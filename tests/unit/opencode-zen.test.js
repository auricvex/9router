import { afterEach, describe, expect, it, vi } from "vitest";

import { PROVIDER_MODELS, getModelTargetFormat, getModelSupportedFormats, getDefaultModel } from "../../open-sse/config/providerModels.js";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import { resolveTransport } from "../../open-sse/services/provider.js";
import { resolveProviderAlias } from "../../open-sse/services/model.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import {
  OpenCodeZenExecutor,
  isFreeOpencodeZenModel,
  isPremiumOpencodeZenModel,
} from "../../open-sse/executors/opencode-zen.js";
import { getExecutor } from "../../open-sse/executors/index.js";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: vi.fn(),
}));
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

afterEach(() => vi.clearAllMocks());

// Mirror of chatCore's per-model transport guard: use the sourceFormat-matched
// transport only when the model declares support for that sourceFormat.
function pickTransport(provider, sourceFormat, alias, model) {
  const supported = getModelSupportedFormats(alias, model);
  const rt = resolveTransport(provider, sourceFormat);
  return supported?.includes(sourceFormat) ? rt : null;
}

describe("OpenCode Zen registry", () => {
  it("is registered with ocz alias and apikey category", async () => {
    const REGISTRY = (await import("../../open-sse/providers/registry/index.js")).default;
    const entry = REGISTRY.find((r) => r.id === "opencode-zen");
    expect(entry).toBeDefined();
    expect(entry.alias).toBe("opencode-zen");
    expect(entry.aliases).toContain("ocz");
    expect(entry.uiAlias).toBe("ocz");
    expect(entry.category).toBe("apikey");
    expect(entry.passthroughModels).toBe(true);
    expect(entry.modelsFetcher).toMatchObject({ url: "https://opencode.ai/zen/v1/models", type: "opencode-zen" });
  });

  it("defaults to a PAID model (free models reject API keys with FreeTierError)", () => {
    const def = getDefaultModel("opencode-zen");
    expect(def).toBe("deepseek-v4-flash");
    expect(isPremiumOpencodeZenModel(def)).toBe(true);
  });

  it("declares openai / claude / openai-responses transports on the zen host", () => {
    const formats = (PROVIDERS["opencode-zen"].transports || []).map((t) => t.format);
    expect(formats).toEqual(["openai", "claude", "openai-responses"]);
    expect(resolveTransport("opencode-zen", "openai").baseUrl).toBe("https://opencode.ai/zen/v1/chat/completions");
    expect(resolveTransport("opencode-zen", "claude").baseUrl).toBe("https://opencode.ai/zen/v1/messages");
    expect(resolveTransport("opencode-zen", "openai-responses").baseUrl).toBe("https://opencode.ai/zen/v1/responses");
  });

  it("routes claude-format clients to /messages only for claude-capable models", () => {
    for (const m of ["minimax-m3", "qwen3.7-max", "claude-sonnet-4.5"]) {
      expect(pickTransport("opencode-zen", "claude", "opencode-zen", m)?.baseUrl).toBe("https://opencode.ai/zen/v1/messages");
    }
    expect(pickTransport("opencode-zen", "claude", "opencode-zen", "glm-5.2")).toBeNull();
    expect(pickTransport("opencode-zen", "claude", "opencode-zen", "gpt-5.5")).toBeNull();
  });

  it("routes responses-only models to /responses, never to /chat or /messages", () => {
    // "ocz" resolves to the provider id via the registry aliases[] map (model.js).
    expect(resolveProviderAlias("ocz")).toBe("opencode-zen");
    for (const m of ["gpt-5.5", "grok-4.6", "muse-spark-1.3", "muse-spark-1.3-contributor-free"]) {
      expect(getModelTargetFormat("opencode-zen", m)).toBe(FORMATS.OPENAI_RESPONSES);
      expect(pickTransport("opencode-zen", "openai-responses", "opencode-zen", m)?.baseUrl).toBe("https://opencode.ai/zen/v1/responses");
      expect(pickTransport("opencode-zen", "claude", "opencode-zen", m)).toBeNull();
      expect(pickTransport("opencode-zen", "openai", "opencode-zen", m)).toBeNull();
    }
  });

  it("advertises paid muse-spark capabilities (not just -free)", () => {
    for (const m of ["muse-spark-1.2", "muse-spark-1.3"]) {
      expect(getCapabilitiesForModel("opencode-zen", m)).toMatchObject({
        reasoning: true,
        thinkingFormat: "openai",
        contextWindow: 1048576,
        maxOutput: 131072,
      });
    }
  });
});

