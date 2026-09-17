import { describe, expect, it } from "vitest";
import { parseOpencodeValidationResponse } from "../../src/shared/utils/opencodeValidation.js";

function errorResponse(status, type, message) {
  return Response.json({ type: "error", error: { type, message } }, { status });
}

describe("OpenCode Zen validation response", () => {
  it("accepts a successful probe", async () => {
    expect(await parseOpencodeValidationResponse(Response.json({ choices: [] })))
      .toEqual({ valid: true, error: null });
  });

  it.each([
    ["CreditsError", "No payment method. Add a payment method in OpenCode billing."],
    ["CreditsError", "Insufficient balance."],
    ["AuthError", "Invalid API key"],
  ])("preserves HTTP 401 %s instead of guessing from status", async (type, message) => {
    expect(await parseOpencodeValidationResponse(errorResponse(401, type, message)))
      .toEqual({ valid: false, error: message });
  });

  it.each([
    [400, "ModelError", "Model not found"],
    [403, "AuthError", "Access denied"],
    [429, "RateLimitError", "Rate limit exceeded"],
    [503, "ProviderError", "Service unavailable"],
  ])("does not accept HTTP %s as a successful probe", async (status, type, message) => {
    expect(await parseOpencodeValidationResponse(errorResponse(status, type, message)))
      .toEqual({ valid: false, error: message });
  });

  it.each([
    [401, "<html>Unauthorized</html>"],
    [502, "Bad gateway"],
    [500, JSON.stringify({ error: { message: { unexpected: true } } })],
    [400, JSON.stringify({ error: { message: "  " } })],
  ])("reports HTTP %s when no usable error message exists", async (status, body) => {
    expect(await parseOpencodeValidationResponse(new Response(body, { status })))
      .toEqual({ valid: false, error: `OpenCode Zen validation failed (HTTP ${status})` });
  });
});
