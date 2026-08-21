/**
 * Book Renewal Integration Tests
 */
module.exports = async function runRenewalTests({ BASE, request, assert, test, tokens, models }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  BOOK RENEWAL WORKFLOW TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { adminToken, studentAToken, studentBToken } = tokens;
  const { Book, User, Transaction } = models;

  const studentA = await User.findOne({ contact: "student-a@krmu.edu.in" });
  assert(studentA, "Student A record missing");

  const testBook = await Book.create({
    title: "Clean Architecture",
    author: "Robert Martin",
    category: "Software",
    totalCopies: 1,
    availableCopies: 0
  });

  const futureDue = new Date();
  futureDue.setDate(futureDue.getDate() + 7);

  const activeTx = await Transaction.create({
    bookId: testBook._id,
    userId: studentA._id,
    userName: studentA.name,
    userRole: "student",
    issueDate: new Date(),
    dueDate: futureDue,
    status: "issued",
    renewed: false
  });

  await test("Student B cannot renew Student A's active book issue (403)", async () => {
    const r = await request("PUT", `${BASE}/api/transactions/${activeTx._id}/renew`, {}, studentBToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Student A can renew their active book issue", async () => {
    const r = await request("PUT", `${BASE}/api/transactions/${activeTx._id}/renew`, {}, studentAToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success === true, "Expected success: true");

    const updated = await Transaction.findById(activeTx._id);
    assert(updated.renewed === true, "renewed flag not set to true");
  });

  await test("Second renewal attempt on same transaction is rejected (400)", async () => {
    const r = await request("PUT", `${BASE}/api/transactions/${activeTx._id}/renew`, {}, studentAToken);
    assert(r.status === 400, `Expected 400 for second renewal, got ${r.status}`);
  });

  await test("Cannot renew an overdue book issue (400)", async () => {
    const pastDue = new Date();
    pastDue.setDate(pastDue.getDate() - 2);

    const overdueTx = await Transaction.create({
      bookId: testBook._id,
      userId: studentA._id,
      userName: studentA.name,
      userRole: "student",
      issueDate: new Date(Date.now() - 15 * 86400000),
      dueDate: pastDue,
      status: "issued",
      renewed: false
    });

    const r = await request("PUT", `${BASE}/api/transactions/${overdueTx._id}/renew`, {}, studentAToken);
    assert(r.status === 400, `Expected 400 for overdue renewal, got ${r.status}`);

    await Transaction.deleteOne({ _id: overdueTx._id });
  });

  // Cleanup
  await Book.deleteOne({ _id: testBook._id });
  await Transaction.deleteOne({ _id: activeTx._id });
};