describe("OpenCode Zen split-auth (free models never get the key)", () => {
  it("classifies -free ids and big-pickle as free, everything else premium", () => {
    expect(isFreeOpencodeZenModel("mimo-v2.5-free")).toBe(true);
    expect(isFreeOpencodeZenModel("deepseek-v4-flash-free")).toBe(true);
    expect(isFreeOpencodeZenModel("big-pickle")).toBe(true);
    expect(isFreeOpencodeZenModel("opencode-zen/mimo-v2.5-free")).toBe(true);
    expect(isFreeOpencodeZenModel("deepseek-v4-flash")).toBe(false);
    expect(isFreeOpencodeZenModel("gpt-5.5")).toBe(false);
    expect(isFreeOpencodeZenModel("unknown-future-model")).toBe(false);
    expect(isPremiumOpencodeZenModel("deepseek-v4-flash")).toBe(true);
    expect(isPremiumOpencodeZenModel("mimo-v2.5-free")).toBe(false);
  });

  it("is wired in the executor map (incl. ocz alias)", () => {
    expect(getExecutor("opencode-zen")).toBeInstanceOf(OpenCodeZenExecutor);
    expect(getExecutor("ocz")).toBeInstanceOf(OpenCodeZenExecutor);
  });

  it("strips the API key on free models (upstream FreeTierErrors keyed requests)", () => {
    const ex = new OpenCodeZenExecutor();
    const h = ex.buildHeaders({ apiKey: "sk-zen-test" }, true, "https://opencode.ai/zen/v1/chat/completions", "mimo-v2.5-free");
    expect(h["Authorization"]).toBeUndefined();
    expect(h["x-api-key"]).toBeUndefined();
    expect(h["User-Agent"]).toMatch(/^opencode\//);
    expect(h["x-opencode-client"]).toBe("desktop");
    expect(h["x-opencode-session"]).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    expect(h["x-opencode-request"]).toMatch(/^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
  });

  it("sends Bearer on chat/completions and /responses for paid models", () => {
    const ex = new OpenCodeZenExecutor();
    const chat = ex.buildHeaders({ apiKey: "sk-zen-test" }, true, "https://opencode.ai/zen/v1/chat/completions", "deepseek-v4-flash");
    expect(chat["Authorization"]).toBe("Bearer sk-zen-test");
    const responses = ex.buildHeaders({ apiKey: "sk-zen-test" }, true, "https://opencode.ai/zen/v1/responses", "gpt-5.5");
    expect(responses["Authorization"]).toBe("Bearer sk-zen-test");
    expect(responses["x-api-key"]).toBeUndefined();
  });

  it("declares Bearer auth for the Responses transport", () => {
    expect(resolveTransport("opencode-zen", "openai-responses").auth).toMatchObject({
      header: "Authorization", scheme: "bearer",
    });
  });

  it.each(["openai", "claude", "openai-responses"])(
    "sends Bearer on a paid Responses request with a %s runtime transport",
    async (format) => {
      const fetchMock = vi.mocked(proxyAwareFetch);
      fetchMock.mockResolvedValue(Response.json({ id: "resp_test" }));
      const ex = new OpenCodeZenExecutor();
      await ex.execute({
        model: "gpt-5.5",
        body: { model: "gpt-5.5", input: "ping" },
        stream: false,
        credentials: {
          apiKey: "sk-zen-test",
          runtimeTransport: resolveTransport("opencode-zen", format),
        },
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("https://opencode.ai/zen/v1/responses");
      const headers = new Headers(options.headers);
      expect(headers.get("authorization")).toBe("Bearer sk-zen-test");
      expect(headers.has("x-api-key")).toBe(false);
    },
  );

  it("keeps x-api-key on the Messages transport", () => {
    const ex = new OpenCodeZenExecutor();
    const headers = ex.buildHeaders({
      apiKey: "sk-zen-test",
      runtimeTransport: resolveTransport("opencode-zen", "claude"),
    }, false, "https://opencode.ai/zen/v1/messages", "claude-sonnet-4.6");
    expect(headers["x-api-key"]).toBe("sk-zen-test");
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("forces stream:true upstream for free models (non-streaming gets FreeTierError)", async () => {
    const ex = new OpenCodeZenExecutor();
    // transformRequest level: body must carry stream:true even for JSON callers.
    const out = ex.transformRequest(
      "mimo-v2.5-free",
      { model: "mimo-v2.5-free", messages: [{ role: "user", content: "hi" }], stream: false },
      false,
      {},
    );
    expect(out.stream).toBe(true);
    // paid models keep the caller's stream value.
    const paid = ex.transformRequest(
      "deepseek-v4-flash",
      { model: "deepseek-v4-flash", messages: [{ role: "user", content: "hi" }], stream: false },
      false,
      { apiKey: "sk-zen-test" },
    );
    expect(paid.stream).toBe(false);
    // execute level: a JSON (stream:false) free request still goes out streamed.
    const fetchMock = vi.mocked(proxyAwareFetch);
    fetchMock.mockResolvedValue(new Response('data: {"choices":[]}\n\n', {
      headers: { "Content-Type": "text/event-stream" },
    }));
    await ex.execute({
      model: "mimo-v2.5-free",
      body: { model: "mimo-v2.5-free", messages: [{ role: "user", content: "hi" }], stream: false },
      stream: false,
      credentials: {},
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body).stream).toBe(true);
  });

  it("forces responses-only models to /responses even with a stale chat transport", () => {
    const ex = new OpenCodeZenExecutor();
    const creds = { runtimeTransport: { baseUrl: "https://opencode.ai/zen/v1/chat/completions" } };
    expect(ex.buildUrl("gpt-5.5", true, 0, creds)).toBe("https://opencode.ai/zen/v1/responses");
    expect(ex.buildUrl("muse-spark-1.3", true, 0, creds)).toBe("https://opencode.ai/zen/v1/responses");
    expect(ex.buildUrl("deepseek-v4-flash", true, 0, creds)).toBe("https://opencode.ai/zen/v1/chat/completions");
  });

  it("402s keyless premium requests instead of proxying upstream 401", async () => {
    const ex = new OpenCodeZenExecutor();
    const out = await ex.execute({ model: "deepseek-v4-flash", body: {}, stream: false, credentials: {} });
    expect(out.response.status).toBe(402);
    const json = await out.response.json();
    expect(json.error.code).toBe("premium_model_requires_key");
  });

  it("annotates FreeTierError bodies for debuggability", () => {
    const ex = new OpenCodeZenExecutor();
    const body = '{"type":"error","error":{"type":"FreeTierError","message":"free tier can only be used from within OpenCode"}}';
    const parsed = ex.parseError({ status: 400 }, body);
    expect(parsed.message).toContain("free tier");
  });
});
