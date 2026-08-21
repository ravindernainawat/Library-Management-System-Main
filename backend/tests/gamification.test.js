/**
 * Gamification & Leaderboard Integration Tests
 */
module.exports = async function runGamificationTests({ BASE, request, assert, test, tokens, models }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  GAMIFICATION & LEADERBOARD TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { studentAToken, studentBToken } = tokens;

  await test("Leaderboard endpoint returns top accounts", async () => {
    const r = await request("GET", `${BASE}/api/features/gamification/leaderboard`, null, studentAToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body), "Expected array response for leaderboard");
  });

  await test("Student A can access their own gamification stats", async () => {
    const r = await request("GET", `${BASE}/api/features/gamification/user/student-a@krmu.edu.in`, null, studentAToken);
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(typeof r.body.points === "number", "Points missing from response");
    assert(r.body.rank, "Rank missing from response");
  });

  await test("Student A cannot access Student B's gamification stats (403)", async () => {
    const r = await request("GET", `${BASE}/api/features/gamification/user/student-b@krmu.edu.in`, null, studentAToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });
};
