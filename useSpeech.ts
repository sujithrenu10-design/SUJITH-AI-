import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RecognitionResult = {
  isFinal: boolean;
  0: { transcript: string; confidence: number };
};

type RecognitionEvent = {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResult };
};

type RecognitionErrorEvent = {
  error: string;
  message?: string;
};

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

type Options = {
  lang: string;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
};

export type SpeechErrorCode =
  | "not-allowed"
  | "service-not-allowed"
  | "audio-capture"
  | "network"
  | "no-speech"
  | "unsupported"
  | "other"
  | null;

const errorMessages: Record<string, string> = {
  "not-allowed": "Microphone permission was denied. Allow microphone access in browser settings.",
  "service-not-allowed": "Microphone access is blocked by the browser. Check site permissions.",
  "audio-capture": "No microphone was found. Connect a microphone and try again.",
  network: "Speech service is unavailable right now. Check your connection and retry.",
  "no-speech": "No speech detected. Tap the microphone and try again.",
};

export function useSpeechRecognition({ lang, onFinal, onError }: Options) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<SpeechErrorCode>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const shouldListenRef = useRef(false);
  const activeSessionRef = useRef(0);
  const restartTimerRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const latestInterimRef = useRef("");
  const lastEmittedRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const finalCallbackRef = useRef(onFinal);
  const errorCallbackRef = useRef(onError);
  const langRef = useRef(lang);

  finalCallbackRef.current = onFinal;
  errorCallbackRef.current = onError;
  langRef.current = lang;

  const clearTimers = useCallback(() => {
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const disposeRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (!rec) return;
    rec.onstart = null;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try {
      rec.abort();
    } catch {
      try {
        rec.stop();
      } catch {
        // Already stopped
      }
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(null);
  }, []);

  const emitFinal = useCallback((raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    const now = Date.now();
    // Guard against duplicate triggers within 900ms (Android Chrome quirk)
    if (lastEmittedRef.current.text === clean && now - lastEmittedRef.current.at < 900) {
      return;
    }
    lastEmittedRef.current = { text: clean, at: now };
    latestInterimRef.current = "";
    setInterim("");
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    finalCallbackRef.current(clean);
  }, []);

  const launchSession = useCallback(
    (sessionId: number): boolean => {
      if (!shouldListenRef.current || sessionId !== activeSessionRef.current) return false;
      const speechWindow = window as SpeechWindow;
      const RecognitionConstructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
      if (!RecognitionConstructor) {
        setSupported(false);
        const msg = "Speech recognition isn't supported in this browser. Use the text composer.";
        setError(msg);
        setErrorCode("unsupported");
        errorCallbackRef.current(msg);
        shouldListenRef.current = false;
        setListening(false);
        return false;
      }

      disposeRecognition();
      const recognition = new RecognitionConstructor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = langRef.current;

      recognition.onstart = () => {
        if (sessionId !== activeSessionRef.current) return;
        setListening(true);
        setInterim("");
        setError(null);
        setErrorCode(null);
      };

      recognition.onresult = (event) => {
        if (sessionId !== activeSessionRef.current) return;
        let finalText = "";
        let interimText = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result[0]?.transcript ?? "";
          if (result.isFinal) finalText += `${transcript} `;
          else interimText += transcript;
        }

        if (finalText.trim()) {
          emitFinal(finalText);
          return;
        }

        const cleanInterim = interimText.trim();
        latestInterimRef.current = cleanInterim;
        setInterim(cleanInterim);

        if (silenceTimerRef.current) {
          window.clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        // Android Chrome often omits isFinal on short utterances; commit after 1.35s of silence
        if (cleanInterim && shouldListenRef.current) {
          silenceTimerRef.current = window.setTimeout(() => {
            if (sessionId !== activeSessionRef.current || !shouldListenRef.current) return;
            const pending = latestInterimRef.current.trim();
            if (pending) emitFinal(pending);
          }, 1350);
        }
      };

      recognition.onerror = (event) => {
        if (sessionId !== activeSessionRef.current) return;
        if (event.error === "aborted") return;
        // In continuous hands-free mode, silence ("no-speech") is normal: let onend restart silently
        if (event.error === "no-speech" && shouldListenRef.current) {
          return;
        }
        const code: SpeechErrorCode =
          event.error === "not-allowed" ||
          event.error === "service-not-allowed" ||
          event.error === "audio-capture" ||
          event.error === "network" ||
          event.error === "no-speech"
            ? event.error
            : "other";
        const message = errorMessages[event.error] ?? "Microphone listening stopped. Tap the mic to retry.";
        shouldListenRef.current = false;
        clearTimers();
        latestInterimRef.current = "";
        setListening(false);
        setInterim("");
        setError(message);
        setErrorCode(code);
        errorCallbackRef.current(message);
      };

      recognition.onend = () => {
        if (sessionId !== activeSessionRef.current) return;
        if (silenceTimerRef.current) {
          window.clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        // Flush trailing interim speech if the browser ended the session before marking it final
        const trailing = latestInterimRef.current.trim();
        if (shouldListenRef.current && trailing) {
          emitFinal(trailing);
          return;
        }
        latestInterimRef.current = "";
        setInterim("");
        if (shouldListenRef.current) {
          restartTimerRef.current = window.setTimeout(() => {
            if (!shouldListenRef.current || sessionId !== activeSessionRef.current) return;
            launchSession(sessionId);
          }, 220);
        } else {
          setListening(false);
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
        setListening(true);
        return true;
      } catch {
        // Retry once after brief release delay if browser hasn't finished closing previous recognizer
        restartTimerRef.current = window.setTimeout(() => {
          if (!shouldListenRef.current || sessionId !== activeSessionRef.current) return;
          try {
            recognition.start();
            setListening(true);
          } catch {
            shouldListenRef.current = false;
            setListening(false);
            const msg = "Microphone listening could not start. Check your browser permissions.";
            setError(msg);
            setErrorCode("not-allowed");
            errorCallbackRef.current(msg);
          }
        }, 160);
        return true;
      }
    },
    [clearTimers, disposeRecognition, emitFinal]
  );

  const start = useCallback(() => {
    setError(null);
    setErrorCode(null);
    clearTimers();
    latestInterimRef.current = "";
    shouldListenRef.current = true;
    const sessionId = activeSessionRef.current + 1;
    activeSessionRef.current = sessionId;
    return launchSession(sessionId);
  }, [clearTimers, launchSession]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    activeSessionRef.current += 1;
    clearTimers();
    latestInterimRef.current = "";
    disposeRecognition();
    setListening(false);
    setInterim("");
  }, [clearTimers, disposeRecognition]);

  const toggle = useCallback(() => {
    if (shouldListenRef.current) stop();
    else start();
  }, [start, stop]);

  useEffect(() => {
    const speechWindow = window as SpeechWindow;
    if (!speechWindow.SpeechRecognition && !speechWindow.webkitSpeechRecognition) {
      setSupported(false);
    }
    if (recognitionRef.current) recognitionRef.current.lang = lang;
  }, [lang]);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      activeSessionRef.current += 1;
      clearTimers();
      disposeRecognition();
    };
  }, [clearTimers, disposeRecognition]);

  return useMemo(
    () => ({ supported, listening, interim, error, errorCode, clearError, start, stop, toggle }),
    [supported, listening, interim, error, errorCode, clearError, start, stop, toggle]
  );
}
