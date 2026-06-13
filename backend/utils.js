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

// Shared transporter — created once, reused for all emails (connection pooling)
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  
  const nodemailer = require("nodemailer");
  _transporter = nodemailer.createTransport({ 
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: (process.env.SMTP_PORT || '465') === '465', // true for 465, false for 587
    auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 30000,  // 30 seconds — Railway containers need more time
    greetingTimeout: 30000,    // 30 seconds
    socketTimeout: 60000,      // 60 seconds
    pool: true,                // reuse connections
    maxConnections: 3,
    maxMessages: 50,
    logger: process.env.SMTP_DEBUG === 'true', // enable nodemailer debug logs
    debug: process.env.SMTP_DEBUG === 'true',
  });
  
  return _transporter;
}

// Verify SMTP connection at startup — call this once after server starts
async function verifySMTP() {
  if (process.env.SMTP_ENABLED !== "true" || !process.env.SMTP_EMAIL) {
    console.log("  ⚠ SMTP disabled (SMTP_ENABLED != true or SMTP_EMAIL not set)");
    return false;
  }
  try {
    const transporter = getTransporter();
    await transporter.verify();
    console.log("  ✓ SMTP connection verified — email delivery active");
    return true;
  } catch(e) {
    console.error("  ✗ SMTP verification FAILED:", e.code || e.message);
    console.error("    Check SMTP_EMAIL and SMTP_PASSWORD env vars on Railway");
    _transporter = null; // reset so it retries next time
    return false;
  }
}

async function sendEmail(to, subject, html) {
  if (process.env.SMTP_ENABLED !== "true" || !process.env.SMTP_EMAIL) {
    console.log("[Email] SMTP disabled — skipping email to", to);
    return false;
  }
  
  // Prevent sending emails to dummy/test domains which cause bounces
  if (/@(booksphere\.com|example\.com|test\.com)$/i.test(to)) {
    console.log(`[Email] Skipped sending to dummy address: ${to}`);
    return false;
  }

  const maxRetries = 2;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const transporter = getTransporter();
      
      // Strip HTML for a plain text fallback (helps with Outlook spam filters)
      const text = html.replace(/<[^>]+>/g, ' ');
      
      const info = await transporter.sendMail({ 
        from: `"BookSphere System" <${process.env.SMTP_EMAIL}>`, 
        replyTo: process.env.SMTP_EMAIL,
        to, 
        subject, 
        text,
        html 
      });
      console.log(`[Email] ✓ Sent to ${to} (messageId: ${info.messageId})`);
      return true;
    } catch(e) {
      const errDetail = `code=${e.code || 'UNKNOWN'} command=${e.command || 'N/A'} msg=${e.message}`;
      console.error(`[Email] ✗ Attempt ${attempt}/${maxRetries} failed for ${to}: ${errDetail}`);
      
      // Reset transporter on connection errors so next attempt creates a fresh one
      if (e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT' || e.code === 'ESOCKET' || e.code === 'ECONNRESET') {
        _transporter = null;
      }
      
      if (attempt < maxRetries) {
        // Wait 2 seconds before retry
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  return false;
}

module.exports = { logActivity, calcFine, notifyReservationQueue, sendEmail, verifySMTP };
