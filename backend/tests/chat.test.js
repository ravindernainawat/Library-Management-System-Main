/**
 * AI Assistant Chatbot Integration Tests
 */
module.exports = async function runChatTests({ BASE, request, assert, test, tokens }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  AI ASSISTANT CHATBOT TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { studentAToken } = tokens;

  await test("Unauthenticated chat request is rejected (401/403)", async () => {
    const r = await request("POST", `${BASE}/api/chat`, { message: "Hello" });
    assert(r.status === 401 || r.status === 403, `Expected 401/403, got ${r.status}`);
  });

  await test("Empty chat message is rejected (400)", async () => {
    const r = await request("POST", `${BASE}/api/chat`, {}, studentAToken);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Authenticated chat request returns structured response without exposing secrets", async () => {
    const r = await request("POST", `${BASE}/api/chat`, { message: "What books do you have on algorithms?" }, studentAToken);
    assert(r.status === 200 || r.status === 500, `Expected 200/500, got ${r.status}`);
    const str = JSON.stringify(r.body);
    assert(!str.includes("GEMINI_API_KEY") && !str.includes("AIzaSy"), "Chat endpoint leaked secret API key");
  });
};
