import { useEffect, useRef, useState } from "react";

export type VoicePhase = "off" | "listening" | "processing" | "speaking" | "paused";

const IDLE_BANDS = [0.16, 0.2, 0.24, 0.2, 0.16];

export function useVoiceAudioLevel({
  open,
  phase,
  interim,
  spokenText,
  speechPulse = 0,
}: {
  open: boolean;
  phase: VoicePhase;
  interim?: string;
  spokenText?: string;
  speechPulse?: number;
}) {
  const [level, setLevel] = useState(0);
  const [bands, setBands] = useState<number[]>(IDLE_BANDS);
  const pulseBoostRef = useRef(0);
  const lastInterimRef = useRef("");

  useEffect(() => {
    const next = interim ?? "";
    if (next !== lastInterimRef.current) {
      lastInterimRef.current = next;
      if (next.trim().length > 0) {
        pulseBoostRef.current = 0.88;
      }
    }
  }, [interim]);

  useEffect(() => {
    if (speechPulse > 0 || (spokenText && spokenText.trim().length > 0)) {
      pulseBoostRef.current = Math.min(1, Math.max(pulseBoostRef.current, 0.78));
    }
  }, [speechPulse, spokenText]);

  useEffect(() => {
    if (!open || phase === "off") {
      setLevel((prev) => (prev === 0 ? prev : 0));
      setBands((prev) => (prev === IDLE_BANDS ? prev : IDLE_BANDS));
      return;
    }

    // Do NOT open a concurrent getUserMedia() stream while SpeechRecognition is active:
    // on Android Chrome, concurrent mic capture steals hardware audio focus from SpeechRecognition.
    let cancelled = false;
    let rafId = 0;
    let smoothed = 0.12;
    let lastEmitAt = 0;
    let settledPaused = false;

    const tick = (now: number) => {
      if (cancelled) return;
      pulseBoostRef.current = Math.max(0, pulseBoostRef.current * 0.91);
      const t = now * 0.001;

      if (phase === "paused") {
        if (!settledPaused) {
          settledPaused = true;
          setLevel((prev) => (Math.abs(prev - 0.08) < 0.005 ? prev : 0.08));
          setBands((prev) => (prev === IDLE_BANDS ? prev : IDLE_BANDS));
        }
        rafId = requestAnimationFrame(tick);
        return;
      }

      settledPaused = false;
      // Throttle React state updates to ~20fps; LiveVoiceOrb/Waveform canvases already animate at 60fps internally
      const shouldEmit = now - lastEmitAt >= 48;

      if (phase === "listening") {
        const hasSpeech = pulseBoostRef.current > 0.06;
        const energy = hasSpeech
          ? 0.28 + pulseBoostRef.current * 0.65 + 0.1 * Math.sin(t * 9.2)
          : 0.16 + 0.06 * Math.sin(t * 2.8);
        smoothed = smoothed * 0.7 + Math.min(1, energy) * 0.3;
        if (shouldEmit) {
          lastEmitAt = now;
          setLevel(smoothed);
          setBands([
            Math.min(1, 0.18 + smoothed * 0.65 + 0.08 * Math.sin(t * 5.2)),
            Math.min(1, 0.24 + smoothed * 0.82 + 0.1 * Math.sin(t * 6.1 + 0.8)),
            Math.min(1, 0.28 + smoothed * 0.95 + 0.11 * Math.cos(t * 5.8)),
            Math.min(1, 0.24 + smoothed * 0.82 + 0.1 * Math.sin(t * 6.4 + 1.6)),
            Math.min(1, 0.18 + smoothed * 0.65 + 0.08 * Math.cos(t * 5.1 + 2.2)),
          ]);
        }
      } else if (phase === "speaking") {
        const synthSpeaking =
          typeof window !== "undefined" && "speechSynthesis" in window
            ? window.speechSynthesis.speaking || Boolean(spokenText)
            : true;
        const cadence = synthSpeaking
          ? 0.4 +
            0.22 * Math.abs(Math.sin(t * 6.5)) +
            0.14 * Math.sin(t * 11.3 + 0.7) +
            pulseBoostRef.current * 0.38
          : 0.22 + pulseBoostRef.current * 0.35;
        smoothed = smoothed * 0.68 + Math.min(1, cadence) * 0.32;
        if (shouldEmit) {
          lastEmitAt = now;
          setLevel(smoothed);
          setBands([
            Math.min(1, 0.26 + smoothed * 0.68 + 0.12 * Math.sin(t * 8.2)),
            Math.min(1, 0.35 + smoothed * 0.84 + 0.14 * Math.sin(t * 9.5 + 1.1)),
            Math.min(1, 0.42 + smoothed * 0.95 + 0.15 * Math.cos(t * 10.4 + 0.4)),
            Math.min(1, 0.35 + smoothed * 0.84 + 0.14 * Math.sin(t * 9.1 + 2.1)),
            Math.min(1, 0.26 + smoothed * 0.68 + 0.12 * Math.cos(t * 7.8 + 2.9)),
          ]);
        }
      } else if (phase === "processing") {
        const pulse = 0.26 + 0.12 * Math.sin(t * 3.8);
        smoothed = smoothed * 0.8 + pulse * 0.2;
        if (shouldEmit) {
          lastEmitAt = now;
          setLevel(smoothed);
          setBands([
            0.22 + 0.14 * (0.5 + 0.5 * Math.sin(t * 4.2)),
            0.28 + 0.16 * (0.5 + 0.5 * Math.sin(t * 4.2 + 0.7)),
            0.34 + 0.18 * (0.5 + 0.5 * Math.sin(t * 4.2 + 1.4)),
            0.28 + 0.16 * (0.5 + 0.5 * Math.sin(t * 4.2 + 2.1)),
            0.22 + 0.14 * (0.5 + 0.5 * Math.sin(t * 4.2 + 2.8)),
          ]);
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [open, phase, spokenText]);

  return { level, bands };
}
