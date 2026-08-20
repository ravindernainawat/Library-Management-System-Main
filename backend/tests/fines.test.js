/**
 * Fine Payment Lifecycle Regression Tests
 */
module.exports = async function runFinesTests({ BASE, request, assert, test, tokens, models }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  FINE SYSTEM & PAYMENT SECURITY TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { adminToken, studentAToken } = tokens;
  const { Book, User, Transaction } = models;

  const studentUser = await User.findOne({ contact: "student-a@krmu.edu.in" });
  assert(studentUser, "Student A user record missing");

  const testBook = await Book.create({
    title: "System Architecture",
    author: "Martin",
    category: "CS",
    totalCopies: 1,
    availableCopies: 1
  });

  const pastDue = new Date();
  pastDue.setDate(pastDue.getDate() - 10);
  const issueDate = new Date();
  issueDate.setDate(issueDate.getDate() - 24);

  const testTx = await Transaction.create({
    bookId: testBook._id,
    userId: studentUser._id,
    userName: studentUser.name,
    userRole: "student",
    issueDate: issueDate,
    dueDate: pastDue,
    returnDate: new Date(),
    status: "returned",
    overdueFine: 50,
    totalFine: 50,
    fineStatus: "unpaid",
    paymentStatus: "none"
  });
  const txId = testTx._id.toString();

  await test("Student can view unpaid fines", async () => {
    const r = await request("GET", `${BASE}/api/transactions/fines/unpaid`, null, studentAToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.success === true, "Expected success: true");
  });

  await test("Student fine payment sets paymentStatus=pending and keeps fineStatus=unpaid", async () => {
    const r = await request("POST", `${BASE}/api/transactions/pay-fine/${txId}`, { amount: 50, paymentMethod: "upi" }, studentAToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    const updated = await Transaction.findById(txId);
    assert(updated.fineStatus === "unpaid", `Expected fineStatus=unpaid, got ${updated.fineStatus}`);
    assert(updated.paymentStatus === "pending", `Expected paymentStatus=pending, got ${updated.paymentStatus}`);
  });

  await test("Duplicate payment attempt is blocked (400)", async () => {
    const r = await request("POST", `${BASE}/api/transactions/pay-fine/${txId}`, { amount: 50, paymentMethod: "upi" }, studentAToken);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Receipt access is blocked before admin verification (400)", async () => {
    const r = await request("GET", `${BASE}/api/transactions/receipt/${txId}`, null, studentAToken);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Student cannot verify fine payment directly (403)", async () => {
    const r = await request("PUT", `${BASE}/api/transactions/verify-fine/${txId}`, {}, studentAToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Admin can verify pending payment -> fineStatus becomes paid & receipt is authorized", async () => {
    const r = await request("PUT", `${BASE}/api/transactions/verify-fine/${txId}`, {}, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const updated = await Transaction.findById(txId);
    assert(updated.fineStatus === "paid", `Expected fineStatus=paid, got ${updated.fineStatus}`);
    assert(updated.paymentStatus === "completed", `Expected paymentStatus=completed, got ${updated.paymentStatus}`);

    const receiptRes = await request("GET", `${BASE}/api/transactions/receipt/${txId}`, null, studentAToken);
    assert(receiptRes.status === 200, `Expected receipt 200, got ${receiptRes.status}`);
  });

  await test("Double verification by admin is blocked (400)", async () => {
    const r = await request("PUT", `${BASE}/api/transactions/verify-fine/${txId}`, {}, adminToken);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  // Cleanup
  await Book.deleteOne({ _id: testBook._id });
  await Transaction.deleteOne({ _id: txId });
};
