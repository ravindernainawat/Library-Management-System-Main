/**
 * P2P Book Exchange Lifecycle Integration Tests
 */
module.exports = async function runExchangeTests({ BASE, request, assert, test, tokens, models }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  P2P EXCHANGE SYSTEM TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { adminToken, studentAToken, studentBToken } = tokens;
  const { Book, Exchange, User } = models;

  const studentA = await User.findOne({ contact: "student-a@krmu.edu.in" });
  const studentB = await User.findOne({ contact: "student-b@krmu.edu.in" });
  assert(studentA && studentB, "Student A or B user record missing");

  const testBook = await Book.create({
    title: "Design Patterns Gang of Four",
    author: "Erich Gamma",
    category: "Software",
    totalCopies: 1,
    availableCopies: 1
  });

  let exchangeId = null;

  await test("Student A cannot initiate exchange in Student B's name (403)", async () => {
    const r = await request("POST", `${BASE}/api/features/exchanges`, {
      fromUser: studentB.name,
      fromUserEmail: studentB.contact,
      toUser: studentA.name,
      toUserEmail: studentA.contact,
      bookId: testBook._id.toString(),
      bookTitle: testBook.title
    }, studentAToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Student A proposes P2P exchange to Student B", async () => {
    const r = await request("POST", `${BASE}/api/features/exchanges`, {
      fromUser: studentA.name,
      fromUserEmail: studentA.contact,
      toUser: studentB.name,
      toUserEmail: studentB.contact,
      bookId: testBook._id.toString(),
      bookTitle: testBook.title,
      campusLocation: "Library Block C"
    }, studentAToken);

    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success === true, "Expected success: true");

    exchangeId = r.body.exchange.id || r.body.exchange._id;
  });

  await test("Student A cannot accept an exchange meant for Student B (403)", async () => {
    assert(exchangeId, "No exchangeId");
    const r = await request("PUT", `${BASE}/api/features/exchanges/${exchangeId}/accept`, { campusLocation: "Block C" }, studentAToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Student B accepts the exchange request", async () => {
    assert(exchangeId, "No exchangeId");
    const r = await request("PUT", `${BASE}/api/features/exchanges/${exchangeId}/accept`, { campusLocation: "Library Block C" }, studentBToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const ex = await Exchange.findById(exchangeId);
    assert(ex.status === "accepted", `Expected status=accepted, got ${ex.status}`);
  });

  await test("Admin approves the exchange", async () => {
    assert(exchangeId, "No exchangeId");
    const r = await request("PUT", `${BASE}/api/features/exchanges/${exchangeId}/approve`, {}, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const ex = await Exchange.findById(exchangeId);
    assert(ex.status === "approved", `Expected status=approved, got ${ex.status}`);
  });

  // Cleanup
  await Book.deleteOne({ _id: testBook._id });
  if (exchangeId) await Exchange.deleteOne({ _id: exchangeId });
};
