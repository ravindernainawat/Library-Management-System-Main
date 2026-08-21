/**
 * Book Management & Catalog Integration Tests
 */
module.exports = async function runBooksTests({ BASE, request, assert, test, tokens, models }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  BOOK MANAGEMENT & CATALOG TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { adminToken, teacherToken, studentAToken } = tokens;
  const { Book, BookCopy, Transaction } = models;

  let createdBookId = null;

  await test("Student/Teacher cannot create books (403)", async () => {
    const r1 = await request("POST", `${BASE}/api/books`, { title: "Hacker Book", author: "Anon", category: "General", quantity: 2 }, studentAToken);
    assert(r1.status === 403, `Expected 403, got ${r1.status}`);

    const r2 = await request("POST", `${BASE}/api/books`, { title: "Teacher Book", author: "Prof", category: "Science", quantity: 2 }, teacherToken);
    assert(r2.status === 403, `Expected 403, got ${r2.status}`);
  });

  await test("Admin can create a new book with auto-generated copies and QR codes", async () => {
    const r = await request("POST", `${BASE}/api/books`, {
      title: "Clean Code Architecture",
      author: "Robert C. Martin",
      category: "Computer Science",
      isbn: "9780134494166",
      quantity: 3,
      department: "Engineering",
      branch: "CSE"
    }, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success === true, "Expected success: true");
    assert(r.body.book && r.body.book._id, "Book object missing from response");
    
    createdBookId = r.body.book._id.toString();
    assert(r.body.book.totalCopies === 3, `Expected totalCopies=3, got ${r.body.book.totalCopies}`);
    assert(r.body.book.availableCopies === 3, `Expected availableCopies=3, got ${r.body.book.availableCopies}`);

    const copies = await BookCopy.find({ bookId: createdBookId });
    assert(copies.length === 3, `Expected 3 copies, found ${copies.length}`);
  });

  await test("Catalog retrieval with search and pagination works", async () => {
    const r = await request("GET", `${BASE}/api/books?search=Clean%20Code&page=1&limit=10`, null, studentAToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.success === true, "Expected success: true");
    assert(r.body.data && r.body.data.length >= 1, "Catalog returned empty array for search");
  });

  await test("Individual book detail endpoint returns book metadata and copies", async () => {
    assert(createdBookId, "No createdBookId available");
    const r = await request("GET", `${BASE}/api/books/${createdBookId}`, null, studentAToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.title === "Clean Code Architecture", `Title mismatch: ${r.body.title}`);
    assert(r.body.copies && r.body.copies.length === 3, "Copies missing in book detail response");
  });

  await test("Admin can update book details", async () => {
    assert(createdBookId, "No createdBookId available");
    const r = await request("PUT", `${BASE}/api/books/${createdBookId}`, {
      title: "Clean Architecture (Updated)",
      author: "Robert C. Martin",
      category: "Computer Science",
      quantity: 4
    }, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const updated = await Book.findById(createdBookId);
    assert(updated.title === "Clean Architecture (Updated)", `Title failed to update: ${updated.title}`);
    assert(updated.totalCopies === 4, `totalCopies failed to update: ${updated.totalCopies}`);
  });

  await test("Cannot delete a book with active issued transactions", async () => {
    assert(createdBookId, "No createdBookId available");
    const activeTx = await Transaction.create({
      bookId: createdBookId,
      userId: "000000000000000000000001",
      userName: "Test User",
      userRole: "student",
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 86400000),
      status: "issued"
    });

    const r = await request("DELETE", `${BASE}/api/books/${createdBookId}`, null, adminToken);
    assert(r.status === 400, `Expected 400 when deleting book with active issue, got ${r.status}`);

    await Transaction.deleteOne({ _id: activeTx._id });
  });

  await test("Admin can delete eligible book", async () => {
    assert(createdBookId, "No createdBookId available");
    const r = await request("DELETE", `${BASE}/api/books/${createdBookId}`, null, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const checkBook = await Book.findById(createdBookId);
    assert(!checkBook, "Book record still exists after deletion");
  });
};
