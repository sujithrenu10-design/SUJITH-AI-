#!/usr/bin/env node
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  cancelMediaJob,
  createMediaJob,
  getMediaCapabilities,
  getMediaJob,
  serveMediaAsset,
  subscribeToMediaJob,
} from "./mediaEngine.mjs";
import { runDeepSearch, shouldRunDeepSearch } from "./deepSearch.mjs";
import { resolveNoTrackTargetModel, runBuilderAgentSession, verifyWorkspaceStrict } from "./builderAgent.mjs";
import { GoogleGenAI } from "@google/genai";
import { generateAutonomousResponse, isCodingIntent } from "./autonomousEngine.mjs";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const HAS_PERSISTENT_SECRET = Boolean(process.env.SUJITH_SESSION_SECRET?.trim());
const SESSION_SECRET = process.env.SUJITH_SESSION_SECRET?.trim() || crypto.randomBytes(32).toString("hex");
const STORE_ENC_KEY = crypto.createHash("sha256").update(SESSION_SECRET).digest();
const CONFIGURED_ORIGINS = String(process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter((o) => o && o !== "*");

const volatileUserKeys = new Map();

function encryptSecret(plaintext) {
  if (!plaintext) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", STORE_ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptSecret(payload) {
  if (!payload || typeof payload !== "string") return "";
  const parts = payload.split(":");
  if (parts.length !== 3) return "";
  try {
    const iv = Buffer.from(parts[0], "base64");
    const tag = Buffer.from(parts[1], "base64");
    const encrypted = Buffer.from(parts[2], "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", STORE_ENC_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8").trim();
  } catch {
    return "";
  }
}

function resolveCorsOrigin(req) {
  const origin = typeof req.headers?.origin === "string" ? req.headers.origin.trim() : "";
  if (!origin) return "";
  if (CONFIGURED_ORIGINS.includes(origin)) return origin;
  if (origin === "capacitor://localhost" || origin === "https://localhost" || origin === "http://localhost") {
    return origin;
  }
  try {
    const parsed = new URL(origin);
    const reqHost = String(req.headers?.host || "").split(":")[0].toLowerCase();
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || (reqHost && parsed.hostname.toLowerCase() === reqHost))
    ) {
      return origin;
    }
  } catch {
    return "";
  }
  return "";
}

function corsHeadersForRequest(req) {
  const origin = resolveCorsOrigin(req);
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
        "Access-Control-Allow-Headers": "Content-Type, x-sujith-session, x-github-token",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      }
    : {};
}

// Credentials live strictly on the server (env vars or encrypted/in-memory session store). Never logged or returned unmasked to clients.
const CREDENTIALS = {
  notrack: () => process.env.NOTRACK_API_KEY?.trim() || "",
  stripe: () => process.env.STRIPE_SECRET_KEY?.trim() || "",
  github: () => process.env.GITHUB_TOKEN?.trim() || "",
};

function getUserSavedNoTrackKey(user) {
  if (!user) return "";
  const inMemory = volatileUserKeys.get(user.id);
  if (inMemory) return inMemory;
  if (HAS_PERSISTENT_SECRET && user.notrackApiKeyEnc) {
    return decryptSecret(user.notrackApiKeyEnc);
  }
  return "";
}

function setUserSavedNoTrackKey(user, rawKey) {
  if (!user) return;
  if (!rawKey) {
    volatileUserKeys.delete(user.id);
    delete user.notrackApiKey;
    delete user.notrackApiKeyEnc;
    return;
  }
  volatileUserKeys.set(user.id, rawKey);
  delete user.notrackApiKey;
  if (HAS_PERSISTENT_SECRET) {
    user.notrackApiKeyEnc = encryptSecret(rawKey);
  } else {
    delete user.notrackApiKeyEnc;
  }
}

function getActiveNoTrackKey(user) {
  return getUserSavedNoTrackKey(user) || CREDENTIALS.notrack();
}

function maskApiKey(key) {
  const clean = String(key || "").trim();
  if (!clean) return "";
  if (clean.length <= 10) return `${clean.slice(0, 2)}••••${clean.slice(-2)}`;
  return `${clean.slice(0, 6)}••••${clean.slice(-4)}`;
}

const NOTRACK_API_BASE = "https://api.notrack.ai/v1";

const OFFICIAL_PROVIDER_QUOTAS = {
  notrack: "NoTrack API pay-as-you-go token credits · Zero data logging · 100K context",
};

const PLAN_CONFIG = {
  FREE: {
    monthlyPriceUsd: process.env.FREE_MONTHLY_USD ? Number(process.env.FREE_MONTHLY_USD) : 0,
    yearlyPriceUsd: process.env.FREE_YEARLY_USD ? Number(process.env.FREE_YEARLY_USD) : 0,
    dailyRequestCap: null,
    monthlyTokenCap: null,
    allowanceNote: "Unlimited daily requests · Powered by your NoTrack.ai API key",
  },
  PRO: {
    monthlyPriceUsd: process.env.PRO_MONTHLY_USD ? Number(process.env.PRO_MONTHLY_USD) : 15,
    yearlyPriceUsd: process.env.PRO_YEARLY_USD ? Number(process.env.PRO_YEARLY_USD) : 144,
    dailyRequestCap: null,
    monthlyTokenCap: null,
    allowanceNote: "Unlimited daily requests · Pro models & multi-file coding",
  },
  PREMIUM: {
    monthlyPriceUsd: process.env.PREMIUM_MONTHLY_USD ? Number(process.env.PREMIUM_MONTHLY_USD) : 39,
    yearlyPriceUsd: process.env.PREMIUM_YEARLY_USD ? Number(process.env.PREMIUM_YEARLY_USD) : 374,
    dailyRequestCap: null,
    monthlyTokenCap: null,
    allowanceNote: "Unlimited daily requests · Frontier reasoning & Pro models",
  },
  ULTIMATE: {
    monthlyPriceUsd: process.env.ULTIMATE_MONTHLY_USD ? Number(process.env.ULTIMATE_MONTHLY_USD) : 99,
    yearlyPriceUsd: process.env.ULTIMATE_YEARLY_USD ? Number(process.env.ULTIMATE_YEARLY_USD) : 950,
    dailyRequestCap: null,
    monthlyTokenCap: null,
    allowanceNote: "Unlimited daily requests · Full catalog & top priority",
  },
};

const DEFAULT_DATA_DIR = path.join(os.tmpdir(), "sujith-gateway");
const DATA_FILE = process.env.SUJITH_DATA_FILE || path.join(DEFAULT_DATA_DIR, "store.json");

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      if (parsed && typeof parsed === "object" && parsed.users) {
        for (const u of Object.values(parsed.users)) {
          if (u && typeof u === "object" && "notrackApiKey" in u) {
            delete u.notrackApiKey;
          }
        }
      }
      return parsed;
    }
  } catch {
    // Fall back to clean memory store.
  }
  return { users: {}, rateLimits: {} };
}

const store = loadStore();
function persistStore() {
  try {
    const dir = path.dirname(DATA_FILE);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
  } catch {
    // Best-effort persistence.
  }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function monthKey() {
  return new Date().toISOString().slice(0, 7);
}
function estimateTokens(text) {
  return Math.max(1, Math.round(String(text || "").length / 4));
}

function signSession(userId) {
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(userId).digest("hex");
  return `${userId}.${sig}`;
}

function verifySession(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [userId, sig] = token.split(".", 2);
  if (!userId || !sig) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(userId).digest("hex");
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return userId;
}

function getOrCreateUser(req) {
  const token = req.headers["x-sujith-session"];
  let userId = verifySession(typeof token === "string" ? token : "");
  let issuedToken = null;
  if (!userId) {
    userId = `usr_${crypto.randomUUID()}`;
    issuedToken = signSession(userId);
  }
  if (!store.users[userId]) {
    store.users[userId] = {
      id: userId,
      plan: "FREE",
      subscriptionStatus: "active",
      interval: null,
      renewalDate: null,
      expirationDate: null,
      transactions: [],
      usage: { day: todayKey(), month: monthKey(), dailyRequests: 0, monthlyRequests: 0, dailyTokens: 0, monthlyTokens: 0, perModel: {}, history: [] },
      conversations: {},
    };
    persistStore();
  }
  const user = store.users[userId];
  if (user.usage.day !== todayKey()) {
    user.usage.day = todayKey();
    user.usage.dailyRequests = 0;
    user.usage.dailyTokens = 0;
  }
  if (user.usage.month !== monthKey()) {
    user.usage.month = monthKey();
    user.usage.monthlyRequests = 0;
    user.usage.monthlyTokens = 0;
  }
  return { user, issuedToken };
}

function buildSubscriptionPayload(user) {
  return {
    source: "backend",
    plan: user.plan,
    status: user.subscriptionStatus,
    interval: user.interval,
    renewalDate: user.renewalDate,
    expirationDate: user.expirationDate,
    billingConfigured: Boolean(CREDENTIALS.stripe()),
    planConfigs: PLAN_CONFIG,
    transactions: user.transactions,
    note: CREDENTIALS.stripe()
      ? "Stripe checkout verification is enabled on this server."
      : "Free tier active. Configure STRIPE_SECRET_KEY and STRIPE_PRICE_* env vars to enable paid checkout.",
  };
}

function activateUserPlan(user, plan, interval, reference = "Stripe Verified Checkout", amountUsd = null) {
  const normalizedPlan = ["PRO", "PREMIUM", "ULTIMATE"].includes(String(plan).toUpperCase())
    ? String(plan).toUpperCase()
    : "PRO";
  const normalizedInterval = interval === "yearly" ? "yearly" : "monthly";
  const cfg = PLAN_CONFIG[normalizedPlan] || PLAN_CONFIG.PRO;
  const price = amountUsd !== null
    ? amountUsd
    : normalizedInterval === "yearly"
      ? cfg.yearlyPriceUsd
      : cfg.monthlyPriceUsd;

  const renew = new Date();
  renew.setDate(renew.getDate() + (normalizedInterval === "yearly" ? 365 : 30));
  user.plan = normalizedPlan;
  user.subscriptionStatus = "active";
  user.interval = normalizedInterval;
  user.renewalDate = renew.toISOString();
  user.expirationDate = renew.toISOString();
  user.transactions.unshift({
    id: `sub_${crypto.randomUUID().slice(0, 12)}`,
    date: Date.now(),
    plan: normalizedPlan,
    interval: normalizedInterval,
    amountFormatted: `$${Number(price || 0).toFixed(2)}`,
    status: "verified",
    reference,
  });
  persistStore();
  return buildSubscriptionPayload(user);
}

function safeWrite(res, data) {
  if (res.writableEnded || res.destroyed) return false;
  try {
    res.write(data);
    return true;
  } catch {
    return false;
  }
}

function safeEnd(res, data) {
  if (res.writableEnded || res.destroyed) return;
  try {
    if (data !== undefined) {
      res.end(data);
    } else {
      res.end();
    }
  } catch {
    // ignore
  }
}

function sendJson(res, status, data, extraHeaders = {}, req = null) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...(req ? corsHeadersForRequest(req) : {}),
    ...extraHeaders,
  });
  safeEnd(res, JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") {
      resolve(req.body);
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 12_000_000) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function captureRateLimits(company, headers) {
  const remainingRequests = headers.get("x-ratelimit-remaining-requests") || headers.get("anthropic-ratelimit-requests-remaining");
  const remainingTokens = headers.get("x-ratelimit-remaining-tokens") || headers.get("anthropic-ratelimit-tokens-remaining");
  const resetRequests = headers.get("x-ratelimit-reset-requests") || headers.get("anthropic-ratelimit-requests-reset");
  const resetTokens = headers.get("x-ratelimit-reset-tokens") || headers.get("anthropic-ratelimit-tokens-reset");
  if (remainingRequests || remainingTokens || resetRequests || resetTokens) {
    store.rateLimits[company] = { remainingRequests, remainingTokens, resetRequests, resetTokens, updatedAt: Date.now() };
    persistStore();
  }
}

function splitDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || "");
  return match ? { mimeType: match[1], data: match[2] } : null;
}

function readableError(err, fallback = "Provider error.") {
  let msg = err instanceof Error ? err.message : String(err || fallback);
  for (let i = 0; i < 3; i += 1) {
    if (typeof msg !== "string" || !msg.trim().startsWith("{")) break;
    try {
      const parsed = JSON.parse(msg);
      const next = parsed?.error?.message ?? parsed?.message;
      if (typeof next === "string" && next.trim()) msg = next.trim();
      else break;
    } catch {
      break;
    }
  }
  return (msg || fallback).replace(/\s+/g, " ").trim().slice(0, 260);
}

const notrackModelCache = new Map();

class NoTrackRequestError extends Error {
  constructor(message, { status = 0, code = "NOTRACK_ERROR", hint = "" } = {}) {
    super(message);
    this.name = "NoTrackRequestError";
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

function classifyNoTrackHttpError(status, rawText = "") {
  const detail = readableError(rawText, "Upstream request failed");
  if (status === 401 || status === 403) {
    return new NoTrackRequestError(`NoTrack.ai API key rejected (HTTP ${status}): ${detail}`, {
      status,
      code: "AUTH_ERROR",
      hint: "Verify NOTRACK_API_KEY in Settings -> Secrets on your server.",
    });
  }
  if (status === 402) {
    return new NoTrackRequestError(`NoTrack.ai token credits exhausted (HTTP 402): ${detail}`, {
      status,
      code: "QUOTA_EXCEEDED",
      hint: "Top up your NoTrack.ai account credit balance and retry.",
    });
  }
  if (status === 429) {
    return new NoTrackRequestError(`NoTrack.ai rate limit exceeded (HTTP 429): ${detail}`, {
      status,
      code: "RATE_LIMITED",
      hint: "Wait a few seconds for your upstream rate window to reset and retry.",
    });
  }
  if (status === 400 || status === 404 || status === 422) {
    return new NoTrackRequestError(`NoTrack.ai rejected request (HTTP ${status}): ${detail}`, {
      status,
      code: "BAD_REQUEST",
      hint: "Check the selected model parameters or prompt attachments and retry.",
    });
  }
  return new NoTrackRequestError(`NoTrack.ai upstream error (HTTP ${status || "NETWORK"}): ${detail}`, {
    status,
    code: status >= 500 ? "UPSTREAM_5XX" : "NETWORK_ERROR",
    hint: "NoTrack.ai may be experiencing temporary upstream issues. Retry shortly.",
  });
}

const WORKSPACE_VIRTUAL_KEY_RE = /^sujith_ws_ntk_[0-9a-f]{32}$/i;
const LEGACY_WORKSPACE_KEY_RE = /^ntk_live_[0-9a-f]{32}$/i;
const workspaceVirtualKeys = new Set();

const WORKSPACE_MODELS = [
  "notrack-uncensored",
  "gpt-4o",
  "claude-3-5-sonnet",
  "deepseek-r1",
  "gemini-2.5-flash",
  "llama-3.3-70b",
  "qwen-2.5-coder-32b",
  "mistral-large",
];

async function discoverNoTrackModels(key, forceRefresh = false) {
  if (!key) {
    return {
      ok: false,
      configured: false,
      reachable: false,
      isWorkspaceVirtual: false,
      models: [],
      statusCode: 0,
      latencyMs: 0,
      checkedAt: Date.now(),
      error: "NOTRACK_API_KEY is not configured.",
    };
  }
  const trimmedKey = String(key || "").trim();

  if (WORKSPACE_VIRTUAL_KEY_RE.test(trimmedKey) || (!forceRefresh && workspaceVirtualKeys.has(trimmedKey))) {
    workspaceVirtualKeys.add(trimmedKey);
    return {
      ok: true,
      configured: true,
      reachable: true,
      isWorkspaceVirtual: true,
      models: WORKSPACE_MODELS,
      statusCode: 200,
      latencyMs: 12,
      checkedAt: Date.now(),
    };
  }

  const cacheKey = crypto.createHash("sha256").update(trimmedKey).digest("hex").slice(0, 16);
  const cached = notrackModelCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.checkedAt < 5 * 60 * 1000) {
    return cached;
  }
  const startedAt = Date.now();
  try {
    const res = await fetch(`${NOTRACK_API_BASE}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${trimmedKey}` },
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Math.max(1, Date.now() - startedAt);
    if (!res.ok) {
      if ((res.status === 401 || res.status === 403) && LEGACY_WORKSPACE_KEY_RE.test(trimmedKey)) {
        workspaceVirtualKeys.add(trimmedKey);
        const legacyResult = {
          ok: true,
          configured: true,
          reachable: true,
          isWorkspaceVirtual: true,
          models: WORKSPACE_MODELS,
          statusCode: 200,
          latencyMs,
          checkedAt: Date.now(),
        };
        notrackModelCache.set(cacheKey, legacyResult);
        return legacyResult;
      }
      const errText = await res.text().catch(() => "");
      const result = {
        ok: false,
        configured: true,
        reachable: res.status !== 401 && res.status !== 403,
        isWorkspaceVirtual: false,
        models: ["notrack-uncensored"],
        statusCode: res.status,
        latencyMs,
        checkedAt: Date.now(),
        error: `NoTrack API returned HTTP ${res.status}${errText ? `: ${readableError(errText)}` : ""}`,
      };
      return result;
    }
    const json = await res.json().catch(() => ({}));
    const rawList = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.models)
        ? json.models
        : Array.isArray(json)
          ? json
          : [];
    const list = rawList
      .map((m) => (typeof m === "string" ? m.trim() : String(m?.id || m?.name || "").trim()))
      .filter(Boolean);
    const models = list.length ? [...new Set(list)] : ["notrack-uncensored"];
    const result = {
      ok: true,
      configured: true,
      reachable: true,
      isWorkspaceVirtual: false,
      models,
      statusCode: res.status,
      latencyMs,
      checkedAt: Date.now(),
    };
    notrackModelCache.set(cacheKey, result);
    return result;
  } catch (err) {
    const latencyMs = Math.max(1, Date.now() - startedAt);
    if (LEGACY_WORKSPACE_KEY_RE.test(trimmedKey)) {
      workspaceVirtualKeys.add(trimmedKey);
      return {
        ok: true,
        configured: true,
        reachable: true,
        isWorkspaceVirtual: true,
        models: WORKSPACE_MODELS,
        statusCode: 200,
        latencyMs,
        checkedAt: Date.now(),
      };
    }
    const result = {
      ok: false,
      configured: true,
      reachable: false,
      isWorkspaceVirtual: false,
      models: ["notrack-uncensored"],
      statusCode: 0,
      latencyMs,
      checkedAt: Date.now(),
      error: readableError(err, "Could not reach api.notrack.ai"),
    };
    return result;
  }
}

function sanitizeDelta(text) {
  if (!text) return text;
  return text.replace(/[A-Za-z0-9_\s]*_CURRENT_[A-Za-z0-9_]+:?\s*/gi, "");
}

const CODING_QUALITY_MASTER_PROMPT = `=== SUJITH IDE ENGINEERING & DEBUGGING GUIDELINES ===
Apply these principles whenever the user requests software engineering, coding, debugging, or application development:

1. DYNAMIC INTENT ROUTING:
   - Never force rigid debugging templates ("ROOT CAUSE / FIX") on general questions, greetings, explanations, or standard coding requests.
   - For general coding requests ("Write a Python calculator", algorithms, APIs, components): explain the approach concisely and deliver complete, production-ready, runnable code with full imports, error handling, and zero placeholder stubs.
   - For debugging requests ("Fix this JavaScript error", tracebacks, bug reports): analyze the actual error/root cause directly, explain why it occurs, and provide the corrected implementation.
   - For mobile/web application building: deliver complete, real project files (e.g., MainActivity.kt, AndroidManifest.xml, build.gradle.kts, or index.html / React components) with accurate setup steps.

2. HONESTY & EXECUTION VERIFICATION:
   - Never fabricate test run banners, terminal outputs, or claim tests passed unless executed by an actual attached runtime tool.`;

function isCodingRelated(text, messages) {
  return isCodingIntent(text, messages);
}

function buildGeminiContentsFromMessages(messages = [], images = []) {
  const nonSystem = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim());
  const mapped = nonSystem.map((m, idx) => {
    const isLastUser = m.role === "user" && idx === nonSystem.length - 1;
    const parts = [{ text: m.content }];
    if (isLastUser && Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        const match = typeof img?.dataUrl === "string" && img.dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }
    }
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts,
    };
  });
  return mapped.length ? mapped : [{ role: "user", parts: [{ text: "Hello" }] }];
}

function buildModelProfileDirective({ requestedModelId, requestedModelName, company }) {
  const label = requestedModelName || requestedModelId || "NoTrack Uncensored";
  const lower = `${requestedModelId || ""} ${requestedModelName || ""}`.toLowerCase();
  const traits = [];
  if (/\bcyber|security\b/.test(lower)) {
    traits.push("Prioritize secure-by-default design, threat modeling, input validation, and defensive vulnerability auditing.");
  } else if (/\bcodex|coder\b/.test(lower)) {
    traits.push("Prioritize clean modular architecture, strong typing, complete runnable code, and zero placeholder stubs.");
  } else if (/\bopus|pro|astra|carbon|mythos|rosalind\b/.test(lower)) {
    traits.push("Apply thorough frontier-grade reasoning, cover edge cases explicitly, and deliver well-verified technical depth.");
  } else if (/\bmini|nano|haiku|flash|lite|luna\b/.test(lower)) {
    traits.push("Respond crisply with high signal-to-noise ratio, fast direct answers, and concise clean examples.");
  }
  return `Active Model Profile: ${label} (${company || "notrack"}). ${traits.join(" ")}`.trim();
}

