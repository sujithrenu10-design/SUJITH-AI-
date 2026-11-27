import type { CompanyId } from "./companyLogos";
import type { ModelSpec, PlanTier, SubscriptionPlan } from "./modelCatalog";
import type { Attachment, BuildCheck, BuildRunErrorDetail, BuildStep, MediaGenerationState, SearchState } from "./types";

export type MediaCapabilities = {
  imageReady: boolean;
  videoReady: boolean;
  imageProviders: string[];
  videoProviders: string[];
};

export type ProviderAvailability = {
  serverReachable: boolean;
  notrackConfigured: boolean;
  notrackSource?: "settings" | "env" | "none";
  notrackMaskedKey?: string;
  notrackStatus: "connected" | "unconfigured" | "error";
  discoveredModels: string[];
  notrackLatencyMs?: number;
  notrackError?: string;
  notrackCheckedAt?: number;
  mediaCapabilities?: MediaCapabilities;
  providers: Record<CompanyId, { configured: boolean; statusText: string }>;
  checkedAt: number;
  error?: string;
};

export type UsageEvent = {
  id: string;
  timestamp: number;
  modelId: string;
  modelName: string;
  company: CompanyId;
  usedProvider?: string;
  actualModel?: string;
  ttftMs?: number;
  latencyMs?: number;
  inputTokens: number;
  outputTokens: number;
  status: "complete" | "error";
};

export type ProviderRateLimit = {
  remainingRequests: string | null;
  remainingTokens: string | null;
  resetRequests: string | null;
  resetTokens: string | null;
  updatedAt: number;
};

export type UsageSummary = {
  source: "backend" | "unavailable";
  unlimitedDaily?: boolean;
  dailyRequests: number;
  monthlyRequests: number;
  dailyTokens: number;
  monthlyTokens: number;
  remainingDailyRequests: number | null;
  remainingMonthlyTokens: number | null;
  resetNote: string;
  officialQuotas?: Partial<Record<CompanyId, string>>;
  perModel: Record<string, { requests: number; inputTokens: number; outputTokens: number }>;
  rateLimits: Partial<Record<CompanyId, ProviderRateLimit>>;
  history: UsageEvent[];
  note: string;
};

export type TransactionRecord = {
  id: string;
  date: number;
  plan: PlanTier;
  interval: "monthly" | "yearly";
  amountFormatted: string;
  status: "verified" | "pending" | "refunded" | "cancelled";
  reference: string;
};

export type SubscriptionState = {
  source: "backend" | "unavailable";
  plan: PlanTier;
  status: "active" | "cancelled" | "expired" | "unverified";
  interval: "monthly" | "yearly" | null;
  renewalDate: string | null;
  expirationDate: string | null;
  billingConfigured: boolean;
  planConfigs: Partial<Record<PlanTier, { monthlyPriceUsd: number | null; yearlyPriceUsd: number | null; allowanceNote: string }>>;
  transactions: TransactionRecord[];
  note: string;
};

export type ChatStreamMeta = {
  inputTokens?: number;
  outputTokens?: number;
  streamedTokens?: number;
  engine?: string;
  actualModel?: string;
  usedProvider?: string;
  ttftMs?: number;
  latencyMs?: number;
  rateLimit?: ProviderRateLimit;
};

export class BackendRequestError extends Error {
  detail?: BuildRunErrorDetail;

  constructor(message: string, detail?: BuildRunErrorDetail) {
    super(message);
    this.name = "BackendRequestError";
    this.detail = detail;
  }
}

const SESSION_TOKEN_KEY = "sujith-ide.gateway-session.v1";
const BACKEND_URL_KEY = "sujith-ide.backend-url.v1";

export function getApiBaseUrl(): string {
  try {
    const saved = localStorage.getItem(BACKEND_URL_KEY)?.trim();
    if (saved) return saved.replace(/\/+$/, "");
  } catch {
    // Ignore storage access errors
  }
  const envBase = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.trim();
  return envBase ? envBase.replace(/\/+$/, "") : "";
}

export function setApiBaseUrl(url: string) {
  try {
    const clean = url.trim().replace(/\/+$/, "");
    if (!clean) localStorage.removeItem(BACKEND_URL_KEY);
    else localStorage.setItem(BACKEND_URL_KEY, clean);
  } catch {
    // Ignore storage access errors
  }
}

export function apiUrl(path: string) {
  const base = getApiBaseUrl();
  if (!base) return path;
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

export function resolveMediaAssetUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return "";
  if (/^(https?:|data:|blob:)/i.test(pathOrUrl)) return pathOrUrl;
  return apiUrl(pathOrUrl);
}

function getSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function setSessionToken(token: string) {
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // Storage may be unavailable in private browsing.
  }
}

function apiHeaders(extra?: Record<string, string>) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(extra ?? {}) };
  const token = getSessionToken();
  if (token) headers["x-sujith-session"] = token;
  return headers;
}

const ALL_PROVIDER_KEYS: CompanyId[] = ["notrack", "openai", "gemini", "anthropic"];

export const OFFLINE_PROVIDER_STATUS: ProviderAvailability = {
  serverReachable: false,
  notrackConfigured: false,
  notrackSource: "none",
  notrackMaskedKey: "",
  notrackStatus: "unconfigured",
  discoveredModels: [],
  providers: Object.fromEntries(
    ALL_PROVIDER_KEYS.map((k) => [
      k,
      {
        configured: false,
        statusText: "API Key Required",
      },
    ])
  ) as Record<CompanyId, { configured: boolean; statusText: string }>,
  checkedAt: 0,
};

export const EMPTY_USAGE_SUMMARY: UsageSummary = {
  source: "unavailable",
  unlimitedDaily: true,
  dailyRequests: 0,
  monthlyRequests: 0,
  dailyTokens: 0,
  monthlyTokens: 0,
  remainingDailyRequests: null,
  remainingMonthlyTokens: null,
  resetNote: "Daily counters reset at 00:00 UTC · Unlimited daily requests active.",
  officialQuotas: {
    notrack: "NoTrack API pay-as-you-go token credits · Zero data logging · 100K context",
  },
  perModel: {},
  rateLimits: {},
  history: [],
  note: "Live NoTrack.ai inference telemetry & token usage.",
};

export const DEFAULT_SUBSCRIPTION_STATE: SubscriptionState = {
  source: "unavailable",
  plan: "FREE",
  status: "active",
  interval: null,
  renewalDate: null,
  expirationDate: null,
  billingConfigured: false,
  planConfigs: {},
  transactions: [],
  note: "Free tier active. Paid plans require verified Stripe checkout when STRIPE_SECRET_KEY is configured on the server.",
};

export async function fetchProviderAvailability(signal?: AbortSignal): Promise<ProviderAvailability> {
  try {
    const response = await fetch(apiUrl("/api/providers/status"), {
      method: "GET",
      headers: apiHeaders(),
      signal,
    });
    const sessionHeader = response.headers.get("x-sujith-session");
    if (sessionHeader) setSessionToken(sessionHeader);
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("application/json")) {
      return { ...OFFLINE_PROVIDER_STATUS, checkedAt: Date.now() };
    }
    const payload = (await response.json()) as {
      ok?: boolean;
      notrackConfigured?: boolean;
      notrackSource?: "settings" | "env" | "none";
      notrackMaskedKey?: string;
      notrackStatus?: "connected" | "unconfigured" | "error";
      discoveredModels?: string[];
      notrackLatencyMs?: number;
      notrackError?: string;
      notrackCheckedAt?: number;
      mediaCapabilities?: MediaCapabilities;
      providers?: Record<CompanyId, { configured?: boolean; statusText?: string }>;
      sessionToken?: string;
    };
    if (payload.sessionToken) setSessionToken(payload.sessionToken);
    if (!payload.ok || !payload.providers) {
      return { ...OFFLINE_PROVIDER_STATUS, checkedAt: Date.now() };
    }
    const providersMap: Record<CompanyId, { configured: boolean; statusText: string }> = {} as Record<
      CompanyId,
      { configured: boolean; statusText: string }
    >;
    for (const k of ALL_PROVIDER_KEYS) {
      const p = payload.providers[k];
      providersMap[k] = {
        configured: Boolean(p?.configured),
        statusText: p?.statusText ?? (p?.configured ? "NoTrack Live" : "API Key Required"),
      };
    }
    return {
      serverReachable: true,
      notrackConfigured: Boolean(payload.notrackConfigured),
      notrackSource: payload.notrackSource ?? "none",
      notrackMaskedKey: payload.notrackMaskedKey ?? "",
      notrackStatus: payload.notrackStatus ?? (payload.notrackConfigured ? "connected" : "unconfigured"),
      discoveredModels: Array.isArray(payload.discoveredModels) ? payload.discoveredModels : [],
      notrackLatencyMs: payload.notrackLatencyMs,
      notrackError: payload.notrackError,
      notrackCheckedAt: payload.notrackCheckedAt,
      mediaCapabilities: payload.mediaCapabilities,
      providers: providersMap,
      checkedAt: Date.now(),
    };
  } catch {
    return { ...OFFLINE_PROVIDER_STATUS, checkedAt: Date.now() };
  }
}

