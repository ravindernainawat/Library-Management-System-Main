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
// Priority order (Automatic Fallback Chain):
//   1. Brevo HTTP API — Primary provider (free 300/day, sends to ANY recipient)
//   2. Resend API     — Secondary provider (free 100/day, free tier sends ONLY to verified email)
//   3. Gmail SMTP     — Local development fallback (blocked on cloud platforms)
//
// Setup Guides:
//   - Brevo: Sign up free at https://www.brevo.com, SMTP & API key, set BREVO_API_KEY.
//   - Resend: Sign up free at https://resend.com, get API key, set RESEND_API_KEY.
//   - Gmail SMTP: Enable 2FA, create App Password, set SMTP_EMAIL and SMTP_PASSWORD.
// ─────────────────────────────────────────────────────────────────────────────

// Strategy 1: Brevo HTTP API (works on Railway, sends to ANY email, free 300/day, no SMTP needed)
async function sendViaBrevo(to, subject, html, text) {
  const axios = require("axios");
  
  const senderName = process.env.BREVO_SENDER_NAME || "BookSphere";
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "info@booksphere.com";

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
  
  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [to],
      subject,
      html,
      text,
    });
    
    if (error) {
      if (process.env.NODE_ENV !== "test") console.error("❌ Resend API Error Details:", error);
      throw new Error(error.message || JSON.stringify(error));
    }
    console.log(`[Email/Resend] ✓ Sent to ${to} (id: ${data.id})`);
    return true;
  } catch (err) {
    if (process.env.NODE_ENV !== "test") console.error("❌ Resend Exception Details:", err);
    throw err;
  }
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
  let isAnyConfigured = false;
  let isAnySuccessful = false;

  // Check Brevo API (Primary — sends to ANY email)
  if (process.env.BREVO_API_KEY) {
    isAnyConfigured = true;
    try {
      const axios = require("axios");
      const response = await axios.get("https://api.brevo.com/v3/account", {
        headers: { "api-key": process.env.BREVO_API_KEY },
        timeout: 10000,
      });
      const plan = response.data.plan?.[0]?.type || "free";
      console.log(`  ✓ Brevo API verified — email delivery active (Primary, plan: ${plan})`);
      console.log(`    Sender: ${process.env.BREVO_SENDER_EMAIL || "info@booksphere.com"}`);
      console.log(`    Free tier: 300 emails/day to ANY recipient`);
      isAnySuccessful = true;
    } catch(e) {
      console.error("  ✗ Brevo API verification FAILED:", e.response?.data?.message || e.message);
    }
  }

  // Check Resend API (Secondary — free tier only sends to verified email)
  if (process.env.RESEND_API_KEY) {
    isAnyConfigured = true;
    try {
      console.log("  ✓ Resend API key configured — email delivery active (Secondary, cloud-ready)");
      console.log(`    From: ${process.env.EMAIL_FROM || "onboarding@resend.dev"}`);
      console.log("    ⚠ Note: Resend free tier only sends to YOUR verified email.");
      isAnySuccessful = true;
    } catch(e) {
      console.error("  ✗ Resend setup error:", e.message);
    }
  }
  
  // Check Gmail SMTP check (Fallback)
  if (process.env.SMTP_ENABLED === "true" && process.env.SMTP_EMAIL) {
    isAnyConfigured = true;
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
      console.log("  ✓ SMTP connection verified — email delivery active (Fallback, local/SMTP)");
      isAnySuccessful = true;
    } catch(e) {
      console.error("  ✗ SMTP verification FAILED:", e.code || e.message);
      console.error("    Gmail SMTP is blocked on most cloud platforms.");
      console.error("    → Set BREVO_API_KEY for cloud deployment (free at brevo.com)");
    }
  }
  
  if (!isAnyConfigured) {
    console.log("  ⚠ No email provider configured.");
    console.log("    → Set BREVO_API_KEY for production (free 300 emails/day at brevo.com)");
    return false;
  }
  
  return isAnySuccessful;
}

// Main email function — tries Brevo API → Resend → Gmail SMTP
async function sendEmail(to, subject, html) {
  // Prevent sending emails to dummy/test domains which cause bounces
  if (/@(booksphere\.com|example\.com|test\.com)$/i.test(to)) {
    console.log(`[Email] Skipped sending to dummy address: ${to}`);
    return false;
  }
  
  const hasProvider = process.env.BREVO_API_KEY || process.env.RESEND_API_KEY || (process.env.SMTP_ENABLED === "true" && process.env.SMTP_EMAIL);
  if (!hasProvider) {
    console.warn(`[Email] ⚠ No email provider configured. Skipped sending email to: ${to}`);
    return false;
  }

  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Strategy 1: Brevo HTTP API (Primary — sends to ANY email, free 300/day)
  if (process.env.BREVO_API_KEY) {
    try {
      return await sendViaBrevo(to, subject, html, text);
    } catch(e) {
      console.warn(`[Email/Brevo] ✗ Failed for ${to}: ${e.response?.data?.message || e.message}. Trying next provider...`);
    }
  }

  // Strategy 2: Resend API (Secondary — free tier only sends to verified email)
  if (process.env.RESEND_API_KEY) {
    try {
      return await sendViaResend(to, subject, html, text);
    } catch(e) {
      console.warn(`[Email/Resend] ✗ Failed for ${to}: ${e.message}. Trying next provider...`);
    }
  }
  
  // Strategy 3: Gmail SMTP (Fallback — works locally, blocked on most cloud platforms)
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
  
  console.error("[Email] ✗ All email strategies failed. Configure BREVO_API_KEY or RESEND_API_KEY.");
  return false;
}

module.exports = { logActivity, calcFine, notifyReservationQueue, sendEmail, verifySMTP };
