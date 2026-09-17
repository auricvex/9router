import crypto from "node:crypto";
import { DefaultExecutor } from "./default.js";
import { resolveSessionId } from "../utils/sessionManager.js";
import { isMuseSparkModel } from "../providers/models/helpers.js";
import {
  normalizeResponsesInput,
  clampResponsesCallId,
  coerceResponsesArguments,
  coerceResponsesOutput,
} from "../translator/formats/responsesApi.js";

// OpenCode Zen (pay-per-use gateway, https://opencode.ai/zen/v1).
//
// Split-auth rule (the whole point of this executor): upstream REJECTS API keys
// on free-tier models with `FreeTierError: free tier can only be used from
// within OpenCode`. So free models are always sent KEYLESS with an OpenCode
// client identity, while paid models use the Zen API key. A naive Bearer-always
// wrapper breaks every `-free` model — do not "simplify" this away.
const SESSION_HEADER = "x-opencode-session";
const SESSION_FIELD = "_opencodeZenSession";
const MAX_SESSION_LENGTH = 256;

// Exact TUI identity: the upstream Console gates anonymous free capacity on the
// User-Agent value (`opencode/` → 200, anything else → 429 FreeUsageLimitError).
// x-opencode-* headers alone do not unlock it.
const OPENCODE_CLI_UA = "opencode/1.18.16";
const OPENCODE_CLIENT = "desktop";
const OPENCODE_PROJECT = "global";

const RESPONSES_BASE_URL = "https://opencode.ai/zen/v1/responses";
const MAX_TOOL_NAME_LEN = 128;

// Free Zen models that don't use the "-free" id suffix.
const KNOWN_FREE_ZEN_MODELS = new Set(["big-pickle"]);

function normalizeSession(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_SESSION_LENGTH) return null;
  return normalized;
}

function nativeSession(headers) {
  if (!headers || typeof headers !== "object") return null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === SESSION_HEADER) return normalizeSession(value);
  }
  return null;
}

function translatedSession(sessionId, clientTool) {
  // Encode as a CLI-shaped id (see cliSessionId): the free-tier edge
  // validates the ses_ layout and FreeTierErrors anything else.
  const digest = crypto
    .createHash("sha256")
    .update(`opencode-zen\0${clientTool || "generic"}\0${sessionId}`)
    .digest();
  return cliIdFromHash("ses", digest);
}

const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// Port of the OpenCode CLI Identifier.create (ascending): `<prefix>_` + 12-hex
// time field + 14 base62 chars (26 chars after the prefix).
function cliIdFromHash(prefix, hash) {
  let timeHex = hash.subarray(0, 6).toString("hex");
  if (/^0+$/.test(timeHex)) timeHex = `${timeHex.slice(0, 11)}1`;
  let tail = "";
  for (let i = 0; i < 14; i++) tail += BASE62_CHARS[hash[6 + i] % 62];
  return `${prefix}_${timeHex}${tail}`;
}

let idCounter = 0;
function cliIdFresh(prefix) {
  const mask = (BigInt(1) << BigInt(48)) - BigInt(1);
  const now = (BigInt(Date.now()) * BigInt(0x1000) + BigInt((idCounter++ % 0xfff) + 1)) & mask;
  const timeBytes = Buffer.alloc(6);
  for (let i = 0; i < 6; i++) timeBytes[i] = Number((now >> BigInt(40 - 8 * i)) & BigInt(0xff));
  const tailBytes = crypto.randomBytes(14);
  let tail = "";
  for (let i = 0; i < 14; i++) tail += BASE62_CHARS[tailBytes[i] % 62];
  let timeHex = timeBytes.toString("hex");
  if (/^0+$/.test(timeHex)) timeHex = `${timeHex.slice(0, 11)}1`;
  return `${prefix}_${timeHex}${tail}`;
}

// Strip the thinking suffix "model(level)" so checks hit the base id.
function baseModelId(model) {
  return String(model || "").replace(/\([^()]+\)\s*$/, "").trim();
}

// Upstream path for "-free" ids (strip any provider prefix first).
function bareModelId(model) {
  const base = baseModelId(model);
  const slash = base.lastIndexOf("/");
  return slash >= 0 ? base.slice(slash + 1) : base;
}

export function isFreeOpencodeZenModel(model) {
  const bare = bareModelId(model);
  return bare.endsWith("-free") || KNOWN_FREE_ZEN_MODELS.has(bare);
}

// Premium = anything not on the free tier. Unknown models are assumed premium
// (fail-safe: they go out with the API key instead of anonymously).
export function isPremiumOpencodeZenModel(model) {
  return !isFreeOpencodeZenModel(model);
}