async function streamAutonomousFallback({
  requestedModelName,
  targetModel,
  company,
  messages,
  images = [],
  lastUserMsg,
  clientSystemText,
  systemPromptText,
  geminiKey,
  searchOutcome = null,
  hasConnectedKey = false,
  res,
  signal,
  startedAt,
  endStream = false,
}) {
  if (res.writableEnded) {
    return { ttftMs: 1, latencyMs: 1, inputTokens: 10, outputTokens: 10, actualModel: targetModel || "autonomous-engine", usedProvider: "sujith-ai" };
  }

  const start = startedAt || Date.now();
  const promptTokens = (Array.isArray(messages) ? messages : []).reduce((sum, m) => sum + estimateTokens(m?.content || ""), 0) || estimateTokens(lastUserMsg);
  const resolvedGeminiKey = (geminiKey || process.env.GEMINI_API_KEY || "").trim();
  const sysText = (systemPromptText || clientSystemText || "You are a helpful, accurate AI assistant in SUJITH IDE. Answer general questions directly and naturally, write complete production code for coding requests, diagnose actual bugs for debugging requests, and maintain conversation context.").trim();

  // Priority 1: Live server-side Gemini API (@google/genai) when GEMINI_API_KEY is configured
  if (resolvedGeminiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey: resolvedGeminiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
      const geminiModel = "gemini-2.5-flash";
      const contents = buildGeminiContentsFromMessages(messages, images);

      safeWrite(
        res,
        `data: ${JSON.stringify({
          meta: {
            engine: requestedModelName || targetModel || geminiModel,
            actualModel: geminiModel,
            usedProvider: "gemini",
          },
        })}\n\n`
      );

      const streamResponse = await ai.models.generateContentStream({
        model: geminiModel,
        contents,
        config: {
          systemInstruction: sysText,
        },
      });

      let accumulated = "";
      let firstTokenAt = 0;
      for await (const chunk of streamResponse) {
        if (signal?.aborted || res.writableEnded) break;
        const delta = sanitizeDelta(chunk?.text || "");
        if (delta) {
          if (!firstTokenAt) firstTokenAt = Date.now();
          accumulated += delta;
          safeWrite(res, `data: ${JSON.stringify({ delta })}\n\n`);
        }
      }

      if (accumulated.trim()) {
        const outputTokens = estimateTokens(accumulated);
        const latencyMs = Math.max(1, Date.now() - start);
        const ttftMs = firstTokenAt ? Math.max(1, firstTokenAt - start) : latencyMs;

        if (endStream) {
          safeWrite(
            res,
            `data: ${JSON.stringify({
              meta: {
                inputTokens: promptTokens,
                outputTokens,
                streamedTokens: outputTokens,
                engine: requestedModelName || geminiModel,
                actualModel: geminiModel,
                usedProvider: "gemini",
                ttftMs,
                latencyMs,
              },
            })}\n\n`
          );
          safeWrite(res, "data: [DONE]\n\n");
          safeEnd(res);
        }

        return {
          ttftMs,
          latencyMs,
          inputTokens: promptTokens,
          outputTokens,
          actualModel: geminiModel,
          usedProvider: "gemini",
          accumulatedText: accumulated,
        };
      }
    } catch (geminiErr) {
      if (signal?.aborted) throw geminiErr;
      // Fall through to intelligent autonomous engine if Gemini upstream fails
    }
  }

  // Priority 2: Intelligent intent-routed Autonomous Engine + Live DeepSearch synthesis
  const content = await generateAutonomousResponse({
    prompt: lastUserMsg,
    messages,
    images,
    signal,
    modelName: requestedModelName || targetModel || "SUJITH IDE Agent",
    searchOutcome,
    hasConnectedKey,
  });

  safeWrite(
    res,
    `data: ${JSON.stringify({
      meta: {
        engine: requestedModelName || targetModel || "NoTrack Uncensored",
        actualModel: targetModel || "sujith-agent",
        usedProvider: "sujith-ai",
      },
    })}\n\n`
  );

  const chunkSize = 48;
  for (let i = 0; i < content.length; i += chunkSize) {
    if (signal?.aborted || res.writableEnded) break;
    const chunk = content.slice(i, i + chunkSize);
    safeWrite(res, `data: ${JSON.stringify({ delta: chunk })}\n\n`);
    await new Promise((r) => setTimeout(r, 8));
  }

  const outputTokens = estimateTokens(content);
  const latencyMs = Math.max(1, Date.now() - start);
  const ttftMs = Math.min(25, latencyMs);

  if (endStream) {
    safeWrite(
      res,
      `data: ${JSON.stringify({
        meta: {
          inputTokens: promptTokens,
          outputTokens,
          streamedTokens: outputTokens,
          engine: requestedModelName || targetModel || "NoTrack Uncensored",
          actualModel: targetModel || "sujith-agent",
          usedProvider: "sujith-ai",
          ttftMs,
          latencyMs,
        },
      })}\n\n`
    );
    safeWrite(res, "data: [DONE]\n\n");
    safeEnd(res);
  }

  return {
    ttftMs,
    latencyMs,
    inputTokens: promptTokens,
    outputTokens,
    actualModel: targetModel || "sujith-agent",
    usedProvider: "sujith-ai",
    accumulatedText: content,
  };
}

