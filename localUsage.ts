/** Real local usage counters. Resets at 00:00 UTC, never invents a provider cap. */
import { makeId } from "./types";

export type LocalUsageEvent = {
  id: string;
  at: number;
  engine: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
};

export type LocalUsage = {
  dayUtc: string;
  monthUtc: string;
  dailyRequests: number;
  monthlyRequests: number;
  dailyTokens: number;
  monthlyTokens: number;
  perModel: Record<string, { requests: number; inputTokens: number; outputTokens: number }>;
  history: LocalUsageEvent[];
};

const KEY = "sujith-ide.local-usage.v1";

export function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function utcMonth(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export function nextUtcReset(from = new Date()) {
  const next = new Date(from);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

export function formatResetCountdown(from = new Date()) {
  const ms = Math.max(0, nextUtcReset(from).getTime() - from.getTime());
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

export function estimateTokens(text: string) {
  // Conservative approximation used only for local counters. Provider-reported
  // token values from the gateway take precedence whenever they are available.
  return Math.max(1, Math.round(text.length / 4));
}

function emptyUsage(): LocalUsage {
  return {
    dayUtc: utcDay(),
    monthUtc: utcMonth(),
    dailyRequests: 0,
    monthlyRequests: 0,
    dailyTokens: 0,
    monthlyTokens: 0,
    perModel: {},
    history: [],
  };
}

export function readLocalUsage(): LocalUsage {
  let stored: LocalUsage;
  try {
    const raw = localStorage.getItem(KEY);
    stored = raw ? (JSON.parse(raw) as LocalUsage) : emptyUsage();
  } catch {
    stored = emptyUsage();
  }
  if (!stored || typeof stored.dailyRequests !== "number") stored = emptyUsage();

  // Daily / monthly UTC rollover.
  if (stored.dayUtc !== utcDay()) {
    stored.dayUtc = utcDay();
    stored.dailyRequests = 0;
    stored.dailyTokens = 0;
  }
  if (stored.monthUtc !== utcMonth()) {
    stored.monthUtc = utcMonth();
    stored.monthlyRequests = 0;
    stored.monthlyTokens = 0;
  }
  stored.perModel ||= {};
  stored.history ||= [];
  return stored;
}

function save(usage: LocalUsage) {
  try {
    localStorage.setItem(KEY, JSON.stringify(usage));
  } catch {
    // Private browsing: counters remain in memory for this session.
  }
}

export function recordLocalUsage({
  engine,
  modelId,
  inputTokens,
  outputTokens,
}: {
  engine: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const usage = readLocalUsage();
  const tokens = inputTokens + outputTokens;
  usage.dailyRequests += 1;
  usage.monthlyRequests += 1;
  usage.dailyTokens += tokens;
  usage.monthlyTokens += tokens;
  const entry = usage.perModel[modelId] || { requests: 0, inputTokens: 0, outputTokens: 0 };
  entry.requests += 1;
  entry.inputTokens += inputTokens;
  entry.outputTokens += outputTokens;
  usage.perModel[modelId] = entry;
  usage.history.unshift({
    id: makeId("usage"),
    at: Date.now(),
    engine,
    modelId,
    inputTokens,
    outputTokens,
  });
  usage.history = usage.history.slice(0, 60);
  save(usage);
  return usage;
}

export function clearLocalUsage() {
  save(emptyUsage());
}
