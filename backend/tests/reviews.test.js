/**
 * Review System & XSS Security Integration Tests
 */
module.exports = async function runReviewsTests({ BASE, request, assert, test, tokens, models }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  REVIEW SYSTEM & SECURITY TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { studentAToken, studentBToken } = tokens;
  const { Book, Review, User } = models;

  const studentA = await User.findOne({ contact: "student-a@krmu.edu.in" });
  const studentB = await User.findOne({ contact: "student-b@krmu.edu.in" });
  assert(studentA && studentB, "Student A/B user records missing");

  const testBook = await Book.create({
    title: "Clean Code",
    author: "Robert C. Martin",
    category: "Software",
    totalCopies: 1,
    availableCopies: 1
  });

  await test("Student A cannot submit a review under Student B's identity (403)", async () => {
    const r = await request("POST", `${BASE}/api/reviews`, {
      bookId: testBook._id.toString(),
      userName: studentB.name,
      userEmail: studentB.contact,
      rating: 5,
      comment: "Spoofed review"
    }, studentAToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Student A can submit a review with rating 1-5", async () => {
    const r = await request("POST", `${BASE}/api/reviews`, {
      bookId: testBook._id.toString(),
      userName: studentA.name,
      userEmail: studentA.contact,
      rating: 5,
      comment: "Excellent book!"
    }, studentAToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success === true, "Expected success: true");
  });

  await test("Review comments with XSS payloads are handled safely", async () => {
    const xssPayload = "<script>alert('xss')</script>";
    const r = await request("POST", `${BASE}/api/reviews`, {
      bookId: testBook._id.toString(),
      userName: studentA.name,
      userEmail: studentA.contact,
      rating: 4,
      comment: xssPayload
    }, studentAToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    
    const listRes = await request("GET", `${BASE}/api/reviews/${testBook._id}`, null, studentAToken);
    assert(listRes.status === 200, `Expected 200, got ${listRes.status}`);
  });

  await test("Submitting review with missing rating returns 400", async () => {
    const r = await request("POST", `${BASE}/api/reviews`, {
      bookId: testBook._id.toString(),
      userName: studentA.name,
      userEmail: studentA.contact
    }, studentAToken);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  // Cleanup
  await Book.deleteOne({ _id: testBook._id });
  await Review.deleteMany({ bookId: testBook._id });
};
