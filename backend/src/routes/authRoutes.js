const express  = require("express");
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { generateOTP, sendOTPEmail } = require("../middleware/emailUtils");

const router = express.Router();
const JWT_SECRET    = process.env.JWT_SECRET || "punch-tracker-secret-change-in-prod";
const JWT_EXPIRES   = process.env.JWT_EXPIRES_IN || "24h";
const ADMIN_EMAIL   = process.env.ADMIN_EMAIL || "admin@example.com";

// ── Couchbase helpers ─────────────────────────────────────────────────────────
// These are injected from server.js via router.locals
function getCluster() { return router.locals.cluster; }
function getCollection() { return router.locals.collection; }
function getCB_BUCKET() { return router.locals.CB_BUCKET; }
function getCB_SCOPE() { return router.locals.CB_SCOPE; }
function getCB_COLLECTION() { return router.locals.CB_COLLECTION; }

async function queryDB(query, params = []) {
  const cluster = getCluster();
  const result  = await cluster.query(query, { parameters: params });
  return result.rows;
}

// ── POST /api/auth/send-otp ───────────────────────────────────────────────────
// Step 1 of registration OR login — send OTP to email
router.post("/send-otp", async (req, res) => {
  const { email, purpose } = req.body; // purpose: "registration" | "login"

  if (!email) return res.status(400).json({ error: "Email is required" });

  // For login — check user exists and is approved
  if (purpose === "login") {
    const CB_BUCKET = getCB_BUCKET();
    const CB_SCOPE  = getCB_SCOPE();
    const CB_COL    = getCB_COLLECTION();
    const rows = await queryDB(
      `SELECT META().id AS id, doc.* FROM \`${CB_BUCKET}\`.\`${CB_SCOPE}\`.\`${CB_COL}\` AS doc
       WHERE doc.type = 'user' AND LOWER(doc.email) = LOWER($1) LIMIT 1`,
      [email]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "No account found with this email." });
    }
    if (rows[0].status !== "approved") {
      return res.status(403).json({
        error: rows[0].status === "pending"
          ? "Your account is pending admin approval."
          : "Your account has been rejected. Contact admin.",
      });
    }
  }

  try {
    const otp       = generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    const docId     = `otp::${email.toLowerCase()}`;

    // Save OTP to Couchbase (overwrite any existing)
    const collection = getCollection();
    try { await collection.remove(docId); } catch (e) { /* ignore */ }
    await collection.insert(docId, {
      type: "otp", email: email.toLowerCase(),
      code: otp, expiresAt, createdAt: Date.now(),
    });

    // Send OTP email
    await sendOTPEmail(email, otp, purpose === "login" ? "login" : "verification");

    res.json({ success: true, message: `OTP sent to ${email}` });
  } catch (err) {
    console.error("❌ Send OTP error:", err.message);
    res.status(500).json({ error: "Failed to send OTP", details: err.message });
  }
});

// ── POST /api/auth/verify-otp ─────────────────────────────────────────────────
// Step 2 — verify OTP code
router.post("/verify-otp", async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: "Email and OTP code required" });

  try {
    const collection = getCollection();
    const docId      = `otp::${email.toLowerCase()}`;

    let otpDoc;
    try {
      const result = await collection.get(docId);
      otpDoc = result.content;
    } catch {
      return res.status(400).json({ error: "OTP not found or already used. Request a new one." });
    }

    if (Date.now() > otpDoc.expiresAt) {
      await collection.remove(docId).catch(() => {});
      return res.status(400).json({ error: "OTP expired. Please request a new one." });
    }

    if (otpDoc.code !== code.toString()) {
      return res.status(400).json({ error: "Incorrect OTP. Please try again." });
    }

    // OTP valid — remove it
    await collection.remove(docId).catch(() => {});

    res.json({ success: true, message: "OTP verified successfully", emailVerified: true });
  } catch (err) {
    console.error("❌ Verify OTP error:", err.message);
    res.status(500).json({ error: "OTP verification failed", details: err.message });
  }
});

