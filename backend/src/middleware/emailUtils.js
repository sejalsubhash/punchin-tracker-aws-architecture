const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const sesClient = new SESClient({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const APP_URL = process.env.APP_URL || "https://secure-punch-in-tracker.onrender.com";

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendStatusEmail(toEmail, name, status) {
  const isApproved = status === "approved";
  const FROM_EMAIL = process.env.SES_FROM_EMAIL;
  if (!FROM_EMAIL) {
    console.warn("⚠️  SES_FROM_EMAIL not set — skipping status email");
    return;
  }
  try {
    await sesClient.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: {
          Data: isApproved
            ? "✅ Account Approved — Punch Tracker"
            : "❌ Account Rejected — Punch Tracker",
        },
        Body: {
          Html: {
            Data: `
              <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f4f6fb;border-radius:12px;">
                <div style="background:${isApproved ? "#059669" : "#dc2626"};padding:20px;border-radius:8px;text-align:center;margin-bottom:24px;">
                  <h1 style="color:white;margin:0;">🕐 Punch Tracker</h1>
                </div>
                <div style="background:white;padding:24px;border-radius:8px;">
                  <h2>Hello ${name},</h2>
                  ${isApproved
                    ? `<p>Your account has been <strong style="color:#059669;">approved</strong>.</p>
                       <a href="${APP_URL}/login" style="background:#2563eb;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;margin-top:16px;">Login Now →</a>`
                    : `<p>Your account has been <strong style="color:#dc2626;">rejected</strong>. Contact admin.</p>`
                  }
                </div>
              </div>
            `,
          },
        },
      },
    }));
    console.log(`✅ Status email (${status}) sent to ${toEmail}`);
  } catch (err) {
    console.error("❌ SES status email error:", err.message);
  }
}

async function sendOTPEmail(toEmail, otp, purpose = "verification") {
  console.log(`ℹ️  Cognito handles OTP emails automatically — manual OTP not needed`);
}

module.exports = { generateOTP, sendOTPEmail, sendStatusEmail };