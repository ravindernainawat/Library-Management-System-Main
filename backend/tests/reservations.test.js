/**
 * Book Reservations & Hold Queue Integration Tests
 */
module.exports = async function runReservationsTests({ BASE, request, assert, test, tokens, models }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  RESERVATION WORKFLOW & HOLD QUEUE TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { studentAToken, studentBToken } = tokens;
  const { Book, Reservation, User } = models;

  const studentA = await User.findOne({ contact: "student-a@krmu.edu.in" });
  assert(studentA, "Student A record missing");

  const testBook = await Book.create({
    title: "Algorithms 4th Edition",
    author: "Sedgewick",
    category: "CS",
    totalCopies: 2,
    availableCopies: 2
  });

  let reservationId = null;

  await test("Student A can reserve an available book (24h hold)", async () => {
    const r = await request("POST", `${BASE}/api/features/reservations`, {
      bookId: testBook._id.toString(),
      userName: studentA.name,
      userEmail: studentA.contact
    }, studentAToken);

    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success === true, "Expected success: true");

    const updatedBook = await Book.findById(testBook._id);
    assert(updatedBook.availableCopies === 1, `Expected availableCopies=1, got ${updatedBook.availableCopies}`);

    reservationId = r.body.reservation.id || r.body.reservation._id;
  });

  await test("Duplicate active reservation by same user is rejected (400)", async () => {
    const r = await request("POST", `${BASE}/api/features/reservations`, {
      bookId: testBook._id.toString(),
      userName: studentA.name,
      userEmail: studentA.contact
    }, studentAToken);
    assert(r.status === 400, `Expected 400 for duplicate reservation, got ${r.status}`);
  });

  await test("Student B cannot view Student A's reservations (403)", async () => {
    const r = await request("GET", `${BASE}/api/features/reservations/user/${encodeURIComponent(studentA.name)}`, null, studentBToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Student A can cancel their reservation and restore inventory", async () => {
    assert(reservationId, "No reservationId");
    const r = await request("DELETE", `${BASE}/api/features/reservations/${reservationId}`, null, studentAToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);

    const updatedBook = await Book.findById(testBook._id);
    assert(updatedBook.availableCopies === 2, `Expected restored availableCopies=2, got ${updatedBook.availableCopies}`);
  });

  // Cleanup
  await Book.deleteOne({ _id: testBook._id });
  if (reservationId) await Reservation.deleteOne({ _id: reservationId });
};