// Models served by /zen/v1/responses; every other Zen model stays on the
// sourceFormat-matched transport (/chat/completions or /messages).
// Registry declares targetFormat:"openai-responses" for these; this helper is
// the executor-side backstop when a stale runtimeTransport leaks in.
function isResponsesModel(model) {
  const base = bareModelId(model);
  if (isMuseSparkModel(base)) return true;
  return /^(gpt-|grok-|muse-spark)/i.test(base);
}

function hasApiKey(credentials) {
  return !!(credentials?.apiKey || credentials?.accessToken
    || credentials?.providerSpecificData?.extraApiKeys);
}

// Flatten Chat Completions tool declarations into the Responses flat shape and
// drop hosted/nameless tools the /responses endpoint rejects.
function normalizeResponsesTools(body) {
  if (!Array.isArray(body.tools)) return;
  const validNames = new Set();
  body.tools = body.tools.filter((tool) => {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) return false;
    const fn = tool.function && typeof tool.function === "object" && !Array.isArray(tool.function) ? tool.function : null;
    const rawName = typeof tool.name === "string" ? tool.name : (typeof fn?.name === "string" ? fn.name : "");
    const name = rawName.trim();
    if (!name) return false;
    const description = typeof tool.description === "string" ? tool.description : (typeof fn?.description === "string" ? fn.description : "");
    let parameters = (tool.parameters && typeof tool.parameters === "object" && !Array.isArray(tool.parameters))
      ? tool.parameters
      : (fn?.parameters && typeof fn.parameters === "object" && !Array.isArray(fn.parameters) ? fn.parameters : { type: "object", properties: {} });
    if (parameters.type === "object" && !parameters.properties) parameters = { ...parameters, properties: {} };
    for (const k of Object.keys(tool)) delete tool[k];
    tool.type = "function";
    tool.name = name.slice(0, MAX_TOOL_NAME_LEN);
    if (description) tool.description = description;
    tool.parameters = parameters;
    validNames.add(tool.name);
    return true;
  });
  if (body.tool_choice && typeof body.tool_choice === "object" && !Array.isArray(body.tool_choice)) {
    if (body.tool_choice.type === "function") {
      const n = typeof body.tool_choice.name === "string" ? body.tool_choice.name.trim() : "";
      if (!n || !validNames.has(n)) delete body.tool_choice;
    }
  }
}

function sanitizeResponsesItems(body) {
  if (!Array.isArray(body.input)) return;
  body.input = body.input.filter((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return true;
    if (item.type === "function_call") {
      if (!item.name || typeof item.name !== "string" || item.name.trim() === "") return false;
      item.name = item.name.trim().slice(0, MAX_TOOL_NAME_LEN);
      item.call_id = clampResponsesCallId(item.call_id);
      item.arguments = coerceResponsesArguments(item.arguments);
      return true;
    }
    if (item.type === "function_call_output") {
      item.call_id = clampResponsesCallId(item.call_id);
      item.output = coerceResponsesOutput(item.output);
      return true;
    }
    return true;
  });
}

function readRawHeaders(credentials) {
  return credentials?.rawHeaders || {};
}

function readHeaderInsensitive(rawHeaders, name) {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(rawHeaders || {})) {
    if (k.toLowerCase() === want) return v;
  }
  return undefined;
}

export class OpenCodeZenExecutor extends DefaultExecutor {
  constructor() {
    super("opencode-zen");
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    // Responses-only models never go to /chat/completions or /messages, even
    // when a stale runtimeTransport leaks in.
    if (isResponsesModel(model)) return RESPONSES_BASE_URL;
    return super.buildUrl(model, stream, urlIndex, credentials);
  }

  prepareRequestCredentials({ body, credentials, providerSessionId, clientTool } = {}) {
    const sourceCredentials = credentials || {};
    const native = nativeSession(sourceCredentials.rawHeaders);
    const resolved = normalizeSession(providerSessionId) || resolveSessionId({
      headers: sourceCredentials.rawHeaders,
      body,
      connectionId: sourceCredentials.connectionId,
      scope: "opencode-zen",
    });

    return {
      ...sourceCredentials,
      [SESSION_FIELD]: native || translatedSession(resolved, clientTool),
    };
  }

  async execute(args) {
    // Gate premium models behind a usable API key: without one, return a clear
    // 402 instead of proxying the raw upstream 401 "Missing API key".
    const creds = args?.credentials;
    if (!hasApiKey(creds) && isPremiumOpencodeZenModel(args?.model)) {
      const bodyJson = JSON.stringify({
        error: {
          message: "This model requires an OpenCode Zen API key — add one in Settings → Providers.",
          type: "invalid_request_error",
          code: "premium_model_requires_key",
        },
      });
      return {
        response: new Response(bodyJson, {
          status: 402,
          headers: { "Content-Type": "application/json" },
        }),
        url: "",
        headers: {},
        transformedBody: null,
      };
    }
    const credentials = this.prepareRequestCredentials(args);
    // Free tier rejects non-streaming requests with FreeTierError — the
    // OpenCode client always streams. Force stream upstream for free models;
    // chatCore converts SSE back to JSON for non-streaming clients
    // (see handleNonStreamingResponse's text/event-stream branch).
    const forced = isFreeOpencodeZenModel(args?.model) && !args?.stream;
    return super.execute(forced ? { ...args, stream: true, credentials } : { ...args, credentials });
  }

