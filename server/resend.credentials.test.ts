import { describe, expect, it } from "vitest";

describe.skipIf(!process.env.RESEND_API_KEY)("Resend credentials", () => {
  it("authenticates against the domains endpoint without sending mail", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    expect(apiKey, "RESEND_API_KEY must be configured").toBeTruthy();
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(response.status).toBe(200);
  }, 15_000);
});
