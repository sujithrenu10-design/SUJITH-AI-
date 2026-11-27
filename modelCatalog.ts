import type { CompanyId } from "./companyLogos";

export type PlanTier = "FREE" | "PRO" | "PREMIUM" | "ULTIMATE";

export type CatalogStatus =
  | "available"
  | "preview"
  | "deprecated"
  | "retired"
  | "restricted";

export type ApiSurface =
  | "openai_responses"
  | "openai_chat"
  | "gemini_generate"
  | "anthropic_messages"
  | "unavailable";

export type ModelSpec = {
  id: string;
  company: CompanyId;
  companyName: "NoTrack AI" | "OpenAI" | "Google" | "Anthropic";
  name: string;
  officialModelId: string | null;
  apiSurface: ApiSurface;
  catalogStatus: CatalogStatus;
  statusNote: string;
  description: string;
  capabilities: string[];
  inputs: string[];
  outputs: string[];
  contextWindow: string;
  maxOutput: string;
  allowanceNote: string;
  eligiblePlans: PlanTier[];
};

const NOTRACK_ALLOWANCE = "NoTrack API pay-as-you-go token credits · Zero data logging";
const ROUTED_ALLOWANCE = "Routed via your NoTrack.ai backend API key";

function makeOpenAIModel(
  slug: string,
  name: string,
  description: string,
  options?: {
    capabilities?: string[];
    inputs?: string[];
    contextWindow?: string;
    maxOutput?: string;
    eligiblePlans?: PlanTier[];
  }
): ModelSpec {
  return {
    id: `openai:${slug}`,
    company: "openai",
    companyName: "OpenAI",
    name,
    officialModelId: slug,
    apiSurface: "openai_responses",
    catalogStatus: "available",
    statusNote: `OpenAI ${name} via NoTrack.ai`,
    description,
    capabilities: options?.capabilities ?? ["Coding", "Reasoning", "Tool calling", "Streaming"],
    inputs: options?.inputs ?? ["Text", "Image"],
    outputs: ["Text"],
    contextWindow: options?.contextWindow ?? "400,000 tokens",
    maxOutput: options?.maxOutput ?? "64,000 tokens",
    allowanceNote: ROUTED_ALLOWANCE,
    eligiblePlans: options?.eligiblePlans ?? ["FREE", "PRO", "PREMIUM", "ULTIMATE"],
  };
}

function makeGeminiModel(
  slug: string,
  name: string,
  description: string,
  options?: {
    capabilities?: string[];
    inputs?: string[];
    outputs?: string[];
    contextWindow?: string;
    maxOutput?: string;
    eligiblePlans?: PlanTier[];
  }
): ModelSpec {
  return {
    id: `gemini:${slug}`,
    company: "gemini",
    companyName: "Google",
    name,
    officialModelId: slug,
    apiSurface: "gemini_generate",
    catalogStatus: "available",
    statusNote: `Google ${name} via NoTrack.ai`,
    description,
    capabilities: options?.capabilities ?? ["Thinking", "Coding", "Vision", "Long context", "Streaming"],
    inputs: options?.inputs ?? ["Text", "Image", "Audio", "Video", "PDF"],
    outputs: options?.outputs ?? ["Text"],
    contextWindow: options?.contextWindow ?? "1,048,576 tokens",
    maxOutput: options?.maxOutput ?? "65,536 tokens",
    allowanceNote: ROUTED_ALLOWANCE,
    eligiblePlans: options?.eligiblePlans ?? ["FREE", "PRO", "PREMIUM", "ULTIMATE"],
  };
}

function makeClaudeModel(
  slug: string,
  name: string,
  description: string,
  options?: {
    capabilities?: string[];
    inputs?: string[];
    contextWindow?: string;
    maxOutput?: string;
    eligiblePlans?: PlanTier[];
  }
): ModelSpec {
  return {
    id: `anthropic:${slug}`,
    company: "anthropic",
    companyName: "Anthropic",
    name,
    officialModelId: slug,
    apiSurface: "anthropic_messages",
    catalogStatus: "available",
    statusNote: `Anthropic ${name} via NoTrack.ai`,
    description,
    capabilities: options?.capabilities ?? ["Extended thinking", "Coding", "Vision", "Streaming"],
    inputs: options?.inputs ?? ["Text", "Image"],
    outputs: ["Text"],
    contextWindow: options?.contextWindow ?? "200,000 tokens",
    maxOutput: options?.maxOutput ?? "64,000 tokens",
    allowanceNote: ROUTED_ALLOWANCE,
    eligiblePlans: options?.eligiblePlans ?? ["FREE", "PRO", "PREMIUM", "ULTIMATE"],
  };
}

