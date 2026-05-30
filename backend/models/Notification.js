const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  userEmail: { type: String, default: "" },
  type: {
    type: String,
    enum: [
      "due_reminder", "due_reminder_2day", "due_reminder_today",
      "overdue", "overdue_daily",
      "available", "request_update", "general",
      "exchange_request", "exchange_update",
      "reservation_available",
      "admin_approval", "account_blocked", "account_approved",
      "account_unblocked"
    ],
    required: true
  },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  emailSent: { type: Boolean, default: false }
}, { timestamps: true });

notificationSchema.post("save", async function(doc) {
  if (!doc.emailSent) {
    let toEmail = doc.userEmail;
    // If no email was provided (e.g., cron job reminders), look it up
    if (!toEmail && doc.userName) {
      const User = mongoose.model("User");
      const user = await User.findOne({ name: doc.userName });
      if (user && user.contact) {
        toEmail = user.contact;
      } else {
        const Account = mongoose.model("Account");
        const account = await Account.findOne({ name: doc.userName });
        if (account && account.email) {
          toEmail = account.email;
        }
      }
    }

    if (toEmail) {
      const { sendEmail } = require("../utils");
      const sent = await sendEmail(toEmail, "BookSphere Library Notification", doc.message);
      if (sent) {
        // Use updateOne to avoid triggering another save hook
        await mongoose.model("Notification").updateOne({ _id: doc._id }, { emailSent: true });
      }
    }
  }
});

module.exports = mongoose.model("Notification", notificationSchema);
