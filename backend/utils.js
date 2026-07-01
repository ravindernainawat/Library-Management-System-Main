const ActivityLog = require("./models/ActivityLog");

async function logActivity(action, performedBy, details) {
  try { await ActivityLog.create({ action, performedBy, details }); } catch(err) {}
}

function calcFine(t) {
  const now = new Date();
  const due = new Date(t.dueDate);
  let diff;
  if (t.status === "returned" && t.returnDate) diff = new Date(t.returnDate) - due;
  else diff = now - due;
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24)) * 5;
}

async function notifyReservationQueue(book, Reservation, Notification) {
  if (!book || book.availableCopies <= 0) return;
  const next = await Reservation.findOne({ bookId: book._id, status: "waiting" }).sort({ position: 1 });
  if (next) {
    next.status = "notified";
    next.notifiedAt = new Date();
    next.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h to claim
    await next.save();
    await Notification.create({ userName: next.userName, userEmail: next.userEmail, type: "reservation_available", message: `Great news! "${book.title}" is now available. You are #1 in queue. Reserve within 48 hours!` });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL DELIVERY SYSTEM
//
// Priority order:
//   1. Brevo HTTP API — Primary for production (free 300/day, works on Railway, ANY recipient)
//   2. Resend API     — Secondary cloud provider (sandbox: only sends to verified emails)
//   3. Gmail SMTP     — Local development fallback (blocked on cloud platforms)
//
// Brevo Setup (Recommended for Production):
//   1. Sign up free at https://www.brevo.com
//   2. Go to Settings → SMTP & API → API Keys tab → Generate a new API key
//   3. Copy the API key (starts with xkeysib-...)
//   4. Set these env vars in Railway:
//      BREVO_API_KEY=xkeysib-xxxxxx
//      BREVO_SENDER_EMAIL=ravindernainawat007@gmail.com  (must match your Brevo account email)
//      BREVO_SENDER_NAME=BookSphere
// ─────────────────────────────────────────────────────────────────────────────

// Strategy 1: Brevo HTTP API (works on Railway, sends to ANY email, free 300/day, no SMTP needed)
async function sendViaBrevo(to, subject, html, text) {
  const axios = require("axios");
  
  const senderName = process.env.BREVO_SENDER_NAME || "BookSphere";
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "ravindernainawat007@gmail.com";

  const response = await axios.post("https://api.brevo.com/v3/smtp/email", {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: to }],
    subject: subject,
    htmlContent: html,
    textContent: text,
  }, {
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    timeout: 15000,
  });
  
  console.log(`[Email/Brevo] ✓ Sent to ${to} (messageId: ${response.data.messageId})`);
  return true;
}

// Strategy 2: Resend API (works on Railway, but free tier only sends to verified emails)
async function sendViaResend(to, subject, html, text) {
  const { Resend } = require("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  
  const fromAddress = process.env.EMAIL_FROM || "BookSphere <onboarding@resend.dev>";
  
  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: [to],
    subject,
    html,
    text,
  });
  
  if (error) throw new Error(error.message);
  console.log(`[Email/Resend] ✓ Sent to ${to} (id: ${data.id})`);
  return true;
}