export async function saveNoTrackApiKey(apiKey: string): Promise<{
  ok: boolean;
  configured: boolean;
  verified?: boolean;
  source?: "settings" | "env" | "none";
  maskedKey?: string;
  models: string[];
  latencyMs?: number;
  statusCode?: number;
  error?: string;
}> {
  try {
    const response = await fetch(apiUrl("/api/providers/notrack/key"), {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ apiKey }),
    });
    const sessionHeader = response.headers.get("x-sujith-session");
    if (sessionHeader) setSessionToken(sessionHeader);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return { ok: false, configured: false, models: [], error: `Server returned HTTP ${response.status}` };
    }
    const data = (await response.json()) as {
      ok?: boolean;
      configured?: boolean;
      verified?: boolean;
      source?: "settings" | "env" | "none";
      maskedKey?: string;
      models?: string[];
      latencyMs?: number;
      statusCode?: number;
      error?: string;
    };
    return {
      ok: Boolean(response.ok && data.ok),
      configured: Boolean(data.configured),
      verified: data.verified,
      source: data.source,
      maskedKey: data.maskedKey,
      models: Array.isArray(data.models) ? data.models : [],
      latencyMs: data.latencyMs,
      statusCode: data.statusCode ?? response.status,
      error: data.error,
    };
  } catch {
    return { ok: false, configured: false, models: [], error: "Could not reach backend server." };
  }
}

export async function clearNoTrackApiKey(): Promise<{
  ok: boolean;
  configured: boolean;
  source?: "settings" | "env" | "none";
  maskedKey?: string;
  error?: string;
}> {
  try {
    const response = await fetch(apiUrl("/api/providers/notrack/key"), {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ clear: true }),
    });
    const sessionHeader = response.headers.get("x-sujith-session");
    if (sessionHeader) setSessionToken(sessionHeader);
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      configured?: boolean;
      source?: "settings" | "env" | "none";
      maskedKey?: string;
      error?: string;
    };
    return {
      ok: Boolean(response.ok && data.ok),
      configured: Boolean(data.configured),
      source: data.source,
      maskedKey: data.maskedKey,
      error: data.error,
    };
  } catch {
    return { ok: false, configured: false, error: "Could not reach backend server." };
  }
}

export async function checkNoTrackBackend(signal?: AbortSignal): Promise<{
  ok: boolean;
  configured: boolean;
  reachable: boolean;
  source?: "settings" | "env" | "none";
  maskedKey?: string;
  models: string[];
  latencyMs?: number;
  statusCode?: number;
  error?: string;
}> {
  try {
    const response = await fetch(apiUrl("/api/providers/notrack/check"), {
      method: "GET",
      headers: apiHeaders(),
      signal,
    });
    const sessionHeader = response.headers.get("x-sujith-session");
    if (sessionHeader) setSessionToken(sessionHeader);
    if (!response.ok) {
      return {
        ok: false,
        configured: false,
        reachable: false,
        models: [],
        statusCode: response.status,
        error: `Backend returned HTTP ${response.status}`,
      };
    }
    return (await response.json()) as {
      ok: boolean;
      configured: boolean;
      reachable: boolean;
      source?: "settings" | "env" | "none";
      maskedKey?: string;
      models: string[];
      latencyMs?: number;
      statusCode?: number;
      error?: string;
    };
  } catch {
    return { ok: false, configured: false, reachable: false, models: [], error: "Could not reach backend server." };
  }
}