  buildHeaders(credentials, stream = true, url, model) {
    const headers = super.buildHeaders(credentials || {}, stream, url, model);
    const raw = readRawHeaders(credentials);
    const modelId = model || "";

    if (isFreeOpencodeZenModel(modelId)) {
      // Free tier: NEVER send the Zen key (upstream answers FreeTierError).
      // Keyless + OpenCode client identity is the only shape the free pool accepts.
      delete headers["Authorization"];
      delete headers["x-api-key"];
    } else if (typeof url === "string" && url.endsWith("/responses")) {
      // /responses reads Bearer auth, even when buildUrl overrides a stale
      // /messages runtime transport that supplied x-api-key.
      const key = credentials?.apiKey || credentials?.accessToken;
      delete headers["x-api-key"];
      if (key) headers["Authorization"] = `Bearer ${key}`;
    }

    // OpenCode client identity: client values win, CLI defaults fill the gaps.
    // The User-Agent is the exception — a non-OpenCode UA (curl, SDKs) is
    // replaced, because the free pool gates on it and 429s generic clients.
    const downstreamUa = readHeaderInsensitive(raw, "user-agent") || "";
    if (!/^opencode\//i.test(downstreamUa.trim())) {
      headers["User-Agent"] = OPENCODE_CLI_UA;
    } else if (downstreamUa && !headers["User-Agent"]) {
      headers["User-Agent"] = downstreamUa;
    }
    const lower = {};
    for (const [k, v] of Object.entries(raw)) lower[k.toLowerCase()] = v;
    headers["x-opencode-client"] = lower["x-opencode-client"] || headers["x-opencode-client"] || OPENCODE_CLIENT;
    headers["x-opencode-project"] = lower["x-opencode-project"] || headers["x-opencode-project"] || OPENCODE_PROJECT;
    const prepared = credentials?.[SESSION_FIELD];
    headers[SESSION_HEADER] = lower[SESSION_HEADER]
      || prepared
      || this.prepareRequestCredentials({ credentials })[SESSION_FIELD];
    if (!headers["x-opencode-request"]) {
      headers["x-opencode-request"] = lower["x-opencode-request"] || cliIdFresh("msg");
    }
    return headers;
  }

  transformRequest(model, body, stream, credentials) {
    const out = super.transformRequest(model, body);
    // 9router#1442: strip the OpenAI-Codex/Claude-CLI passthrough field the
    // Zen upstream rejects with 400 "Extra inputs are not permitted".
    if (out && typeof out === "object" && !Array.isArray(out)
      && Object.prototype.hasOwnProperty.call(out, "client_metadata")) {
      delete out.client_metadata;
    }
    // Free tier rejects non-streaming bodies with FreeTierError: always stream.
    if (isFreeOpencodeZenModel(model || body?.model)) out.stream = true;
    if (!isResponsesModel(model || body?.model)) return out;
    const normalized = normalizeResponsesInput(out.input);
    if (normalized) out.input = normalized;
    if (!Array.isArray(out.input) || out.input.length === 0) {
      out.input = [{ type: "message", role: "user", content: [{ type: "input_text", text: "..." }] }];
    }
    // Responses names the output cap max_output_tokens, not max_tokens.
    if (out.max_output_tokens === undefined) {
      if (out.max_completion_tokens !== undefined) out.max_output_tokens = out.max_completion_tokens;
      else if (out.max_tokens !== undefined) out.max_output_tokens = out.max_tokens;
    }
    delete out.max_tokens;
    delete out.max_completion_tokens;
    if (out.reasoning_effort !== undefined && out.reasoning === undefined) {
      out.reasoning = { effort: out.reasoning_effort, summary: "auto" };
    }
    if (out.reasoning && typeof out.reasoning === "object" && !Array.isArray(out.reasoning)) {
      if (!out.reasoning.summary) out.reasoning.summary = "auto";
    }
    delete out.reasoning_effort;
    out.stream = true;
    out.store = false;
    normalizeResponsesTools(out);
    sanitizeResponsesItems(out);
    return out;
  }

  parseError(response, bodyText) {
    const base = super.parseError(response, bodyText);
    if (typeof bodyText === "string"
      && (bodyText.includes("FreeTierError") || bodyText.includes("FreeUsageLimitError"))) {
      return {
        status: response.status,
        message: `${base.message} [opencode-zen free tier: rate-limited or datacenter egress blocked — pair free models with a paid fallback]`,
      };
    }
    return base;
  }
}
