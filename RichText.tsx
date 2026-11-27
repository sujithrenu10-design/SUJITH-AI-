import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Download, ExternalLink, Monitor, Play, Smartphone, Square, Terminal, Trash2, WrapText, X } from "lucide-react";

const CODE_TOKEN_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:import|export|from|default|const|let|var|function|return|async|await|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|new|class|extends|implements|interface|type|enum|true|false|null|undefined|def|elif|pass|yield|val|fun|object|package|public|private|static|void)\b|\b\d+(?:\.\d+)?\b)/g;

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to execCommand inside restricted iframes / WebViews
  }
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

export function safeExternalUrl(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function highlightCodeLine(line: string, lineKey: number) {
  const tokens: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  CODE_TOKEN_RE.lastIndex = 0;
  while ((match = CODE_TOKEN_RE.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(line.slice(lastIndex, match.index));
    }
    const tok = match[0];
    let cls = "text-[#c7e4ff]";
    if (tok.startsWith("//") || tok.startsWith("/*") || tok.startsWith("#")) {
      cls = "text-[#6c8aa6] italic";
    } else if (tok.startsWith('"') || tok.startsWith("'") || tok.startsWith("`")) {
      cls = "text-[#8de8b0]";
    } else if (/^\d/.test(tok)) {
      cls = "text-[#f6be7e]";
    } else {
      cls = "text-[#82b4ff] font-medium";
    }
    tokens.push(
      <span key={`${lineKey}-${match.index}`} className={cls}>
        {tok}
      </span>
    );
    lastIndex = match.index + tok.length;
  }
  if (lastIndex < line.length) {
    tokens.push(line.slice(lastIndex));
  }
  return tokens.length ? tokens : "\n";
}

function parseCodeHeader(rawHeader: string): { baseLang: string; fileName: string | null } {
  const clean = (rawHeader || "").trim();
  const colonIdx = clean.indexOf(":");
  if (colonIdx > 0) {
    const baseLang = clean.slice(0, colonIdx).trim().toLowerCase();
    const fileName = clean.slice(colonIdx + 1).trim();
    return { baseLang, fileName: fileName || null };
  }
  return { baseLang: clean.toLowerCase(), fileName: null };
}

function defaultFilenameForLang(baseLang: string, fileName: string | null): string {
  if (fileName) {
    const base = fileName.split("/").pop()?.trim();
    if (base) return base;
  }
  const extMap: Record<string, string> = {
    python: "py",
    py: "py",
    javascript: "js",
    js: "js",
    typescript: "ts",
    ts: "ts",
    tsx: "tsx",
    jsx: "jsx",
    html: "html",
    htm: "html",
    svg: "svg",
    css: "css",
    kotlin: "kt",
    kt: "kt",
    java: "java",
    sql: "sql",
    json: "json",
    bash: "sh",
    sh: "sh",
    xml: "xml",
  };
  const ext = extMap[baseLang] || "txt";
  return `snippet.${ext}`;
}

function buildPreviewSrcDoc(lang: string, code: string): string {
  const cleanLang = lang.split(":")[0].toLowerCase();
  if (cleanLang === "svg" || (/^\s*<svg[\s>]/i.test(code) && !/<html[\s>]/i.test(code))) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;}</style></head><body>${code}</body></html>`;
  }
  if (/<!doctype\s+html|<html[\s>]/i.test(code)) {
    return code;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${code}</body></html>`;
}

function isRunnableWebCode(lang: string, code: string): boolean {
  const baseLang = lang.split(":")[0].toLowerCase();
  if (baseLang === "html" || baseLang === "htm" || baseLang === "svg") return true;
  if (!baseLang && /<!doctype\s+html|<html[\s>]|<svg[\s>]/i.test(code)) return true;
  return false;
}

function isRunnableJsCode(lang: string): boolean {
  const baseLang = lang.split(":")[0].toLowerCase();
  return baseLang === "js" || baseLang === "javascript";
}

type JsConsoleEntry = {
  level: "log" | "info" | "warn" | "error" | "result";
  text: string;
};

function prepareRunnableJs(code: string): string {
  return code
    .replace(/^\s*export\s+default\s+/gm, "")
    .replace(/^\s*export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)/gm, "");
}