export async function fetchUsageSummary(signal?: AbortSignal): Promise<UsageSummary> {
  try {
    const response = await fetch(apiUrl("/api/usage"), {
      method: "GET",
      headers: apiHeaders(),
      signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("application/json")) return EMPTY_USAGE_SUMMARY;
    const data = (await response.json()) as Partial<UsageSummary>;
    if (!data || typeof data.dailyRequests !== "number") return EMPTY_USAGE_SUMMARY;
    return { ...EMPTY_USAGE_SUMMARY, ...data, source: "backend" };
  } catch {
    return EMPTY_USAGE_SUMMARY;
  }
}

export async function fetchSubscriptionState(signal?: AbortSignal): Promise<SubscriptionState> {
  try {
    const response = await fetch(apiUrl("/api/subscriptions/status"), {
      method: "GET",
      headers: apiHeaders(),
      signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("application/json")) return DEFAULT_SUBSCRIPTION_STATE;
    const data = (await response.json()) as Partial<SubscriptionState>;
    if (!data || !data.plan) return DEFAULT_SUBSCRIPTION_STATE;
    return { ...DEFAULT_SUBSCRIPTION_STATE, ...data, source: "backend" };
  } catch {
    return DEFAULT_SUBSCRIPTION_STATE;
  }
}

export async function startSubscriptionCheckout(plan: SubscriptionPlan["id"], interval: "monthly" | "yearly"): Promise<{
  ok: boolean;
  instantActivated?: boolean;
  state?: SubscriptionState;
  checkoutUrl?: string;
  sessionId?: string;
  message: string;
}> {
  try {
    const response = await fetch(apiUrl("/api/subscriptions/checkout"), {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ plan, interval }),
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return { ok: false, message: "Billing endpoint did not respond with JSON." };
    }
    const payload = (await response.json()) as {
      ok?: boolean;
      instantActivated?: boolean;
      state?: SubscriptionState;
      checkoutUrl?: string;
      sessionId?: string;
      error?: string;
      message?: string;
    };
    if (!response.ok || !payload.ok) {
      return { ok: false, message: payload.error || payload.message || "Could not complete subscription request." };
    }
    return {
      ok: true,
      instantActivated: payload.instantActivated,
      state: payload.state,
      checkoutUrl: payload.checkoutUrl,
      sessionId: payload.sessionId,
      message: payload.message ?? "Subscription updated.",
    };
  } catch {
    return { ok: false, message: "Could not reach subscription endpoint." };
  }
}

export async function verifySubscriptionPayment(sessionId: string): Promise<{ ok: boolean; state?: SubscriptionState; message: string }> {
  try {
    const response = await fetch(apiUrl("/api/subscriptions/verify"), {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ sessionId }),
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return { ok: false, message: "Billing verification server is not reachable." };
    }
    const payload = (await response.json()) as { ok?: boolean; state?: SubscriptionState; error?: string; message?: string };
    if (!response.ok || !payload.ok) {
      return { ok: false, message: payload.error || payload.message || "Payment could not be verified." };
    }
    return { ok: true, state: payload.state, message: payload.message ?? "Subscription verified." };
  } catch {
    return { ok: false, message: "Could not reach the billing server to verify payment." };
  }
}

export async function manageSubscriptionAction(
  action: "cancel" | "restore" | "downgrade-free"
): Promise<{ ok: boolean; state?: SubscriptionState; message: string }> {
  try {
    const response = await fetch(apiUrl(`/api/subscriptions/${action}`), {
      method: "POST",
      headers: apiHeaders(),
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return { ok: false, message: "Subscription server is not reachable." };
    }
    const payload = (await response.json()) as { ok?: boolean; state?: SubscriptionState; error?: string; message?: string };
    if (!response.ok || !payload.ok) {
      return { ok: false, message: payload.error || payload.message || "Action could not be completed." };
    }
    return { ok: true, state: payload.state, message: payload.message ?? "Subscription updated." };
  } catch {
    return { ok: false, message: "Could not reach the subscription server." };
  }
}

export async function streamGatewayChat({
  model,
  messages,
  attachments,
  conversationId,
  temperature,
  maxTokens,
  deepSearch,
  signal,
  onDelta,
  onWarning,
  onSearch,
  onMeta,
}: {
  model: ModelSpec;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  attachments?: Attachment[];
  conversationId: string;
  temperature?: number;
  maxTokens?: number;
  deepSearch?: boolean;
  signal: AbortSignal;
  onDelta: (accumulatedText: string) => void;
  onWarning?: (warning: string) => void;
  onSearch?: (search: SearchState) => void;
  onMeta?: (meta: ChatStreamMeta) => void;
}): Promise<string> {
  const response = await fetch(apiUrl("/api/chat"), {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      conversationId,
      modelCatalogId: model.id,
      company: model.company,
      officialModelId: model.officialModelId || model.id,
      modelName: model.name,
      apiSurface: model.apiSurface,
      messages,
      ...(typeof deepSearch === "boolean" ? { deepSearch } : {}),
      ...(typeof temperature === "number" ? { temperature } : {}),
      ...(typeof maxTokens === "number" ? { maxTokens } : {}),
      attachments: (attachments ?? []).map((item) => ({
        name: item.name,
        type: item.type,
        text: item.text,
        dataUrl: item.dataUrl,
      })),
    }),
    signal,
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { error?: string; message?: string; errorDetail?: BuildRunErrorDetail };
      const msg = payload.error || payload.message || `Backend returned HTTP ${response.status}.`;
      throw new BackendRequestError(msg, payload.errorDetail ?? { status: response.status, code: "HTTP_ERROR", message: msg });
    }
    const msg = `Backend returned HTTP ${response.status}.`;
    throw new BackendRequestError(msg, { status: response.status, code: "HTTP_ERROR", message: msg });
  }

  if (!contentType.includes("text/event-stream") || !response.body) {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { text?: string; error?: string; errorDetail?: BuildRunErrorDetail };
      if (payload.error) throw new BackendRequestError(payload.error, payload.errorDetail);
      if (payload.text) {
        onDelta(payload.text);
        return payload.text;
      }
    }
    throw new BackendRequestError(`Unexpected response from backend for ${model.name}.`, {
      status: 502,
      code: "UNEXPECTED_RESPONSE",
      message: `Unexpected non-streaming response for ${model.name}.`,
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  const processBlock = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    let parsed: {
      delta?: string;
      warning?: string;
      search?: SearchState;
      error?: string;
      errorDetail?: BuildRunErrorDetail;
      meta?: ChatStreamMeta;
    };
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (parsed.error) {
      throw new BackendRequestError(parsed.error, parsed.errorDetail ?? { message: parsed.error });
    }
    if (parsed.search) onSearch?.(parsed.search);
    if (parsed.warning) onWarning?.(parsed.warning);
    if (parsed.delta) {
      accumulated += parsed.delta;
      onDelta(accumulated);
    }
    if (parsed.meta) onMeta?.(parsed.meta);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      for (const block of events) processBlock(block);
      if (done) break;
    }
    if (buffer.trim()) processBlock(buffer);
  } finally {
    reader.releaseLock();
  }

  if (!accumulated.trim()) {
    throw new BackendRequestError(`${model.name} returned an empty response.`, {
      status: 502,
      code: "EMPTY_RESPONSE",
      message: `${model.name} returned an empty response.`,
    });
  }
  return accumulated.trim();
}