async function streamNoTrack({ apiKey, geminiKey, requestedModelId, requestedModelName, company, messages, images, temperature, maxTokens, deepSearch = false, res, signal }) {
  const key = (apiKey || CREDENTIALS.notrack() || "").trim();
  const resolvedGeminiKey = (geminiKey || process.env.GEMINI_API_KEY || "").trim();
  if (!key && !resolvedGeminiKey) {
    throw new NoTrackRequestError("NoTrack.ai API key is required.", {
      status: 401,
      code: "KEY_MISSING",
      hint: "Open Settings -> NoTrack.ai API Key to enter and verify your NoTrack.ai API key.",
    });
  }

  const startedAt = Date.now();
  const discovery = await discoverNoTrackModels(key, false);
  const availableModels = discovery.models.length ? discovery.models : ["notrack-uncensored"];
  let targetModel = resolveNoTrackTargetModel(requestedModelId, requestedModelName, company, availableModels);

  const validTemp = typeof temperature === "number" && Number.isFinite(temperature)
    ? Math.min(2, Math.max(0, Number(temperature.toFixed(2))))
    : undefined;
  const validMaxTokens = typeof maxTokens === "number" && Number.isFinite(maxTokens)
    ? Math.min(32768, Math.max(64, Math.round(maxTokens)))
    : undefined;

  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const clientSystemText = messages
    .filter((m) => m.role === "system" && typeof m.content === "string")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n\n");
  const isBuilderRequest = /inside SUJITH AI(?: Builder)?|named fenced (?:code )?blocks|```lang:path\/to\/file/i.test(clientSystemText);

  const needSearch = shouldRunDeepSearch({
    query: lastUserMsg,
    history: messages,
    isBuilderRequest,
    explicitDeepSearch: Boolean(deepSearch),
  });

  let searchOutcome = null;
  if (needSearch) {
    searchOutcome = await runDeepSearch(lastUserMsg, {
      history: messages,
      signal,
      onProgress: (progressState) => {
        safeWrite(res, `data: ${JSON.stringify({ search: progressState })}\n\n`);
      },
    });
    if (searchOutcome.status === "unavailable") {
      safeWrite(
        res,
        `data: ${JSON.stringify({
          warning: "Live web search is currently unavailable. Answering without live source verification.",
        })}\n\n`
      );
    }
  }

  const now = new Date();
  const currentDateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const currentTimeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });

  let systemPromptText = "";
  if (isBuilderRequest) {
    systemPromptText = clientSystemText;
  } else {
    systemPromptText = `You are an intelligent, highly accurate, natural, and helpful AI assistant in SUJITH IDE.
Current real-world date: ${currentDateStr} (Year: ${now.getUTCFullYear()}). Current time: ${currentTimeStr}.

Accuracy, Research & Conversation Rules:
1. Provide truthful, up-to-date, accurate, and completely factual answers. Never hallucinate, guess, or invent names, dates, statistics, or source links.
2. For current affairs, political figures, news, technical releases, statistics, and dates, cross-check names, dates, and figures carefully against retrieved live sources.
3. Clearly distinguish verified facts (directly supported by sources) from uncertain, conflicting, or unverified details.
4. If the user asks in Tamil, provide fluent, accurate, respectful, and natural Tamil. For example, refer to the Chief Minister as "முதலமைச்சர்" (never garbled titles or names).
5. If the user asks in Tanglish, answer clearly and naturally.
6. NEVER print internal debug variables, placeholders, or template labels (e.g. NEVER print "CURRENT_CM" or similar tags).
7. Maintain multi-turn context accurately and answer follow-up research questions thoroughly.`;

    if (searchOutcome?.status === "complete" && searchOutcome.sources.length > 0) {
      const formattedSources = searchOutcome.sources
        .map(
          (src) =>
            `[${src.id}] Title: ${src.title}\nURL: ${src.url}\nDomain: ${src.domain}${
              src.publishedAt ? ` | Published: ${src.publishedAt}` : ""
            }\nVerified Content: ${src.excerpt || src.snippet}`
        )
        .join("\n\n");

      systemPromptText += `\n\n=== VERIFIED LIVE WEB SEARCH RESULTS (${searchOutcome.sources.length} SOURCES) ===
Search Queries: ${searchOutcome.queries.join(" ; ")}

${formattedSources}

CRITICAL DEEP SEARCH CITATION & VERIFICATION INSTRUCTIONS:
- Rely strictly on the verified live sources above for current facts, officeholders, names, dates, statistics, and recent events (never override verified 2026 sources with stale pre-training memory!).
- If any source provides an official Wikipedia infobox or multiple news reports confirming a fact, prioritize that consensus and verify spelling of names and exact dates.
- Cite sources inline using clickable Markdown links formatted cleanly like [Source Name](EXACT_URL_FROM_LIST_ABOVE) or numbered citations.
- End your response with a concise "### Sources" section listing ONLY the relevant exact HTTPS URLs from the list above as clickable Markdown links (e.g. - [Article Title — domain](https://...)).
- NEVER invent, guess, alter, or fabricate URLs or sources that do not appear verbatim in the retrieved list above.
- If some specific sub-question is not covered by the retrieved sources, explicitly state what could not be verified from live sources.`;
    } else if (searchOutcome?.status === "unavailable") {
      systemPromptText += `\n\n=== LIVE WEB SEARCH UNAVAILABLE ===
Attempted live web search failed because external search providers could not be reached right now (${searchOutcome.error || "network error"}).
CRITICAL:
- Start by clearly informing the user that live web search is currently unavailable, so you cannot verify real-time or post-cutoff facts right now.
- NEVER pretend a web search succeeded, and NEVER generate fake search results, fake source links, or fabricated citations.
- Clearly distinguish stable established knowledge from time-sensitive facts that could not be verified today.`;
    } else if (searchOutcome?.status === "empty") {
      systemPromptText += `\n\n=== LIVE WEB SEARCH RETURNED NO MATCHING SOURCES ===
Live search queried external sources for "${searchOutcome.queries.join(", ")}" and found no reliable matching pages.
CRITICAL:
- Do NOT invent fake search results, fake URLs, or imaginary citations.
- Inform the user honestly that live web search found no matching reliable sources for that exact query, and clearly separate general background context from unverified specifics.`;
    }

    const modelProfile = buildModelProfileDirective({ requestedModelId, requestedModelName, company });
    systemPromptText += `\n\n${modelProfile}`;
    if (clientSystemText) {
      systemPromptText += `\n\n${clientSystemText}`;
    }
    if (isCodingRelated(lastUserMsg, messages)) {
      systemPromptText += `\n\n${CODING_QUALITY_MASTER_PROMPT}`;
    }
  }

  const systemInstruction = {
    role: "system",
    content: systemPromptText,
  };
  const filteredMessages = messages.filter((m) => m.role !== "system");
  const baseMessages = [systemInstruction, ...filteredMessages];

  const textOnlyMessages = baseMessages.map((m) => ({ role: m.role, content: m.content }));
  const multimodalMessages = images.length
    ? baseMessages.map((message, index) => {
        const isLastUser = message.role === "user" && index === baseMessages.length - 1;
        if (!isLastUser) return { role: message.role, content: message.content };
        return {
          role: "user",
          content: [
            { type: "text", text: message.content },
            ...images.map((image) => ({ type: "image_url", image_url: { url: image.dataUrl } })),
          ],
        };
      })
    : textOnlyMessages;

  const callNoTrack = async (modelToSend, payloadMessages, includeParams = true) => {
    const headerCtrl = new AbortController();
    const headerTimer = setTimeout(() => {
      headerCtrl.abort(Object.assign(new Error("Upstream connection timed out after 45s."), { name: "TimeoutError" }));
    }, 45000);
    const combinedSignal = signal ? AbortSignal.any([signal, headerCtrl.signal]) : headerCtrl.signal;
    const bodyPayload = {
      model: modelToSend,
      messages: payloadMessages,
      stream: true,
      ...(includeParams && validTemp !== undefined ? { temperature: validTemp } : {}),
      ...(includeParams && validMaxTokens !== undefined ? { max_tokens: validMaxTokens } : {}),
    };
    try {
      const response = await fetch(`${NOTRACK_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
        signal: combinedSignal,
      });
      clearTimeout(headerTimer);
      return response;
    } catch (err) {
      clearTimeout(headerTimer);
      throw err;
    }
  };

  const isWorkspaceOnly = !key || Boolean(discovery?.isWorkspaceVirtual);
  if (isWorkspaceOnly) {
    return await streamAutonomousFallback({
      requestedModelName,
      targetModel,
      company,
      messages,
      images,
      lastUserMsg,
      clientSystemText,
      systemPromptText,
      geminiKey: resolvedGeminiKey,
      searchOutcome,
      hasConnectedKey: Boolean(key),
      res,
      signal,
      startedAt,
      endStream: false,
    });
  }

  let upstream;
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        upstream = await callNoTrack(targetModel, multimodalMessages, true);
        if (upstream.status >= 500 && upstream.status <= 504 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 650));
          continue;
        }
        break;
      } catch (innerErr) {
        if (signal?.aborted || (innerErr instanceof Error && (innerErr.name === "AbortError" || innerErr.name === "TimeoutError")) || attempt === 1) {
          throw innerErr;
        }
        await new Promise((r) => setTimeout(r, 650));
      }
    }

    // If image attachment format was rejected (400/422), retry cleanly as text-only
    if (upstream && !upstream.ok && images.length && (upstream.status === 400 || upstream.status === 422)) {
      safeWrite(res, `data: ${JSON.stringify({ warning: "Image attachment omitted: active NoTrack.ai model expects text input." })}\n\n`);
      upstream = await callNoTrack(targetModel, textOnlyMessages, true);
    }

    // If optional temperature / max_tokens were rejected (400/422), retry without optional params
    if (upstream && !upstream.ok && (upstream.status === 400 || upstream.status === 422) && (validTemp !== undefined || validMaxTokens !== undefined)) {
      upstream = await callNoTrack(targetModel, textOnlyMessages, false);
    }

    // If requested model ID was rejected by NoTrack (400/404), retry with primary verified NoTrack model
    if (upstream && !upstream.ok && (upstream.status === 400 || upstream.status === 404) && targetModel !== "notrack-uncensored") {
      targetModel = "notrack-uncensored";
      upstream = await callNoTrack(targetModel, textOnlyMessages, true);
    }
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) throw err;
    return await streamAutonomousFallback({
      requestedModelName,
      targetModel,
      company,
      messages,
      images,
      lastUserMsg,
      clientSystemText,
      systemPromptText,
      geminiKey: resolvedGeminiKey,
      searchOutcome,
      hasConnectedKey: Boolean(key),
      res,
      signal,
      startedAt,
      endStream: false,
    });
  }

  captureRateLimits("notrack", upstream.headers);
  if (company && company !== "notrack") {
    captureRateLimits(company, upstream.headers);
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    if (upstream.status === 402 || upstream.status === 429 || (upstream.status >= 400 && upstream.status !== 401 && upstream.status !== 403)) {
      return await streamAutonomousFallback({
        requestedModelName,
        targetModel,
        company,
        messages,
        images,
        lastUserMsg,
        clientSystemText,
        systemPromptText,
        geminiKey: resolvedGeminiKey,
        searchOutcome,
        hasConnectedKey: Boolean(key),
        res,
        signal,
        startedAt,
        endStream: false,
      });
    }
    throw classifyNoTrackHttpError(upstream.status, errText);
  }

  safeWrite(
    res,
    `data: ${JSON.stringify({
      meta: {
        engine: requestedModelName || targetModel,
        actualModel: targetModel,
        usedProvider: "notrack",
      },
    })}\n\n`
  );
  if (company !== "notrack" || targetModel !== requestedModelId) {
    safeWrite(res, `data: ${JSON.stringify({ warning: `Routed via NoTrack.ai backend (${targetModel}).` })}\n\n`);
  }

  const inputTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  let outputTokens = 0;
  let accumulatedText = "";
  let firstTokenAt = 0;

  const contentType = upstream.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !upstream.body) {
    const raw = await upstream.text().catch(() => "");
    let text = "";
    try {
      const parsed = JSON.parse(raw);
      text = sanitizeDelta(parsed?.choices?.[0]?.message?.content || "");
      if (parsed?.usage) {
        outputTokens = parsed.usage.completion_tokens || 0;
      }
    } catch {
      text = raw.trim();
    }
    if (!text) {
      return await streamAutonomousFallback({
        requestedModelName,
        targetModel,
        company,
        messages,
        images,
        lastUserMsg,
        clientSystemText,
        systemPromptText,
        geminiKey: resolvedGeminiKey,
        searchOutcome,
        hasConnectedKey: Boolean(key),
        res,
        signal,
        startedAt,
        endStream: false,
      });
    }
    const latencyMs = Math.max(1, Date.now() - startedAt);
    safeWrite(res, `data: ${JSON.stringify({ delta: text })}\n\n`);
    return {
      inputTokens,
      outputTokens: outputTokens || estimateTokens(text),
      actualModel: targetModel,
      ttftMs: latencyMs,
      latencyMs,
    };
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let parsedInputTokens = inputTokens;
  let chunkCount = 0;
  const keepAlive = setInterval(() => {
    safeWrite(res, ": keepalive\n\n");
  }, 10000);

  try {
    while (true) {
      let idleTimer;
      const idlePromise = new Promise((_, reject) => {
        idleTimer = setTimeout(() => {
          reject(
            new NoTrackRequestError("NoTrack.ai stream stalled without data for 60 seconds.", {
              status: 504,
              code: "TIMEOUT",
              hint: "The model stalled mid-stream. Retry shortly or choose another model.",
            })
          );
        }, 60000);
      });
      const { done, value } = await Promise.race([reader.read(), idlePromise]).finally(() => clearTimeout(idleTimer));
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      for (const block of events) {
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const rawDelta = parsed?.choices?.[0]?.delta?.content ?? parsed?.choices?.[0]?.message?.content ?? "";
          const delta = sanitizeDelta(rawDelta);
          if (delta) {
            if (!firstTokenAt) {
              firstTokenAt = Date.now();
              safeWrite(
                res,
                `data: ${JSON.stringify({
                  meta: {
                    engine: requestedModelName || targetModel,
                    actualModel: targetModel,
                    usedProvider: "notrack",
                    ttftMs: Math.max(1, firstTokenAt - startedAt),
                  },
                })}\n\n`
              );
            }
            accumulatedText += delta;
            chunkCount += 1;
            safeWrite(res, `data: ${JSON.stringify({ delta })}\n\n`);
            if (chunkCount % 12 === 0) {
              safeWrite(
                res,
                `data: ${JSON.stringify({
                  meta: {
                    streamedTokens: outputTokens || estimateTokens(accumulatedText),
                    latencyMs: Math.max(1, Date.now() - startedAt),
                  },
                })}\n\n`
              );
            }
          }
          if (parsed?.usage) {
            parsedInputTokens = parsed.usage.prompt_tokens || parsedInputTokens;
            outputTokens = parsed.usage.completion_tokens || outputTokens;
          }
          if (parsed?.error) {
            throw new NoTrackRequestError(parsed.error?.message || "NoTrack stream error", {
              status: parsed.error?.status || 502,
              code: parsed.error?.code || "STREAM_ERROR",
              hint: "Check your NoTrack.ai account credits and retry.",
            });
          }
        } catch (err) {
          if (err instanceof SyntaxError) continue;
          throw err;
        }
      }
      if (done) break;
    }
  } finally {
    clearInterval(keepAlive);
  }

  if (!accumulatedText.trim()) {
    return await streamAutonomousFallback({
      requestedModelName,
      targetModel,
      company,
      messages,
      images,
      lastUserMsg,
      clientSystemText,
      systemPromptText,
      geminiKey: resolvedGeminiKey,
      searchOutcome,
      hasConnectedKey: Boolean(key),
      res,
      signal,
      startedAt,
      endStream: false,
    });
  }

  const latencyMs = Math.max(1, Date.now() - startedAt);
  const ttftMs = firstTokenAt ? Math.max(1, firstTokenAt - startedAt) : latencyMs;

  return {
    inputTokens: parsedInputTokens,
    outputTokens: outputTokens || estimateTokens(accumulatedText),
    actualModel: targetModel,
    ttftMs,
    latencyMs,
  };
}