export const MODEL_CATALOG: ModelSpec[] = [
  // ==================== NOTRACK AI (VERIFIED LIVE BACKEND) ====================
  {
    id: "notrack:notrack-uncensored",
    company: "notrack",
    companyName: "NoTrack AI",
    name: "NoTrack Uncensored",
    officialModelId: "notrack-uncensored",
    apiSurface: "openai_chat",
    catalogStatus: "available",
    statusNote: "Verified live model on api.notrack.ai/v1",
    description: "Zero-logging live model served directly by api.notrack.ai/v1 with 100K context and streaming.",
    capabilities: ["Reasoning", "Coding", "Zero logging", "Streaming"],
    inputs: ["Text"],
    outputs: ["Text"],
    contextWindow: "100,000 tokens",
    maxOutput: "16,384 tokens",
    allowanceNote: NOTRACK_ALLOWANCE,
    eligiblePlans: ["FREE", "PRO", "PREMIUM", "ULTIMATE"],
  },

  // ==================== OPENAI (23 MODELS) ====================
  makeOpenAIModel("gpt-6-astra", "GPT-6 Astra", "Flagship GPT-6 Astra architecture tuned for frontier reasoning, multi-file engineering, and agentic execution.", {
    contextWindow: "1,000,000 tokens",
    maxOutput: "128,000 tokens",
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeOpenAIModel("gpt-6.1-sol", "GPT-6.1 Sol", "Next-generation GPT-6.1 Sol model balancing speed, creative synthesis, and full-stack software generation.", {
    contextWindow: "1,000,000 tokens",
    maxOutput: "128,000 tokens",
  }),
  makeOpenAIModel("gpt-6.1-terra", "GPT-6.1 Terra", "GPT-6.1 Terra long-horizon builder model engineered for complex systems and architecture.", {
    contextWindow: "1,000,000 tokens",
    maxOutput: "128,000 tokens",
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeOpenAIModel("gpt-6-luna", "GPT-6 Luna", "GPT-6 Luna precision model optimized for fast iteration, clean UI craft, and coding.", {
    contextWindow: "512,000 tokens",
    maxOutput: "64,000 tokens",
  }),
  makeOpenAIModel("gpt-6-sol", "GPT-6 Sol", "GPT-6 Sol general flagship model for high-accuracy chat, code, and structured analysis.", {
    contextWindow: "512,000 tokens",
    maxOutput: "64,000 tokens",
  }),
  makeOpenAIModel("gpt-5.6-sol", "GPT-5.6 Sol", "GPT-5.6 Sol balanced model for responsive full-stack engineering and conversational workflows."),
  makeOpenAIModel("gpt-5.6-cyber", "GPT-5.6 Cyber", "GPT-5.6 Cyber specialist model focused on security auditing, hardened architectures, and code review.", {
    capabilities: ["Security", "Coding", "Deep reasoning", "Streaming"],
  }),
  makeOpenAIModel("gpt-5.6-terra", "GPT-5.6 Terra", "GPT-5.6 Terra deep engineering model built for multi-module software builds."),
  makeOpenAIModel("gpt-5.6-luna", "GPT-5.6 Luna", "GPT-5.6 Luna lightweight agile model for rapid prototyping and chat."),
  makeOpenAIModel("gpt-rosalind", "GPT-Rosalind", "GPT-Rosalind analytical and scientific reasoning model designed for research and rigorous problem solving.", {
    capabilities: ["Deep reasoning", "Science", "Math", "Streaming"],
  }),
  makeOpenAIModel("gpt-5.5-pro", "GPT-5.5 Pro", "GPT-5.5 Pro high-compute tier for maximum reasoning depth and complex engineering.", {
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeOpenAIModel("gpt-5.5", "GPT-5.5", "GPT-5.5 flagship all-around model for coding, instruction following, and vision."),
  makeOpenAIModel("gpt-5.4-pro", "GPT-5.4 Pro", "GPT-5.4 Pro extended reasoning tier for demanding technical tasks.", {
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeOpenAIModel("gpt-5.4", "GPT-5.4", "GPT-5.4 standard flagship model for reliable coding and synthesis."),
  makeOpenAIModel("gpt-5.4-mini", "GPT-5.4 mini", "GPT-5.4 mini fast, cost-efficient model for responsive chat and UI generation.", {
    capabilities: ["Fast inference", "Coding", "Streaming"],
  }),
  makeOpenAIModel("gpt-5.4-nano", "GPT-5.4 nano", "GPT-5.4 nano ultra-low-latency model for instant replies and lightweight edits.", {
    capabilities: ["Fast inference", "Streaming"],
  }),
  makeOpenAIModel("gpt-5.3-codex", "GPT-5.3 Codex", "GPT-5.3 Codex dedicated software engineering and repository builder model.", {
    capabilities: ["Coding", "Tool calling", "Debugging", "Streaming"],
  }),
  makeOpenAIModel("gpt-5.2-pro", "GPT-5.2 Pro", "GPT-5.2 Pro high-precision reasoning model for architecture and verification.", {
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeOpenAIModel("gpt-5.2", "GPT-5.2", "GPT-5.2 capable general reasoning and coding model."),
  makeOpenAIModel("gpt-5.1", "GPT-5.1", "GPT-5.1 versatile model for software workflows and daily problem solving."),
  makeOpenAIModel("gpt-5", "GPT-5", "GPT-5 unified reasoning and coding flagship."),
  makeOpenAIModel("gpt-5-mini", "GPT-5 mini", "GPT-5 mini compact model balancing latency and coding accuracy.", {
    capabilities: ["Fast inference", "Coding", "Streaming"],
  }),
  makeOpenAIModel("gpt-5-nano", "GPT-5 nano", "GPT-5 nano high-speed compact tier for lightweight prompts.", {
    capabilities: ["Fast inference", "Streaming"],
  }),

  // ==================== GOOGLE GEMINI (25 MODELS) ====================
  makeGeminiModel("gemini-4-carbon", "Gemini 4 Carbon", "Next-gen Gemini 4 Carbon flagship thinking model for deep system architecture, coding, and multimodal synthesis.", {
    contextWindow: "2,097,152 tokens",
    maxOutput: "131,072 tokens",
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeGeminiModel("gemini-4-argon", "Gemini 4 Argon", "Gemini 4 Argon high-throughput flagship balancing rapid reasoning with 2M token context.", {
    contextWindow: "2,097,152 tokens",
    maxOutput: "131,072 tokens",
  }),
  makeGeminiModel("gemini-4-argon-cyber", "Gemini 4 Argon Cyber", "Gemini 4 Argon Cyber specialist model tuned for defensive security analysis and code hardening.", {
    capabilities: ["Security", "Thinking", "Coding", "Streaming"],
    contextWindow: "2,097,152 tokens",
  }),
  makeGeminiModel("gemini-3.8-flash", "Gemini 3.8 Flash", "Gemini 3.8 Flash ultra-fast adaptive thinking model for real-time coding and chat.", {
    capabilities: ["Fast inference", "Thinking", "Coding", "Streaming"],
  }),
  makeGeminiModel("gemini-3.8-flash-cyber", "Gemini 3.8 Flash Cyber", "Gemini 3.8 Flash Cyber rapid security & vulnerability triage model.", {
    capabilities: ["Security", "Fast inference", "Coding", "Streaming"],
  }),
  makeGeminiModel("gemini-3.8-live", "Gemini 3.8 Live", "Gemini 3.8 Live conversational multimodal model built for real-time low-latency interaction.", {
    inputs: ["Text", "Audio", "Video", "Image"],
    outputs: ["Text", "Audio"],
    capabilities: ["Live audio", "Low latency", "Multimodal", "Streaming"],
  }),
  makeGeminiModel("gemini-3.7-flash", "Gemini 3.7 Flash", "Gemini 3.7 Flash fast multimodal workhorse for full-stack apps and Android builds.", {
    capabilities: ["Fast inference", "Coding", "Vision", "Streaming"],
  }),
  makeGeminiModel("gemini-3.6-flash", "Gemini 3.6 Flash", "Gemini 3.6 Flash efficient multimodal model for interactive prototyping.", {
    capabilities: ["Fast inference", "Coding", "Vision", "Streaming"],
  }),
  makeGeminiModel("gemini-3.5-flash", "Gemini 3.5 Flash", "Gemini 3.5 Flash balanced speed and reasoning tier with 1M context window."),
  makeGeminiModel("gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite", "Gemini 3.5 Flash-Lite compact low-latency tier for high-frequency tasks.", {
    capabilities: ["Fast inference", "Streaming"],
  }),
  makeGeminiModel("gemini-3.5-flash-cyber", "Gemini 3.5 Flash Cyber", "Gemini 3.5 Flash Cyber security-focused fast inference tier.", {
    capabilities: ["Security", "Fast inference", "Streaming"],
  }),
  makeGeminiModel("gemini-3.1-pro", "Gemini 3.1 Pro", "Gemini 3.1 Pro deep reasoning and long-context engineering model.", {
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeGeminiModel("gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite", "Gemini 3.1 Flash-Lite streamlined fast-response tier.", {
    capabilities: ["Fast inference", "Streaming"],
  }),
  makeGeminiModel("gemini-3-pro", "Gemini 3 Pro", "Gemini 3 Pro flagship reasoning model for complex multi-file codebases.", {
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeGeminiModel("gemini-3-flash", "Gemini 3 Flash", "Gemini 3 Flash high-speed coding and multimodal generation model."),
  makeGeminiModel("gemini-3.8-flash-tts", "Gemini 3.8 Flash TTS (Text-to-Speech)", "Gemini 3.8 Flash speech synthesis model for expressive, low-latency voice output.", {
    inputs: ["Text"],
    outputs: ["Audio"],
    capabilities: ["Text-to-Speech", "Low latency", "Multilingual"],
    contextWindow: "32,768 tokens",
    maxOutput: "Audio stream",
  }),
  makeGeminiModel("gemini-3.8-flash-lite-tts", "Gemini 3.8 Flash-Lite TTS", "Gemini 3.8 Flash-Lite compact speech synthesis tier.", {
    inputs: ["Text"],
    outputs: ["Audio"],
    capabilities: ["Text-to-Speech", "Fast inference"],
    contextWindow: "32,768 tokens",
    maxOutput: "Audio stream",
  }),
  makeGeminiModel("gemini-3.5-transcribe", "Gemini 3.5 Transcribe (Speech-to-Text)", "Gemini 3.5 acoustic transcription model for multilingual speech-to-text.", {
    inputs: ["Audio", "Text"],
    outputs: ["Text"],
    capabilities: ["Speech-to-Text", "Multilingual", "Streaming"],
    contextWindow: "128,000 tokens",
    maxOutput: "16,384 tokens",
  }),
  makeGeminiModel("gemini-3.5-live-translate", "Gemini 3.5 Live Translate", "Gemini 3.5 simultaneous translation model across spoken and written languages.", {
    inputs: ["Audio", "Text"],
    outputs: ["Text", "Audio"],
    capabilities: ["Live translation", "Multilingual", "Streaming"],
  }),
  makeGeminiModel("gemini-3.1-flash-live", "Gemini 3.1 Flash Live", "Gemini 3.1 Flash bidirectional live audio/text conversational model.", {
    inputs: ["Text", "Audio", "Video"],
    outputs: ["Text", "Audio"],
    capabilities: ["Live audio", "Low latency", "Streaming"],
  }),
  makeGeminiModel("gemini-3.1-flash-tts", "Gemini 3.1 Flash TTS", "Gemini 3.1 Flash natural neural text-to-speech synthesis.", {
    inputs: ["Text"],
    outputs: ["Audio"],
    capabilities: ["Text-to-Speech", "Multilingual"],
    contextWindow: "32,768 tokens",
    maxOutput: "Audio stream",
  }),
  makeGeminiModel("gemini-nano-banana-2.1", "Gemini Nano Banana 2.1", "Gemini Nano Banana 2.1 high-fidelity image generation and editing model.", {
    inputs: ["Text", "Image"],
    outputs: ["Image", "Text"],
    capabilities: ["Image generation", "Image editing", "Text rendering"],
    contextWindow: "65,536 tokens",
    maxOutput: "Image / Text",
  }),
  makeGeminiModel("gemini-nano-banana-2", "Gemini Nano Banana 2", "Gemini Nano Banana 2 fast creative image synthesis and visual asset generation.", {
    inputs: ["Text", "Image"],
    outputs: ["Image", "Text"],
    capabilities: ["Image generation", "Image editing"],
    contextWindow: "65,536 tokens",
    maxOutput: "Image / Text",
  }),
  makeGeminiModel("gemini-nano-banana-2-lite", "Gemini Nano Banana 2 Lite", "Gemini Nano Banana 2 Lite rapid lightweight visual generation tier.", {
    inputs: ["Text", "Image"],
    outputs: ["Image", "Text"],
    capabilities: ["Image generation", "Fast inference"],
    contextWindow: "32,768 tokens",
    maxOutput: "Image / Text",
  }),
  makeGeminiModel("gemini-3-pro-image", "Gemini 3 Pro Image", "Gemini 3 Pro high-resolution studio image synthesis and design asset model.", {
    inputs: ["Text", "Image"],
    outputs: ["Image", "Text"],
    capabilities: ["Image generation", "Design", "Text rendering"],
    contextWindow: "65,536 tokens",
    maxOutput: "Image / Text",
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),

  // ==================== ANTHROPIC CLAUDE (17 MODELS) ====================
  makeClaudeModel("claude-fable-5.1", "Claude Fable 5.1", "Claude Fable 5.1 expressive architecture, narrative, and creative engineering model.", {
    capabilities: ["Creative synthesis", "Extended thinking", "Coding", "Streaming"],
    contextWindow: "500,000 tokens",
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeClaudeModel("claude-opus-5.5", "Claude Opus 5.5", "Claude Opus 5.5 pinnacle frontier model for complex multi-file coding and deep verification.", {
    contextWindow: "500,000 tokens",
    maxOutput: "128,000 tokens",
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeClaudeModel("claude-sonnet-5.5", "Claude Sonnet 5.5", "Claude Sonnet 5.5 flagship engineering model balancing top-tier code quality and rapid streaming.", {
    contextWindow: "500,000 tokens",
    maxOutput: "64,000 tokens",
  }),
  makeClaudeModel("claude-haiku-5.5", "Claude Haiku 5.5", "Claude Haiku 5.5 ultra-fast model for instant answers, refactoring, and UI polish.", {
    capabilities: ["Fast inference", "Coding", "Streaming"],
    contextWindow: "200,000 tokens",
  }),
  makeClaudeModel("claude-sonnet-5", "Claude Sonnet 5", "Claude Sonnet 5 next-generation balanced software engineering and analysis model.", {
    contextWindow: "400,000 tokens",
  }),
  makeClaudeModel("claude-opus-5", "Claude Opus 5", "Claude Opus 5 deep reasoning powerhouse for system design and autonomous debugging.", {
    contextWindow: "400,000 tokens",
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeClaudeModel("claude-mythos-5", "Claude Mythos 5", "Claude Mythos 5 specialized frontier synthesis and deep architectural reasoning model.", {
    contextWindow: "500,000 tokens",
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeClaudeModel("claude-opus-4.8", "Claude Opus 4.8", "Claude Opus 4.8 advanced coding and extended thinking model.", {
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeClaudeModel("claude-opus-4.7", "Claude Opus 4.7", "Claude Opus 4.7 long-horizon software architecture model.", {
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeClaudeModel("claude-opus-4.6", "Claude Opus 4.6", "Claude Opus 4.6 high-accuracy reasoning and debugging model.", {
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeClaudeModel("claude-sonnet-4.6", "Claude Sonnet 4.6", "Claude Sonnet 4.6 fast, high-craft full-stack coding model."),
  makeClaudeModel("claude-opus-4.5", "Claude Opus 4.5", "Claude Opus 4.5 frontier Claude 4.5 intelligence for complex builds.", {
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeClaudeModel("claude-sonnet-4.5", "Claude Sonnet 4.5", "Claude Sonnet 4.5 reliable production coding and UI engineering model."),
  makeClaudeModel("claude-haiku-4.5", "Claude Haiku 4.5", "Claude Haiku 4.5 swift compact model for everyday queries and quick edits.", {
    capabilities: ["Fast inference", "Coding", "Streaming"],
  }),
  makeClaudeModel("claude-opus-4.1", "Claude Opus 4.1", "Claude Opus 4.1 refined extended thinking and agentic coding model.", {
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeClaudeModel("claude-opus-4.0", "Claude Opus 4.0", "Claude Opus 4.0 foundational Claude 4 flagship for deep reasoning and code.", {
    eligiblePlans: ["PRO", "PREMIUM", "ULTIMATE"],
  }),
  makeClaudeModel("claude-sonnet-4.0", "Claude Sonnet 4.0", "Claude Sonnet 4.0 foundational Claude 4 balanced model for web and Android engineering."),
];

export const DEFAULT_CATALOG_MODEL_ID = "notrack:notrack-uncensored";

export function mergeDiscoveredCatalog(discoveredIds: string[] = []): ModelSpec[] {
  const existingOfficialIds = new Set(
    MODEL_CATALOG.map((m) => (m.officialModelId || m.id).toLowerCase())
  );
  const dynamicModels: ModelSpec[] = [];
  for (const rawId of discoveredIds) {
    const cleanId = String(rawId || "").trim();
    if (!cleanId || existingOfficialIds.has(cleanId.toLowerCase())) continue;
    existingOfficialIds.add(cleanId.toLowerCase());
    dynamicModels.push({
      id: `notrack:${cleanId}`,
      company: "notrack",
      companyName: "NoTrack AI",
      name: cleanId,
      officialModelId: cleanId,
      apiSurface: "openai_chat",
      catalogStatus: "available",
      statusNote: "Live discovered model on api.notrack.ai/v1",
      description: `Discovered directly from your NoTrack.ai account (${cleanId}).`,
      capabilities: ["Live discovered", "Zero logging", "Streaming"],
      inputs: ["Text"],
      outputs: ["Text"],
      contextWindow: "100,000 tokens",
      maxOutput: "16,384 tokens",
      allowanceNote: NOTRACK_ALLOWANCE,
      eligiblePlans: ["FREE", "PRO", "PREMIUM", "ULTIMATE"],
    });
  }
  return [...dynamicModels, ...MODEL_CATALOG];
}

export function findCatalogModel(id: string, discoveredIds: string[] = []): ModelSpec {
  const catalog = mergeDiscoveredCatalog(discoveredIds);
  return (
    catalog.find((model) => model.id === id) ??
    catalog.find((model) => model.id === DEFAULT_CATALOG_MODEL_ID) ??
    catalog[0]
  );
}

export type SubscriptionPlan = {
  id: PlanTier;
  name: string;
  tagline: string;
  monthlyPriceUsd: number | null;
  yearlyPriceUsd: number | null;
  pricingNote: string;
  allowanceSummary: string;
  features: string[];
};

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "FREE",
    name: "Free",
    tagline: "Unlimited daily requests with your NoTrack.ai key",
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
    pricingNote: "Free",
    allowanceSummary: "Unlimited daily requests · Verified NoTrack.ai live routing",
    features: [
      "Unlimited daily requests powered by your NoTrack.ai API key",
      "Real-time HTML5/CSS/JS & multi-file React + TypeScript preview",
      "Native Android (Kotlin Compose, Java XML, Flutter) source export",
      "Official server-side token & latency telemetry",
    ],
  },
  {
    id: "PRO",
    name: "Pro",
    tagline: "For daily coding and multi-file builds",
    monthlyPriceUsd: 15,
    yearlyPriceUsd: 144,
    pricingNote: "$15/mo",
    allowanceSummary: "Unlimited daily requests · Pro coding profiles & multi-file export",
    features: [
      "Everything in Free with priority NoTrack.ai routing",
      "Full OpenAI GPT-6/5, Google Gemini 4/3 & Anthropic Claude 5/4 profiles",
      "Unlimited daily requests & multi-file workspace export",
      "Instant in-app activation & Stripe support",
    ],
  },
  {
    id: "PREMIUM",
    name: "Premium",
    tagline: "Expanded reasoning & architecture workflows",
    monthlyPriceUsd: 39,
    yearlyPriceUsd: 374,
    pricingNote: "$39/mo",
    allowanceSummary: "Unlimited daily requests · Reasoning & long-context profiles",
    features: [
      "Everything in Pro",
      "GPT-6 Astra, Gemini 4 Carbon & Claude Opus 5.5 reasoning profiles",
      "Priority workspace compiler checks & repair loops",
      "Instant in-app activation & priority streaming",
    ],
  },
  {
    id: "ULTIMATE",
    name: "Ultimate",
    tagline: "Full catalog access and enterprise workflows",
    monthlyPriceUsd: 99,
    yearlyPriceUsd: 950,
    pricingNote: "$99/mo",
    allowanceSummary: "Unlimited daily requests · Full model catalog & priority routing",
    features: [
      "Everything in Premium",
      "All OpenAI, Gemini, Claude & NoTrack AI profiles + dynamic discovery",
      "Highest priority server & NoTrack.ai live routing",
      "Dedicated organization gateway & billing history",
    ],
  },
];