export async function syncWorkspaceToServer(
  projectId: string,
  files: { path: string; content: string }[],
  folders: string[] = [],
  clean = true
): Promise<{ ok: boolean; workspaceRoot?: string; fileCount?: number; error?: string }> {
  try {
    const response = await fetch(apiUrl("/api/workspace/sync"), {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ projectId, files, folders, clean }),
    });
    const sessionHeader = response.headers.get("x-sujith-session");
    if (sessionHeader) setSessionToken(sessionHeader);
    const data = (await response.json()) as { ok?: boolean; workspaceRoot?: string; fileCount?: number; error?: string };
    return {
      ok: Boolean(response.ok && data.ok),
      workspaceRoot: data.workspaceRoot,
      fileCount: data.fileCount,
      error: data.error,
    };
  } catch {
    return { ok: false, error: "Could not sync workspace to server." };
  }
}

export type BuilderAgentFileEvent = {
  path: string;
  action: "created" | "edited";
  language: string;
  content: string;
};

export type BuilderAgentCompleteEvent = {
  summary: string;
  filesCount: number;
  touchedCount: number;
};

export async function streamBuilderAgent({
  model,
  conversationId,
  prompt,
  history,
  files,
  attachments,
  targetMode,
  enforceReactVite,
  temperature,
  maxTokens,
  customSystem,
  signal,
  onStep,
  onFileSaved,
  onFileDeleted,
  onChecks,
  onDelta,
  onWarning,
  onMeta,
  onComplete,
}: {
  model: ModelSpec;
  conversationId: string;
  prompt: string;
  history: { role: "user" | "assistant"; content: string }[];
  files: { path: string; content: string }[];
  attachments?: Attachment[];
  targetMode: "website" | "android";
  enforceReactVite: boolean;
  temperature?: number;
  maxTokens?: number;
  customSystem?: string;
  signal: AbortSignal;
  onStep?: (step: BuildStep) => void;
  onFileSaved?: (file: BuilderAgentFileEvent) => void;
  onFileDeleted?: (path: string) => void;
  onChecks?: (checks: BuildCheck[]) => void;
  onDelta?: (delta: string) => void;
  onWarning?: (warning: string) => void;
  onMeta?: (meta: ChatStreamMeta) => void;
  onComplete?: (complete: BuilderAgentCompleteEvent) => void;
}): Promise<BuilderAgentCompleteEvent> {
  const SSE_INACTIVITY_MS = 75_000;
  const idleController = new AbortController();
  let idleTimedOut = false;
  let idleTimer: number | undefined;

  const resetIdleTimer = () => {
    if (idleTimer !== undefined) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      idleTimedOut = true;
      idleController.abort();
    }, SSE_INACTIVITY_MS);
  };

  const clearIdleTimer = () => {
    if (idleTimer !== undefined) {
      window.clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  };

  const onParentAbort = () => idleController.abort();
  if (signal.aborted) {
    throw new DOMException("Build stopped.", "AbortError");
  }
  signal.addEventListener("abort", onParentAbort, { once: true });
  resetIdleTimer();

  try {
    let response: Response;
    try {
      response = await fetch(apiUrl("/api/builder/agent"), {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          conversationId,
          modelCatalogId: model.id,
          company: model.company,
          officialModelId: model.officialModelId || model.id,
          modelName: model.name,
          prompt,
          history,
          files,
          targetMode,
          enforceReactVite,
          ...(typeof temperature === "number" ? { temperature } : {}),
          ...(typeof maxTokens === "number" ? { maxTokens } : {}),
          ...(customSystem ? { customSystem } : {}),
          attachments: (attachments ?? []).map((item) => ({
            name: item.name,
            type: item.type,
            text: item.text,
            dataUrl: item.dataUrl,
          })),
        }),
        signal: idleController.signal,
      });
    } catch (err) {
      if (idleTimedOut && !signal.aborted) {
        const msg = "The builder agent timed out waiting for the model to respond.";
        throw new BackendRequestError(msg, {
          status: 504,
          code: "TIMEOUT",
          message: msg,
          hint: "Any files already saved remain in your workspace. Retry to continue.",
          recoverable: true,
        });
      }
      throw err;
    }

    resetIdleTimer();
    const sessionHeader = response.headers.get("x-sujith-session");
    if (sessionHeader) setSessionToken(sessionHeader);

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) {
      if (contentType.includes("application/json")) {
        const payload = (await response.json()) as { error?: string; message?: string; errorDetail?: BuildRunErrorDetail };
        const msg = payload.error || payload.message || `Builder agent returned HTTP ${response.status}.`;
        throw new BackendRequestError(
          msg,
          payload.errorDetail ?? { status: response.status, code: "HTTP_ERROR", message: msg, recoverable: true }
        );
      }
      const msg = `Builder agent returned HTTP ${response.status}.`;
      throw new BackendRequestError(msg, { status: response.status, code: "HTTP_ERROR", message: msg, recoverable: true });
    }

    if (!contentType.includes("text/event-stream") || !response.body) {
      throw new BackendRequestError(`Unexpected non-streaming response from builder agent for ${model.name}.`, {
        status: 502,
        code: "UNEXPECTED_RESPONSE",
        message: `Unexpected non-streaming response for ${model.name}.`,
        recoverable: true,
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completion: BuilderAgentCompleteEvent = { summary: "", filesCount: files.length, touchedCount: 0 };

    const processBlock = (block: string) => {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data || data === "[DONE]") return;
      let parsed: {
        step?: BuildStep;
        file_saved?: BuilderAgentFileEvent;
        file_deleted?: { path: string };
        checks?: BuildCheck[];
        delta?: string;
        warning?: string;
        meta?: ChatStreamMeta;
        complete?: BuilderAgentCompleteEvent;
        error?: string;
        errorDetail?: BuildRunErrorDetail;
      };
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
      if (parsed.error) {
        throw new BackendRequestError(parsed.error, parsed.errorDetail ?? { message: parsed.error, recoverable: true });
      }
      if (parsed.meta) onMeta?.(parsed.meta);
      if (parsed.warning) onWarning?.(parsed.warning);
      if (parsed.step) onStep?.(parsed.step);
      if (parsed.file_saved) onFileSaved?.(parsed.file_saved);
      if (parsed.file_deleted?.path) onFileDeleted?.(parsed.file_deleted.path);
      if (Array.isArray(parsed.checks)) onChecks?.(parsed.checks);
      if (typeof parsed.delta === "string" && parsed.delta) onDelta?.(parsed.delta);
      if (parsed.complete) {
        completion = parsed.complete;
        onComplete?.(parsed.complete);
      }
    };

    try {
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (idleTimedOut && !signal.aborted) {
            const msg = "Builder stream stalled without data for 75s.";
            throw new BackendRequestError(msg, {
              status: 504,
              code: "TIMEOUT",
              message: msg,
              hint: "Any files already saved remain intact in your workspace. Retry to continue.",
              recoverable: true,
            });
          }
          throw err;
        }
        resetIdleTimer();
        const { done, value } = chunk;
        buffer += decoder.decode(value, { stream: !done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";
        for (const block of events) processBlock(block);
        if (done) break;
      }
      if (buffer.trim()) processBlock(buffer);
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Ignore release error
      }
    }

    return completion;
  } finally {
    clearIdleTimer();
    signal.removeEventListener("abort", onParentAbort);
  }
}

