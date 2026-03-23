const nodemailer = require("nodemailer");

// ── Gmail SMTP transporter ────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD, // Gmail App Password (not login password)
  },
});

// ── Generate 6-digit OTP ──────────────────────────────────────────────────────
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Send OTP email ────────────────────────────────────────────────────────────
async function sendOTPEmail(toEmail, otp, purpose = "verification") {
  const subjects = {
    verification: "📧 Verify your email — Punch Tracker",
    login:        "🔐 Your login OTP — Punch Tracker",
  };

  const messages = {
    verification: `Your email verification OTP is`,
    login:        `Your login OTP is`,
  };

  const mailOptions = {
    from:    `"Punch Tracker" <${process.env.GMAIL_USER}>`,
    to:      toEmail,
    subject: subjects[purpose] || subjects.verification,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f4f6fb; border-radius: 12px;">
        <div style="background: #2563eb; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: white; margin: 0; font-size: 22px;">🕐 Punch Tracker</h1>
          <p style="color: #bfdbfe; margin: 4px 0 0; font-size: 13px;">Team Attendance System</p>
        </div>
        <div style="background: white; padding: 24px; border-radius: 8px; border: 1px solid #e4e9f2;">
          <p style="color: #475569; font-size: 14px; margin: 0 0 16px;">${messages[purpose] || messages.verification}:</p>
          <div style="background: #eff4ff; border: 2px dashed #2563eb; border-radius: 8px; padding: 20px; text-align: center; margin: 16px 0;">
            <span style="font-size: 36px; font-weight: 700; color: #2563eb; letter-spacing: 8px; font-family: monospace;">${otp}</span>
          </div>
          <p style="color: #94a3b8; font-size: 12px; margin: 16px 0 0; text-align: center;">
            This OTP expires in <strong>5 minutes</strong>. Do not share it with anyone.
          </p>
        </div>
        <p style="color: #94a3b8; font-size: 11px; text-align: center; margin-top: 16px;">
          If you did not request this, please ignore this email.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`✅ OTP email sent to ${toEmail}`);
}

// ── Send approval/rejection email ─────────────────────────────────────────────
async function sendStatusEmail(toEmail, name, status) {
  const isApproved = status === "approved";

  const mailOptions = {
    from:    `"Punch Tracker" <${process.env.GMAIL_USER}>`,
    to:      toEmail,
    subject: isApproved
      ? "✅ Account Approved — Punch Tracker"
      : "❌ Account Rejected — Punch Tracker",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f4f6fb; border-radius: 12px;">
        <div style="background: ${isApproved ? "#059669" : "#dc2626"}; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: white; margin: 0; font-size: 22px;">🕐 Punch Tracker</h1>
        </div>
        <div style="background: white; padding: 24px; border-radius: 8px; border: 1px solid #e4e9f2;">
          <h2 style="color: #0f172a; margin: 0 0 12px;">Hello ${name},</h2>
          ${isApproved
            ? `<p style="color: #475569;">Your account has been <strong style="color:#059669;">approved</strong> by the admin. You can now log in and mark your attendance.</p>
               <div style="text-align: center; margin-top: 20px;">
                 <a href="${process.env.APP_URL}/login" style="background: #2563eb; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">Login Now</a>
               </div>`
            : `<p style="color: #475569;">Unfortunately, your account registration has been <strong style="color:#dc2626;">rejected</strong> by the admin. Please contact your administrator for more information.</p>`
          }
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(`✅ Status email (${status}) sent to ${toEmail}`);
}

module.exports = { generateOTP, sendOTPEmail, sendStatusEmail };