/**
 * CSV & PDF Reports Export Integration Tests
 */
module.exports = async function runReportsTests({ BASE, request, assert, test, tokens }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  REPORTS & CSV/PDF EXPORT TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { adminToken, teacherToken, studentAToken } = tokens;

  await test("Student cannot export CSV issue reports (403)", async () => {
    const r = await request("GET", `${BASE}/api/features/export/issues`, null, studentAToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Teacher cannot export PDF fine reports (403)", async () => {
    const r = await request("GET", `${BASE}/api/features/export/pdf/fines`, null, teacherToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Admin can export CSV inventory report", async () => {
    const r = await request("GET", `${BASE}/api/features/export/inventory`, null, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test("Admin can export PDF inventory report", async () => {
    const r = await request("GET", `${BASE}/api/features/export/pdf/inventory`, null, adminToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });
};
