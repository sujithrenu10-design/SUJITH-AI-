export type VoiceModelMode = "live" | "expressive" | "standard";

export type VoicePreset = {
  id: string;
  name: string;
  group: string;
  lang: string;
  pitch: number;
  rate: number;
  tone: "warm" | "bright" | "calm" | "crisp" | "deep";
  genderHint: "female" | "male" | "neutral";
  sampleText: string;
};

export type VoiceGroup = {
  group: string;
  voices: VoicePreset[];
};

export type VoiceDictionaryEntry = {
  id: string;
  term: string;
  spokenAs: string;
  createdAt: number;
};

export type DictationHistoryItem = {
  id: string;
  text: string;
  lang: string;
  mode: "live" | "dictation";
  createdAt: number;
};

export const VOICE_MODEL_OPTIONS: {
  id: VoiceModelMode;
  label: string;
  description: string;
}[] = [
  {
    id: "live",
    label: "Live",
    description: "Real-time conversational loop with instant barge-in",
  },
  {
    id: "expressive",
    label: "Expressive",
    description: "Natural dynamic pacing and warmer intonation",
  },
  {
    id: "standard",
    label: "Standard",
    description: "Clear, steady pacing for technical answers",
  },
];

export const VOICE_LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-IN", label: "English (India)" },
  { value: "ta-IN", label: "Tamil" },
  { value: "hi-IN", label: "Hindi" },
  { value: "de-DE", label: "German" },
  { value: "fr-FR", label: "French" },
  { value: "ja-JP", label: "Japanese" },
  { value: "ko-KR", label: "Korean" },
  { value: "es-MX", label: "Mexican Spanish" },
  { value: "es-AR", label: "Argentinian Spanish" },
  { value: "pt-BR", label: "Brazilian Portuguese" },
  { value: "te-IN", label: "Telugu" },
  { value: "ml-IN", label: "Malayalam" },
  { value: "kn-IN", label: "Kannada" },
];

