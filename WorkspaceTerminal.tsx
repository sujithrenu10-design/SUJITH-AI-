import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Play, Square, Terminal as TerminalIcon, Trash2 } from "lucide-react";
import { streamTerminalCommand, syncWorkspaceToServer } from "../lib/gatewayClient";
import type { WorkspaceFile } from "../lib/types";
import { cn } from "../utils/cn";

type TerminalEntry = {
  id: string;
  kind: "cmd" | "stdout" | "stderr" | "info";
  text: string;
};

export function WorkspaceTerminal({
  projectId,
  files,
  onSyncComplete,
}: {
  projectId: string;
  files: WorkspaceFile[];
  onSyncComplete?: () => void;
}) {
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [entries, setEntries] = useState<TerminalEntry[]>([
    {
      id: "boot-1",
      kind: "info",
      text: "SUJITH AI Workspace Terminal connected to confined server project directory.",
    },
  ]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries]);

  const appendEntry = (kind: TerminalEntry["kind"], text: string) => {
    setEntries((prev) => [...prev.slice(-150), { id: `${Date.now()}-${Math.random()}`, kind, text }]);
  };

  const runCommand = async (rawCmd?: string) => {
    const cmd = (rawCmd ?? command).trim();
    if (!cmd || running) return;
    setCommand("");
    setHistory((prev) => [cmd, ...prev.filter((c) => c !== cmd)].slice(0, 30));
    setHistoryIdx(-1);
    appendEntry("cmd", `$ ${cmd}`);

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    try {
      const payloadFiles = files.map((f) => ({ path: f.path, content: f.content }));
      const exitCode = await streamTerminalCommand({
        projectId,
        command: cmd,
        files: payloadFiles,
        signal: controller.signal,
        onOutput: (chunk) => {
          if (chunk.type === "stdout" && chunk.text) appendEntry("stdout", chunk.text);
          else if (chunk.type === "stderr" && chunk.text) appendEntry("stderr", chunk.text);
          else if (chunk.type === "exit") {
            appendEntry("info", `[process exited with code ${chunk.code ?? 0}]`);
          }
        },
      });
      if (exitCode === 0) onSyncComplete?.();
    } catch (err) {
      appendEntry("stderr", err instanceof Error ? err.message : "Command failed.");
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  };

  const syncOnly = async () => {
    if (running) return;
    setRunning(true);
    try {
      const res = await syncWorkspaceToServer(
        projectId,
        files.map((f) => ({ path: f.path, content: f.content }))
      );
      if (res.ok) appendEntry("info", `Synced ${res.fileCount ?? files.length} workspace file(s) to ${res.workspaceRoot || "server workspace"}.`);
      else appendEntry("stderr", res.error || "Sync failed.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[var(--surface)]">
      <div className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--line)] bg-[var(--surface-soft)] px-2.5 py-1.5">
        <button type="button" disabled={running} onClick={() => void runCommand("find . -maxdepth 4")} className="toolbar-action">
          Tree
        </button>
        <button type="button" disabled={running} onClick={() => void runCommand("which node npm tsx python3 gcc java gradle")} className="toolbar-action">
          Tools
        </button>
        <button type="button" disabled={running} onClick={() => void runCommand("gradle assembleDebug")} className="toolbar-action">
          Gradle APK
        </button>
        <button type="button" disabled={running} onClick={() => void syncOnly()} className="toolbar-action">
          Sync files
        </button>
        <button type="button" onClick={() => setEntries([])} className="toolbar-action ml-auto" aria-label="Clear terminal">
          <Trash2 size={11} />Clear
        </button>
      </div>

      <div
        ref={scrollRef}
        className="thin-scrollbar min-h-0 flex-1 overflow-y-auto bg-[#0f172a] p-3 font-mono text-[10.5px] leading-relaxed text-[#e2e8f0]"
      >
        {entries.map((entry) => (
          <pre
            key={entry.id}
            className={cn(
              "m-0 whitespace-pre-wrap break-words font-mono",
              entry.kind === "cmd" && "mt-1.5 font-semibold text-[#93c5fd]",
              entry.kind === "stderr" && "text-[#fca5a5]",
              entry.kind === "info" && "text-[#94a3b8]"
            )}
          >
            {entry.text}
          </pre>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runCommand();
        }}
        className="flex shrink-0 items-center gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-3 py-2"
      >
        <TerminalIcon size={13} className="shrink-0 text-[var(--muted)]" />
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" && history.length) {
              e.preventDefault();
              const next = Math.min(historyIdx + 1, history.length - 1);
              setHistoryIdx(next);
              setCommand(history[next] ?? "");
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              const next = historyIdx - 1;
              setHistoryIdx(next);
              setCommand(next >= 0 ? history[next] ?? "" : "");
            }
          }}
          placeholder="python3 main.py · tsx src/index.ts · node app.js · tsc --noEmit"
          aria-label="Terminal command"
          className="placeholder-color h-8 min-w-0 flex-1 bg-transparent font-mono text-[11px] text-[var(--ink)] outline-none"
        />
        {running ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-[#bb3c37] px-2.5 text-[10px] font-medium text-white"
          >
            <Square size={10} fill="currentColor" />Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!command.trim()}
            className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-[var(--ink)] px-2.5 text-[10px] font-medium text-[var(--surface)] disabled:opacity-35"
          >
            {running ? <LoaderCircle size={11} className="animate-spin" /> : <Play size={11} />}Run
          </button>
        )}
      </form>
    </section>
  );
}
