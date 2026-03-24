const express  = require("express");
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { generateOTP, sendOTPEmail } = require("../middleware/emailUtils");
const { verifyToken } = require("../middleware/authMiddleware");

const JWT_SECRET  = process.env.JWT_SECRET || "punch-tracker-secret-change-in-prod";
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || "24h";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

module.exports = function(db) {
  const router = express.Router();

  async function queryDB(query, params = []) {
    const result = await db.cluster.query(query, { parameters: params });
    return result.rows;
  }

  // ── POST /api/auth/send-otp ─────────────────────────────────────────────────
  router.post("/send-otp", async (req, res) => {
    const { email, purpose } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    if (purpose === "login") {
      try {
        const rows = await queryDB(
          `SELECT META().id AS id, doc.* FROM \`${db.CB_BUCKET}\`.\`${db.CB_SCOPE}\`.\`${db.CB_COLLECTION}\` AS doc
           WHERE doc.type = 'user' AND LOWER(doc.email) = LOWER($1) LIMIT 1`,
          [email]
        );
        if (rows.length === 0) return res.status(404).json({ error: "No account found with this email." });
        if (rows[0].status !== "approved") {
          return res.status(403).json({
            error: rows[0].status === "pending"
              ? "Your account is pending admin approval."
              : "Your account has been rejected. Contact admin.",
          });
        }
      } catch (err) {
        return res.status(500).json({ error: "Database error", details: err.message });
      }
    }

    try {
      const otp       = generateOTP();
      const expiresAt = Date.now() + 5 * 60 * 1000;
      const docId     = `otp::${email.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      try { await db.collection.remove(docId); } catch (e) { }
      await db.collection.insert(docId, {
        type: "otp", email: email.toLowerCase(),
        code: otp, expiresAt, createdAt: Date.now(),
      });
      await sendOTPEmail(email, otp, purpose === "login" ? "login" : "verification");
      res.json({ success: true, message: `OTP sent to ${email}` });
    } catch (err) {
      console.error("❌ Send OTP error:", err.message);
      res.status(500).json({ error: "Failed to send OTP", details: err.message });
    }
  });

  // ── POST /api/auth/verify-otp ───────────────────────────────────────────────
  router.post("/verify-otp", async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: "Email and OTP code required" });

    try {
      const docId = `otp::${email.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      let otpDoc;
      try {
        const result = await db.collection.get(docId);
        otpDoc = result.content;
      } catch {
        return res.status(400).json({ error: "OTP not found or already used. Request a new one." });
      }
      if (Date.now() > otpDoc.expiresAt) {
        await db.collection.remove(docId).catch(() => {});
        return res.status(400).json({ error: "OTP expired. Please request a new one." });
      }
      if (otpDoc.code !== code.toString()) {
        return res.status(400).json({ error: "Incorrect OTP. Please try again." });
      }
      await db.collection.remove(docId).catch(() => {});
      res.json({ success: true, message: "OTP verified successfully", emailVerified: true });
    } catch (err) {
      console.error("❌ Verify OTP error:", err.message);
      res.status(500).json({ error: "OTP verification failed", details: err.message });
    }
  });

  // ── POST /api/auth/register ─────────────────────────────────────────────────
  router.post("/register", async (req, res) => {
    const { name, email, password, faceId } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }
    try {
      const existing = await queryDB(
        `SELECT META().id AS id FROM \`${db.CB_BUCKET}\`.\`${db.CB_SCOPE}\`.\`${db.CB_COLLECTION}\` AS doc
         WHERE doc.type = 'user' AND LOWER(doc.email) = LOWER($1) LIMIT 1`,
        [email]
      );
      if (existing.length > 0) {
        return res.status(409).json({ error: "An account with this email already exists." });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const isAdmin      = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      const docId        = `user::${uuidv4()}`;
      const user = {
        type: "user", name, email: email.toLowerCase(),
        passwordHash, faceId: faceId || null,
        role:   isAdmin ? "admin" : "member",
        status: isAdmin ? "approved" : "pending",
        createdAt: Date.now(),
      };
      await db.collection.insert(docId, user);
      console.log(`✅ User registered: ${name} (${email}) — status: ${user.status}`);

      if (!isAdmin && db.sendSNSNotification) {
        await db.sendSNSNotification(
          `👤 New User Registration\n\nName: ${name}\nEmail: ${email}\nStatus: Pending Approval\n\nPlease log in to admin dashboard to approve or reject.\n\n– Punch Tracker System`
        );
      }

      res.status(201).json({
        success: true,
        message: isAdmin ? "Admin account created. You can now login." : "Registration successful! Waiting for admin approval.",
        status:  user.status,
        role:    user.role,
      });
    } catch (err) {
      console.error("❌ Register error:", err.message);
      res.status(500).json({ error: "Registration failed", details: err.message });
    }
  });

  // ── POST /api/auth/login ────────────────────────────────────────────────────
  router.post("/login", async (req, res) => {
    const { email, password, otp } = req.body;
    if (!email || !password || !otp) {
      return res.status(400).json({ error: "Email, password and OTP are required" });
    }
    try {
      const rows = await queryDB(
        `SELECT META().id AS id, doc.* FROM \`${db.CB_BUCKET}\`.\`${db.CB_SCOPE}\`.\`${db.CB_COLLECTION}\` AS doc
         WHERE doc.type = 'user' AND LOWER(doc.email) = LOWER($1) LIMIT 1`,
        [email]
      );
      if (rows.length === 0) return res.status(401).json({ error: "Invalid email or password." });

      const user = rows[0];
      if (user.status !== "approved") {
        return res.status(403).json({
          error: user.status === "pending"
            ? "Your account is pending admin approval."
            : "Your account has been rejected.",
        });
      }

      const passwordMatch = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatch) return res.status(401).json({ error: "Invalid email or password." });

      const docId = `otp::${email.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      let otpDoc;
      try {
        const result = await db.collection.get(docId);
        otpDoc = result.content;
      } catch {
        return res.status(400).json({ error: "OTP not found. Please request a new OTP." });
      }
      if (Date.now() > otpDoc.expiresAt) {
        await db.collection.remove(docId).catch(() => {});
        return res.status(400).json({ error: "OTP expired. Please request a new one." });
      }
      if (otpDoc.code !== otp.toString()) {
        return res.status(400).json({ error: "Incorrect OTP." });
      }
      await db.collection.remove(docId).catch(() => {});

      const token = jwt.sign(
        { id: user.id, name: user.name, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );
      console.log(`✅ User logged in: ${user.name} (${user.email})`);
      res.json({
        success: true, token,
        user: { name: user.name, email: user.email, role: user.role, id: user.id },
      });
    } catch (err) {
      console.error("❌ Login error:", err.message);
      res.status(500).json({ error: "Login failed", details: err.message });
    }
  });

  // ── GET /api/auth/me ────────────────────────────────────────────────────────
  router.get("/me", verifyToken, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
};