// ── POST /api/auth/register ───────────────────────────────────────────────────
// Step 3 — save user after OTP + face verified
router.post("/register", async (req, res) => {
  const { name, email, password, faceId } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email and password are required" });
  }

  try {
    const CB_BUCKET = getCB_BUCKET();
    const CB_SCOPE  = getCB_SCOPE();
    const CB_COL    = getCB_COLLECTION();
    const collection = getCollection();

    // Check email not already registered
    const existing = await queryDB(
      `SELECT META().id AS id FROM \`${CB_BUCKET}\`.\`${CB_SCOPE}\`.\`${CB_COL}\` AS doc
       WHERE doc.type = 'user' AND LOWER(doc.email) = LOWER($1) LIMIT 1`,
      [email]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const isAdmin      = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    // Save user
    const docId = `user::${uuidv4()}`;
    const user  = {
      type: "user", name, email: email.toLowerCase(),
      passwordHash, faceId: faceId || null,
      role: isAdmin ? "admin" : "member",
      status: isAdmin ? "approved" : "pending",
      createdAt: Date.now(),
    };
    await collection.insert(docId, user);

    console.log(`✅ User registered: ${name} (${email}) — status: ${user.status}`);

    // Send SNS notification to admin (if not admin registering)
    if (!isAdmin && router.locals.sendSNSNotification) {
      await router.locals.sendSNSNotification(
        `👤 New User Registration\n\nName: ${name}\nEmail: ${email}\nStatus: Pending Approval\n\nPlease log in to the admin dashboard to approve or reject.\n\n– Punch Tracker System`
      );
    }

    res.status(201).json({
      success: true,
      message: isAdmin
        ? "Admin account created. You can now login."
        : "Registration successful! Waiting for admin approval.",
      status: user.status,
      role:   user.role,
    });
  } catch (err) {
    console.error("❌ Register error:", err.message);
    res.status(500).json({ error: "Registration failed", details: err.message });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// Step 4 — verify password + OTP → issue JWT
router.post("/login", async (req, res) => {
  const { email, password, otp } = req.body;

  if (!email || !password || !otp) {
    return res.status(400).json({ error: "Email, password and OTP are required" });
  }

  try {
    const CB_BUCKET = getCB_BUCKET();
    const CB_SCOPE  = getCB_SCOPE();
    const CB_COL    = getCB_COLLECTION();
    const collection = getCollection();

    // Find user
    const rows = await queryDB(
      `SELECT META().id AS id, doc.* FROM \`${CB_BUCKET}\`.\`${CB_SCOPE}\`.\`${CB_COL}\` AS doc
       WHERE doc.type = 'user' AND LOWER(doc.email) = LOWER($1) LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = rows[0];

    if (user.status !== "approved") {
      return res.status(403).json({
        error: user.status === "pending"
          ? "Your account is pending admin approval."
          : "Your account has been rejected.",
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // Verify OTP
    const docId = `otp::${email.toLowerCase()}`;
    let otpDoc;
    try {
      const result = await collection.get(docId);
      otpDoc = result.content;
    } catch {
      return res.status(400).json({ error: "OTP not found. Please request a new OTP." });
    }

    if (Date.now() > otpDoc.expiresAt) {
      await collection.remove(docId).catch(() => {});
      return res.status(400).json({ error: "OTP expired. Please request a new one." });
    }

    if (otpDoc.code !== otp.toString()) {
      return res.status(400).json({ error: "Incorrect OTP." });
    }

    await collection.remove(docId).catch(() => {});

    // Issue JWT
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    console.log(`✅ User logged in: ${user.name} (${user.email})`);

    res.json({
      success: true,
      token,
      user: { name: user.name, email: user.email, role: user.role, id: user.id },
    });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    res.status(500).json({ error: "Login failed", details: err.message });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get("/me", require("../middleware/authMiddleware").verifyToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;