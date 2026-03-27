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
// ── Admin email — hardcoded + env variable (both checked) ─────────────────────
const ADMIN_EMAILS = [
  "sejal.work0411@gmail.com",                                    // hardcoded admin
  (process.env.ADMIN_EMAIL || "").toLowerCase().trim(),          // from Render env
].filter(Boolean);

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}
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

      // Check if admin email at Step 1 itself
      const isAdminReg   = isAdminEmail(email);
      const initialRole  = isAdminReg ? "admin"    : "member";
      const initialStatus = isAdminReg ? "approved" : "pending";

      console.log(`📧 Registration started: ${email} | isAdmin: ${isAdminReg}`);

      // Register with temp password to trigger Cognito verification email
      const tempPassword = `Temp@${Math.random().toString(36).slice(2, 10)}1A`;
      await cognitoClient.send(new SignUpCommand({
        ClientId: CLIENT_ID,
        Username: email.toLowerCase(),
        Password: tempPassword,
        UserAttributes: [
          { Name: "name",          Value: name },
          { Name: "email",         Value: email.toLowerCase() },
          { Name: "custom:role",   Value: initialRole },
          { Name: "custom:status", Value: initialStatus },
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

      // ── Detect if this is admin registration ──────────────────────────
      const isAdmin    = isAdminEmail(email);
      const userStatus = isAdmin ? "approved" : "pending";
      const userRole   = isAdmin ? "admin"    : "member";
      console.log(`👤 Registering: ${email} | isAdmin: ${isAdmin} | status: ${userStatus}`);

      // Update faceId + status + role in Cognito
      await cognitoClient.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: POOL_ID,
        Username:   email.toLowerCase(),
        UserAttributes: [
          { Name: "custom:faceId",  Value: faceId    || "" },
          { Name: "custom:status",  Value: userStatus },
          { Name: "custom:role",    Value: userRole   },
        ],
      }));

      // Save face photo to Couchbase (for admin dashboard view)
      const userDocId = `user_pending::${email.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      try { await db.collection.remove(userDocId); } catch (e) {}
      await db.collection.insert(userDocId, {
        type:       "pending_user",
        name,
        email:      email.toLowerCase(),
        faceId:     faceId || "",
        facePhoto:  facePhoto || "",
        status:     userStatus,
        role:       userRole,
        createdAt:  Date.now(),
      });

      // Clean up temp registration
      await db.collection.remove(docId).catch(() => {});

      // Only notify admin via SNS if this is a normal user registration
      const APP_URL = process.env.APP_URL || "https://secure-punch-in-tracker.onrender.com";
      if (!isAdmin && db.sendSNSNotification) {
        await db.sendSNSNotification(
          `👤 New User Registration — Action Required\n\n` +
          `Name:   ${name}\n` +
          `Email:  ${email}\n` +
          `Status: Pending Your Approval\n\n` +
          `Please review and approve or reject this user:\n` +
          `${APP_URL}/admin\n\n` +
          `– Punch Tracker System`
        );
      }

      console.log(`✅ Registration complete: ${name} (${email}) — role: ${userRole} status: ${userStatus}`);
      res.status(201).json({
        success:  true,
        isAdmin,
        message:  isAdmin
          ? "Admin account created successfully! You can now login."
          : "Registration successful! Waiting for admin approval.",
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

      // Auto-approve admin if somehow still pending
      if (isAdminEmail(email.toLowerCase()) && status === "pending") {
        await cognitoClient.send(new AdminUpdateUserAttributesCommand({
          UserPoolId: POOL_ID,
          Username:   email.toLowerCase(),
          UserAttributes: [
            { Name: "custom:status", Value: "approved" },
            { Name: "custom:role",   Value: "admin" },
          ],
        }));
        // Update local vars
        attrs["custom:status"] = "approved";
        attrs["custom:role"]   = "admin";
        console.log(`✅ Admin auto-approved on login: ${email}`);
      }

      const finalStatus = attrs["custom:status"] || "pending";
      const finalRole   = attrs["custom:role"]   || "member";

      // Block login if not approved
      if (finalStatus === "pending") {
        return res.status(403).json({ error: "Your account is pending admin approval. You will receive an email once approved." });
      }
      if (finalStatus === "rejected") {
        return res.status(403).json({ error: "Your account has been rejected. Please contact the administrator." });
      }

      // Issue JWT
      const token = jwt.sign(
        { email: email.toLowerCase(), name, role: finalRole, status: finalStatus, faceId },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );

      console.log(`✅ User logged in: ${name} (${email}) — role: ${finalRole}`);
      res.json({
        success: true, token,
        user: { name, email: email.toLowerCase(), role: finalRole, faceId },
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


  // ── POST /api/auth/setup-admin ─────────────────────────────────────────────
  // Creates admin account directly — only works for ADMIN_EMAIL
  // Use this if admin registration gets stuck
  router.post("/setup-admin", async (req, res) => {
    const { email, password, name } = req.body;

    if (!isAdminEmail(email)) {
      return res.status(403).json({ error: "This email is not configured as admin." });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const adminName = name || "Admin";

    try {
      // Try to create user in Cognito
      try {
        const { AdminSetUserPasswordCommand } = require("@aws-sdk/client-cognito-identity-provider");

        // Check if user already exists
        try {
          await cognitoClient.send(new AdminGetUserCommand({
            UserPoolId: POOL_ID,
            Username:   email.toLowerCase(),
          }));
          // User exists — just update attributes and password
          await cognitoClient.send(new AdminSetUserPasswordCommand({
            UserPoolId: POOL_ID,
            Username:   email.toLowerCase(),
            Password:   password,
            Permanent:  true,
          }));
          await cognitoClient.send(new AdminUpdateUserAttributesCommand({
            UserPoolId: POOL_ID,
            Username:   email.toLowerCase(),
            UserAttributes: [
              { Name: "custom:status", Value: "approved" },
              { Name: "custom:role",   Value: "admin"    },
              { Name: "name",          Value: adminName  },
              { Name: "email_verified", Value: "true"    },
            ],
          }));
          console.log(`✅ Admin account updated: ${email}`);
          return res.json({ success: true, message: "Admin account updated. You can now login.", email, password });
        } catch (notFoundErr) {
          if (notFoundErr.name !== "UserNotFoundException") throw notFoundErr;
        }

        // Create new admin user directly via admin API
        const { AdminCreateUserCommand } = require("@aws-sdk/client-cognito-identity-provider");
        await cognitoClient.send(new AdminCreateUserCommand({
          UserPoolId:        POOL_ID,
          Username:          email.toLowerCase(),
          TemporaryPassword: password,
          MessageAction:     "SUPPRESS", // Don't send welcome email
          UserAttributes: [
            { Name: "name",           Value: adminName             },
            { Name: "email",          Value: email.toLowerCase()   },
            { Name: "email_verified", Value: "true"                },
            { Name: "custom:role",    Value: "admin"               },
            { Name: "custom:status",  Value: "approved"            },
            { Name: "custom:faceId",  Value: ""                    },
          ],
        }));

        // Set permanent password
        await cognitoClient.send(new AdminSetUserPasswordCommand({
          UserPoolId: POOL_ID,
          Username:   email.toLowerCase(),
          Password:   password,
          Permanent:  true,
        }));

        console.log(`✅ Admin account created: ${email}`);
        res.json({
          success:  true,
          message:  "Admin account created successfully! You can now login.",
          email,
          password,
        });

      } catch (cognitoErr) {
        throw cognitoErr;
      }
    } catch (err) {
      console.error("❌ Setup admin error:", err.message);
      if (err.name === "InvalidPasswordException") {
        return res.status(400).json({
          error: "Password must have uppercase, lowercase, number and special character (e.g. Admin@2026)",
        });
      }
      res.status(500).json({ error: "Admin setup failed", details: err.message });
    }
  });


  // ── POST /api/auth/fix-admin ────────────────────────────────────────────────
  // One-time route to fix admin status in Cognito if stuck as pending
  router.post("/fix-admin", async (req, res) => {
    const { secret } = req.body;
    // Secret key to protect this route
    if (secret !== "punch-admin-fix-2026") {
      return res.status(403).json({ error: "Invalid secret" });
    }
    try {
      const adminEmails = ADMIN_EMAILS.filter(Boolean);
      const results = [];
      for (const adminEmail of adminEmails) {
        try {
          await cognitoClient.send(new AdminUpdateUserAttributesCommand({
            UserPoolId: POOL_ID,
            Username:   adminEmail,
            UserAttributes: [
              { Name: "custom:status", Value: "approved" },
              { Name: "custom:role",   Value: "admin" },
            ],
          }));
          results.push({ email: adminEmail, fixed: true });
          console.log(`✅ Admin fixed: ${adminEmail}`);
        } catch (err) {
          results.push({ email: adminEmail, fixed: false, error: err.message });
        }
      }
      res.json({ success: true, results });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/auth/me ────────────────────────────────────────────────────────
  router.get("/me", verifyToken, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
};