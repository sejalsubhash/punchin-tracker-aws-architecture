const express = require("express");
const { verifyAdmin } = require("../middleware/authMiddleware");
const { sendStatusEmail } = require("../middleware/emailUtils");

const router = express.Router();

async function queryDB(cluster, query, params = []) {
  const result = await cluster.query(query, { parameters: params });
  return result.rows;
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get("/users", verifyAdmin, async (req, res) => {
  try {
    const { cluster, CB_BUCKET, CB_SCOPE, CB_COLLECTION } = router.locals;
    const rows = await queryDB(cluster,
      `SELECT META().id AS id, doc.name, doc.email, doc.role,
              doc.status, doc.createdAt
       FROM \`${CB_BUCKET}\`.\`${CB_SCOPE}\`.\`${CB_COLLECTION}\` AS doc
       WHERE doc.type = 'user' AND doc.role != 'admin'
       ORDER BY doc.createdAt DESC`
    );
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users", details: err.message });
  }
});

// ── POST /api/admin/approve/:id ───────────────────────────────────────────────
router.post("/approve/:id", verifyAdmin, async (req, res) => {
  try {
    const { collection } = router.locals;
    const docId = req.params.id;

    const result = await collection.get(docId);
    const user   = result.content;

    if (user.type !== "user") {
      return res.status(404).json({ error: "User not found" });
    }

    // Update status
    user.status     = "approved";
    user.approvedAt = new Date().toISOString();
    await collection.replace(docId, user);

    // Send approval email
    await sendStatusEmail(user.email, user.name, "approved");

    console.log(`✅ Admin approved: ${user.name} (${user.email})`);
    res.json({ success: true, message: `${user.name} has been approved` });
  } catch (err) {
    console.error("❌ Approve error:", err.message);
    res.status(500).json({ error: "Approval failed", details: err.message });
  }
});

// ── POST /api/admin/reject/:id ────────────────────────────────────────────────
router.post("/reject/:id", verifyAdmin, async (req, res) => {
  try {
    const { collection } = router.locals;
    const docId = req.params.id;

    const result = await collection.get(docId);
    const user   = result.content;

    if (user.type !== "user") {
      return res.status(404).json({ error: "User not found" });
    }

    user.status     = "rejected";
    user.rejectedAt = new Date().toISOString();
    await collection.replace(docId, user);

    await sendStatusEmail(user.email, user.name, "rejected");

    console.log(`✅ Admin rejected: ${user.name} (${user.email})`);
    res.json({ success: true, message: `${user.name} has been rejected` });
  } catch (err) {
    console.error("❌ Reject error:", err.message);
    res.status(500).json({ error: "Rejection failed", details: err.message });
  }
});

// ── DELETE /api/admin/records/:id ─────────────────────────────────────────────
router.delete("/records/:id", verifyAdmin, async (req, res) => {
  try {
    const { collection } = router.locals;
    await collection.remove(req.params.id);
    res.json({ success: true, message: "Record deleted by admin" });
  } catch (err) {
    res.status(500).json({ error: "Delete failed", details: err.message });
  }
});

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get("/stats", verifyAdmin, async (req, res) => {
  try {
    const { cluster, CB_BUCKET, CB_SCOPE, CB_COLLECTION } = router.locals;
    const today = new Date().toISOString().slice(0, 10);

    const [pending, approved, rejected, todayPunches] = await Promise.all([
      queryDB(cluster, `SELECT COUNT(*) AS cnt FROM \`${CB_BUCKET}\`.\`${CB_SCOPE}\`.\`${CB_COLLECTION}\` AS doc WHERE doc.type='user' AND doc.status='pending'`),
      queryDB(cluster, `SELECT COUNT(*) AS cnt FROM \`${CB_BUCKET}\`.\`${CB_SCOPE}\`.\`${CB_COLLECTION}\` AS doc WHERE doc.type='user' AND doc.status='approved'`),
      queryDB(cluster, `SELECT COUNT(*) AS cnt FROM \`${CB_BUCKET}\`.\`${CB_SCOPE}\`.\`${CB_COLLECTION}\` AS doc WHERE doc.type='user' AND doc.status='rejected'`),
      queryDB(cluster, `SELECT COUNT(*) AS cnt FROM \`${CB_BUCKET}\`.\`${CB_SCOPE}\`.\`${CB_COLLECTION}\` AS doc WHERE doc.type='punch_record' AND doc.date=$1`, [today]),
    ]);

    res.json({
      pendingUsers:  pending[0]?.cnt || 0,
      approvedUsers: approved[0]?.cnt || 0,
      rejectedUsers: rejected[0]?.cnt || 0,
      todayPunches:  todayPunches[0]?.cnt || 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

module.exports = router;