export async function verifyWorkspaceOnServer(
  files: { path: string; content: string }[],
  signal?: AbortSignal,
  options?: { targetMode?: "website" | "android"; enforceReactVite?: boolean }
): Promise<{
  ok: boolean;
  checkedFiles: number;
  errorCount: number;
  diagnostics: { path: string; line: number; severity: "error" | "warning"; message: string }[];
}> {
  try {
    const response = await fetch(apiUrl("/api/workspace/check"), {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        files,
        ...(options?.targetMode ? { targetMode: options.targetMode } : {}),
        ...(typeof options?.enforceReactVite === "boolean" ? { enforceReactVite: options.enforceReactVite } : {}),
      }),
      signal,
    });
    if (!response.ok) return { ok: true, checkedFiles: 0, errorCount: 0, diagnostics: [] };
    const data = (await response.json()) as {
      ok?: boolean;
      checkedFiles?: number;
      errorCount?: number;
      diagnostics?: { path: string; line: number; severity: "error" | "warning"; message: string }[];
    };
    return {
      ok: data.ok !== false,
      checkedFiles: data.checkedFiles ?? files.length,
      errorCount: data.errorCount ?? 0,
      diagnostics: Array.isArray(data.diagnostics) ? data.diagnostics : [],
    };
  } catch {
    return { ok: true, checkedFiles: 0, errorCount: 0, diagnostics: [] };
  }
}

