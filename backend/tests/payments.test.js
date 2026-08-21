/**
 * Payment Verification & Workflow Tests
 */
module.exports = async function runPaymentsTests({ BASE, request, assert, test, tokens, models }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  PAYMENT WORKFLOW & MISMATCH TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { adminToken, studentAToken } = tokens;
  const { Book, User, Transaction } = models;

  const studentUser = await User.findOne({ contact: "student-a@krmu.edu.in" });
  assert(studentUser, "Student user record missing");

  const testBook = await Book.create({
    title: "Database System Concepts",
    author: "Silberschatz",
    category: "CS",
    totalCopies: 1,
    availableCopies: 1
  });

  const tx = await Transaction.create({
    bookId: testBook._id,
    userId: studentUser._id,
    userName: studentUser.name,
    userRole: "student",
    issueDate: new Date(Date.now() - 20 * 86400000),
    dueDate: new Date(Date.now() - 5 * 86400000),
    status: "returned",
    returnDate: new Date(),
    overdueFine: 25,
    totalFine: 25,
    fineStatus: "unpaid",
    paymentStatus: "none"
  });

  await test("Student payment with incorrect amount is rejected (400)", async () => {
    const r = await request("POST", `${BASE}/api/transactions/pay-fine/${tx._id}`, { amount: 10, paymentMethod: "upi" }, studentAToken);
    assert(r.status === 400, `Expected 400 for amount mismatch, got ${r.status}`);
  });

  await test("Admin can fetch unpaid and pending fines list", async () => {
    await request("POST", `${BASE}/api/transactions/pay-fine/${tx._id}`, { amount: 25, paymentMethod: "upi" }, studentAToken);
    const r = await request("GET", `${BASE}/api/transactions/fines/unpaid`, null, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.success === true, "Expected success: true");
  });

  await test("Student can view their own unpaid and pending fine payments", async () => {
    const r = await request("GET", `${BASE}/api/transactions/fines/unpaid`, null, studentAToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  // Cleanup
  await Book.deleteOne({ _id: testBook._id });
  await Transaction.deleteOne({ _id: tx._id });
};
