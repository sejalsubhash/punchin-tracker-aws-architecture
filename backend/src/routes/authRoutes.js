const express = require("express");
const jwt     = require("jsonwebtoken");
const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  ResendConfirmationCodeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const { verifyToken } = require("../middleware/authMiddleware");

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const CLIENT_ID   = process.env.COGNITO_CLIENT_ID;
const POOL_ID     = process.env.COGNITO_USER_POOL_ID;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase();
const JWT_SECRET  = process.env.JWT_SECRET || "punch-tracker-secret";
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || "24h";

module.exports = function(db) {
  const router = express.Router();

  // ── POST /api/auth/send-otp-registration ───────────────────────────────────
  // Step 1 — Send OTP via Cognito SignUp (temp password)
  router.post("/send-otp-registration", async (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: "Name and email are required" });

    try {
      // Check if email already exists
      try {
        await cognitoClient.send(new AdminGetUserCommand({
          UserPoolId: POOL_ID,
          Username:   email.toLowerCase(),
        }));
        return res.status(409).json({ error: "An account with this email already exists." });
      } catch (e) {
        if (e.name !== "UserNotFoundException") throw e;
      }

      // Register with temp password to trigger Cognito verification email
      const tempPassword = `Temp@${Math.random().toString(36).slice(2, 10)}1A`;
      await cognitoClient.send(new SignUpCommand({
        ClientId: CLIENT_ID,
        Username: email.toLowerCase(),
        Password: tempPassword,
        UserAttributes: [
          { Name: "name",          Value: name },
          { Name: "email",         Value: email.toLowerCase() },
          { Name: "custom:role",   Value: "member" },
          { Name: "custom:status", Value: "pending" },
          { Name: "custom:faceId", Value: "" },
        ],
      }));

      // Store temp password temporarily in Couchbase so we can change it after OTP
      const docId = `temp_reg::${email.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      try { await db.collection.remove(docId); } catch (e) {}
      await db.collection.insert(docId, {
        type:         "temp_registration",
        name,
        email:        email.toLowerCase(),
        tempPassword,
        createdAt:    Date.now(),
        expiresAt:    Date.now() + 30 * 60 * 1000, // 30 mins
      });

      console.log(`✅ OTP sent via Cognito to: ${email}`);
      res.json({ success: true, message: `Verification code sent to ${email}` });
    } catch (err) {
      console.error("❌ Send OTP error:", err.message);
      if (err.name === "UsernameExistsException") {
        return res.status(409).json({ error: "An account with this email already exists." });
      }
      res.status(500).json({ error: "Failed to send OTP", details: err.message });
    }
  });

  // ── POST /api/auth/verify-email-otp ────────────────────────────────────────
  // Step 2 — Verify OTP from Cognito email
  router.post("/verify-email-otp", async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: "Email and code required" });
    try {
      await cognitoClient.send(new ConfirmSignUpCommand({
        ClientId:         CLIENT_ID,
        Username:         email.toLowerCase(),
        ConfirmationCode: code.toString(),
      }));
      console.log(`✅ Email verified: ${email}`);
      res.json({ success: true, message: "Email verified successfully" });
    } catch (err) {
      console.error("❌ Verify OTP error:", err.message);
      if (err.name === "CodeMismatchException")   return res.status(400).json({ error: "Incorrect code. Please try again." });
      if (err.name === "ExpiredCodeException")    return res.status(400).json({ error: "Code expired. Please request a new one." });
      if (err.name === "NotAuthorizedException")  return res.status(400).json({ error: "Email already verified." });
      res.status(500).json({ error: "Verification failed", details: err.message });
    }
  });

  // ── POST /api/auth/resend-code ──────────────────────────────────────────────
  router.post("/resend-code", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    try {
      await cognitoClient.send(new ResendConfirmationCodeCommand({
        ClientId: CLIENT_ID,
        Username: email.toLowerCase(),
      }));
      res.json({ success: true, message: "Verification code resent to your email" });
    } catch (err) {
      console.error("❌ Resend code error:", err.message);
      res.status(500).json({ error: "Failed to resend code", details: err.message });
    }
  });

  // ── POST /api/auth/complete-registration ───────────────────────────────────
  // Step 3 — Set real password + save face + notify admin
  router.post("/complete-registration", async (req, res) => {
    const { name, email, password, faceId, facePhoto } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }

    try {
      // Get temp registration data
      const docId = `temp_reg::${email.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      let tempReg;
      try {
        const result = await db.collection.get(docId);
        tempReg = result.content;
      } catch {
        return res.status(400).json({ error: "Registration session expired. Please start again." });
      }

      if (Date.now() > tempReg.expiresAt) {
        await db.collection.remove(docId).catch(() => {});
        return res.status(400).json({ error: "Registration session expired. Please start again." });
      }

      // Update Cognito password using admin API
      const { AdminSetUserPasswordCommand } = require("@aws-sdk/client-cognito-identity-provider");
      await cognitoClient.send(new AdminSetUserPasswordCommand({
        UserPoolId: POOL_ID,
        Username:   email.toLowerCase(),
        Password:   password,
        Permanent:  true,
      }));

      // Update faceId in Cognito
      await cognitoClient.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: POOL_ID,
        Username:   email.toLowerCase(),
        UserAttributes: [
          { Name: "custom:faceId",  Value: faceId  || "" },
          { Name: "custom:status",  Value: "pending" },
        ],
      }));

      // Save face photo to Couchbase for admin to view
      const userDocId = `user_pending::${email.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      try { await db.collection.remove(userDocId); } catch (e) {}
      await db.collection.insert(userDocId, {
        type:       "pending_user",
        name,
        email:      email.toLowerCase(),
        faceId:     faceId || "",
        facePhoto:  facePhoto || "",
        status:     "pending",
        createdAt:  Date.now(),
      });

      // Clean up temp registration
      await db.collection.remove(docId).catch(() => {});

      // Notify admin via SNS
      const APP_URL = process.env.APP_URL || "https://secure-punch-in-tracker.onrender.com";
      if (db.sendSNSNotification) {
        await db.sendSNSNotification(
        `👤 New User Registration — Action Required\n\n` +
        `Name:   ${name}\n` +
        `Email:  ${email}\n` +
        `Status: Pending Your Approval\n\n` +
        `ADMIN LOGIN STEPS:\n` +
        `1. Open this link: ${APP_URL}/login\n` +
        `2. Login with your admin email and password\n` +
        `3. You will be automatically redirected to Admin Dashboard\n` +
        `4. Go to Pending tab to approve or reject\n\n` +
        `Direct admin link (after login): ${APP_URL}/admin\n\n` +
        `– Punch Tracker System`
);
      }

      console.log(`✅ Registration complete: ${name} (${email})`);
      res.status(201).json({
        success: true,
        message: "Registration successful! Waiting for admin approval.",
      });
    } catch (err) {
      console.error("❌ Complete registration error:", err.message);
      if (err.name === "InvalidPasswordException") {
        return res.status(400).json({
          error: "Password must have uppercase, lowercase, number and special character (e.g. Pass@123)",
        });
      }
      res.status(500).json({ error: "Registration failed", details: err.message });
    }
  });

  // ── POST /api/auth/login ────────────────────────────────────────────────────
  router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    try {
      // Authenticate with Cognito
      const authResult = await cognitoClient.send(new InitiateAuthCommand({
        AuthFlow:       "USER_PASSWORD_AUTH",
        ClientId:       CLIENT_ID,
        AuthParameters: { USERNAME: email.toLowerCase(), PASSWORD: password },
      }));

      if (authResult.ChallengeName) {
        return res.status(403).json({ error: "Login challenge not supported. Please reset your password." });
      }

      // Get user attributes
      const userResult = await cognitoClient.send(new AdminGetUserCommand({
        UserPoolId: POOL_ID,
        Username:   email.toLowerCase(),
      }));

      const attrs = {};
      userResult.UserAttributes.forEach(a => { attrs[a.Name] = a.Value; });

      const status = attrs["custom:status"] || "pending";
      const role   = attrs["custom:role"]   || "member";
      const name   = attrs["name"]          || email;
      const faceId = attrs["custom:faceId"] || "";

      // Block login if not approved
      if (status === "pending") {
        return res.status(403).json({ error: "Your account is pending admin approval. You will receive an email once approved." });
      }
      if (status === "rejected") {
        return res.status(403).json({ error: "Your account has been rejected. Please contact the administrator." });
      }

      // Issue JWT
      const token = jwt.sign(
        { email: email.toLowerCase(), name, role, status, faceId },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );

      console.log(`✅ User logged in: ${name} (${email})`);
      res.json({
        success: true, token,
        user: { name, email: email.toLowerCase(), role, faceId },
      });
    } catch (err) {
      console.error("❌ Login error:", err.message);
      if (err.name === "NotAuthorizedException")    return res.status(401).json({ error: "Invalid email or password." });
      if (err.name === "UserNotConfirmedException") return res.status(403).json({ error: "Please verify your email first." });
      if (err.name === "UserNotFoundException")     return res.status(401).json({ error: "Invalid email or password." });
      res.status(500).json({ error: "Login failed", details: err.message });
    }
  });

  // ── POST /api/auth/forgot-password ─────────────────────────────────────────
  router.post("/forgot-password", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    try {
      await cognitoClient.send(new ForgotPasswordCommand({
        ClientId: CLIENT_ID,
        Username: email.toLowerCase(),
      }));
      res.json({ success: true, message: "Reset code sent to your email" });
    } catch (err) {
      console.error("❌ Forgot password error:", err.message);
      if (err.name === "UserNotFoundException")    return res.status(404).json({ error: "No account found with this email." });
      if (err.name === "NotAuthorizedException")   return res.status(400).json({ error: "Please verify your email first." });
      res.status(500).json({ error: "Failed to send reset code", details: err.message });
    }
  });

  // ── POST /api/auth/reset-password ──────────────────────────────────────────
  router.post("/reset-password", async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) return res.status(400).json({ error: "All fields required" });
    if (newPassword.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    try {
      await cognitoClient.send(new ConfirmForgotPasswordCommand({
        ClientId:         CLIENT_ID,
        Username:         email.toLowerCase(),
        ConfirmationCode: code.toString(),
        Password:         newPassword,
      }));
      res.json({ success: true, message: "Password reset successfully" });
    } catch (err) {
      console.error("❌ Reset password error:", err.message);
      if (err.name === "CodeMismatchException")    return res.status(400).json({ error: "Incorrect reset code." });
      if (err.name === "ExpiredCodeException")     return res.status(400).json({ error: "Code expired. Request a new one." });
      if (err.name === "InvalidPasswordException") return res.status(400).json({ error: "Password must have uppercase, lowercase, number and special character." });
      res.status(500).json({ error: "Password reset failed", details: err.message });
    }
  });

  // ── GET /api/auth/me ────────────────────────────────────────────────────────
  router.get("/me", verifyToken, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
};