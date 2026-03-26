const express = require("express");
const { verifyAdmin } = require("../middleware/authMiddleware");
const {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
  AdminListUsersCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const POOL_ID = process.env.COGNITO_USER_POOL_ID;
const APP_URL = process.env.APP_URL || "https://secure-punch-in-tracker.onrender.com";

module.exports = function(db) {
  const router = express.Router();

  async function queryDB(query, params = []) {
    const result = await db.cluster.query(query, { parameters: params });
    return result.rows;
  }

  // ── GET /api/admin/users ────────────────────────────────────────────────────
  router.get("/users", verifyAdmin, async (req, res) => {
    try {
      const result = await cognitoClient.send(new AdminListUsersCommand({
        UserPoolId: POOL_ID,
        Limit: 60,
      }));

      const usersPromises = result.Users.map(async u => {
        const attrs = {};
        u.Attributes.forEach(a => { attrs[a.Name] = a.Value; });

        const email   = attrs["email"] || u.Username;
        const role    = attrs["custom:role"]   || "member";
        const status  = attrs["custom:status"] || "pending";
        const faceId  = attrs["custom:faceId"] || "";

        if (role === "admin") return null;

        // Get face photo from Couchbase pending_user doc
        let facePhoto = "";
        try {
          const docId    = `user_pending::${email.replace(/[^a-z0-9]/g, "_")}`;
          const docResult = await db.collection.get(docId);
          facePhoto = docResult.content.facePhoto || "";
        } catch (e) {}

        return {
          id:        u.Username,
          name:      attrs["name"]  || "",
          email,
          role,
          status,
          faceId,
          facePhoto,
          confirmed: u.UserStatus === "CONFIRMED",
          createdAt: u.UserCreateDate,
        };
      });

      const users = (await Promise.all(usersPromises)).filter(Boolean);
      res.json({ users });
    } catch (err) {
      console.error("❌ List users error:", err.message);
      res.status(500).json({ error: "Failed to fetch users", details: err.message });
    }
  });

  // ── POST /api/admin/approve/:email ──────────────────────────────────────────
  router.post("/approve/:email", verifyAdmin, async (req, res) => {
    const email = decodeURIComponent(req.params.email);
    try {
      // Update status in Cognito
      await cognitoClient.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: POOL_ID,
        Username:   email,
        UserAttributes: [{ Name: "custom:status", Value: "approved" }],
      }));

      // Get user name
      const result = await cognitoClient.send(new AdminListUsersCommand({
        UserPoolId: POOL_ID,
        Filter:     `email = "${email}"`,
        Limit: 1,
      }));
      const attrs = {};
      if (result.Users.length > 0) {
        result.Users[0].Attributes.forEach(a => { attrs[a.Name] = a.Value; });
      }
      const name = attrs["name"] || email;

      // Send approval SNS notification to user
      if (db.sendSNSNotification) {
        await db.sendSNSNotification(
          `✅ Account Approved\n\n` +
          `Hello ${name},\n\n` +
          `Your Punch Tracker account has been approved by the admin.\n` +
          `You can now login and start marking your attendance.\n\n` +
          `Login here: ${APP_URL}/login\n\n` +
          `– Punch Tracker System`
        );
      }

      console.log(`✅ Admin approved: ${name} (${email})`);
      res.json({ success: true, message: `${name} has been approved` });
    } catch (err) {
      console.error("❌ Approve error:", err.message);
      res.status(500).json({ error: "Approval failed", details: err.message });
    }
  });

  // ── POST /api/admin/reject/:email ───────────────────────────────────────────
  router.post("/reject/:email", verifyAdmin, async (req, res) => {
    const email = decodeURIComponent(req.params.email);
    try {
      await cognitoClient.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: POOL_ID,
        Username:   email,
        UserAttributes: [{ Name: "custom:status", Value: "rejected" }],
      }));

      const result = await cognitoClient.send(new AdminListUsersCommand({
        UserPoolId: POOL_ID,
        Filter:     `email = "${email}"`,
        Limit: 1,
      }));
      const attrs = {};
      if (result.Users.length > 0) {
        result.Users[0].Attributes.forEach(a => { attrs[a.Name] = a.Value; });
      }
      const name = attrs["name"] || email;

      // Send rejection SNS notification to user
      if (db.sendSNSNotification) {
        await db.sendSNSNotification(
          `❌ Account Rejected\n\n` +
          `Hello ${name},\n\n` +
          `Unfortunately, your Punch Tracker account registration has been rejected by the admin.\n` +
          `Please contact your administrator for more information.\n\n` +
          `– Punch Tracker System`
        );
      }

      console.log(`✅ Admin rejected: ${name} (${email})`);
      res.json({ success: true, message: `${name} has been rejected` });
    } catch (err) {
      console.error("❌ Reject error:", err.message);
      res.status(500).json({ error: "Rejection failed", details: err.message });
    }
  });

  // ── DELETE /api/admin/records/:id ───────────────────────────────────────────
  router.delete("/records/:id", verifyAdmin, async (req, res) => {
    try {
      await db.collection.remove(req.params.id);
      res.json({ success: true, message: "Record deleted" });
    } catch (err) {
      res.status(500).json({ error: "Delete failed", details: err.message });
    }
  });

  // ── GET /api/admin/stats ────────────────────────────────────────────────────
  router.get("/stats", verifyAdmin, async (req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const allUsers = await cognitoClient.send(new AdminListUsersCommand({
        UserPoolId: POOL_ID, Limit: 60,
      }));

      let pending = 0, approved = 0, rejected = 0;
      allUsers.Users.forEach(u => {
        const attrs = {};
        u.Attributes.forEach(a => { attrs[a.Name] = a.Value; });
        if (attrs["custom:role"] === "admin") return;
        const s = attrs["custom:status"] || "pending";
        if (s === "pending")  pending++;
        if (s === "approved") approved++;
        if (s === "rejected") rejected++;
      });

      const todayResult = await queryDB(
        `SELECT COUNT(*) AS cnt FROM \`${db.CB_BUCKET}\`.\`${db.CB_SCOPE}\`.\`${db.CB_COLLECTION}\` AS doc
         WHERE doc.type = 'punch_record' AND doc.date = $1`, [today]
      );

      res.json({ pendingUsers: pending, approvedUsers: approved, rejectedUsers: rejected, todayPunches: todayResult[0]?.cnt || 0 });
    } catch (err) {
      console.error("❌ Stats error:", err.message);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  return router;
};