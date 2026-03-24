const express = require("express");
const { verifyAdmin } = require("../middleware/authMiddleware");
const { sendStatusEmail } = require("../middleware/emailUtils");

module.exports = function(db) {
  const router = express.Router();

  async function queryDB(query, params = []) {
    const result = await db.cluster.query(query, { parameters: params });
    return result.rows;
  }

  // ── GET /api/admin/users ────────────────────────────────────────────────────
  router.get("/users", verifyAdmin, async (req, res) => {
    try {
      const rows = await queryDB(
        `SELECT META().id AS id, doc.name, doc.email, doc.role, doc.status, doc.createdAt, doc.approvedAt
         FROM \`${db.CB_BUCKET}\`.\`${db.CB_SCOPE}\`.\`${db.CB_COLLECTION}\` AS doc
         WHERE doc.type = 'user' AND doc.role != 'admin'
         ORDER BY doc.createdAt DESC`
      );
      res.json({ users: rows });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch users", details: err.message });
    }
  });

  // ── POST /api/admin/approve/:id ─────────────────────────────────────────────
  router.post("/approve/:id", verifyAdmin, async (req, res) => {
    try {
      const result = await db.collection.get(req.params.id);
      const user   = result.content;
      if (user.type !== "user") return res.status(404).json({ error: "User not found" });

      user.status     = "approved";
      user.approvedAt = new Date().toISOString();
      await db.collection.replace(req.params.id, user);
      await sendStatusEmail(user.email, user.name, "approved");

      console.log(`✅ Admin approved: ${user.name}`);
      res.json({ success: true, message: `${user.name} has been approved` });
    } catch (err) {
      console.error("❌ Approve error:", err.message);
      res.status(500).json({ error: "Approval failed", details: err.message });
    }
  });

  // ── POST /api/admin/reject/:id ──────────────────────────────────────────────
  router.post("/reject/:id", verifyAdmin, async (req, res) => {
    try {
      const result = await db.collection.get(req.params.id);
      const user   = result.content;
      if (user.type !== "user") return res.status(404).json({ error: "User not found" });

      user.status     = "rejected";
      user.rejectedAt = new Date().toISOString();
      await db.collection.replace(req.params.id, user);
      await sendStatusEmail(user.email, user.name, "rejected");

      console.log(`✅ Admin rejected: ${user.name}`);
      res.json({ success: true, message: `${user.name} has been rejected` });
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
      const [pending, approved, rejected, todayPunches] = await Promise.all([
        queryDB(`SELECT COUNT(*) AS cnt FROM \`${db.CB_BUCKET}\`.\`${db.CB_SCOPE}\`.\`${db.CB_COLLECTION}\` AS doc WHERE doc.type='user' AND doc.status='pending'`),
        queryDB(`SELECT COUNT(*) AS cnt FROM \`${db.CB_BUCKET}\`.\`${db.CB_SCOPE}\`.\`${db.CB_COLLECTION}\` AS doc WHERE doc.type='user' AND doc.status='approved'`),
        queryDB(`SELECT COUNT(*) AS cnt FROM \`${db.CB_BUCKET}\`.\`${db.CB_SCOPE}\`.\`${db.CB_COLLECTION}\` AS doc WHERE doc.type='user' AND doc.status='rejected'`),
        queryDB(`SELECT COUNT(*) AS cnt FROM \`${db.CB_BUCKET}\`.\`${db.CB_SCOPE}\`.\`${db.CB_COLLECTION}\` AS doc WHERE doc.type='punch_record' AND doc.date=$1`, [today]),
      ]);
      res.json({
        pendingUsers:  pending[0]?.cnt  || 0,
        approvedUsers: approved[0]?.cnt || 0,
        rejectedUsers: rejected[0]?.cnt || 0,
        todayPunches:  todayPunches[0]?.cnt || 0,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  return router;
};