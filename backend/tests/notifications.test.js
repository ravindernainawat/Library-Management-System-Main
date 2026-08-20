/**
 * Notification System Integration Tests
 */
module.exports = async function runNotificationsTests({ BASE, request, assert, test, tokens, models }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  NOTIFICATION SYSTEM TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { studentAToken, studentBToken } = tokens;
  const { Notification } = models;

  // Create temporary notification
  const notif = await Notification.create({
    userName: "Student A",
    userEmail: "student-a@krmu.edu.in",
    type: "general",
    message: "Test notification for Student A",
    read: false
  });

  await test("Student A can fetch their own notifications", async () => {
    const r = await request("GET", `${BASE}/api/notifications/student-a@krmu.edu.in`, null, studentAToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.success === true, "Expected success: true");
  });

  await test("Student B cannot access Student A's notifications (403)", async () => {
    const r = await request("GET", `${BASE}/api/notifications/student-a@krmu.edu.in`, null, studentBToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Student B cannot mark Student A's notification as read (403)", async () => {
    const r = await request("PUT", `${BASE}/api/notifications/${notif._id}/read`, {}, studentBToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Student A can mark their notification as read", async () => {
    const r = await request("PUT", `${BASE}/api/notifications/${notif._id}/read`, {}, studentAToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const updated = await Notification.findById(notif._id);
    assert(updated.read === true, "Notification read flag not updated to true");
  });

  // Cleanup
  await Notification.deleteOne({ _id: notif._id });
};