export const VOICE_GROUPS: VoiceGroup[] = [
  {
    group: "Argentinian Spanish",
    voices: [
      {
        id: "faro",
        name: "Faro",
        group: "Argentinian Spanish",
        lang: "es-AR",
        pitch: 0.96,
        rate: 1.0,
        tone: "warm",
        genderHint: "male",
        sampleText: "Hola, soy Faro. Listo para conversar cuando quieras.",
      },
      {
        id: "tonada",
        name: "Tonada",
        group: "Argentinian Spanish",
        lang: "es-AR",
        pitch: 1.06,
        rate: 1.02,
        tone: "bright",
        genderHint: "female",
        sampleText: "Hola, soy Tonada. Contame en qué te puedo ayudar.",
      },
    ],
  },
  {
    group: "Brazilian Portuguese",
    voices: [
      {
        id: "viola",
        name: "Viola",
        group: "Brazilian Portuguese",
        lang: "pt-BR",
        pitch: 1.08,
        rate: 1.01,
        tone: "warm",
        genderHint: "female",
        sampleText: "Olá, eu sou a Viola. Como posso ajudar você hoje?",
      },
      {
        id: "rio",
        name: "Rio",
        group: "Brazilian Portuguese",
        lang: "pt-BR",
        pitch: 0.94,
        rate: 1.03,
        tone: "crisp",
        genderHint: "male",
        sampleText: "Oi, aqui é o Rio. Vamos começar nossa conversa.",
      },
    ],
  },
  {
    group: "British English",
    voices: [
      {
        id: "arbor",
        name: "Arbor",
        group: "British English",
        lang: "en-GB",
        pitch: 0.92,
        rate: 0.98,
        tone: "calm",
        genderHint: "male",
        sampleText: "Hello, I'm Arbor. Ready to assist you whenever you'd like.",
      },
      {
        id: "vale",
        name: "Vale",
        group: "British English",
        lang: "en-GB",
        pitch: 1.07,
        rate: 1.0,
        tone: "bright",
        genderHint: "female",
        sampleText: "Hi there, I'm Vale. What would you like to explore today?",
      },
    ],
  },
  {
    group: "French",
    voices: [
      {
        id: "rivage",
        name: "Rivage",
        group: "French",
        lang: "fr-FR",
        pitch: 0.95,
        rate: 0.99,
        tone: "calm",
        genderHint: "male",
        sampleText: "Bonjour, je suis Rivage. Comment puis-je vous aider ?",
      },
      {
        id: "aube",
        name: "Aube",
        group: "French",
        lang: "fr-FR",
        pitch: 1.08,
        rate: 1.02,
        tone: "bright",
        genderHint: "female",
        sampleText: "Salut, je suis Aube. Je t'écoute.",
      },
    ],
  },
  {
    group: "German",
    voices: [
      {
        id: "sonna",
        name: "Sonna",
        group: "German",
        lang: "de-DE",
        pitch: 1.06,
        rate: 1.01,
        tone: "warm",
        genderHint: "female",
        sampleText: "Hallo, ich bin Sonna. Bereit, wenn du es bist.",
      },
      {
        id: "miko",
        name: "Miko",
        group: "German",
        lang: "de-DE",
        pitch: 0.95,
        rate: 1.02,
        tone: "crisp",
        genderHint: "male",
        sampleText: "Hey, ich bin Miko. Woran arbeiten wir heute?",
      },
    ],
  },
  {
    group: "Hindi",
    voices: [
      {
        id: "neer",
        name: "Neer",
        group: "Hindi",
        lang: "hi-IN",
        pitch: 0.95,
        rate: 1.0,
        tone: "calm",
        genderHint: "male",
        sampleText: "नमस्ते, मैं नीर हूँ। बताइए आज क्या मदद करूँ?",
      },
      {
        id: "leher",
        name: "Leher",
        group: "Hindi",
        lang: "hi-IN",
        pitch: 1.08,
        rate: 1.02,
        tone: "bright",
        genderHint: "female",
        sampleText: "नमस्ते, मैं लहर हूँ। हम अभी शुरू कर सकते हैं।",
      },
    ],
  },
  {
    group: "Tamil",
    voices: [
      {
        id: "kural",
        name: "Kural",
        group: "Tamil",
        lang: "ta-IN",
        pitch: 0.96,
        rate: 1.0,
        tone: "calm",
        genderHint: "male",
        sampleText: "வணக்கம், நான் குரல். இன்று உங்களுக்கு எப்படி உதவலாம்?",
      },
      {
        id: "thendral",
        name: "Thendral",
        group: "Tamil",
        lang: "ta-IN",
        pitch: 1.07,
        rate: 1.01,
        tone: "warm",
        genderHint: "female",
        sampleText: "வணக்கம், நான் தென்றல். பேசத் தயாராக இருக்கிறேன்.",
      },
    ],
  },
  {
    group: "American English",
    voices: [
      {
        id: "spruce",
        name: "Spruce",
        group: "American English",
        lang: "en-US",
        pitch: 0.9,
        rate: 0.98,
        tone: "deep",
        genderHint: "male",
        sampleText: "Hey, I'm Spruce. Let's get right into it.",
      },
      {
        id: "juniper",
        name: "Juniper",
        group: "American English",
        lang: "en-US",
        pitch: 1.09,
        rate: 1.02,
        tone: "bright",
        genderHint: "female",
        sampleText: "Hi! I'm Juniper, upbeat and ready to help.",
      },
      {
        id: "maple",
        name: "Maple",
        group: "American English",
        lang: "en-US",
        pitch: 1.04,
        rate: 0.99,
        tone: "warm",
        genderHint: "female",
        sampleText: "Hello, I'm Maple. Tell me what's on your mind.",
      },
      {
        id: "cove",
        name: "Cove",
        group: "American English",
        lang: "en-US",
        pitch: 0.94,
        rate: 1.0,
        tone: "calm",
        genderHint: "male",
        sampleText: "Hey there, I'm Cove. Whenever you're ready, just speak.",
      },
      {
        id: "bubbie",
        name: "Bubbie",
        group: "American English",
        lang: "en-US",
        pitch: 1.12,
        rate: 1.04,
        tone: "bright",
        genderHint: "female",
        sampleText: "Hiya, I'm Bubbie! Let's build something awesome.",
      },
      {
        id: "sol",
        name: "Sol",
        group: "American English",
        lang: "en-US",
        pitch: 1.02,
        rate: 1.01,
        tone: "crisp",
        genderHint: "neutral",
        sampleText: "Hi, I'm Sol. Clear, focused, and ready to assist.",
      },
      {
        id: "breeze",
        name: "Breeze",
        group: "American English",
        lang: "en-US",
        pitch: 1.06,
        rate: 1.05,
        tone: "bright",
        genderHint: "female",
        sampleText: "Hey! I'm Breeze. Ask me anything.",
      },
    ],
  },
  {
    group: "Japanese",
    voices: [
      {
        id: "himari",
        name: "Himari",
        group: "Japanese",
        lang: "ja-JP",
        pitch: 1.1,
        rate: 1.02,
        tone: "bright",
        genderHint: "female",
        sampleText: "こんにちは、ひまりです。いつでも話しかけてくださいね。",
      },
      {
        id: "rindo",
        name: "Rindō",
        group: "Japanese",
        lang: "ja-JP",
        pitch: 0.94,
        rate: 1.0,
        tone: "calm",
        genderHint: "male",
        sampleText: "こんにちは、リンドウです。今日は何をお手伝いしましょうか。",
      },
    ],
  },
  {
    group: "Korean",
    voices: [
      {
        id: "hanul",
        name: "Hanul",
        group: "Korean",
        lang: "ko-KR",
        pitch: 0.96,
        rate: 1.01,
        tone: "calm",
        genderHint: "male",
        sampleText: "안녕하세요, 하늘입니다. 무엇을 도와드릴까요?",
      },
      {
        id: "haetsal",
        name: "Haetsal",
        group: "Korean",
        lang: "ko-KR",
        pitch: 1.08,
        rate: 1.02,
        tone: "warm",
        genderHint: "female",
        sampleText: "안녕하세요, 햇살이에요. 편하게 말씀해 주세요.",
      },
    ],
  },
  {
    group: "Mexican Spanish",
    voices: [
      {
        id: "arrullo",
        name: "Arrullo",
        group: "Mexican Spanish",
        lang: "es-MX",
        pitch: 1.07,
        rate: 1.0,
        tone: "warm",
        genderHint: "female",
        sampleText: "Hola, soy Arrullo. ¿En qué te ayudo hoy?",
      },
      {
        id: "tinta",
        name: "Tinta",
        group: "Mexican Spanish",
        lang: "es-MX",
        pitch: 0.95,
        rate: 1.02,
        tone: "crisp",
        genderHint: "male",
        sampleText: "Hola, soy Tinta. Listo para escucharte.",
      },
    ],
  },
];

