/**
 * BookCopy & QR Code Integration Tests
 */
module.exports = async function runCopiesTests({ BASE, request, assert, test, tokens, models }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  BOOKCOPY & QR CODE SECURITY TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { adminToken, studentAToken, teacherToken } = tokens;
  const { Book, BookCopy } = models;

  // Create temporary book for copy testing
  const tempBook = await Book.create({
    title: "Domain Driven Design",
    author: "Eric Evans",
    category: "Software",
    totalCopies: 2,
    availableCopies: 2
  });

  const copy1 = await BookCopy.create({
    bookId: tempBook._id,
    copyNumber: 1,
    qrData: `BOOKSPHERE:${tempBook._id}:COPY:1`,
    status: "available"
  });

  await test("Student cannot update copy shelf location or condition (403)", async () => {
    const r = await request("PUT", `${BASE}/api/books/copies/${copy1._id}`, {
      aisle: "A1", rack: "R2", position: "P3", condition: "good"
    }, studentAToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Teacher cannot update copy shelf location (403)", async () => {
    const r = await request("PUT", `${BASE}/api/books/copies/${copy1._id}`, {
      aisle: "A1", rack: "R2", position: "P3"
    }, teacherToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Admin can update copy shelf location and condition", async () => {
    const r = await request("PUT", `${BASE}/api/books/copies/${copy1._id}`, {
      aisle: "A3", rack: "R12", position: "Shelf-4", condition: "new"
    }, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const updated = await BookCopy.findById(copy1._id);
    assert(updated.shelfLocation.aisle === "A3", `Aisle mismatch: ${updated.shelfLocation.aisle}`);
    assert(updated.condition === "new", `Condition mismatch: ${updated.condition}`);
  });

  await test("Admin can report copy damage", async () => {
    const r = await request("POST", `${BASE}/api/books/copies/${copy1._id}/damage`, {
      description: "Torn cover page",
      reportedBy: "Admin Smith"
    }, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const updated = await BookCopy.findById(copy1._id);
    assert(updated.condition === "damaged", `Expected condition=damaged, got ${updated.condition}`);
    assert(updated.damageHistory.length >= 1, "Damage history entry not recorded");
  });

  await test("Invalid copy ID returns proper error (404/500)", async () => {
    const r = await request("PUT", `${BASE}/api/books/copies/000000000000000000000099`, {
      aisle: "B1"
    }, adminToken);
    assert(r.status === 404 || r.status === 500, `Expected 404 or 500, got ${r.status}`);
  });

  // Cleanup temp book and copy
  await Book.deleteOne({ _id: tempBook._id });
  await BookCopy.deleteMany({ bookId: tempBook._id });
};