// Strategy 3: Gmail SMTP (works locally, blocked on most cloud platforms)
async function sendViaSMTP(to, subject, html, text) {
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({ 
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: (process.env.SMTP_PORT || '587') === '465',
    auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
  
  const info = await transporter.sendMail({ 
    from: `"BookSphere System" <${process.env.SMTP_EMAIL}>`, 
    replyTo: process.env.SMTP_EMAIL,
    to, subject, text, html 
  });
  console.log(`[Email/SMTP] ✓ Sent to ${to} (messageId: ${info.messageId})`);
  return true;
}

// Verify email provider at startup
async function verifySMTP() {
  // Check Brevo API first (production recommended)
  if (process.env.BREVO_API_KEY) {
    try {
      const axios = require("axios");
      const response = await axios.get("https://api.brevo.com/v3/account", {
        headers: { "api-key": process.env.BREVO_API_KEY },
        timeout: 10000,
      });
      const plan = response.data.plan?.[0]?.type || "free";
      console.log(`  ✓ Brevo API verified — email delivery active (plan: ${plan})`);
      console.log(`    Sender: ${process.env.BREVO_SENDER_EMAIL || "ravindernainawat007@gmail.com"}`);
      console.log(`    Free tier: 300 emails/day to ANY recipient`);
      return true;
    } catch(e) {
      console.error("  ✗ Brevo API verification FAILED:", e.response?.data?.message || e.message);
    }
  }

  // Check Resend
  if (process.env.RESEND_API_KEY) {
    try {
      console.log("  ✓ Resend API key configured — email delivery active (cloud-ready)");
      console.log(`    From: ${process.env.EMAIL_FROM || "onboarding@resend.dev"}`);
      console.log("    ⚠ Note: Resend free tier only sends to YOUR verified email.");
      console.log("    → For sending to ANY email, configure BREVO_API_KEY (free at brevo.com)");
      return true;
    } catch(e) {
      console.error("  ✗ Resend setup error:", e.message);
    }
  }
  
  // Fall back to Gmail SMTP check
  if (process.env.SMTP_ENABLED === "true" && process.env.SMTP_EMAIL) {
    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({ 
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: (process.env.SMTP_PORT || '587') === '465',
        auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
      });
      await transporter.verify();
      console.log("  ✓ SMTP connection verified — email delivery active (local/SMTP)");
      return true;
    } catch(e) {
      console.error("  ✗ SMTP verification FAILED:", e.code || e.message);
      console.error("    Gmail SMTP is blocked on most cloud platforms.");
      console.error("    → Set BREVO_API_KEY for cloud deployment (free at brevo.com)");
      return false;
    }
  }
  
  console.log("  ⚠ No email provider configured.");
  console.log("    → Set BREVO_API_KEY for production (free at brevo.com)");
  return false;
}

// Main email function — tries Brevo API → Resend → Gmail SMTP
async function sendEmail(to, subject, html) {
  // Prevent sending emails to dummy/test domains which cause bounces
  if (/@(booksphere\.com|example\.com|test\.com)$/i.test(to)) {
    console.log(`[Email] Skipped sending to dummy address: ${to}`);
    return false;
  }
  
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Strategy 1: Brevo HTTP API (production — sends to ANY email, no SMTP ports needed)
  if (process.env.BREVO_API_KEY) {
    try {
      return await sendViaBrevo(to, subject, html, text);
    } catch(e) {
      console.error(`[Email/Brevo] ✗ Failed for ${to}: ${e.response?.data?.message || e.message}`);
    }
  }

  // Strategy 2: Resend API (cloud-ready but free tier is sandbox-limited)
  if (process.env.RESEND_API_KEY) {
    try {
      return await sendViaResend(to, subject, html, text);
    } catch(e) {
      console.error(`[Email/Resend] ✗ Failed for ${to}: ${e.message}`);
    }
  }
  
  // Strategy 3: Gmail SMTP (works locally, usually blocked on cloud)
  if (process.env.SMTP_ENABLED === "true" && process.env.SMTP_EMAIL) {
    try {
      return await sendViaSMTP(to, subject, html, text);
    } catch(e) {
      if (process.env.NODE_ENV === "production") {
        console.error(`[Email/SMTP] ✗ Failed for ${to}`);
      } else {
        const errDetail = `code=${e.code || 'UNKNOWN'} msg=${e.message}`;
        console.error(`[Email/SMTP] ✗ Failed for ${to}: ${errDetail}`);
      }
    }
  }
  
  console.error("[Email] ✗ All email strategies failed. Configure BREVO_API_KEY in Railway.");
  return false;
}

module.exports = { logActivity, calcFine, notifyReservationQueue, sendEmail, verifySMTP };