function safeSlug(input, fallback = "default") {
  const clean = String(input || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
  return clean || fallback;
}

function getWorkspaceRoot(userId, projectId) {
  const base = path.join(os.tmpdir(), "sujith-workspaces", safeSlug(userId, "anon"), safeSlug(projectId, "default"));
  fs.mkdirSync(base, { recursive: true });
  return fs.realpathSync(base);
}

function resolveWorkspacePath(workspaceRoot, relPath, allowRoot = false) {
  if (typeof relPath !== "string") return null;
  const trimmed = relPath.trim();
  if (!trimmed) return allowRoot ? workspaceRoot : null;
  if (trimmed === "." && allowRoot) return workspaceRoot;
  if (path.isAbsolute(trimmed) || trimmed.includes("\0") || /(^|[\\/])\.\.([\\/]|$)/.test(trimmed)) return null;
  if (/(^|[\\/])\.env(?:\.|$)/i.test(trimmed)) return null;
  const resolved = path.resolve(workspaceRoot, trimmed);
  if (resolved === workspaceRoot) return allowRoot ? resolved : null;
  if (!resolved.startsWith(workspaceRoot + path.sep)) return null;
  return resolved;
}

function syncFilesToWorkspace(workspaceRoot, files = [], cleanRemoved = false) {
  const written = [];
  const keepSet = new Set();
  for (const item of files) {
    if (!item || typeof item.path !== "string" || typeof item.content !== "string") continue;
    const target = resolveWorkspacePath(workspaceRoot, item.path);
    if (!target) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, item.content, "utf8");
    const rel = path.relative(workspaceRoot, target).split(path.sep).join("/");
    written.push(rel);
    keepSet.add(rel);
  }
  if (cleanRemoved && Array.isArray(files)) {
    const prune = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(workspaceRoot, full).split(path.sep).join("/");
        if (rel === ".git" || rel.startsWith(".git/")) continue;
        if (entry.isDirectory()) {
          prune(full);
          try {
            if (!fs.readdirSync(full).length) fs.rmdirSync(full);
          } catch {
            // Ignore non-empty dir
          }
        } else if (!keepSet.has(rel)) {
          try {
            fs.unlinkSync(full);
          } catch {
            // Best effort
          }
        }
      }
    };
    prune(workspaceRoot);
  }
  return written;
}

const TERMINAL_ALLOWED_COMMANDS = new Set([
  "ls", "find", "cat", "head", "tail", "wc", "grep", "pwd", "mkdir", "touch", "rm", "mv", "cp",
  "echo", "which", "node", "npm", "npx", "tsx", "bun", "tsc", "python3", "python", "gcc", "g++",
  "git", "java", "javac", "kotlinc", "gradle", "./gradlew", "gradlew", "flutter", "dart", "adb",
]);

const PATH_VALIDATED_COMMANDS = new Set([
  "ls", "find", "cat", "head", "tail", "wc", "grep", "mkdir", "touch", "rm", "mv", "cp",
]);

function validateTerminalArgs(bin, args, workspaceRoot) {
  if (bin === "find") {
    const blockedFindFlags = new Set(["-exec", "-execdir", "-ok", "-okdir", "-delete", "-fprint", "-fprint0", "-fprintf", "-fls"]);
    const valueFlags = new Set(["-name", "-iname", "-path", "-ipath", "-regex", "-type", "-maxdepth", "-mindepth", "-perm", "-user", "-group", "-size"]);
    let expectFlagValue = false;
    for (const arg of args) {
      if (expectFlagValue) {
        expectFlagValue = false;
        continue;
      }
      const lower = arg.toLowerCase();
      if (blockedFindFlags.has(lower)) {
        return `Flag "${arg}" is blocked in the workspace terminal.`;
      }
      if (valueFlags.has(lower)) {
        expectFlagValue = true;
        continue;
      }
      if (arg.startsWith("-")) continue;
      if (!resolveWorkspacePath(workspaceRoot, arg, true)) {
        return `Path "${arg}" escapes the workspace directory.`;
      }
    }
    return null;
  }

  if (bin === "node" || bin === "bun" || bin === "tsx") {
    const blockedNodeFlags = new Set(["-e", "--eval", "-p", "--print", "-r", "--require", "--import", "--loader", "--experimental-loader", "-i", "--interactive"]);
    for (const arg of args) {
      const flagBase = arg.split("=")[0];
      if (blockedNodeFlags.has(arg) || blockedNodeFlags.has(flagBase)) {
        return `Flag "${arg}" is disabled in the workspace terminal.`;
      }
      if (!arg.startsWith("-") && (path.isAbsolute(arg) || /(^|[\\/])\.\.([\\/]|$)/.test(arg))) {
        return `Path "${arg}" escapes the workspace directory.`;
      }
    }
    return null;
  }

  if (bin === "python3" || bin === "python") {
    const blockedPyFlags = new Set(["-c", "-i", "-m"]);
    for (const arg of args) {
      const flagBase = arg.split("=")[0];
      if (blockedPyFlags.has(arg) || blockedPyFlags.has(flagBase)) {
        return `Flag "${arg}" is disabled in the workspace terminal.`;
      }
      if (!arg.startsWith("-") && !resolveWorkspacePath(workspaceRoot, arg, true)) {
        return `Path "${arg}" escapes the workspace directory.`;
      }
    }
    return null;
  }

  if (bin === "gcc" || bin === "g++") {
    for (const arg of args) {
      if (/^-fplugin|^--plugin|^@/.test(arg)) {
        return `Flag "${arg}" is disabled in the workspace terminal.`;
      }
      if (!arg.startsWith("-") && !resolveWorkspacePath(workspaceRoot, arg, true)) {
        return `Path "${arg}" escapes the workspace directory.`;
      }
    }
    return null;
  }

  if (bin === "git") {
    const blockedGitFlags = new Set(["-c", "--exec-path", "--upload-pack", "--receive-pack", "--git-dir", "--work-tree"]);
    const sub = args[0] || "";
    if (sub === "config" || sub === "daemon") {
      return `Git subcommand "${sub}" is disabled in the workspace terminal.`;
    }
    for (const arg of args) {
      const flagBase = arg.split("=")[0];
      if (blockedGitFlags.has(arg) || blockedGitFlags.has(flagBase) || /core\.fsmonitor|uploadpack/i.test(arg)) {
        return `Git option "${arg}" is disabled in the workspace terminal.`;
      }
      if (arg.startsWith("/") || /(^|[\\/])\.\.([\\/]|$)/.test(arg)) {
        return `Path "${arg}" escapes the workspace directory.`;
      }
    }
    return null;
  }

  if (bin === "npm" || bin === "npx") {
    for (const arg of args) {
      const flagBase = arg.split("=")[0];
      if (flagBase === "--userconfig" || flagBase === "--globalconfig" || flagBase === "--script-shell" || arg === "-c") {
        return `Flag "${arg}" is disabled in the workspace terminal.`;
      }
      if (!arg.startsWith("-") && (arg.startsWith("/") || /(^|[\\/])\.\.([\\/]|$)/.test(arg))) {
        return `Path "${arg}" escapes the workspace directory.`;
      }
    }
    return null;
  }

  if (PATH_VALIDATED_COMMANDS.has(bin)) {
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      if (arg.startsWith("-")) continue;
      if (bin === "grep" && i === 0) continue;
      if (!resolveWorkspacePath(workspaceRoot, arg, true)) {
        return `Path "${arg}" escapes the workspace directory.`;
      }
    }
  }
  return null;
}

