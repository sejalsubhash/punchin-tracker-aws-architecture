const express = require("express");
const { verifyAdmin } = require("../middleware/authMiddleware");
const { sendStatusEmail } = require("../middleware/emailUtils");
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

module.exports = function(db) {
  const router = express.Router();

  async function queryDB(query, params = []) {
    const result = await db.cluster.query(query, { parameters: params });
    return result.rows;
  }

  // ── GET /api/admin/users ────────────────────────────────────────────────────
  router.get("/users", verifyAdmin, async (req, res) => {
    try {
      // Get all users from Cognito
      const result = await cognitoClient.send(new AdminListUsersCommand({
        UserPoolId: POOL_ID,
        Limit: 60,
      }));

      const users = result.Users.map(u => {
        const attrs = {};
        u.Attributes.forEach(a => { attrs[a.Name] = a.Value; });
        return {
          id:          u.Username,
          name:        attrs["name"]           || "",
          email:       attrs["email"]          || u.Username,
          role:        attrs["custom:role"]    || "member",
          status:      attrs["custom:status"]  || "pending",
          confirmed:   u.UserStatus === "CONFIRMED",
          createdAt:   u.UserCreateDate,
        };
      }).filter(u => u.role !== "admin");

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
        UserAttributes: [
          { Name: "custom:status", Value: "approved" },
        ],
      }));

      // Get user name for email
      const result = await cognitoClient.send(new AdminListUsersCommand({
        UserPoolId: POOL_ID,
        Filter:     `email = "${email}"`,
        Limit:      1,
      }));

      let name = email;
      if (result.Users.length > 0) {
        const nameAttr = result.Users[0].Attributes.find(a => a.Name === "name");
        if (nameAttr) name = nameAttr.Value;
      }

      // Send approval email via SES
      await sendStatusEmail(email, name, "approved");

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
        UserAttributes: [
          { Name: "custom:status", Value: "rejected" },
        ],
      }));

      const result = await cognitoClient.send(new AdminListUsersCommand({
        UserPoolId: POOL_ID,
        Filter:     `email = "${email}"`,
        Limit:      1,
      }));

      let name = email;
      if (result.Users.length > 0) {
        const nameAttr = result.Users[0].Attributes.find(a => a.Name === "name");
        if (nameAttr) name = nameAttr.Value;
      }

      await sendStatusEmail(email, name, "rejected");

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
      res.json({ success: true, message: "Record deleted by admin" });
    } catch (err) {
      res.status(500).json({ error: "Delete failed", details: err.message });
    }
  });

  // ── GET /api/admin/stats ────────────────────────────────────────────────────
  router.get("/stats", verifyAdmin, async (req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);

      // Get user counts from Cognito
      const allUsers = await cognitoClient.send(new AdminListUsersCommand({
        UserPoolId: POOL_ID,
        Limit: 60,
      }));

      const members = allUsers.Users.filter(u => {
        const attrs = {};
        u.Attributes.forEach(a => { attrs[a.Name] = a.Value; });
        return attrs["custom:role"] !== "admin";
      });

      const pending  = members.filter(u => {
        const attrs = {};
        u.Attributes.forEach(a => { attrs[a.Name] = a.Value; });
        return attrs["custom:status"] === "pending";
      }).length;

      const approved = members.filter(u => {
        const attrs = {};
        u.Attributes.forEach(a => { attrs[a.Name] = a.Value; });
        return attrs["custom:status"] === "approved";
      }).length;

      const rejected = members.filter(u => {
        const attrs = {};
        u.Attributes.forEach(a => { attrs[a.Name] = a.Value; });
        return attrs["custom:status"] === "rejected";
      }).length;

      // Get today punch count from Couchbase
      const todayResult = await queryDB(
        `SELECT COUNT(*) AS cnt FROM \`${db.CB_BUCKET}\`.\`${db.CB_SCOPE}\`.\`${db.CB_COLLECTION}\` AS doc
         WHERE doc.type = 'punch_record' AND doc.date = $1`,
        [today]
      );

      res.json({
        pendingUsers:  pending,
        approvedUsers: approved,
        rejectedUsers: rejected,
        todayPunches:  todayResult[0]?.cnt || 0,
      });
    } catch (err) {
      console.error("❌ Stats error:", err.message);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  return router;
};