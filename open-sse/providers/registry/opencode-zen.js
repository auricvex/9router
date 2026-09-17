export default {
  id: "opencode-zen",
  priority: 45,
  alias: "opencode-zen",
  aliases: [
    "ocz",
  ],
  uiAlias: "ocz",
  display: {
    name: "OpenCode Zen",
    icon: "terminal",
    color: "#E87040",
    textIcon: "OZ",
    website: "https://opencode.ai/auth",
    notice: {
      text: "Pay-per-use gateway (same key as OpenCode Go). Free (-free) models are best-effort: they must be called keyless from an OpenCode client identity and are rate-limited per IP.",
      apiKeyUrl: "https://opencode.ai/auth",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://opencode.ai/zen/v1/chat/completions",
    headers: {
      "x-opencode-client": "desktop",
    },
  },
  // Multi-endpoint: pick the transport matching the client sourceFormat to skip
  // translation. Guarded per-model by `supportedFormats` (see chatCore) because
  // Zen models differ in endpoint support. Endpoint table: https://opencode.ai/docs/zen/
  transports: [
    { format: "openai", baseUrl: "https://opencode.ai/zen/v1/chat/completions", auth: { combined: true, header: "Authorization", scheme: "bearer" } },
    { format: "claude", baseUrl: "https://opencode.ai/zen/v1/messages", auth: { combined: true, header: "x-api-key", scheme: "raw", anthropicVersion: true } },
    { format: "openai-responses", baseUrl: "https://opencode.ai/zen/v1/responses", auth: { combined: true, header: "Authorization", scheme: "bearer" } },
  ],
  // models[0] is the dashboard default AND the key-validation probe target,
  // so it must be a paid model (free models reject API keys with FreeTierError).
  models: [
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", supportedFormats: ["openai"] },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", supportedFormats: ["openai"] },
    { id: "deepseek-v4-flash-vision-exp", name: "DeepSeek V4 Flash Vision (Exp)", supportedFormats: ["openai"] },
    { id: "glm-5.3-flash", name: "GLM 5.3 Flash (Vision)", supportedFormats: ["openai"] },
    { id: "glm-5.3", name: "GLM 5.3", supportedFormats: ["openai"] },
    { id: "glm-5.2", name: "GLM 5.2", supportedFormats: ["openai"] },
    { id: "glm-5.1", name: "GLM 5.1", supportedFormats: ["openai"] },
    { id: "glm-5", name: "GLM 5", supportedFormats: ["openai"] },
    { id: "kimi-k2.7-code", name: "Kimi K2.7 Code", supportedFormats: ["openai"] },
    { id: "kimi-k2.6", name: "Kimi K2.6", supportedFormats: ["openai"] },
    { id: "kimi-k2.5", name: "Kimi K2.5", supportedFormats: ["openai"] },
    { id: "kimi-k3", name: "Kimi K3", supportedFormats: ["openai"] },
    { id: "minimax-m3", name: "MiniMax M3", supportedFormats: ["openai", "claude"] },
    { id: "minimax-m2.7", name: "MiniMax M2.7", supportedFormats: ["openai", "claude"] },
    { id: "minimax-m2.5", name: "MiniMax M2.5", supportedFormats: ["openai", "claude"] },
    { id: "big-pickle", name: "Big Pickle", supportedFormats: ["openai"] },
    // Claude + Qwen serve Anthropic-native /messages (same behavior as opencode-go #2292).
    { id: "claude-opus-4.5", name: "Claude Opus 4.5", supportedFormats: ["claude"] },
    { id: "claude-opus-4.6", name: "Claude Opus 4.6", supportedFormats: ["claude"] },
    { id: "claude-opus-4.7", name: "Claude Opus 4.7", supportedFormats: ["claude"] },
    { id: "claude-opus-4.8", name: "Claude Opus 4.8", supportedFormats: ["claude"] },
    { id: "claude-opus-5", name: "Claude Opus 5", supportedFormats: ["claude"] },
    { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", supportedFormats: ["claude"] },
    { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6", supportedFormats: ["claude"] },
    { id: "claude-sonnet-5", name: "Claude Sonnet 5", supportedFormats: ["claude"] },
    { id: "claude-haiku-4.5", name: "Claude Haiku 4.5", supportedFormats: ["claude"] },
    { id: "claude-fable-5", name: "Claude Fable 5", supportedFormats: ["claude"] },
    { id: "qwen3.5-plus", name: "Qwen 3.5 Plus", supportedFormats: ["claude"] },
    { id: "qwen3.6-plus", name: "Qwen 3.6 Plus", supportedFormats: ["claude"] },
    { id: "qwen3.7-plus", name: "Qwen 3.7 Plus", supportedFormats: ["claude"] },
    { id: "qwen3.7-max", name: "Qwen 3.7 Max", supportedFormats: ["claude"] },
    // Served by /zen/v1/responses only — targetFormat forces chatCore past the
    // sourceFormat-matched transports into translation (see chatCore guard).
    { id: "gpt-5", name: "GPT 5", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "gpt-5-codex", name: "GPT 5 Codex", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.1", name: "GPT 5.1", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.1-codex", name: "GPT 5.1 Codex", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.2", name: "GPT 5.2", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.2-codex", name: "GPT 5.2 Codex", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.3-codex", name: "GPT 5.3 Codex", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.3-codex-spark", name: "GPT 5.3 Codex Spark", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.4", name: "GPT 5.4", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.4-mini", name: "GPT 5.4 Mini", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.4-nano", name: "GPT 5.4 Nano", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.5", name: "GPT 5.5", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.6-luna", name: "GPT 5.6 Luna", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.6-terra", name: "GPT 5.6 Terra", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "gpt-5.6-sol", name: "GPT 5.6 Sol", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "grok-4.5", name: "Grok 4.5", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "grok-4.6", name: "Grok 4.6", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "grok-build-0.1", name: "Grok Build 0.1", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "muse-spark-1.2", name: "Muse Spark 1.2", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "muse-spark-1.3", name: "Muse Spark 1.3", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    // ── Free tier (best-effort via API) ──────────────────────────
    // Upstream rejects API keys on free models (FreeTierError: "free tier can
    // only be used from within OpenCode"). The executor strips the key and
    // sends keyless + OpenCode client identity for these; datacenter egress
    // may still fail — pair with a paid fallback in combos.
    { id: "muse-spark-1.2-contributor-free", name: "Muse Spark 1.2 Contributor Free", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "muse-spark-1.3-contributor-free", name: "Muse Spark 1.3 Contributor Free", targetFormat: "openai-responses", supportedFormats: ["openai-responses"] },
    { id: "deepseek-v4-flash-free", name: "DeepSeek V4 Flash Free", supportedFormats: ["openai"] },
    { id: "mimo-v2.5-free", name: "MiMo V2.5 Free", supportedFormats: ["openai"] },
    { id: "hy3-free", name: "HY3 Free", supportedFormats: ["openai"] },
    { id: "nemotron-3-ultra-free", name: "Nemotron 3 Ultra Free", supportedFormats: ["openai"] },
    { id: "nemotron-3.5-lightning-free", name: "Nemotron 3.5 Lightning Free", supportedFormats: ["openai"] },
    { id: "north-mini-code-free", name: "North Mini Code Free", supportedFormats: ["openai"] },
  ],
  modelsFetcher: { url: "https://opencode.ai/zen/v1/models", type: "opencode-zen" },
  passthroughModels: true,
};
