import { useEffect, useRef, useState } from "react";
import type { VoicePhase } from "../hooks/useVoiceAudioLevel";
import { cn } from "../utils/cn";

const ORB_PALETTES: Record<VoicePhase, { c1: string; c2: string; c3: string; glow: string }> = {
  off: {
    c1: "#64748b",
    c2: "#94a3b8",
    c3: "#e2e8f0",
    glow: "rgba(100, 116, 139, 0.28)",
  },
  paused: {
    c1: "#2563eb",
    c2: "#60a5fa",
    c3: "#dbeafe",
    glow: "rgba(37, 99, 235, 0.24)",
  },
  listening: {
    c1: "#0284c7",
    c2: "#38bdf8",
    c3: "#e0f2fe",
    glow: "rgba(14, 165, 233, 0.48)",
  },
  processing: {
    c1: "#6366f1",
    c2: "#a855f7",
    c3: "#f3e8ff",
    glow: "rgba(139, 92, 246, 0.45)",
  },
  speaking: {
    c1: "#1d4ed8",
    c2: "#06b6d4",
    c3: "#ffffff",
    glow: "rgba(37, 99, 235, 0.55)",
  },
};

export function LiveVoiceOrb({
  phase,
  level = 0,
  size = 34,
  orbTextureSrc = "/assets/aistudio/IMG_20261030_162513_5a36d74b.jpg",
  className,
}: {
  phase: VoicePhase;
  level?: number;
  size?: number;
  orbTextureSrc?: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(level);
  const phaseRef = useRef(phase);
  const [imgLoaded, setImgLoaded] = useState(false);

  levelRef.current = level;
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    let raf = 0;
    let time = 0;
    let prev = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - prev) * 0.001);
      prev = now;

      const curPhase = phaseRef.current;
      const curLevel = levelRef.current;
      const speed =
        curPhase === "speaking"
          ? 2.8 + curLevel * 3.2
          : curPhase === "listening"
            ? 1.9 + curLevel * 2.6
            : curPhase === "processing"
              ? 2.4
              : 0.7;
      time += dt * speed;

      const palette = ORB_PALETTES[curPhase] ?? ORB_PALETTES.paused;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.min(cx, cy);

      ctx.clearRect(0, 0, w, h);

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();

      // Base radial sphere
      const baseGrad = ctx.createRadialGradient(
        cx - r * 0.25,
        cy - r * 0.28,
        r * 0.08,
        cx,
        cy,
        r * 1.05
      );
      baseGrad.addColorStop(0, palette.c3);
      baseGrad.addColorStop(0.45, palette.c2);
      baseGrad.addColorStop(1, palette.c1);
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, w, h);

      // Swirling plasma lobes (ChatGPT Advanced Voice Mode liquid cloud feel)
      const amp = 0.22 + curLevel * 0.24;
      for (let i = 0; i < 3; i += 1) {
        const angle = time * (0.9 + i * 0.35) + i * 2.09;
        const ox = cx + Math.cos(angle) * r * amp;
        const oy = cy + Math.sin(angle * 1.15) * r * amp;
        const blobGrad = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * 0.85);
        blobGrad.addColorStop(0, i === 0 ? "rgba(255,255,255,0.72)" : i === 1 ? "rgba(125,211,252,0.62)" : "rgba(59,130,246,0.58)");
        blobGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalCompositeOperation = i === 0 ? "screen" : "lighter";
        ctx.fillStyle = blobGrad;
        ctx.beginPath();
        ctx.arc(ox, oy, r * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtle glossy highlight rim
      ctx.globalCompositeOperation = "source-over";
      const rim = ctx.createRadialGradient(cx, cy - r * 0.45, r * 0.05, cx, cy, r);
      rim.addColorStop(0, "rgba(255,255,255,0.42)");
      rim.addColorStop(0.45, "rgba(255,255,255,0.04)");
      rim.addColorStop(1, "rgba(15,23,42,0.18)");
      ctx.fillStyle = rim;
      ctx.fillRect(0, 0, w, h);

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  const palette = ORB_PALETTES[phase] ?? ORB_PALETTES.paused;
  const scale = phase === "paused" ? 1 : 1 + Math.min(0.14, level * 0.14);

  return (
    <span
      className={cn("relative inline-block shrink-0 rounded-full transition-transform duration-150", className)}
      style={{
        width: size,
        height: size,
        transform: `scale(${scale})`,
        boxShadow: `0 0 ${Math.round(size * 0.45)}px ${palette.glow}`,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="block h-full w-full rounded-full"
      />
      <img
        src={orbTextureSrc}
        alt=""
        onLoad={() => setImgLoaded(true)}
        onError={() => setImgLoaded(false)}
        className={cn(
          "pointer-events-none absolute inset-0 h-full w-full scale-[1.2] rounded-full object-cover transition-opacity duration-300",
          imgLoaded ? "opacity-85 mix-blend-soft-light" : "hidden opacity-0"
        )}
      />
    </span>
  );
}

export function LiveVoiceWaveform({
  phase,
  level = 0,
  className,
}: {
  phase: VoicePhase;
  level?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(level);
  const phaseRef = useRef(phase);

  levelRef.current = level;
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = 320;
    const height = 76;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    let raf = 0;
    let time = 0;
    let prev = performance.now();

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - prev) * 0.001);
      prev = now;

      const curPhase = phaseRef.current;
      const curLevel = levelRef.current;
      const speed =
        curPhase === "speaking"
          ? 4.4
          : curPhase === "listening"
            ? 3.2
            : curPhase === "processing"
              ? 3.6
              : 1.1;
      time += dt * speed;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const midY = canvas.height / 2;
      const baseAmp =
        curPhase === "paused"
          ? 2.5 * dpr
          : curPhase === "processing"
            ? (7 + 4 * Math.sin(time)) * dpr
            : (6 + curLevel * 24) * dpr;

      const layers =
        curPhase === "processing"
          ? [
              { color: "rgba(139, 92, 246, 0.85)", freq: 0.022, phaseShift: 0, ampScale: 1.0, lineW: 2.4 },
              { color: "rgba(99, 102, 241, 0.55)", freq: 0.031, phaseShift: 1.4, ampScale: 0.72, lineW: 1.8 },
              { color: "rgba(192, 132, 252, 0.4)", freq: 0.017, phaseShift: 2.6, ampScale: 0.52, lineW: 1.4 },
            ]
          : curPhase === "speaking"
            ? [
                { color: "rgba(37, 99, 235, 0.9)", freq: 0.025, phaseShift: 0, ampScale: 1.05, lineW: 2.5 },
                { color: "rgba(6, 182, 212, 0.65)", freq: 0.034, phaseShift: 1.2, ampScale: 0.78, lineW: 1.9 },
                { color: "rgba(96, 165, 250, 0.42)", freq: 0.018, phaseShift: 2.4, ampScale: 0.55, lineW: 1.4 },
              ]
            : [
                { color: "rgba(14, 165, 233, 0.88)", freq: 0.024, phaseShift: 0, ampScale: 1.0, lineW: 2.3 },
                { color: "rgba(37, 99, 235, 0.55)", freq: 0.033, phaseShift: 1.3, ampScale: 0.72, lineW: 1.7 },
                { color: "rgba(125, 211, 252, 0.4)", freq: 0.019, phaseShift: 2.5, ampScale: 0.48, lineW: 1.3 },
              ];

      for (const layer of layers) {
        ctx.beginPath();
        ctx.strokeStyle = layer.color;
        ctx.lineWidth = layer.lineW * dpr;
        ctx.lineCap = "round";

        for (let x = 0; x <= canvas.width; x += 3 * dpr) {
          const normX = x / canvas.width;
          // Smooth bell taper so waves fade cleanly into zero at left/right edges
          const envelope = Math.sin(normX * Math.PI);
          const wave =
            Math.sin(x * layer.freq + time + layer.phaseShift) * 0.65 +
            Math.sin(x * (layer.freq * 1.7) - time * 1.3 + layer.phaseShift) * 0.35;
          const y = midY + wave * baseAmp * layer.ampScale * Math.pow(envelope, 1.35);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("h-[58px] w-full max-w-[300px]", className)}
    />
  );
}
