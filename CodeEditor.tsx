import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AlertCircle, Copy, FileCode2, Plus, Search, Trash2, X } from "lucide-react";
import type { BuildDiagnostic, WorkspaceFile } from "../lib/types";
import { cn } from "../utils/cn";

function labelForFile(path: string) {
  return path.split("/").pop() ?? path;
}

const KEYWORDS = new Set([
  "package", "import", "class", "interface", "object", "fun", "val", "var", "const", "let", "function",
  "return", "if", "else", "elif", "when", "switch", "case", "for", "while", "do", "try", "catch", "except",
  "finally", "raise", "pass", "yield", "with", "as", "from", "def", "async", "await", "lambda", "in", "is",
  "override", "private", "public", "protected", "internal", "suspend", "export", "default", "extends",
  "implements", "void", "boolean", "int", "double", "float", "string", "true", "false", "null", "None",
  "True", "False", "final", "static", "new", "this", "super", "enum", "struct", "type", "plugins",
  "android", "dependencies", "implementation", "widget", "build", "state", "late", "required",
  "fn", "pub", "mut", "impl", "trait", "match", "use", "mod", "crate", "func", "defer", "chan", "select",
  "go", "namespace", "template", "typename", "virtual", "SELECT", "FROM", "WHERE", "INSERT", "INTO",
  "UPDATE", "DELETE", "CREATE", "TABLE", "JOIN", "ORDER", "GROUP", "BY", "VALUES",
]);

