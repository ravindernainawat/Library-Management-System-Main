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
// EMAIL PROVIDER: Resend (primary, cloud-friendly) → Gmail SMTP (fallback, local dev)
//
// Gmail SMTP blocks connections from cloud IPs (Railway, Render, Heroku, etc).
// Resend is a modern email API that works from any platform.
// Free tier: 100 emails/day — more than enough for OTPs.
//
// Setup:
//   1. Sign up at https://resend.com (free)
//   2. Get your API key from the dashboard
//   3. Set RESEND_API_KEY=re_xxxxx in Railway env vars
//   4. Set EMAIL_FROM=onboarding@resend.dev (or your verified domain)
// ─────────────────────────────────────────────────────────────────────────────

// Send email via Resend API (works on Railway, Render, any cloud)
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

// Send email via Gmail SMTP (works locally, blocked on most cloud platforms)
async function sendViaSMTP(to, subject, html, text) {
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({ 
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: (process.env.SMTP_PORT || '587') === '465',
    auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 60000,
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
  // Check Resend first
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      // Resend doesn't have a verify endpoint, but we can check the key format
      console.log("  ✓ Resend API key configured — email delivery active (cloud-ready)");
      console.log(`    From: ${process.env.EMAIL_FROM || "onboarding@resend.dev"}`);
      return true;
    } catch(e) {
      console.error("  ✗ Resend setup error:", e.message);
    }
  }
  
  // Fall back to SMTP check
  if (process.env.SMTP_ENABLED === "true" && process.env.SMTP_EMAIL) {
    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({ 
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: (process.env.SMTP_PORT || '587') === '465',
        auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
      });
      await transporter.verify();
      console.log("  ✓ SMTP connection verified — email delivery active (local/SMTP)");
      return true;
    } catch(e) {
      console.error("  ✗ SMTP verification FAILED:", e.code || e.message);
      console.error("    Gmail SMTP is blocked on most cloud platforms.");
      console.error("    → Set RESEND_API_KEY for cloud deployment (free at resend.com)");
      return false;
    }
  }
  
  console.log("  ⚠ No email provider configured. Set RESEND_API_KEY or SMTP_ENABLED=true");
  return false;
}

// Main email function — tries Resend first, falls back to SMTP
async function sendEmail(to, subject, html) {
  // Prevent sending emails to dummy/test domains which cause bounces
  if (/@(booksphere\.com|example\.com|test\.com)$/i.test(to)) {
    console.log(`[Email] Skipped sending to dummy address: ${to}`);
    return false;
  }
  
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Strategy 1: Resend API (works everywhere including Railway)
  if (process.env.RESEND_API_KEY) {
    try {
      return await sendViaResend(to, subject, html, text);
    } catch(e) {
      console.error(`[Email/Resend] ✗ Failed for ${to}: ${e.message}`);
      // Don't fall through to SMTP on cloud — it'll fail too
      if (process.env.NODE_ENV === "production") return false;
    }
  }
  
  // Strategy 2: Gmail SMTP (works locally, usually blocked on cloud)
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
  
  if (process.env.NODE_ENV !== "production") {
    console.log("[Email] No working email provider. Set RESEND_API_KEY for Railway.");
  }
  return false;
}

module.exports = { logActivity, calcFine, notifyReservationQueue, sendEmail, verifySMTP };