function buildJsSandboxSrcDoc(runId: string, code: string): string {
  const runnable = prepareRunnableJs(code);
  const safeCodeLiteral = JSON.stringify(runnable).replace(/</g, "\\u003c");
  const safeIdLiteral = JSON.stringify(runId);
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
(function() {
  var runId = ${safeIdLiteral};
  var post = function(payload) {
    try { window.parent.postMessage(Object.assign({ __sujithJsRunId: runId }, payload), "*"); } catch (e) {}
  };
  var fmt = function(val) {
    if (typeof val === "string") return val;
    if (typeof val === "undefined") return "undefined";
    if (typeof val === "function") return "[Function " + (val.name || "anonymous") + "]";
    try { return JSON.stringify(val, null, 2); } catch (e) { return String(val); }
  };
  var emitLog = function(level, args) {
    var msg = Array.prototype.slice.call(args).map(fmt).join(" ");
    post({ type: "log", level: level, text: msg });
  };
  console.log = function() { emitLog("log", arguments); };
  console.info = function() { emitLog("info", arguments); };
  console.warn = function() { emitLog("warn", arguments); };
  console.error = function() { emitLog("error", arguments); };
  window.onerror = function(msg, _src, line) {
    post({ type: "done", ok: false, error: (msg || "Runtime error") + (line ? " (line " + line + ")" : "") });
  };
  var t0 = performance.now();
  try {
    var fn = new Function(${safeCodeLiteral});
    var result = fn();
    if (result && typeof result.then === "function") {
      result.then(function(resolved) {
        if (typeof resolved !== "undefined") post({ type: "log", level: "result", text: fmt(resolved) });
        post({ type: "done", ok: true, durationMs: Math.max(1, Math.round(performance.now() - t0)) });
      }, function(err) {
        post({ type: "done", ok: false, error: err && err.message ? err.message : String(err), durationMs: Math.max(1, Math.round(performance.now() - t0)) });
      });
    } else {
      if (typeof result !== "undefined") post({ type: "log", level: "result", text: fmt(result) });
      post({ type: "done", ok: true, durationMs: Math.max(1, Math.round(performance.now() - t0)) });
    }
  } catch (err) {
    post({ type: "done", ok: false, error: err && err.message ? err.message : String(err), durationMs: Math.max(1, Math.round(performance.now() - t0)) });
  }
})();
<\/script></body></html>`;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewViewport, setPreviewViewport] = useState<"mobile" | "desktop">("mobile");
  const [jsRunning, setJsRunning] = useState(false);
  const [jsLogs, setJsLogs] = useState<JsConsoleEntry[] | null>(null);
  const [jsError, setJsError] = useState<string | null>(null);
  const [jsDurationMs, setJsDurationMs] = useState<number | null>(null);
  const [jsSandboxDoc, setJsSandboxDoc] = useState<{ runId: string; srcDoc: string } | null>(null);
  const jsTimerRef = useRef<number | null>(null);

  const { baseLang, fileName } = parseCodeHeader(lang);
  const canPreview = isRunnableWebCode(lang, code);
  const canRunJs = !canPreview && isRunnableJsCode(lang);

  const stopJsExecution = () => {
    if (jsTimerRef.current !== null) {
      window.clearTimeout(jsTimerRef.current);
      jsTimerRef.current = null;
    }
    setJsRunning(false);
    setJsSandboxDoc(null);
  };

  useEffect(() => {
    return () => {
      if (jsTimerRef.current !== null) window.clearTimeout(jsTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!jsSandboxDoc) return;
    const activeRunId = jsSandboxDoc.runId;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        __sujithJsRunId?: string;
        type?: "log" | "done";
        level?: JsConsoleEntry["level"];
        text?: string;
        ok?: boolean;
        error?: string;
        durationMs?: number;
      } | null;
      if (!data || data.__sujithJsRunId !== activeRunId) return;
      if (data.type === "log") {
        setJsLogs((prev) => [...(prev ?? []), { level: data.level || "log", text: String(data.text ?? "") }]);
      } else if (data.type === "done") {
        if (jsTimerRef.current !== null) {
          window.clearTimeout(jsTimerRef.current);
          jsTimerRef.current = null;
        }
        setJsRunning(false);
        setJsSandboxDoc(null);
        if (typeof data.durationMs === "number") setJsDurationMs(data.durationMs);
        if (!data.ok && data.error) {
          setJsError(data.error);
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [jsSandboxDoc]);

  const handleRunJs = () => {
    stopJsExecution();
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setJsLogs([]);
    setJsError(null);
    setJsDurationMs(null);
    setJsRunning(true);
    setJsSandboxDoc({ runId, srcDoc: buildJsSandboxSrcDoc(runId, code) });
    jsTimerRef.current = window.setTimeout(() => {
      setJsRunning(false);
      setJsSandboxDoc(null);
      setJsError("Execution timed out after 4s.");
    }, 4000);
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleDownloadCode = () => {
    const downloadName = defaultFilenameForLang(baseLang, fileName);
    const mime = baseLang === "html" || baseLang === "htm" ? "text/html;charset=utf-8" : baseLang === "svg" ? "image/svg+xml;charset=utf-8" : "text/plain;charset=utf-8";
    const url = URL.createObjectURL(new Blob([code], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleDownloadHtml = () => {
    const html = buildPreviewSrcDoc(lang, code);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = baseLang === "svg" ? "preview.svg" : fileName?.split("/").pop() || "index.html";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const lines = code.split("\n");
  return (
    <>
      <div className="my-2.5 max-w-full overflow-hidden rounded-xl border border-[#1e3a5f]/60 bg-[#081321] shadow-inner">
        <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-[#1e3a5f]/50 bg-[#0d1c30] px-3 py-1.5 text-[11px] text-[#8db2d6]">
          <span className="min-w-0 truncate font-mono">
            <span className="uppercase tracking-wider">{baseLang || "code"}</span>
            {fileName ? <span className="text-[#a8c7e8]"> · {fileName}</span> : null}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {canPreview && (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md bg-[#1a73e8]/25 px-2 py-0.5 text-[11px] font-medium text-[#93c5fd] transition hover:bg-[#1a73e8]/40 hover:text-white"
                aria-label="Run HTML preview"
              >
                <Play size={10} fill="currentColor" />
                <span>Run</span>
              </button>
            )}
            {canRunJs && (
              <button
                type="button"
                onClick={() => (jsRunning ? stopJsExecution() : handleRunJs())}
                className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                  jsRunning
                    ? "bg-red-500/25 text-red-200 hover:bg-red-500/40"
                    : "bg-[#1a73e8]/25 text-[#93c5fd] hover:bg-[#1a73e8]/40 hover:text-white"
                }`}
                aria-label={jsRunning ? "Stop JavaScript execution" : "Run JavaScript in sandbox"}
              >
                {jsRunning ? <Square size={9} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
                <span>{jsRunning ? "Stop" : "Run"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleDownloadCode}
              className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-[#b4d2f0] transition hover:bg-[#19304d] hover:text-white"
              aria-label={`Download ${defaultFilenameForLang(baseLang, fileName)}`}
              title={`Download ${defaultFilenameForLang(baseLang, fileName)}`}
            >
              <Download size={11} />
              <span>Save</span>
            </button>
            <button
              type="button"
              onClick={() => setWrapped((prev) => !prev)}
              className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-[#b4d2f0] transition hover:bg-[#19304d] hover:text-white"
              aria-pressed={wrapped}
              aria-label={wrapped ? "Disable line wrapping" : "Wrap long lines"}
              title={wrapped ? "Switch to horizontal scroll" : "Wrap long lines"}
            >
              <WrapText size={11} />
              <span>{wrapped ? "Wrap" : "Scroll"}</span>
            </button>
            <button
              type="button"
              onClick={() => { void handleCopy(); }}
              className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-[#b4d2f0] transition hover:bg-[#19304d] hover:text-white"
              aria-label="Copy code block"
            >
              {copied ? <Check size={11} className="text-[#81c995]" /> : <Copy size={11} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>
        <pre
          className={
            wrapped
              ? "thin-scrollbar select-text whitespace-pre-wrap [overflow-wrap:anywhere] p-3 font-mono text-[12.5px] leading-[1.6] text-[#c7e4ff]"
              : "thin-scrollbar touch-pan-x touch-pan-y select-text overflow-x-auto whitespace-pre p-3 font-mono text-[12.5px] leading-[1.6] text-[#c7e4ff]"
          }
        >
          <code>
            {lines.map((line, i) => (
              <span key={i} className="block">
                {line.length ? highlightCodeLine(line, i) : " "}
              </span>
            ))}
          </code>
        </pre>

        {(jsLogs !== null || jsError !== null) && (
          <div className="border-t border-[#1e3a5f]/60 bg-[#050c17] px-3 py-2 font-mono text-[12px]">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[10.5px] text-[#7ea1c4]">
              <span className="inline-flex items-center gap-1.5">
                <Terminal size={11} />
                <span>Console Output</span>
                {typeof jsDurationMs === "number" && (
                  <span className="tabular-nums text-[#6c8aa6]">· {jsDurationMs} ms</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  stopJsExecution();
                  setJsLogs(null);
                  setJsError(null);
                  setJsDurationMs(null);
                }}
                aria-label="Clear console output"
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[#8db2d6] transition hover:bg-[#132640] hover:text-white"
              >
                <Trash2 size={10.5} />
                <span>Clear</span>
              </button>
            </div>

            {jsLogs && jsLogs.length > 0 && (
              <div className="max-h-[160px] space-y-1 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere]">
                {jsLogs.map((entry, idx) => (
                  <div
                    key={idx}
                    className={
                      entry.level === "error"
                        ? "text-[#fca5a5]"
                        : entry.level === "warn"
                          ? "text-[#fcd34d]"
                          : entry.level === "result"
                            ? "text-[#8de8b0]"
                            : "text-[#dbeafe]"
                    }
                  >
                    {entry.level === "result" ? `=> ${entry.text}` : entry.text}
                  </div>
                ))}
              </div>
            )}

            {jsLogs && jsLogs.length === 0 && !jsError && !jsRunning && (
              <p className="text-[11px] text-[#6c8aa6]">Completed with no console output.</p>
            )}
            {jsRunning && (
              <p className="text-[11px] text-[#93c5fd]">Running in sandbox...</p>
            )}
            {jsError && (
              <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-[#fca5a5]">{jsError}</p>
            )}
          </div>
        )}
      </div>

      {jsSandboxDoc && (
        <iframe
          key={jsSandboxDoc.runId}
          title="Sandboxed JavaScript execution"
          sandbox="allow-scripts"
          srcDoc={jsSandboxDoc.srcDoc}
          className="hidden"
          aria-hidden="true"
        />
      )}

      {previewOpen && canPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-2.5 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="HTML Live Preview"
        >
          <div
            className={`flex h-[84dvh] w-full flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl transition-[max-width] duration-200 ${
              previewViewport === "desktop" ? "max-w-[780px]" : "max-w-[410px]"
            }`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--surface-soft)] px-3.5 py-2.5">
              <span className="text-[12.5px] font-semibold text-[var(--ink)]">Live Preview</span>
              <div className="flex items-center gap-1.5">
                <div className="inline-flex rounded-lg border border-[var(--line)] bg-[var(--surface)] p-0.5" role="group" aria-label="Preview viewport width">
                  <button
                    type="button"
                    onClick={() => setPreviewViewport("mobile")}
                    aria-pressed={previewViewport === "mobile"}
                    title="Mobile viewport"
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                      previewViewport === "mobile"
                        ? "bg-[var(--surface-muted)] text-[var(--ink)]"
                        : "text-[var(--muted)] hover:text-[var(--ink-soft)]"
                    }`}
                  >
                    <Smartphone size={11.5} />
                    <span>Mobile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewport("desktop")}
                    aria-pressed={previewViewport === "desktop"}
                    title="Desktop viewport"
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                      previewViewport === "desktop"
                        ? "bg-[var(--surface-muted)] text-[var(--ink)]"
                        : "text-[var(--muted)] hover:text-[var(--ink-soft)]"
                    }`}
                  >
                    <Monitor size={11.5} />
                    <span>Desktop</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadHtml}
                  className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-soft)] hover:bg-[var(--surface-muted)]"
                >
                  <Download size={12} />
                  <span>Save</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  aria-label="Close live preview"
                  className="grid h-7 w-7 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            <iframe
              title="Chat code live preview"
              sandbox="allow-scripts allow-forms"
              srcDoc={buildPreviewSrcDoc(lang, code)}
              className="min-h-0 w-full flex-1 border-0 bg-white"
            />
          </div>
        </div>
      )}
    </>
  );
}

