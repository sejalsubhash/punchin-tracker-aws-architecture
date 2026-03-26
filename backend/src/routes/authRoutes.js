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

  // ── POST /api/auth/register ─────────────────────────────────────────────────
  // Cognito sends verification email automatically
  router.post("/register", async (req, res) => {
    const { name, email, password, faceId } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }
    const isAdmin = email.toLowerCase() === ADMIN_EMAIL;
    try {
      await cognitoClient.send(new SignUpCommand({
        ClientId: CLIENT_ID,
        Username: email.toLowerCase(),
        Password: password,
        UserAttributes: [
          { Name: "name",            Value: name },
          { Name: "email",           Value: email.toLowerCase() },
          { Name: "custom:role",     Value: isAdmin ? "admin" : "member" },
          { Name: "custom:status",   Value: isAdmin ? "approved" : "pending" },
          { Name: "custom:faceId",   Value: faceId || "" },
        ],
      }));

      console.log(`✅ User registered in Cognito: ${email}`);

      // Notify admin via SNS
      if (!isAdmin && db.sendSNSNotification) {
        await db.sendSNSNotification(
          `👤 New User Registration\n\nName: ${name}\nEmail: ${email}\nStatus: Pending Approval\n\nLogin to admin dashboard to approve.\n\n– Punch Tracker System`
        );
      }

      res.status(201).json({
        success: true,
        message: "Registration successful! Check your email for verification code.",
        requiresVerification: true,
      });
    } catch (err) {
      console.error("❌ Register error:", err.message);
      if (err.name === "UsernameExistsException") {
        return res.status(409).json({ error: "Account with this email already exists." });
      }
      if (err.name === "InvalidPasswordException") {
        return res.status(400).json({ error: "Password must be at least 8 characters with uppercase, lowercase and number." });
      }
      res.status(500).json({ error: "Registration failed", details: err.message });
    }
  });

  // ── POST /api/auth/verify-otp ───────────────────────────────────────────────
  // Verify Cognito email code
  router.post("/verify-otp", async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: "Email and code required" });
    try {
      await cognitoClient.send(new ConfirmSignUpCommand({
        ClientId:         CLIENT_ID,
        Username:         email.toLowerCase(),
        ConfirmationCode: code.toString(),
      }));
      console.log(`✅ Email verified in Cognito: ${email}`);
      res.json({ success: true, message: "Email verified successfully! Waiting for admin approval." });
    } catch (err) {
      console.error("❌ Verify OTP error:", err.message);
      if (err.name === "CodeMismatchException") {
        return res.status(400).json({ error: "Incorrect verification code. Please try again." });
      }
      if (err.name === "ExpiredCodeException") {
        return res.status(400).json({ error: "Code expired. Please request a new one." });
      }
      if (err.name === "NotAuthorizedException") {
        return res.status(400).json({ error: "User is already verified." });
      }
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

  // ── POST /api/auth/login ────────────────────────────────────────────────────
  router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    try {
      // Authenticate with Cognito
      const authResult = await cognitoClient.send(new InitiateAuthCommand({
        AuthFlow:       "USER_PASSWORD_AUTH",
        ClientId:       CLIENT_ID,
        AuthParameters: {
          USERNAME: email.toLowerCase(),
          PASSWORD: password,
        },
      }));

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

      // Check approval status
      if (status !== "approved") {
        return res.status(403).json({
          error: status === "pending"
            ? "Your account is pending admin approval. You will receive an email once approved."
            : "Your account has been rejected. Contact admin.",
        });
      }

      // Issue JWT token
      const token = jwt.sign(
        { email: email.toLowerCase(), name, role, status },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );

      console.log(`✅ User logged in: ${name} (${email})`);

      res.json({
        success: true,
        token,
        user: { name, email: email.toLowerCase(), role },
      });
    } catch (err) {
      console.error("❌ Login error:", err.message);
      if (err.name === "NotAuthorizedException") {
        return res.status(401).json({ error: "Invalid email or password." });
      }
      if (err.name === "UserNotConfirmedException") {
        return res.status(403).json({
          error: "Please verify your email first.",
          requiresVerification: true,
        });
      }
      if (err.name === "UserNotFoundException") {
        return res.status(401).json({ error: "Invalid email or password." });
      }
      res.status(500).json({ error: "Login failed", details: err.message });
    }
  });


  // ── POST /api/auth/forgot-password ─────────────────────────────────────────
  // Cognito sends reset code to email automatically
  router.post("/forgot-password", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    try {
      const { ForgotPasswordCommand } = require("@aws-sdk/client-cognito-identity-provider");
      await cognitoClient.send(new ForgotPasswordCommand({
        ClientId: CLIENT_ID,
        Username: email.toLowerCase(),
      }));
      console.log(`✅ Password reset code sent to: ${email}`);
      res.json({ success: true, message: "Reset code sent to your email" });
    } catch (err) {
      console.error("❌ Forgot password error:", err.message);
      if (err.name === "UserNotFoundException") {
        return res.status(404).json({ error: "No account found with this email." });
      }
      if (err.name === "NotAuthorizedException") {
        return res.status(400).json({ error: "Please verify your email first." });
      }
      res.status(500).json({ error: "Failed to send reset code", details: err.message });
    }
  });

  // ── POST /api/auth/reset-password ──────────────────────────────────────────
  router.post("/reset-password", async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "Email, code and new password are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    try {
      const { ConfirmForgotPasswordCommand } = require("@aws-sdk/client-cognito-identity-provider");
      await cognitoClient.send(new ConfirmForgotPasswordCommand({
        ClientId:         CLIENT_ID,
        Username:         email.toLowerCase(),
        ConfirmationCode: code.toString(),
        Password:         newPassword,
      }));
      console.log(`✅ Password reset successful for: ${email}`);
      res.json({ success: true, message: "Password reset successfully" });
    } catch (err) {
      console.error("❌ Reset password error:", err.message);
      if (err.name === "CodeMismatchException") {
        return res.status(400).json({ error: "Incorrect reset code. Please try again." });
      }
      if (err.name === "ExpiredCodeException") {
        return res.status(400).json({ error: "Reset code expired. Please request a new one." });
      }
      if (err.name === "InvalidPasswordException") {
        return res.status(400).json({ error: "Password must have uppercase, lowercase, number and special character." });
      }
      res.status(500).json({ error: "Password reset failed", details: err.message });
    }
  });

  // ── GET /api/auth/me ────────────────────────────────────────────────────────
  router.get("/me", verifyToken, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
};