function highlightLine(line: string, language: string): (string | { cls: string; text: string })[] {
  if (!line) return [""];
  if (language === "xml" || language === "html") {
    const parts: (string | { cls: string; text: string })[] = [];
    const re = /(<!--[\s\S]*?-->|<\/?[A-Za-z0-9:._-]+|\s[A-Za-z0-9:._-]+=|"[^"]*"|'[^']*'|\/?>)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith("<!--")) parts.push({ cls: "text-[var(--muted)] italic", text: tok });
      else if (tok.startsWith("<") || tok.endsWith(">")) parts.push({ cls: "text-[#1a73e8] dark:text-[#8ab4f8]", text: tok });
      else if (tok.startsWith('"') || tok.startsWith("'")) parts.push({ cls: "text-[#137333] dark:text-[#81c995]", text: tok });
      else parts.push({ cls: "text-[#b06000] dark:text-[#fdd663]", text: tok });
      last = m.index + tok.length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return parts;
  }

  const parts: (string | { cls: string; text: string })[] = [];
  const tokenRe = /(\/\/.*$|#.*$|\/\*.*?\*\/|@[A-Za-z0-9_]+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b[0-9]+(?:\.[0-9]+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(line)) !== null) {
    if (m.index > last) parts.push(line.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("//") || tok.startsWith("#") || tok.startsWith("/*")) {
      parts.push({ cls: "text-[var(--muted)] italic", text: tok });
    } else if (tok.startsWith("@")) {
      parts.push({ cls: "text-[#9334e6] dark:text-[#c58af9]", text: tok });
    } else if (tok.startsWith('"') || tok.startsWith("'")) {
      parts.push({ cls: "text-[#137333] dark:text-[#81c995]", text: tok });
    } else if (/^[0-9]/.test(tok)) {
      parts.push({ cls: "text-[#b06000] dark:text-[#fdd663]", text: tok });
    } else if (KEYWORDS.has(tok)) {
      parts.push({ cls: "text-[#1a73e8] dark:text-[#8ab4f8] font-medium", text: tok });
    } else {
      parts.push(tok);
    }
    last = m.index + tok.length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

export function CodeEditor({
  files,
  openTabs,
  currentFile,
  diagnostics,
  autoSave,
  busy,
  onSelectTab,
  onCloseTab,
  onNewFile,
  onChange,
  onCopy,
  onDelete,
}: {
  files: WorkspaceFile[];
  openTabs: string[];
  currentFile: WorkspaceFile | undefined;
  diagnostics: BuildDiagnostic[];
  autoSave: boolean;
  busy: boolean;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onNewFile: () => void;
  onChange: (content: string) => void;
  onCopy: (content: string) => void;
  onDelete: () => void;
}) {
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const gutterRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const tabFiles = useMemo(() => {
    const valid = openTabs.map((p) => files.find((f) => f.path === p)).filter((f): f is WorkspaceFile => Boolean(f));
    if (currentFile && !valid.some((f) => f.path === currentFile.path)) valid.unshift(currentFile);
    return valid.length ? valid : files.slice(0, 6);
  }, [openTabs, files, currentFile]);

  const lines = useMemo(() => (currentFile ? currentFile.content.split("\n") : []), [currentFile]);
  const fileDiagnostics = useMemo(
    () => (currentFile ? diagnostics.filter((d) => d.path === currentFile.path) : []),
    [diagnostics, currentFile]
  );
  const errorLineSet = useMemo(() => new Set(fileDiagnostics.map((d) => d.line)), [fileDiagnostics]);

  const matchCount = useMemo(() => {
    if (!currentFile || !findQuery) return 0;
    return currentFile.content.split(findQuery).length - 1;
  }, [currentFile, findQuery]);

  const syncScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = ta.scrollTop;
      highlightRef.current.scrollLeft = ta.scrollLeft;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!currentFile) return;
    const ta = event.currentTarget;
    if (event.key === "Tab") {
      event.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = `${currentFile.content.slice(0, start)}  ${currentFile.content.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    } else if (event.key === "Enter") {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const before = currentFile.content.slice(0, start);
      const lineStart = before.lastIndexOf("\n") + 1;
      const currLine = before.slice(lineStart);
      const indentMatch = currLine.match(/^(\s*)/);
      const baseIndent = indentMatch ? indentMatch[1] : "";
      const extra = /[{(:]\s*$/.test(currLine) ? "  " : "";
      if (baseIndent || extra) {
        event.preventDefault();
        const insert = `\n${baseIndent}${extra}`;
        const next = `${before}${insert}${currentFile.content.slice(end)}`;
        onChange(next);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + insert.length;
        });
      }
    }
  };

  const replaceAll = () => {
    if (!currentFile || !findQuery) return;
    onChange(currentFile.content.split(findQuery).join(replaceQuery));
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--line)] px-2 py-1.5">
        {tabFiles.map((file) => {
          const active = currentFile?.path === file.path;
          const hasErr = diagnostics.some((d) => d.path === file.path);
          return (
            <div
              key={file.path}
              className={cn(
                "flex h-8 max-w-[190px] shrink-0 items-center gap-1 rounded-lg px-2 text-[10px]",
                active ? "bg-[var(--surface-muted)] font-medium text-[var(--ink)]" : "text-[var(--muted)]"
              )}
            >
              <button
                type="button"
                onClick={() => onSelectTab(file.path)}
                aria-pressed={active}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                <FileCode2 size={11} className={hasErr ? "text-[#bb3c37]" : undefined} />
                <span className="truncate">{labelForFile(file.path)}</span>
              </button>
              {tabFiles.length > 1 && (
                <button
                  type="button"
                  onClick={() => onCloseTab(file.path)}
                  aria-label={`Close ${file.path}`}
                  className="rounded p-0.5 text-[var(--muted)] hover:bg-[var(--surface)]"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          );
        })}
        <button type="button" onClick={onNewFile} disabled={busy} className="icon-button !h-8 !w-8" aria-label="New source file">
          <Plus size={14} />
        </button>
      </div>

      {currentFile && (
        <>
          <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-[var(--line)] px-3">
            <p className="min-w-0 flex-1 truncate text-[9px] text-[var(--muted)]">{currentFile.path}</p>
            <span className="text-[8.5px] text-[var(--muted)]">{autoSave ? "Auto-save" : "Session"}</span>
            <button
              type="button"
              className={cn("icon-button !h-7 !w-7", findOpen && "bg-[var(--surface-muted)] text-[var(--ink)]")}
              onClick={() => setFindOpen((v) => !v)}
              aria-label="Find and replace"
            >
              <Search size={12} />
            </button>
            <button type="button" className="icon-button !h-7 !w-7" onClick={() => onCopy(currentFile.content)} aria-label="Copy current file">
              <Copy size={12} />
            </button>
            <button type="button" className="icon-button !h-7 !w-7" onClick={onDelete} disabled={busy} aria-label="Delete current file">
              <Trash2 size={12} />
            </button>
          </div>

          {findOpen && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1.5">
              <input
                value={findQuery}
                onChange={(e) => setFindQuery(e.target.value)}
                placeholder="Find..."
                aria-label="Find text"
                className="h-7 min-w-[90px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-[10.5px] text-[var(--ink)] outline-none"
              />
              <input
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder="Replace..."
                aria-label="Replace text"
                className="h-7 min-w-[90px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-[10.5px] text-[var(--ink)] outline-none"
              />
              <span className="text-[9px] text-[var(--muted)]">{matchCount}</span>
              <button
                type="button"
                disabled={!findQuery || busy}
                onClick={replaceAll}
                className="h-7 rounded-lg bg-[var(--ink)] px-2.5 text-[10px] font-medium text-[var(--surface)] disabled:opacity-40"
              >
                Replace all
              </button>
            </div>
          )}

          {fileDiagnostics.length > 0 && (
            <div className="flex items-start gap-2 border-b border-[#f2b8b5] bg-[#fce8e6] px-3 py-1.5 text-[10px] text-[#b3261e]">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                {fileDiagnostics.slice(0, 3).map((d, idx) => (
                  <p key={idx} className="truncate">
                    Line {d.line}: {d.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[var(--surface)]">
            <div
              ref={gutterRef}
              aria-hidden="true"
              className="no-scrollbar w-10 shrink-0 select-none overflow-hidden border-r border-[var(--line)] bg-[var(--surface-soft)] py-3 text-right font-mono text-[10px] leading-[1.65] text-[var(--muted)]"
            >
              {lines.map((_, i) => (
                <div
                  key={i}
                  className={cn("pr-2", errorLineSet.has(i + 1) && "bg-[#fce8e6] font-semibold text-[#bb3c37]")}
                >
                  {i + 1}
                </div>
              ))}
            </div>

            <div className="relative min-w-0 flex-1 overflow-hidden">
              <pre
                ref={highlightRef}
                aria-hidden="true"
                className="code-editor pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre p-3 font-mono text-[11px] leading-[1.65] text-[var(--ink-soft)]"
              >
                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    className={cn(errorLineSet.has(idx + 1) && "bg-[#fce8e6]/60 dark:bg-[#5c1d1a]/40")}
                  >
                    {highlightLine(line, currentFile.language).map((part, pIdx) =>
                      typeof part === "string" ? (
                        <span key={pIdx}>{part}</span>
                      ) : (
                        <span key={pIdx} className={part.cls}>
                          {part.text}
                        </span>
                      )
                    )}
                    {"\n"}
                  </div>
                ))}
              </pre>
              <textarea
                ref={textareaRef}
                className="code-editor thin-scrollbar relative z-10 h-full w-full resize-none overflow-auto whitespace-pre border-0 bg-transparent p-3 font-mono text-[11px] leading-[1.65] text-transparent caret-[var(--blue)] outline-none selection:bg-[var(--blue)]/20"
                aria-label={`Edit ${currentFile.path}`}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                disabled={busy}
                value={currentFile.content}
                onScroll={syncScroll}
                onKeyDown={handleKeyDown}
                onChange={(event) => onChange(event.target.value)}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
