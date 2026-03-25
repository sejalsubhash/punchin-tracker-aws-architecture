const SibApiV3Sdk = require("sib-api-v3-sdk");

const client = SibApiV3Sdk.ApiClient.instance;
const apiKey = client.authentications["api-key"];
apiKey.apiKey = process.env.BREVO_API_KEY;

const transEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOTPEmail(toEmail, otp, purpose = "verification") {
  const isLogin = purpose === "login";
  try {
    const result = await transEmailApi.sendTransacEmail({
      sender:  { name: "Punch Tracker", email: process.env.BREVO_FROM_EMAIL },
      to:      [{ email: toEmail }],
      subject: isLogin
        ? "🔐 Your login OTP — Punch Tracker"
        : "📧 Verify your email — Punch Tracker",
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f4f6fb;border-radius:12px;">
          <div style="background:#2563eb;padding:20px;border-radius:8px;text-align:center;margin-bottom:24px;">
            <h1 style="color:white;margin:0;font-size:22px;">🕐 Punch Tracker</h1>
            <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px;">Team Attendance System</p>
          </div>
          <div style="background:white;padding:24px;border-radius:8px;border:1px solid #e4e9f2;">
            <p style="color:#475569;font-size:14px;margin:0 0 12px;">
              ${isLogin ? "Your login OTP is:" : "Your email verification code is:"}
            </p>
            <div style="background:#eff4ff;border:2px dashed #2563eb;border-radius:8px;padding:20px;text-align:center;margin:16px 0;">
              <span style="font-size:40px;font-weight:700;color:#2563eb;letter-spacing:10px;font-family:monospace;">${otp}</span>
            </div>
            <p style="color:#94a3b8;font-size:12px;text-align:center;margin:12px 0 0;">
              Expires in <strong>5 minutes</strong>. Do not share.
            </p>
          </div>
        </div>
      `,
    });
    console.log("✅ OTP email sent via Brevo:", result.messageId);
  } catch (err) {
    console.error("❌ Brevo error:", err.message);
    throw err;
  }
}

async function sendStatusEmail(toEmail, name, status) {
  const isApproved = status === "approved";
  const APP_URL    = process.env.APP_URL || "https://secure-punch-in-tracker.onrender.com";
  try {
    await transEmailApi.sendTransacEmail({
      sender:  { name: "Punch Tracker", email: process.env.BREVO_FROM_EMAIL },
      to:      [{ email: toEmail }],
      subject: isApproved
        ? "✅ Account Approved — Punch Tracker"
        : "❌ Account Rejected — Punch Tracker",
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          <h2 style="color:${isApproved ? "#059669" : "#dc2626"};">Hello ${name},</h2>
          ${isApproved
            ? `<p>Your account has been <strong style="color:#059669;">approved</strong>.</p>
               <a href="${APP_URL}/login" style="background:#2563eb;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;margin-top:16px;">Login Now →</a>`
            : `<p>Your account has been <strong style="color:#dc2626;">rejected</strong>. Contact admin.</p>`
          }
        </div>
      `,
    });
    console.log(`✅ Status email (${status}) sent via Brevo`);
  } catch (err) {
    console.error("❌ Brevo status email error:", err.message);
    throw err;
  }
}

module.exports = { generateOTP, sendOTPEmail, sendStatusEmail };