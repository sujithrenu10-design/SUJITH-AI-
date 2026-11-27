import { useState } from "react";
import { CheckCircle2, Cloud, Download, ExternalLink, FolderOpen, LoaderCircle, RefreshCw, Workflow } from "lucide-react";
import { Dialog } from "./Dialog";
import { cloudApkRequest, downloadCloudApkArtifact, type CloudApkArtifact, type CloudApkRun } from "../lib/gatewayClient";
import type { AndroidStack, WorkspaceFile } from "../lib/types";
import { cn } from "../utils/cn";

export function CloudApkDialog({
  title,
  isAndroid,
  androidStack,
  files,
  onClose,
  onDownloadSourceZip,
  onDownloadAndroidZip,
  onAddWorkflowFile,
  onNotify,
}: {
  title: string;
  isAndroid: boolean;
  androidStack: AndroidStack;
  files: WorkspaceFile[];
  onClose: () => void;
  onDownloadSourceZip: () => void;
  onDownloadAndroidZip: () => void;
  onAddWorkflowFile: (path: string, content: string) => void;
  onNotify: (msg: string, error?: boolean) => void;
}) {
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [sessionToken, setSessionToken] = useState("");
  const [working, setWorking] = useState(false);
  const [runs, setRuns] = useState<CloudApkRun[]>([]);
  const [artifacts, setArtifacts] = useState<CloudApkArtifact[]>([]);

  const stackParam = androidStack === "flutter-dart" ? "flutter" : "kotlin";

  const addWorkflow = async () => {
    setWorking(true);
    try {
      const res = await cloudApkRequest({ action: "workflow", stack: stackParam });
      if (!res.ok || !res.path || !res.content) {
        onNotify(res.error || "Could not generate workflow file.", true);
        return;
      }
      onAddWorkflowFile(res.path, res.content);
      onNotify(`Added ${res.path} to project workspace.`);
    } finally {
      setWorking(false);
    }
  };

  const pushAndBuild = async () => {
    if (!repo.trim()) {
      onNotify("Enter a GitHub repository in owner/repo format.", true);
      return;
    }
    setWorking(true);
    try {
      const res = await cloudApkRequest(
        {
          action: "push-and-build",
          stack: stackParam,
          repo: repo.trim(),
          branch: branch.trim() || "main",
          files: files.map((f) => ({ path: f.path, content: f.content })),
        },
        sessionToken
      );
      if (!res.ok) {
        onNotify(res.error || "Cloud APK build dispatch failed.", true);
        return;
      }
      onNotify(res.message || "Pushed project and queued APK workflow.");
      await checkStatus();
    } finally {
      setWorking(false);
    }
  };

  const checkStatus = async () => {
    if (!repo.trim()) {
      onNotify("Enter owner/repo to check GitHub Actions runs.", true);
      return;
    }
    setWorking(true);
    try {
      const res = await cloudApkRequest({ action: "status", repo: repo.trim() }, sessionToken);
      if (!res.ok) {
        onNotify(res.error || "Could not fetch workflow status.", true);
        return;
      }
      setRuns(res.runs ?? []);
      setArtifacts(res.artifacts ?? []);
    } finally {
      setWorking(false);
    }
  };

  const downloadApk = async (artifactId: number) => {
    setWorking(true);
    try {
      const res = await downloadCloudApkArtifact(repo.trim(), artifactId, sessionToken);
      if (!res.ok) onNotify(res.error || "Download failed.", true);
      else onNotify("APK artifact ZIP downloaded.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog
      title={isAndroid ? "Publish & Build Android APK" : "Publish & Export Project"}
      description={
        isAndroid
          ? "Export a complete Gradle/Flutter bundle or compile a real APK via GitHub Actions."
          : "Export your project source ZIP or bundle an Android wrapper project."
      }
      onClose={onClose}
    >
      <div className="space-y-4 py-4">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-3.5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--ink)]">
            <FolderOpen size={15} />
            <span className="truncate">{title}</span>
            <span className="ml-auto rounded bg-[var(--surface)] px-2 py-0.5 text-[9px] font-semibold uppercase text-[var(--muted)]">
              {isAndroid ? androidStack : "web"}
            </span>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--muted)]">
            {isAndroid
              ? "Local containers without Android SDK cannot compile APKs locally. Export the complete Android Studio / Flutter ZIP or run a real GitHub Actions build below."
              : "Download the verified website ZIP to deploy on Netlify Drop, Vercel, or any static host."}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={isAndroid ? onDownloadAndroidZip : onDownloadSourceZip}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] py-2.5 text-[11.5px] font-medium text-[var(--surface)]"
            >
              <Download size={13} />
              {isAndroid ? "Download Android / Gradle Project ZIP" : "Download Website ZIP"}
            </button>
            {!isAndroid && (
              <a
                href="https://app.netlify.com/drop"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-full border border-[var(--line)] py-2.5 text-[11px] font-medium text-[var(--ink-soft)]"
              >
                <ExternalLink size={13} />Open Netlify Drop
              </a>
            )}
            <button
              type="button"
              disabled={working}
              onClick={() => void addWorkflow()}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-[var(--line)] py-2 text-[11px] font-medium text-[var(--ink-soft)] hover:bg-[var(--surface)] disabled:opacity-40"
            >
              <Workflow size={13} />Add GitHub Actions APK Workflow (.yml)
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--line)] p-3.5">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--ink)]">
            <Cloud size={14} className="text-[var(--blue)]" />
            <span>GitHub Actions Cloud APK Build</span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">
            Pushes your workspace to GitHub, executes real Gradle / Flutter compilation on Ubuntu with JDK 17 + Android SDK, and lets you download the compiled APK artifact.
          </p>

          <div className="mt-3 space-y-2">
            <input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="owner/repository"
              aria-label="GitHub repository"
              className="placeholder-color h-9 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 text-[11px] text-[var(--ink)] outline-none"
            />
            <div className="flex gap-2">
              <input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                aria-label="GitHub branch"
                className="placeholder-color h-9 w-28 shrink-0 rounded-xl border border-[var(--line)] bg-transparent px-3 text-[11px] text-[var(--ink)] outline-none"
              />
              <input
                type="password"
                value={sessionToken}
                onChange={(e) => setSessionToken(e.target.value)}
                placeholder="GitHub PAT (session only, optional if server configured)"
                aria-label="GitHub token"
                className="placeholder-color h-9 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-transparent px-3 text-[11px] text-[var(--ink)] outline-none"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={working || !files.length}
                onClick={() => void pushAndBuild()}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--ink)] text-[11px] font-medium text-[var(--surface)] disabled:opacity-40"
              >
                {working ? <LoaderCircle size={12} className="animate-spin" /> : <Cloud size={12} />}
                Push &amp; Build APK
              </button>
              <button
                type="button"
                disabled={working}
                onClick={() => void checkStatus()}
                className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] px-3 text-[11px] font-medium text-[var(--ink-soft)] disabled:opacity-40"
              >
                <RefreshCw size={12} />Status
              </button>
            </div>
          </div>

          {runs.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-2.5">
              {runs.map((run) => (
                <div key={run.id} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--surface-soft)] px-2.5 py-2 text-[10px]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--ink)]">{run.name}</p>
                    <p className="text-[9px] text-[var(--muted)]">
                      {run.status}
                      {run.conclusion ? ` · ${run.conclusion}` : ""}
                    </p>
                  </div>
                  <a
                    href={run.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "flex shrink-0 items-center gap-1 rounded-lg border border-[var(--line)] px-2 py-1 text-[9.5px]",
                      run.conclusion === "success" ? "text-[#137333]" : "text-[var(--ink-soft)]"
                    )}
                  >
                    {run.conclusion === "success" && <CheckCircle2 size={11} />}Logs <ExternalLink size={10} />
                  </a>
                </div>
              ))}
            </div>
          )}

          {artifacts.length > 0 && (
            <div className="mt-2.5 space-y-1.5">
              {artifacts.map((art) => (
                <button
                  key={art.id}
                  type="button"
                  disabled={art.expired || working}
                  onClick={() => void downloadApk(art.id)}
                  className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--blue-soft)] px-3 py-2 text-left text-[10.5px] font-medium text-[var(--blue-text)] disabled:opacity-40"
                >
                  <span className="truncate">{art.name}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {(art.sizeInBytes / 1024 / 1024).toFixed(2)} MB <Download size={12} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