export async function streamTerminalCommand({
  projectId,
  command,
  files,
  signal,
  onOutput,
}: {
  projectId: string;
  command: string;
  files: { path: string; content: string }[];
  signal?: AbortSignal;
  onOutput: (chunk: { type: "stdout" | "stderr" | "exit"; text?: string; code?: number }) => void;
}): Promise<number> {
  const response = await fetch(apiUrl("/api/terminal"), {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ projectId, command, files }),
    signal,
  });
  const sessionHeader = response.headers.get("x-sujith-session");
  if (sessionHeader) setSessionToken(sessionHeader);

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error || `Terminal returned HTTP ${response.status}.`);
    }
    throw new Error(`Terminal returned HTTP ${response.status}.`);
  }
  if (!response.body) throw new Error("Terminal response stream unavailable.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let exitCode = 0;

  const processBlock = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    try {
      const parsed = JSON.parse(data) as { type?: "stdout" | "stderr" | "exit"; text?: string; code?: number };
      if (parsed.type === "exit") {
        exitCode = typeof parsed.code === "number" ? parsed.code : 0;
        onOutput({ type: "exit", code: exitCode });
      } else if (parsed.type === "stdout" || parsed.type === "stderr") {
        onOutput({ type: parsed.type, text: parsed.text || "" });
      }
    } catch {
      // Ignore malformed SSE lines
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      for (const block of events) processBlock(block);
      if (done) break;
    }
    if (buffer.trim()) processBlock(buffer);
  } finally {
    reader.releaseLock();
  }
  return exitCode;
}

export type CloudApkRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
};

export type CloudApkArtifact = {
  id: number;
  name: string;
  sizeInBytes: number;
  expired: boolean;
};

export async function cloudApkRequest(
  payload: {
    action: "workflow" | "status" | "push-and-build";
    stack?: "kotlin" | "flutter";
    repo?: string;
    branch?: string;
    files?: { path: string; content: string }[];
  },
  githubToken?: string
): Promise<{
  ok: boolean;
  path?: string;
  content?: string;
  configured?: boolean;
  serverTokenConfigured?: boolean;
  commitSha?: string;
  message?: string;
  runs?: CloudApkRun[];
  artifacts?: CloudApkArtifact[];
  error?: string;
}> {
  try {
    const extra: Record<string, string> = {};
    if (githubToken?.trim()) extra["x-github-token"] = githubToken.trim();
    const response = await fetch(apiUrl("/api/android/cloud-apk"), {
      method: "POST",
      headers: apiHeaders(extra),
      body: JSON.stringify(payload),
    });
    const sessionHeader = response.headers.get("x-sujith-session");
    if (sessionHeader) setSessionToken(sessionHeader);
    const data = await response.json();
    return { ...data, ok: Boolean(response.ok && data.ok) };
  } catch {
    return { ok: false, error: "Could not reach Cloud APK endpoint." };
  }
}

