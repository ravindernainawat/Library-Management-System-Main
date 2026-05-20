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

async function sendEmail(to, subject, html) {
  if (process.env.SMTP_ENABLED !== "true" || !process.env.SMTP_EMAIL) return false;
  try {
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({ 
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD } 
    });
    
    // Strip HTML for a plain text fallback (helps with Outlook spam filters)
    const text = html.replace(/<[^>]+>/g, ' ');
    
    await transporter.sendMail({ 
      from: `"BookSphere System" <${process.env.SMTP_EMAIL}>`, 
      replyTo: process.env.SMTP_EMAIL,
      to, 
      subject, 
      text,
      html 
    });
    return true;
  } catch(e) { console.log("Email error:", e.message); return false; }
}

module.exports = { logActivity, calcFine, notifyReservationQueue, sendEmail };
