const { Resend } = require("resend");

const resend   = new Resend(process.env.RESEND_API_KEY);
const FROM     = "Punch Tracker <onboarding@resend.dev>";
const APP_URL  = process.env.APP_URL || "https://secure-punch-in-tracker.onrender.com";

// ── Generate 6-digit OTP ──────────────────────────────────────────────────────
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Send OTP Email ────────────────────────────────────────────────────────────
async function sendOTPEmail(toEmail, otp, purpose = "verification") {
  const isLogin = purpose === "login";

  await resend.emails.send({
    from:    FROM,
    to:      toEmail,
    subject: isLogin
      ? "🔐 Your login OTP — Punch Tracker"
      : "📧 Verify your email — Punch Tracker",
    html: `
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
            This code expires in <strong>5 minutes</strong>. Do not share it with anyone.
          </p>
        </div>
        <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:16px;">
          If you did not request this, please ignore this email.
        </p>
      </div>
    `,
  });
  console.log(`✅ OTP email sent to ${toEmail}`);
}

// ── Send Approval / Rejection Email ──────────────────────────────────────────
async function sendStatusEmail(toEmail, name, status) {
  const isApproved = status === "approved";

  await resend.emails.send({
    from:    FROM,
    to:      toEmail,
    subject: isApproved
      ? "✅ Account Approved — Punch Tracker"
      : "❌ Account Rejected — Punch Tracker",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f4f6fb;border-radius:12px;">
        <div style="background:${isApproved ? "#059669" : "#dc2626"};padding:20px;border-radius:8px;text-align:center;margin-bottom:24px;">
          <h1 style="color:white;margin:0;font-size:22px;">🕐 Punch Tracker</h1>
        </div>
        <div style="background:white;padding:24px;border-radius:8px;border:1px solid #e4e9f2;">
          <h2 style="color:#0f172a;margin:0 0 12px;">Hello ${name},</h2>
          ${isApproved
            ? `<p style="color:#475569;">Your account has been <strong style="color:#059669;">approved</strong> by the admin.</p>
               <p style="color:#475569;">You can now log in and start marking your attendance.</p>
               <div style="text-align:center;margin-top:20px;">
                 <a href="${APP_URL}/login"
                    style="background:#2563eb;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">
                   Login Now →
                 </a>
               </div>`
            : `<p style="color:#475569;">Your account registration has been <strong style="color:#dc2626;">rejected</strong> by the admin.</p>
               <p style="color:#475569;">Please contact your administrator for more information.</p>`
          }
        </div>
      </div>
    `,
  });
  console.log(`✅ Status email (${status}) sent to ${toEmail}`);
}

module.exports = { generateOTP, sendOTPEmail, sendStatusEmail };