const INLINE_TOKEN_RE = /(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|`[^`\n]+`|\*\*[^*\n]+\*\*|\*(?!\s)[^*\n]+?(?<!\s)\*|https?:\/\/[^\s<>"')\]]+)/g;

function renderFormattedSpan(text: string, depth = 0): ReactNode {
  if (!text) return null;
  if (depth > 2) return text;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(INLINE_TOKEN_RE.source, "g");

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${depth}-${match.index}`;

    if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/);
      const safeUrl = linkMatch ? safeExternalUrl(linkMatch[2]) : null;
      if (linkMatch && safeUrl) {
        nodes.push(
          <a
            key={key}
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-baseline gap-0.5 font-medium text-[var(--blue-text)] underline decoration-[var(--blue-text)]/45 underline-offset-[3px] transition-colors hover:decoration-[var(--blue-text)] [overflow-wrap:anywhere]"
          >
            <span>{linkMatch[1]}</span>
            <ExternalLink size={11.5} className="inline shrink-0 self-center opacity-75" aria-hidden="true" />
          </a>
        );
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded-[5px] border border-[var(--line)] bg-[var(--surface-soft)] px-1.5 py-0.5 font-mono text-[0.87em] text-[var(--ink-soft)] [overflow-wrap:anywhere]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-[var(--ink)]">
          {renderFormattedSpan(token.slice(2, -2), depth + 1)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <em key={key} className="italic">
          {renderFormattedSpan(token.slice(1, -1), depth + 1)}
        </em>
      );
    } else if (/^https?:\/\//i.test(token)) {
      const stripped = token.replace(/[.,;:!?]+$/, "");
      const trailing = token.slice(stripped.length);
      const safeUrl = safeExternalUrl(stripped);
      if (safeUrl) {
        nodes.push(
          <span key={key}>
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--blue-text)] underline decoration-[var(--blue-text)]/45 underline-offset-[3px] transition-colors hover:decoration-[var(--blue-text)] [overflow-wrap:anywhere]"
            >
              {stripped}
            </a>
            {trailing}
          </span>
        );
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function Inline({ text }: { text: string }) {
  return <>{renderFormattedSpan(text)}</>;
}

