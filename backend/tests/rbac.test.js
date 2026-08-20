/**
 * Role-Based Access Control (RBAC) Matrix Integration Tests
 */
module.exports = async function runRbacTests({ BASE, request, assert, test, tokens }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  COMPLETE RBAC MATRIX SECURITY TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { ownerToken, adminToken, teacherToken, studentAToken } = tokens;

  await test("Student cannot access Admin transaction list (403)", async () => {
    const r = await request("GET", `${BASE}/api/transactions`, null, studentAToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Student cannot access Admin fine verification endpoint (403)", async () => {
    const r = await request("PUT", `${BASE}/api/transactions/verify-fine/000000000000000000000001`, {}, studentAToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Student cannot access Admin analytics endpoint (403)", async () => {
    const r = await request("GET", `${BASE}/api/analytics`, null, studentAToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Student A cannot view Student B's borrowing history (403)", async () => {
    const r = await request("GET", `${BASE}/api/transactions/history/Student%20B`, null, studentAToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Teacher cannot access Admin transaction list (403)", async () => {
    const r = await request("GET", `${BASE}/api/transactions`, null, teacherToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Teacher cannot access Admin analytics (403)", async () => {
    const r = await request("GET", `${BASE}/api/analytics`, null, teacherToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Admin can access Admin transaction list (200)", async () => {
    const r = await request("GET", `${BASE}/api/transactions`, null, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test("Admin can access Admin analytics (200)", async () => {
    const r = await request("GET", `${BASE}/api/analytics`, null, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test("Owner can access analytics endpoints (200)", async () => {
    const r = await request("GET", `${BASE}/api/analytics`, null, ownerToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });
};