export const ALL_VOICE_PRESETS: VoicePreset[] = VOICE_GROUPS.flatMap((g) => g.voices);

export function findVoicePreset(nameOrId?: string | null): VoicePreset {
  if (nameOrId) {
    const key = nameOrId.trim().toLowerCase();
    const match = ALL_VOICE_PRESETS.find(
      (v) => v.name.toLowerCase() === key || v.id.toLowerCase() === key
    );
    if (match) return match;
  }
  return ALL_VOICE_PRESETS.find((v) => v.name === "Sonna") ?? ALL_VOICE_PRESETS[0];
}

export function getVoiceLanguageLabel(value: string): string {
  return VOICE_LANGUAGE_OPTIONS.find((opt) => opt.value === value)?.label ?? "Auto-detect";
}

export function getVoiceModelLabel(value: VoiceModelMode): string {
  return VOICE_MODEL_OPTIONS.find((opt) => opt.id === value)?.label ?? "Live";
}

export function applyVoiceDictionary(text: string, entries: VoiceDictionaryEntry[]): string {
  if (!text || !entries?.length) return text;
  let result = text;
  for (const entry of entries) {
    const term = entry.term.trim();
    const spoken = entry.spokenAs.trim();
    if (!term || !spoken) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    result = result.replace(regex, spoken);
  }
  return result;
}

export function pickSystemVoice(
  voices: SpeechSynthesisVoice[],
  targetLang: string,
  genderHint: VoicePreset["genderHint"] = "neutral"
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const exact = voices.filter((v) => v.lang.toLowerCase() === targetLang.toLowerCase());
  const baseLang = targetLang.split("-")[0]?.toLowerCase() ?? "en";
  const prefix = voices.filter((v) => v.lang.toLowerCase().startsWith(baseLang));
  const pool = exact.length ? exact : prefix;
  if (!pool.length) return null;

  if (genderHint === "female") {
    const fem = pool.find((v) => /female|woman|zira|samantha|victoria|karen|sara|hana|helena|lekha|veena|kalpana/i.test(v.name));
    if (fem) return fem;
  } else if (genderHint === "male") {
    const mal = pool.find((v) => /male|man|david|mark|alex|daniel|george|rishi|prabhat|madhur|stefan/i.test(v.name));
    if (mal) return mal;
  }
  return pool[0];
}

export function previewVoicePreset(preset: VoicePreset, modelMode: VoiceModelMode = "live") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(preset.sampleText);
    utterance.lang = preset.lang;
    const voices = typeof synth.getVoices === "function" ? synth.getVoices() : [];
    const matched = pickSystemVoice(voices, preset.lang, preset.genderHint);
    if (matched) utterance.voice = matched;
    const rateBias = modelMode === "expressive" ? 1.03 : modelMode === "standard" ? 0.96 : 1.0;
    utterance.pitch = preset.pitch;
    utterance.rate = Number((preset.rate * rateBias).toFixed(2));
    synth.speak(utterance);
  } catch {
    // Ignore preview errors when TTS engine is busy or blocked
  }
}