export function RichText({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim().split(/\s+/)[0] || "";
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(<CodeBlock key={`code-${index}`} lang={lang} code={codeLines.join("\n")} />);
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${index}`} className="my-3 border-t border-[var(--line)]" />);
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <h3
          key={`heading-${index}`}
          className={
            level <= 2
              ? "mb-2 mt-3.5 first:mt-0 text-[17px] font-bold leading-snug tracking-[-0.015em] text-[var(--ink)] [overflow-wrap:anywhere]"
              : "mb-1.5 mt-3 first:mt-0 text-[15.5px] font-semibold leading-snug text-[var(--ink)] [overflow-wrap:anywhere]"
          }
        >
          <Inline text={heading[2]} />
        </h3>
      );
      index += 1;
      continue;
    }

    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      const rows = tableLines
        .filter((row) => !/^\|[\s:-]+\|/.test(row.replace(/\|/g, "|")))
        .map((row) =>
          row
            .slice(1, -1)
            .split("|")
            .map((cell) => cell.trim())
        )
        .filter((row) => !row.every((cell) => /^:?-+:?$/.test(cell)));
      if (rows.length) {
        blocks.push(
          <div key={`table-${index}`} className="my-2.5 max-w-full overflow-x-auto rounded-xl border border-[var(--line)]">
            <table className="w-full min-w-[240px] border-collapse text-left text-[13.5px] leading-[1.45]">
              <thead>
                <tr className="bg-[var(--surface-soft)]">
                  {rows[0].map((cell, cellIndex) => (
                    <th key={cellIndex} className="border-b border-[var(--line)] px-3 py-2 font-semibold text-[var(--ink)]">
                      <Inline text={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1).map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-[var(--line)] last:border-0">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-3 py-2 align-top text-[var(--ink-soft)]">
                        <Inline text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    if (/^\s*- \[[ x]\]/i.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*- \[[ x]\]/i.test(lines[index])) {
        const checked = /^\s*- \[x\]/i.test(lines[index]);
        const text = lines[index].replace(/^\s*- \[[ x]\]\s*/i, "");
        items.push(
          <li key={`task-${index}`} className="flex items-start gap-2.5">
            <span
              className={`mt-[3px] grid h-[16px] w-[16px] shrink-0 place-items-center rounded-[4px] border ${
                checked
                  ? "border-[var(--blue)] bg-[var(--blue)] text-white"
                  : "border-[var(--line-strong)] text-transparent"
              }`}
            >
              {checked ? <Check size={10} strokeWidth={3} /> : <Square size={10} />}
            </span>
            <span className="min-w-0 flex-1 text-[var(--ink-soft)] [overflow-wrap:anywhere]">
              <Inline text={text} />
            </span>
          </li>
        );
        index += 1;
      }
      blocks.push(
        <ul key={`tasks-${index}`} className="my-2.5 space-y-1.5 text-[15.5px] leading-[1.58]">
          {items}
        </ul>
      );
      continue;
    }

    if (/^\s*[-*•]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*[-*•]\s+/.test(lines[index])) {
        const text = lines[index].replace(/^\s*[-*•]\s+/, "");
        items.push(
          <li key={`bullet-${index}`} className="relative pl-4 [overflow-wrap:anywhere]">
            <span className="absolute left-0.5 top-[10px] h-[5px] w-[5px] rounded-full bg-[var(--blue)]" />
            <Inline text={text} />
          </li>
        );
        index += 1;
      }
      blocks.push(
        <ul key={`list-${index}`} className="my-2.5 space-y-1.5 text-[15.5px] leading-[1.58] text-[var(--ink-soft)]">
          {items}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: ReactNode[] = [];
      let counter = 0;
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        counter += 1;
        const text = lines[index].replace(/^\s*\d+\.\s+/, "");
        items.push(
          <li key={`number-${index}`} className="flex gap-2.5">
            <span className="mt-[2px] grid h-[20px] w-[20px] shrink-0 place-items-center rounded-full bg-[var(--blue-soft)] text-[11px] font-bold text-[var(--blue-text)]">
              {counter}
            </span>
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <Inline text={text} />
            </span>
          </li>
        );
        index += 1;
      }
      blocks.push(
        <ol key={`numbers-${index}`} className="my-2.5 space-y-2 text-[15.5px] leading-[1.58] text-[var(--ink-soft)]">
          {items}
        </ol>
      );
      continue;
    }

    if (line.trim().startsWith(">")) {
      blocks.push(
        <blockquote
          key={`quote-${index}`}
          className="my-2.5 rounded-r-lg border-l-2 border-[var(--blue)] bg-[var(--blue-soft)] px-3 py-2 text-[15px] italic leading-[1.55] text-[var(--ink-soft)] [overflow-wrap:anywhere]"
        >
          <Inline text={line.replace(/^\s*>\s?/, "")} />
        </blockquote>
      );
      index += 1;
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,4})\s+/.test(lines[index]) &&
      !/^\s*([-*_])\1{2,}\s*$/.test(lines[index]) &&
      !/^\s*([-*•]|\d+\.)\s+/.test(lines[index]) &&
      !lines[index].trim().startsWith("```") &&
      !lines[index].trim().startsWith("|") &&
      !lines[index].trim().startsWith(">")
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${index}`} className="my-2.5 first:mt-0 last:mb-0 text-[15.5px] leading-[1.58] text-[var(--ink-soft)] [overflow-wrap:anywhere]">
        <Inline text={paragraph.join(" ")} />
      </p>
    );
  }

  return <div className="min-w-0 max-w-full text-left [overflow-wrap:anywhere]">{blocks}</div>;
}