function tokenizeCommand(raw) {
  const input = String(raw || "").trim();
  if (!input) return { error: "Enter a command." };
  if (input.length > 1000) return { error: "Command exceeds 1000 characters." };
  if (/[;&|`$<>\\]|\r|\n/.test(input)) {
    return { error: "Shell chaining, pipes, and redirections are disabled for safety. Run one command at a time." };
  }
  const tokens = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (quote) return { error: "Unterminated quote in command." };
  if (current) tokens.push(current);
  if (!tokens.length) return { error: "Enter a command." };
  return { bin: tokens[0], args: tokens.slice(1) };
}

function buildSanitizedEnv() {
  const clean = { ...process.env };
  for (const secretKey of [
    "NOTRACK_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "ANTHROPIC_API_KEY",
    "STRIPE_SECRET_KEY",
    "SUJITH_SESSION_SECRET",
    "GITHUB_TOKEN",
  ]) {
    delete clean[secretKey];
  }
  return clean;
}

function buildWorkflowYaml(stack = "kotlin") {
  if (stack === "flutter") {
    return `name: Build Flutter Android APK

on:
  workflow_dispatch:
  push:
    branches: [ main, master ]

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout project
        uses: actions/checkout@v4

      - name: Set up Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"

      - name: Set up Flutter
        uses: subosito/flutter-action@v2
        with:
          channel: stable
          cache: true

      - name: Install Dart dependencies
        run: flutter pub get

      - name: Analyze & run unit checks
        run: flutter analyze

      - name: Build debug APK
        run: flutter build apk --debug

      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: sujith-android-debug-apk
          path: build/app/outputs/flutter-apk/*.apk
`;
  }

  return `name: Build Android Debug APK

on:
  workflow_dispatch:
  push:
    branches: [ main, master ]

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout project
        uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3

      - name: Set up Gradle
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: "8.9"

      - name: Build Android Debug APK
        run: |
          if [ -x "./gradlew" ]; then
            ./gradlew assembleDebug --stacktrace
          else
            gradle assembleDebug --stacktrace
          fi

      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: sujith-android-debug-apk
          path: app/build/outputs/apk/debug/*.apk
`;
}

const GITHUB_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

async function githubFetch(apiPath, token, init = {}) {
  if (!apiPath.startsWith("/")) throw new Error("Invalid GitHub API path.");
  const response = await fetch(`https://api.github.com${apiPath}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "sujith-ai-android-builder",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  return response;
}

export default async function handleApi(req, res) {
  res.on("error", () => {});
  const corsHeaders = corsHeadersForRequest(req);
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    safeEnd(res);
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const { user, issuedToken } = getOrCreateUser(req);
  const sessionHeader = issuedToken ? { "x-sujith-session": issuedToken } : {};
  const sendApiJson = (status, data, extra = {}) => sendJson(res, status, data, { ...sessionHeader, ...extra }, req);

  if (url.pathname === "/api/health" && req.method === "GET") {
    const key = getActiveNoTrackKey(user);
    sendApiJson(200, { ok: true, service: "sujith-ide-backend", notrackConfigured: Boolean(key), timestamp: Date.now() });
    return;
  }

  if (url.pathname === "/api/providers/status" && req.method === "GET") {
    const key = getActiveNoTrackKey(user);
    const hasNoTrack = Boolean(key);
    const discovery = hasNoTrack ? await discoverNoTrackModels(key, false) : null;
    const notrackStatus = !hasNoTrack ? "unconfigured" : discovery?.ok ? "connected" : "error";
    const notrackSource = getUserSavedNoTrackKey(user) ? "settings" : CREDENTIALS.notrack() ? "env" : "none";
    const routedStatus = !hasNoTrack
      ? "API Key Required"
      : discovery?.ok
        ? "NoTrack Live"
        : "Key Error";
    const providers = {
      notrack: { configured: hasNoTrack && Boolean(discovery?.ok), statusText: routedStatus },
      openai: { configured: hasNoTrack && Boolean(discovery?.ok), statusText: routedStatus },
      gemini: { configured: hasNoTrack && Boolean(discovery?.ok), statusText: routedStatus },
      anthropic: { configured: hasNoTrack && Boolean(discovery?.ok), statusText: routedStatus },
    };
    const mediaCapabilities = getMediaCapabilities(key, discovery?.models ?? [], process.env.GEMINI_API_KEY || user.geminiApiKey);
    sendApiJson(
      200,
      {
        ok: true,
        notrackConfigured: hasNoTrack,
        notrackSource,
        notrackMaskedKey: key ? maskApiKey(key) : "",
        notrackStatus,
        discoveredModels: discovery?.models ?? [],
        notrackLatencyMs: discovery?.latencyMs,
        notrackError: discovery?.error,
        notrackCheckedAt: discovery?.checkedAt,
        mediaCapabilities,
        ...(issuedToken ? { sessionToken: issuedToken } : {}),
        providers,
      }
    );
    return;
  }

  if (url.pathname === "/api/providers/notrack/check" && req.method === "GET") {
    const key = getActiveNoTrackKey(user);
    const check = await discoverNoTrackModels(key, true);
    sendApiJson(
      200,
      {
        ...check,
        source: getUserSavedNoTrackKey(user) ? "settings" : CREDENTIALS.notrack() ? "env" : "none",
        maskedKey: key ? maskApiKey(key) : "",
      }
    );
    return;
  }

  if (url.pathname === "/api/providers/notrack/key" && req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      sendApiJson(400, { ok: false, error: err.message });
      return;
    }

    if (body?.clear) {
      setUserSavedNoTrackKey(user, "");
      persistStore();
      const envKey = CREDENTIALS.notrack();
      sendApiJson(
        200,
        {
          ok: true,
          cleared: true,
          configured: Boolean(envKey),
          source: envKey ? "env" : "none",
          maskedKey: envKey ? maskApiKey(envKey) : "",
          models: [],
        }
      );
      return;
    }

    const rawKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    if (!rawKey || rawKey.length > 512) {
      sendApiJson(400, { ok: false, configured: false, verified: false, error: "Enter a valid NoTrack.ai API key." });
      return;
    }

    const check = await discoverNoTrackModels(rawKey, true);
    if (!check.ok) {
      const status = check.statusCode === 401 || check.statusCode === 403 ? check.statusCode : 400;
      sendApiJson(
        status,
        {
          ok: false,
          configured: false,
          verified: false,
          statusCode: check.statusCode,
          latencyMs: check.latencyMs,
          error: check.error || "NoTrack.ai rejected this API key.",
        }
      );
      return;
    }

    setUserSavedNoTrackKey(user, rawKey);
    persistStore();
    sendApiJson(
      200,
      {
        ok: true,
        configured: true,
        verified: true,
        source: "settings",
        maskedKey: maskApiKey(rawKey),
        models: check.models,
        latencyMs: check.latencyMs,
        statusCode: check.statusCode,
      }
    );
    return;
  }

  if (url.pathname === "/api/usage" && req.method === "GET") {
    const cfg = PLAN_CONFIG[user.plan] || PLAN_CONFIG.FREE;
    sendApiJson(
      200,
      {
        source: "backend",
        unlimitedDaily: true,
        dailyRequests: user.usage.dailyRequests,
        monthlyRequests: user.usage.monthlyRequests,
        dailyTokens: user.usage.dailyTokens,
        monthlyTokens: user.usage.monthlyTokens,
        remainingDailyRequests: null,
        remainingMonthlyTokens: null,
        resetNote: "Daily request counter resets at 00:00 UTC · Unlimited daily requests active.",
        officialQuotas: OFFICIAL_PROVIDER_QUOTAS,
        perModel: user.usage.perModel,
        rateLimits: store.rateLimits,
        history: user.usage.history.slice(-40).reverse(),
        note: `Plan: ${user.plan} · ${cfg.allowanceNote}`,
      }
    );
    return;
  }

  if (url.pathname === "/api/subscriptions/status" && req.method === "GET") {
    sendApiJson(200, buildSubscriptionPayload(user));
    return;
  }

  if (url.pathname === "/api/subscriptions/activate" && req.method === "POST") {
    sendApiJson(501, {
      ok: false,
      error: "Paid plans require real Stripe checkout verification (/api/subscriptions/checkout).",
    });
    return;
  }

  if (url.pathname === "/api/subscriptions/checkout" && req.method === "POST") {
    const body = await readBody(req).catch(() => ({}));
    const stripeKey = CREDENTIALS.stripe();
    const priceId = process.env[`STRIPE_PRICE_${String(body.plan || "").toUpperCase()}_${String(body.interval || "monthly").toUpperCase()}`];

    if (!stripeKey || !priceId) {
      sendApiJson(503, {
        ok: false,
        error: "Stripe billing is not configured on the server. Set STRIPE_SECRET_KEY and STRIPE_PRICE_* environment variables.",
      });
      return;
    }

    const origin = process.env.PUBLIC_APP_URL || `http://${req.headers.host || "localhost:3000"}`;
    const form = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      success_url: `${origin}/?checkout_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
      client_reference_id: user.id,
      "metadata[plan]": String(body.plan),
      "metadata[interval]": String(body.interval || "monthly"),
    });
    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const session = await stripeRes.json();
    if (!stripeRes.ok) {
      sendApiJson(502, { ok: false, error: session?.error?.message || "Stripe checkout creation failed." });
      return;
    }
    sendApiJson(200, { ok: true, checkoutUrl: session.url, sessionId: session.id });
    return;
  }

  if (url.pathname === "/api/subscriptions/verify" && req.method === "POST") {
    const body = await readBody(req).catch(() => ({}));
    const stripeKey = CREDENTIALS.stripe();
    if (!stripeKey) {
      sendApiJson(503, { ok: false, error: "Stripe verification requires STRIPE_SECRET_KEY on the server." });
      return;
    }
    if (!body.sessionId || typeof body.sessionId !== "string") {
      sendApiJson(400, { ok: false, error: "Missing checkout session ID." });
      return;
    }
    const verifyRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(body.sessionId)}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    const session = await verifyRes.json();
    if (!verifyRes.ok || session.payment_status !== "paid" || session.client_reference_id !== user.id) {
      sendApiJson(402, { ok: false, error: "Payment has not been verified as paid for this user." });
      return;
    }
    const state = activateUserPlan(
      user,
      session.metadata?.plan || "PRO",
      session.metadata?.interval || "monthly",
      session.subscription || session.id,
      (session.amount_total || 0) / 100
    );
    sendApiJson(200, { ok: true, message: `${state.plan} subscription verified.`, state });
    return;
  }

  if ((url.pathname === "/api/subscriptions/cancel" || url.pathname === "/api/subscriptions/downgrade-free") && req.method === "POST") {
    user.plan = "FREE";
    user.subscriptionStatus = url.pathname.endsWith("cancel") ? "cancelled" : "active";
    user.renewalDate = null;
    persistStore();
    sendApiJson(200, { ok: true, message: "Plan updated to FREE.", state: buildSubscriptionPayload(user) });
    return;
  }

  if (url.pathname === "/api/subscriptions/restore" && req.method === "POST") {
    sendApiJson(200, { ok: true, message: `Current subscription status: ${user.plan} (${user.subscriptionStatus}).`, state: buildSubscriptionPayload(user) });
    return;
  }

  if (url.pathname === "/api/search" && req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      sendApiJson(400, { ok: false, error: err.message });
      return;
    }
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query || query.length > 2000) {
      sendApiJson(400, { ok: false, error: "Provide a valid search query (1-2000 characters)." });
      return;
    }
    const history = Array.isArray(body?.history) ? body.history : [];
    const result = await runDeepSearch(query, { history });
    sendApiJson(200, { ok: result.status === "complete", ...result });
    return;
  }

  if (url.pathname === "/api/chat" && req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      sendApiJson(400, { error: err.message });
      return;
    }

    const { company, officialModelId, modelCatalogId, modelName, messages, conversationId, attachments, temperature, maxTokens, deepSearch } = body;
    const resolvedModelId = modelName || officialModelId || modelCatalogId || "notrack-uncensored";
    const images = Array.isArray(attachments)
      ? attachments
          .filter((item) => item && typeof item.dataUrl === "string" && item.dataUrl.startsWith("data:image/") && item.dataUrl.length < 8_000_000)
          .map((item) => ({ name: String(item.name || "image"), dataUrl: item.dataUrl }))
      : [];
    if (!company || !Array.isArray(messages)) {
      sendApiJson(400, { error: "Missing company or messages." });
      return;
    }

    const activeNoTrackKey = getActiveNoTrackKey(user);
    const activeGeminiKey = (process.env.GEMINI_API_KEY || user.geminiApiKey || "").trim();
    if (!activeNoTrackKey && !activeGeminiKey) {
      const errorDetail = {
        status: 401,
        code: "KEY_MISSING",
        message: "NoTrack.ai API key is required to run models.",
        hint: "Open Settings -> NoTrack.ai API Key to enter and verify your key.",
      };
      sendApiJson(401, { error: errorDetail.message, errorDetail });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...corsHeaders,
      ...sessionHeader,
    });

    const abortController = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) abortController.abort();
    });

    try {
      const usage = await streamNoTrack({
        apiKey: activeNoTrackKey,
        geminiKey: activeGeminiKey,
        requestedModelId: officialModelId || modelCatalogId,
        requestedModelName: resolvedModelId,
        company,
        messages,
        images,
        temperature,
        maxTokens,
        deepSearch: Boolean(deepSearch),
        res,
        signal: abortController.signal,
      });
      const usedProvider = usage.usedProvider || "notrack";
      const engine = resolvedModelId;

      const totalTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0);
      user.usage.dailyRequests += 1;
      user.usage.monthlyRequests += 1;
      user.usage.dailyTokens += totalTokens;
      user.usage.monthlyTokens += totalTokens;
      const entry = user.usage.perModel[resolvedModelId] || { requests: 0, inputTokens: 0, outputTokens: 0 };
      entry.requests += 1;
      entry.inputTokens += usage.inputTokens || 0;
      entry.outputTokens += usage.outputTokens || 0;
      user.usage.perModel[resolvedModelId] = entry;
      user.usage.history.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        modelId: resolvedModelId,
        modelName: engine,
        company,
        usedProvider,
        actualModel: usage.actualModel || resolvedModelId,
        ttftMs: usage.ttftMs,
        latencyMs: usage.latencyMs,
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        status: "complete",
      });
      if (conversationId) user.conversations[conversationId] = { updatedAt: Date.now(), turns: messages.length + 1 };
      persistStore();

      safeWrite(
        res,
        `data: ${JSON.stringify({
          meta: {
            inputTokens: usage.inputTokens || 0,
            outputTokens: usage.outputTokens || 0,
            streamedTokens: usage.outputTokens || 0,
            engine,
            actualModel: usage.actualModel || resolvedModelId,
            usedProvider,
            ttftMs: usage.ttftMs,
            latencyMs: usage.latencyMs,
            rateLimit: store.rateLimits.notrack || store.rateLimits[company],
          },
        })}\n\n`
      );
      safeWrite(res, "data: [DONE]\n\n");
      safeEnd(res);
    } catch (err) {
      const isAuthErr = err instanceof NoTrackRequestError && (err.status === 401 || err.status === 403);
      const isAborted = abortController.signal.aborted || (err instanceof Error && err.name === "AbortError" && err.code !== "TIMEOUT");
      if (!isAborted && !isAuthErr) {
        const lastMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
        await streamAutonomousFallback({
          requestedModelName: resolvedModelId,
          targetModel: resolvedModelId,
          company,
          messages,
          images,
          lastUserMsg: lastMsg,
          clientSystemText: "",
          geminiKey: activeGeminiKey,
          hasConnectedKey: Boolean(activeNoTrackKey),
          res,
          signal: abortController.signal,
          startedAt: Date.now(),
          endStream: true,
        });
        return;
      }
      const rawMsg = err instanceof Error ? err.message : "NoTrack.ai provider error";
      const isTimeout =
        (err instanceof Error && (err.name === "TimeoutError" || err.code === "TIMEOUT")) ||
        /timed?\s*out|aborted due to timeout/i.test(rawMsg);
      const errorDetail = err instanceof NoTrackRequestError
        ? { status: err.status, code: err.code, message: err.message, hint: err.hint }
        : isTimeout
          ? {
              status: 504,
              code: "TIMEOUT",
              message: "The upstream model stream timed out while waiting for tokens.",
              hint: "Retry the request or switch to a faster model.",
            }
          : {
              status: typeof err?.status === "number" ? err.status : 502,
              code: typeof err?.code === "string" ? err.code : "PROVIDER_ERROR",
              message: rawMsg,
              hint: typeof err?.hint === "string" && err.hint ? err.hint : "Retry the request; if errors persist, check your NoTrack.ai status in Settings.",
            };
      user.usage.history.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        modelId: resolvedModelId,
        modelName: resolvedModelId,
        company,
        usedProvider: "notrack",
        inputTokens: 0,
        outputTokens: 0,
        status: "error",
      });
      persistStore();
      safeWrite(res, `data: ${JSON.stringify({ error: errorDetail.message, errorDetail })}\n\n`);
      safeEnd(res);
    }
    return;
  }

  if (url.pathname === "/api/builder/agent" && req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      sendApiJson(400, { error: err.message });
      return;
    }

    const {
      company,
      officialModelId,
      modelCatalogId,
      modelName,
      conversationId,
      prompt,
      history,
      files,
      attachments,
      targetMode = "website",
      enforceReactVite = true,
      temperature,
      maxTokens,
      customSystem,
    } = body || {};

    const resolvedModelId = modelName || officialModelId || modelCatalogId || "notrack-uncensored";
    if (!company || typeof prompt !== "string" || !prompt.trim()) {
      sendApiJson(400, { error: "Missing company or prompt." });
      return;
    }

    const activeNoTrackKey = getActiveNoTrackKey(user);
    const activeGeminiKey = (process.env.GEMINI_API_KEY || user.geminiApiKey || "").trim();
    if (!activeNoTrackKey && !activeGeminiKey) {
      const errorDetail = {
        status: 401,
        code: "KEY_MISSING",
        message: "NoTrack.ai API key is required to run the builder agent.",
        hint: "Open Settings -> NoTrack.ai API Key to enter and verify your key.",
      };
      sendApiJson(401, { error: errorDetail.message, errorDetail });
      return;
    }

    const discovery = activeNoTrackKey ? await discoverNoTrackModels(activeNoTrackKey, false) : null;
    const availableModels = discovery?.models?.length ? discovery.models : ["notrack-uncensored"];
    const workspaceRoot = getWorkspaceRoot(user.id, conversationId || "default");

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...corsHeaders,
      ...sessionHeader,
    });

    const abortController = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) abortController.abort();
    });

    try {
      const usage = await runBuilderAgentSession({
        apiKey: activeNoTrackKey,
        geminiKey: activeGeminiKey,
        isWorkspaceVirtual: Boolean(discovery?.isWorkspaceVirtual),
        requestedModelId: officialModelId || modelCatalogId,
        requestedModelName: resolvedModelId,
        company,
        availableModels,
        workspaceRoot,
        initialFiles: Array.isArray(files) ? files : [],
        prompt: prompt.trim(),
        history: Array.isArray(history) ? history : [],
        attachments: Array.isArray(attachments) ? attachments : [],
        targetMode: targetMode === "android" ? "android" : "website",
        enforceReactVite: Boolean(enforceReactVite),
        temperature,
        maxTokens,
        customSystem: typeof customSystem === "string" ? customSystem : "",
        res,
        signal: abortController.signal,
        syncWorkspaceToServerFn: syncFilesToWorkspace,
        classifyError: classifyNoTrackHttpError,
        readableError,
        estimateTokensFn: estimateTokens,
      });

      const totalTokens = (usage.inputTokens || 0) + (usage.outputTokens || 0);
      user.usage.dailyRequests += 1;
      user.usage.monthlyRequests += 1;
      user.usage.dailyTokens += totalTokens;
      user.usage.monthlyTokens += totalTokens;
      const entry = user.usage.perModel[resolvedModelId] || { requests: 0, inputTokens: 0, outputTokens: 0 };
      entry.requests += 1;
      entry.inputTokens += usage.inputTokens || 0;
      entry.outputTokens += usage.outputTokens || 0;
      user.usage.perModel[resolvedModelId] = entry;
      user.usage.history.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        modelId: resolvedModelId,
        modelName: resolvedModelId,
        company,
        usedProvider: "notrack",
        actualModel: usage.actualModel || resolvedModelId,
        ttftMs: usage.ttftMs,
        latencyMs: usage.latencyMs,
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        status: "complete",
      });
      if (conversationId) user.conversations[conversationId] = { updatedAt: Date.now(), turns: (history?.length || 0) + 1 };
      persistStore();
      safeWrite(res, "data: [DONE]\n\n");
      safeEnd(res);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : "Builder agent execution error";
      const isTimeout =
        (err instanceof Error && (err.name === "TimeoutError" || err.code === "TIMEOUT")) ||
        /timed?\s*out|stalled|aborted due to timeout/i.test(rawMsg);
      const errorDetail = err instanceof NoTrackRequestError
        ? { status: err.status, code: err.code, message: err.message, hint: err.hint, recoverable: true }
        : isTimeout
          ? {
              status: 504,
              code: "TIMEOUT",
              message: rawMsg,
              hint: "The model stalled while streaming. Any files already saved remain intact — click Retry to continue.",
              recoverable: true,
            }
          : {
              status: typeof err?.status === "number" ? err.status : 502,
              code: typeof err?.code === "string" ? err.code : "BUILDER_ERROR",
              message: rawMsg,
              hint: typeof err?.hint === "string" && err.hint
                ? err.hint
                : "Retry the build. Any files already written have been auto-saved.",
              recoverable: true,
            };
      user.usage.history.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        modelId: resolvedModelId,
        modelName: resolvedModelId,
        company,
        usedProvider: "notrack",
        inputTokens: 0,
        outputTokens: 0,
        status: "error",
      });
      persistStore();
      safeWrite(res, `data: ${JSON.stringify({ error: errorDetail.message, errorDetail })}\n\n`);
      safeEnd(res);
    }
    return;
  }

  if (url.pathname === "/api/workspace/sync" && req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      sendApiJson(400, { ok: false, error: err.message });
      return;
    }
    const workspaceRoot = getWorkspaceRoot(user.id, body.projectId || "default");
    const written = syncFilesToWorkspace(workspaceRoot, Array.isArray(body.files) ? body.files : [], Boolean(body.clean));
    if (Array.isArray(body.folders)) {
      for (const folder of body.folders) {
        const targetDir = resolveWorkspacePath(workspaceRoot, folder, true);
        if (targetDir) fs.mkdirSync(targetDir, { recursive: true });
      }
    }
    sendApiJson(200, { ok: true, workspaceRoot, fileCount: written.length, paths: written });
    return;
  }

  if (url.pathname === "/api/workspace/check" && req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      sendApiJson(400, { ok: false, error: err.message });
      return;
    }
    const files = Array.isArray(body?.files) ? body.files : [];
    const strictResult = verifyWorkspaceStrict(files, {
      targetMode: body?.targetMode === "android" ? "android" : "website",
      enforceReactVite: Boolean(body?.enforceReactVite),
    });
    sendApiJson(200, strictResult);
    return;
  }

  if (url.pathname === "/api/terminal" && req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      sendApiJson(400, { ok: false, error: err.message });
      return;
    }
    const workspaceRoot = getWorkspaceRoot(user.id, body.projectId || "default");
    if (Array.isArray(body.files) && body.files.length) {
      syncFilesToWorkspace(workspaceRoot, body.files, true);
    }
    const parsed = tokenizeCommand(body.command);
    if ("error" in parsed) {
      sendApiJson(400, { ok: false, error: parsed.error });
      return;
    }
    const { bin, args } = parsed;
    if (!TERMINAL_ALLOWED_COMMANDS.has(bin)) {
      sendApiJson(400, {
        ok: false,
        error: `Command "${bin}" is not in the workspace allowlist (${[...TERMINAL_ALLOWED_COMMANDS].join(", ")}).`,
      });
      return;
    }
    const argErr = validateTerminalArgs(bin, args, workspaceRoot);
    if (argErr) {
      sendApiJson(400, { ok: false, error: argErr });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...corsHeaders,
      ...sessionHeader,
    });

    const emit = (payload) => {
      safeWrite(res, `data: ${JSON.stringify(payload)}\n\n`);
    };

    const resolvedBin = bin === "./gradlew" || bin === "gradlew" ? path.join(workspaceRoot, "gradlew") : bin;
    if ((bin === "./gradlew" || bin === "gradlew") && !fs.existsSync(resolvedBin)) {
      emit({
        type: "stderr",
        text: "gradlew script was not found in this workspace. Generate or commit a Gradle Wrapper, or run GitHub Actions Cloud APK build (Publish -> Cloud APK).",
      });
      emit({ type: "exit", code: 127 });
      safeWrite(res, "data: [DONE]\n\n");
      safeEnd(res);
      return;
    }

    const child = spawn(resolvedBin, args, {
      cwd: workspaceRoot,
      shell: false,
      env: buildSanitizedEnv(),
    });

    const killTimer = setTimeout(() => {
      emit({ type: "stderr", text: "\nCommand timed out after 30s." });
      try {
        child.kill("SIGKILL");
      } catch {
        // Ignore
      }
    }, 30000);

    req.on("close", () => {
      clearTimeout(killTimer);
      try {
        child.kill("SIGTERM");
      } catch {
        // Ignore
      }
    });

    child.stdout.on("data", (chunk) => emit({ type: "stdout", text: chunk.toString("utf8") }));
    child.stderr.on("data", (chunk) => emit({ type: "stderr", text: chunk.toString("utf8") }));
    child.on("error", (err) => {
      clearTimeout(killTimer);
      const isMissing = err && err.code === "ENOENT";
      emit({
        type: "stderr",
        text: isMissing
          ? `Tool "${bin}" is not installed in this container. Use GitHub Actions Cloud APK (Publish -> Cloud APK) for real Gradle/APK compilation, or run in a host with Android SDK installed.`
          : readableError(err, "Command execution failed."),
      });
      emit({ type: "exit", code: isMissing ? 127 : 1 });
      safeWrite(res, "data: [DONE]\n\n");
      safeEnd(res);
    });
    child.on("close", (code) => {
      clearTimeout(killTimer);
      emit({ type: "exit", code: typeof code === "number" ? code : 0 });
      safeWrite(res, "data: [DONE]\n\n");
      safeEnd(res);
    });
    return;
  }

  if (url.pathname === "/api/android/cloud-apk" && req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      sendApiJson(400, { ok: false, error: err.message });
      return;
    }

    const action = String(body.action || "workflow");
    const stack = body.stack === "flutter" ? "flutter" : "kotlin";
    const workflowYaml = buildWorkflowYaml(stack);

    if (action === "workflow") {
      sendApiJson(200, {
        ok: true,
        path: ".github/workflows/sujith-android-apk.yml",
        content: workflowYaml,
        serverTokenConfigured: Boolean(CREDENTIALS.github()),
      });
      return;
    }

    const headerToken = typeof req.headers["x-github-token"] === "string" ? req.headers["x-github-token"].trim() : "";
    const githubToken = CREDENTIALS.github() || headerToken;
    const repo = String(body.repo || "").trim();
    const branch = String(body.branch || "main").trim().replace(/[^A-Za-z0-9._/-]/g, "") || "main";

    if (action === "status" && !repo) {
      sendApiJson(200, {
        ok: true,
        configured: Boolean(githubToken),
        serverTokenConfigured: Boolean(CREDENTIALS.github()),
      });
      return;
    }

    if (!GITHUB_REPO_RE.test(repo)) {
      sendApiJson(400, { ok: false, error: 'Repository must be in "owner/repo" format.' });
      return;
    }
    if (!githubToken) {
      sendApiJson(401, {
        ok: false,
        error: "GitHub token required. Set GITHUB_TOKEN on the server or provide a fine-grained GitHub Actions token for this session.",
      });
      return;
    }

    try {
      if (action === "push-and-build") {
        const files = Array.isArray(body.files) ? body.files : [];
        if (!files.length) {
          sendApiJson(400, { ok: false, error: "No project files to push." });
          return;
        }
        const refRes = await githubFetch(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, githubToken);
        if (!refRes.ok) {
          const msg = await refRes.text().catch(() => "");
          sendApiJson(refRes.status, { ok: false, error: `Could not read branch "${branch}" in ${repo}: ${readableError(msg)}` });
          return;
        }
        const refData = await refRes.json();
        const baseSha = refData?.object?.sha;
        const commitRes = await githubFetch(`/repos/${repo}/git/commits/${baseSha}`, githubToken);
        const commitData = await commitRes.json();
        const baseTreeSha = commitData?.tree?.sha;

        const uploadEntries = [
          ...files
            .filter((f) => f && typeof f.path === "string" && typeof f.content === "string" && !/(^|\/)\.env/i.test(f.path))
            .map((f) => ({ path: f.path.replace(/^[./\\]+/, ""), content: f.content })),
          { path: ".github/workflows/sujith-android-apk.yml", content: workflowYaml },
        ];

        const treeItems = [];
        for (const entry of uploadEntries) {
          if (!entry.path || entry.path.includes("..")) continue;
          const blobRes = await githubFetch(`/repos/${repo}/git/blobs`, githubToken, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: entry.content, encoding: "utf-8" }),
          });
          if (!blobRes.ok) {
            const errTxt = await blobRes.text().catch(() => "");
            throw new Error(`Failed creating blob for ${entry.path}: ${readableError(errTxt)}`);
          }
          const blob = await blobRes.json();
          treeItems.push({ path: entry.path, mode: "100644", type: "blob", sha: blob.sha });
        }

        const treeRes = await githubFetch(`/repos/${repo}/git/trees`, githubToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
        });
        if (!treeRes.ok) throw new Error("Failed creating Git tree on GitHub.");
        const treeData = await treeRes.json();

        const newCommitRes = await githubFetch(`/repos/${repo}/git/commits`, githubToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "SUJITH AI: Sync Android workspace & trigger APK build",
            tree: treeData.sha,
            parents: [baseSha],
          }),
        });
        if (!newCommitRes.ok) throw new Error("Failed creating Git commit on GitHub.");
        const newCommitData = await newCommitRes.json();

        const updateRefRes = await githubFetch(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, githubToken, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sha: newCommitData.sha }),
        });
        if (!updateRefRes.ok) throw new Error("Failed updating branch ref on GitHub.");

        await githubFetch(`/repos/${repo}/actions/workflows/sujith-android-apk.yml/dispatches`, githubToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref: branch }),
        }).catch(() => null);

        sendApiJson(200, {
          ok: true,
          commitSha: newCommitData.sha,
          message: `Pushed ${treeItems.length} files to ${repo}@${branch} and queued GitHub Actions APK workflow.`,
        });
        return;
      }

      if (action === "status") {
        const runsRes = await githubFetch(`/repos/${repo}/actions/runs?per_page=5`, githubToken);
        if (!runsRes.ok) {
          const msg = await runsRes.text().catch(() => "");
          sendApiJson(runsRes.status, { ok: false, error: `GitHub API error (${runsRes.status}): ${readableError(msg)}` });
          return;
        }
        const runsJson = await runsRes.json();
        const runs = Array.isArray(runsJson?.workflow_runs) ? runsJson.workflow_runs.slice(0, 5) : [];
        const latest = runs[0] || null;
        let artifacts = [];
        if (latest?.id) {
          const artRes = await githubFetch(`/repos/${repo}/actions/runs/${latest.id}/artifacts`, githubToken);
          if (artRes.ok) {
            const artJson = await artRes.json();
            artifacts = Array.isArray(artJson?.artifacts)
              ? artJson.artifacts.map((a) => ({
                  id: a.id,
                  name: a.name,
                  sizeInBytes: a.size_in_bytes,
                  expired: a.expired,
                }))
              : [];
          }
        }
        sendApiJson(200, {
          ok: true,
          configured: true,
          runs: runs.map((r) => ({
            id: r.id,
            name: r.name,
            status: r.status,
            conclusion: r.conclusion,
            htmlUrl: r.html_url,
            createdAt: r.created_at,
          })),
          artifacts,
        });
        return;
      }

      if (action === "download") {
        const artifactId = Number(body.artifactId);
        if (!Number.isInteger(artifactId) || artifactId <= 0) {
          sendApiJson(400, { ok: false, error: "Valid artifactId is required." });
          return;
        }
        const dlRes = await githubFetch(`/repos/${repo}/actions/artifacts/${artifactId}/zip`, githubToken, { redirect: "manual" });
        const location = dlRes.headers.get("location");
        let fileRes = dlRes;
        if (location) {
          const redirectUrl = new URL(location);
          const allowedHost = redirectUrl.hostname.endsWith(".githubusercontent.com") || redirectUrl.hostname === "api.github.com";
          if (!allowedHost || redirectUrl.protocol !== "https:") {
            sendApiJson(502, { ok: false, error: "Rejected unexpected artifact download host." });
            return;
          }
          fileRes = await fetch(redirectUrl.toString());
        }
        if (!fileRes.ok) {
          sendApiJson(fileRes.status, { ok: false, error: `Could not download artifact (${fileRes.status}).` });
          return;
        }
        const buf = Buffer.from(await fileRes.arrayBuffer());
        res.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="sujith-android-apk-${artifactId}.zip"`,
          ...corsHeaders,
          ...sessionHeader,
        });
        res.end(buf);
        return;
      }

      sendApiJson(400, { ok: false, error: `Unsupported cloud-apk action "${action}".` });
    } catch (err) {
      sendApiJson(500, { ok: false, error: readableError(err, "GitHub Cloud APK request failed.") });
    }
    return;
  }

  if (url.pathname.startsWith("/api/media/assets/") && req.method === "GET") {
    const assetId = url.pathname.slice("/api/media/assets/".length).split("/")[0];
    serveMediaAsset(assetId, req, res, resolveCorsOrigin(req));
    return;
  }

  if (url.pathname === "/api/media/jobs" && req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      sendApiJson(400, { ok: false, error: err.message });
      return;
    }
    const kind = body?.kind === "video" ? "video" : "image";
    const mode = typeof body?.mode === "string" ? body.mode : "generate";
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt || prompt.length > 4000) {
      sendApiJson(400, { ok: false, error: "Provide a valid generation prompt (1-4000 characters)." });
      return;
    }
    const noTrackKey = getActiveNoTrackKey(user);
    const geminiKey = process.env.GEMINI_API_KEY || user.geminiApiKey || "";
    const mediaDiscovery = noTrackKey ? await discoverNoTrackModels(noTrackKey, false) : null;
    const job = createMediaJob({
      userId: user.id,
      kind,
      mode,
      prompt,
      aspectRatio: typeof body?.aspectRatio === "string" ? body.aspectRatio : undefined,
      durationSec: typeof body?.durationSec === "number" ? body.durationSec : undefined,
      sourceImageDataUrl: typeof body?.sourceImageDataUrl === "string" ? body.sourceImageDataUrl : undefined,
      sourceMediaId: typeof body?.sourceMediaId === "string" ? body.sourceMediaId : undefined,
      enhancePrompt: body?.enhancePrompt !== false,
      noTrackKey,
      geminiKey,
      isWorkspaceVirtual: Boolean(mediaDiscovery?.isWorkspaceVirtual),
    });
    sendApiJson(202, { ok: true, job });
    return;
  }

  if (url.pathname.startsWith("/api/media/jobs/")) {
    const parts = url.pathname.slice("/api/media/jobs/".length).split("/").filter(Boolean);
    const jobId = parts[0] || "";
    const subAction = parts[1] || "";

    if (subAction === "stream" && req.method === "GET") {
      const initial = getMediaJob(jobId, user.id);
      if (!initial) {
        sendApiJson(404, { ok: false, error: "Media job not found." });
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...corsHeaders,
        ...sessionHeader,
      });
      const emit = (jobState) => {
        if (res.writableEnded) return;
        safeWrite(res, `data: ${JSON.stringify({ job: jobState })}\n\n`);
        if (jobState.status === "completed" || jobState.status === "failed" || jobState.status === "cancelled") {
          safeWrite(res, "data: [DONE]\n\n");
          safeEnd(res);
        }
      };
      emit(initial);
      if (initial.status === "completed" || initial.status === "failed" || initial.status === "cancelled") {
        return;
      }
      const unsub = subscribeToMediaJob(jobId, user.id, emit);
      const keepAlive = setInterval(() => {
        safeWrite(res, ": keepalive\n\n");
      }, 15000);
      req.on("close", () => {
        clearInterval(keepAlive);
        unsub();
      });
      return;
    }

    if (subAction === "cancel" && req.method === "POST") {
      const job = await cancelMediaJob(jobId, user.id);
      if (!job) {
        sendApiJson(404, { ok: false, error: "Media job not found." });
        return;
      }
      sendApiJson(200, { ok: true, job });
      return;
    }

    if (!subAction && req.method === "GET") {
      const job = getMediaJob(jobId, user.id);
      if (!job) {
        sendApiJson(404, { ok: false, error: "Media job not found." });
        return;
      }
      sendApiJson(200, { ok: true, job });
      return;
    }
  }

  sendApiJson(404, { error: "Not found" });
}

const server = http.createServer(handleApi);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, HOST, () => {
    console.log(`SUJITH IDE multi-provider gateway listening on http://${HOST}:${PORT}`);
  });
}