export async function downloadCloudApkArtifact(
  repo: string,
  artifactId: number,
  githubToken?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const extra: Record<string, string> = {};
    if (githubToken?.trim()) extra["x-github-token"] = githubToken.trim();
    const response = await fetch(apiUrl("/api/android/cloud-apk"), {
      method: "POST",
      headers: apiHeaders(extra),
      body: JSON.stringify({ action: "download", repo, artifactId }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error || `Download failed (${response.status}).` };
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sujith-android-apk-${artifactId}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not download Cloud APK artifact." };
  }
}

function normalizeMediaState(raw: MediaGenerationState): MediaGenerationState {
  return {
    ...raw,
    partialUrl: raw.partialUrl ? resolveMediaAssetUrl(raw.partialUrl) : undefined,
    media: raw.media
      ? {
          ...raw.media,
          url: resolveMediaAssetUrl(raw.media.url),
          previewUrl: raw.media.previewUrl ? resolveMediaAssetUrl(raw.media.previewUrl) : undefined,
        }
      : undefined,
  };
}

export async function startAndStreamMediaJob({
  kind,
  mode,
  prompt,
  aspectRatio,
  durationSec,
  sourceImageDataUrl,
  sourceMediaId,
  enhancePrompt = true,
  signal,
  onUpdate,
}: {
  kind: "image" | "video";
  mode: "generate" | "edit" | "image-to-video";
  prompt: string;
  aspectRatio?: string;
  durationSec?: number;
  sourceImageDataUrl?: string;
  sourceMediaId?: string;
  enhancePrompt?: boolean;
  signal: AbortSignal;
  onUpdate: (state: MediaGenerationState) => void;
}): Promise<MediaGenerationState> {
  const createRes = await fetch(apiUrl("/api/media/jobs"), {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      kind,
      mode,
      prompt,
      aspectRatio,
      durationSec,
      sourceImageDataUrl,
      sourceMediaId,
      enhancePrompt,
    }),
    signal,
  });

  const sessionHeader = createRes.headers.get("x-sujith-session");
  if (sessionHeader) setSessionToken(sessionHeader);

  const createPayload = (await createRes.json().catch(() => ({}))) as {
    ok?: boolean;
    job?: MediaGenerationState;
    error?: string;
  };
  if (!createRes.ok || !createPayload.ok || !createPayload.job) {
    throw new Error(createPayload.error || `Media generation request failed (HTTP ${createRes.status}).`);
  }

  let latest = normalizeMediaState(createPayload.job);
  onUpdate(latest);

  const cancelOnServer = () => {
    void fetch(apiUrl(`/api/media/jobs/${encodeURIComponent(latest.jobId)}/cancel`), {
      method: "POST",
      headers: apiHeaders(),
    }).catch(() => null);
  };
  const onAbort = () => cancelOnServer();
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    const streamRes = await fetch(apiUrl(`/api/media/jobs/${encodeURIComponent(latest.jobId)}/stream`), {
      method: "GET",
      headers: apiHeaders({ Accept: "text/event-stream" }),
      signal,
    });

    if (streamRes.ok && (streamRes.headers.get("content-type") || "").includes("text/event-stream") && streamRes.body) {
      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          buf += decoder.decode(value, { stream: !done });
          const blocks = buf.split(/\r?\n\r?\n/);
          buf = blocks.pop() ?? "";
          for (const block of blocks) {
            const data = block
              .split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (!data || data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data) as { job?: MediaGenerationState };
              if (parsed.job) {
                latest = normalizeMediaState(parsed.job);
                onUpdate(latest);
              }
            } catch {
              // Ignore malformed SSE lines
            }
          }
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
      if (latest.status === "completed" || latest.status === "failed" || latest.status === "cancelled") {
        return latest;
      }
    }

    // Fallback polling loop if SSE ended prematurely
    while (latest.status !== "completed" && latest.status !== "failed" && latest.status !== "cancelled") {
      signal.throwIfAborted();
      await new Promise((r) => setTimeout(r, 1200));
      const pollRes = await fetch(apiUrl(`/api/media/jobs/${encodeURIComponent(latest.jobId)}`), {
        method: "GET",
        headers: apiHeaders(),
        signal,
      });
      if (!pollRes.ok) continue;
      const pollData = (await pollRes.json().catch(() => ({}))) as { job?: MediaGenerationState };
      if (pollData.job) {
        latest = normalizeMediaState(pollData.job);
        onUpdate(latest);
      }
    }
    return latest;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
