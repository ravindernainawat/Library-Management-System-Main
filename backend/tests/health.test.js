/**
 * Health Check Integration Tests
 */
module.exports = async function runHealthTests({ BASE, request, assert, test }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  HEALTH CHECK TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  await test("GET /api/health returns HTTP 200 and healthy status", async () => {
    const res = await request("GET", `${BASE}/api/health`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body && (res.body.status === "ok" || res.body.success === true || res.body.status === "healthy"), "Health response missing valid status");
  });

  await test("Health check response does not expose sensitive keys or secrets", async () => {
    const res = await request("GET", `${BASE}/api/health`);
    const str = JSON.stringify(res.body);
    assert(!str.includes("JWT_SECRET") && !str.includes("GEMINI_API_KEY") && !str.includes("BREVO_API_KEY"), "Health response exposed sensitive environment variables");
  });
};
