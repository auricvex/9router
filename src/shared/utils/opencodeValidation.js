// Zen uses HTTP 401 for billing failures as well as authentication failures.
// A failed inference probe must retain the upstream reason, not label every
// failure as an invalid key (or accept unrelated 4xx/5xx responses as valid).
export async function parseOpencodeValidationResponse(response) {
  if (response.ok) return { valid: true, error: null };

  const data = await response.json().catch(() => null);
  const message = data?.error?.message;
  if (typeof message === "string" && message.trim()) {
    return { valid: false, error: message };
  }

  return {
    valid: false,
    error: `OpenCode Zen validation failed (HTTP ${response.status})`,
  };
}
