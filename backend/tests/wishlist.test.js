/**
 * Wishlist System Integration Tests
 */
module.exports = async function runWishlistTests({ BASE, request, assert, test, tokens, models }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  WISHLIST SYSTEM TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { studentAToken, studentBToken } = tokens;
  const { Book, Wishlist, User } = models;

  const studentA = await User.findOne({ contact: "student-a@krmu.edu.in" });
  assert(studentA, "Student A record missing");

  const testBook = await Book.create({
    title: "Introduction to Algorithms",
    author: "Cormen",
    category: "CS",
    totalCopies: 1,
    availableCopies: 0
  });

  let wishlistItemId = null;

  await test("Student A can add a book to their wishlist", async () => {
    const r = await request("POST", `${BASE}/api/wishlist`, {
      bookId: testBook._id.toString(),
      userName: studentA.name,
      userEmail: studentA.contact
    }, studentAToken);

    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success === true, "Expected success: true");

    wishlistItemId = r.body.wishlist.id || r.body.wishlist._id;
  });

  await test("Duplicate wishlist addition is prevented (400)", async () => {
    const r = await request("POST", `${BASE}/api/wishlist`, {
      bookId: testBook._id.toString(),
      userName: studentA.name,
      userEmail: studentA.contact
    }, studentAToken);
    assert(r.status === 400, `Expected 400 for duplicate wishlist, got ${r.status}`);
  });

  await test("Student B cannot view Student A's wishlist (403)", async () => {
    const r = await request("GET", `${BASE}/api/wishlist/${encodeURIComponent(studentA.contact)}`, null, studentBToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Student A can remove an item from their wishlist", async () => {
    assert(wishlistItemId, "No wishlistItemId");
    const r = await request("DELETE", `${BASE}/api/wishlist/${wishlistItemId}`, null, studentAToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  // Cleanup
  await Book.deleteOne({ _id: testBook._id });
  if (wishlistItemId) await Wishlist.deleteOne({ _id: wishlistItemId });
};
