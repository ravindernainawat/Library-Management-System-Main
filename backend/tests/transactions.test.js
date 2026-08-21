/**
 * Transactions & Circulation Integration Tests
 */
module.exports = async function runTransactionsTests({ BASE, request, assert, test, tokens, models }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  TRANSACTION & CIRCULATION INTEGRITY TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { adminToken, studentAToken } = tokens;
  const { Book, BookCopy, User, Transaction } = models;

  let testBook = await Book.create({
    title: "Refactoring Design Patterns",
    author: "Martin Fowler",
    category: "Engineering",
    totalCopies: 1,
    availableCopies: 1
  });

  let testCopy = await BookCopy.create({
    bookId: testBook._id,
    copyNumber: 1,
    qrData: `BOOKSPHERE:${testBook._id}:COPY:1`,
    status: "available"
  });

  const studentUser = await User.findOne({ contact: "student-a@krmu.edu.in" });
  assert(studentUser, "Student A user record missing");

  let activeTxId = null;

  await test("Admin can manually issue a book to student", async () => {
    const r = await request("POST", `${BASE}/api/transactions/issue`, {
      bookId: testBook._id.toString(),
      userId: studentUser._id.toString(),
      issuedBy: "Admin Smith"
    }, adminToken);

    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success === true, "Expected success: true");

    const updatedBook = await Book.findById(testBook._id);
    assert(updatedBook.availableCopies === 0, `Expected availableCopies=0, got ${updatedBook.availableCopies}`);

    const updatedCopy = await BookCopy.findById(testCopy._id);
    assert(updatedCopy.status === "issued", `Expected copy status=issued, got ${updatedCopy.status}`);

    const tx = await Transaction.findOne({ bookId: testBook._id, status: "issued" });
    assert(tx, "Issued transaction record not found");
    activeTxId = tx._id.toString();
  });

  await test("Attempting to issue an unavailable book is rejected (400)", async () => {
    const r = await request("POST", `${BASE}/api/transactions/issue`, {
      bookId: testBook._id.toString(),
      userId: studentUser._id.toString()
    }, adminToken);
    assert(r.status === 400, `Expected 400 for unavailable book, got ${r.status}`);
  });

  await test("Admin can return issued book", async () => {
    assert(activeTxId, "No active Tx ID");
    const r = await request("POST", `${BASE}/api/transactions/return/${activeTxId}`, {}, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success === true, "Expected success: true");

    const updatedBook = await Book.findById(testBook._id);
    assert(updatedBook.availableCopies === 1, `Expected availableCopies=1, got ${updatedBook.availableCopies}`);

    const updatedCopy = await BookCopy.findById(testCopy._id);
    assert(updatedCopy.status === "available", `Expected copy status=available, got ${updatedCopy.status}`);
  });

  await test("Returning an already returned transaction is rejected (400)", async () => {
    assert(activeTxId, "No active Tx ID");
    const r = await request("POST", `${BASE}/api/transactions/return/${activeTxId}`, {}, adminToken);
    assert(r.status === 400, `Expected 400 for duplicate return, got ${r.status}`);
  });

  await test("Student cannot execute admin issue endpoint (403)", async () => {
    const r = await request("POST", `${BASE}/api/transactions/issue`, {
      bookId: testBook._id.toString(),
      userId: studentUser._id.toString()
    }, studentAToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  // Cleanup
  await Book.deleteOne({ _id: testBook._id });
  await BookCopy.deleteOne({ _id: testCopy._id });
  if (activeTxId) await Transaction.deleteOne({ _id: activeTxId });
};
