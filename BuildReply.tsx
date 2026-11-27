import { useEffect, useId, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  CornerUpRight,
  ExternalLink,
  Eye,
  FileText,
  Flag,
  Globe,
  Lightbulb,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Square,
  Terminal,
  Trash2,
  Wrench,
} from "lucide-react";
import { CompanyLogo } from "./CompanyLogo";
import { MediaGenerationCard } from "./MediaGenerationCard";
import { RichText, safeExternalUrl } from "./RichText";
import type { CompanyId } from "../lib/companyLogos";
import { MODEL_CATALOG } from "../lib/modelCatalog";
import type { BuildFileEntry, BuildRun, BuildStep, ChatMessage, GeneratedMediaItem, MediaGenerationState, SearchState } from "../lib/types";
import "./BuildReply.css";

type ReplyProps = {
  message: ChatMessage;
  showActivity: boolean;
  onFile: (path: string) => void;
  onPreview: () => void;
  onRetry: (prompt: string) => void;
  onStop: () => void;
  onCopy: (text: string) => void;
  onAnimateImage?: (item: GeneratedMediaItem) => void;
  onEditImage?: (item: GeneratedMediaItem, instruction?: string) => void;
  onVariationImage?: (item: GeneratedMediaItem) => void;
  onRegenerateMedia?: (mediaState: MediaGenerationState) => void;
  onNotify?: (message: string, error?: boolean) => void;
  isBusy: boolean;
  availableFiles?: readonly string[];
  hideAnalysis?: boolean;
};

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (days) return `${days}d ${hours}h ${minutes}m ${remainder}s`;
  if (hours) return `${hours}h ${minutes}m ${remainder}s`;
  if (minutes) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

function formatBuilderThoughtDuration(step: BuildStep) {
  if (typeof step.finishedAt !== "number" || !Number.isFinite(step.finishedAt) || !Number.isFinite(step.startedAt)) {
    return step.label;
  }
  const duration = Math.max(0, step.finishedAt - step.startedAt);
  if (duration < 1000) return "Thought for under 1 second";
  const seconds = Math.floor(duration / 1000);
  if (seconds < 60) return `Thought for ${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  return `Thought for ${formatDuration(duration)}`;
}

function responseName(message: ChatMessage, run?: BuildRun) {
  const candidate = (run?.modelName || message.model || run?.engine || "").trim();
  if (candidate && !/^SUJITH Free\b/i.test(candidate)) {
    const matched = MODEL_CATALOG.find(
      (m) =>
        m.name.toLowerCase() === candidate.toLowerCase() ||
        m.id.toLowerCase() === candidate.toLowerCase() ||
        (m.officialModelId && m.officialModelId.toLowerCase() === candidate.toLowerCase()) ||
        m.id.toLowerCase().endsWith(":" + candidate.toLowerCase())
    );
    if (matched) return matched.name;
    return candidate;
  }
  return "NoTrack Uncensored";
}

const ALLOWED_COMPANIES: readonly CompanyId[] = ["notrack", "openai", "gemini", "anthropic"];

function isAllowedCompany(value: unknown): value is CompanyId {
  return typeof value === "string" && ALLOWED_COMPANIES.includes(value as CompanyId);
}

function responseCompany(message: ChatMessage, run?: BuildRun, displayName?: string): CompanyId | null {
  if (isAllowedCompany(run?.company)) return run.company;
  if (isAllowedCompany(message.modelCompany)) return message.modelCompany;
  const target = (displayName || message.model || run?.modelName || "").trim().toLowerCase();
  const matched = MODEL_CATALOG.find(
    (m) =>
      m.name.toLowerCase() === target ||
      m.id.toLowerCase() === target ||
      (m.officialModelId && m.officialModelId.toLowerCase() === target) ||
      m.id.toLowerCase().endsWith(":" + target)
  );
  if (matched) return matched.company;
  if (/\b(notrack)\b/i.test(target)) return "notrack";
  if (/\b(gpt|o1|o3|o4|codex|rosalind)\b/i.test(target)) return "openai";
  if (/\b(gemini|nano banana)\b/i.test(target)) return "gemini";
  if (/\b(claude|fable|mythos|opus|sonnet|haiku)\b/i.test(target)) return "anthropic";
  return "notrack";
}

function formatStepDuration(step: BuildStep) {
  if (typeof step.finishedAt !== "number" || !Number.isFinite(step.finishedAt) || !Number.isFinite(step.startedAt)) {
    return null;
  }
  const ms = Math.max(0, step.finishedAt - step.startedAt);
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return formatDuration(ms);
}

function builderStepLabel(step: BuildStep) {
  if (step.id === "thinking" && step.status === "complete") {
    if (step.label && step.label !== "Thinking") return step.label;
    return formatBuilderThoughtDuration(step);
  }
  if (step.id === "reading" && step.status === "complete") {
    return step.label || "Read files";
  }
  return step.label;
}

function BuilderStatusIcon({ active, failed }: { active?: boolean; failed?: boolean }) {
  return (
    <span className="ai-reply-sparkle" aria-hidden="true">
      {active && (
        <svg viewBox="0 0 24 24" className="ai-reply-sparkle-ring animate-spin" fill="none">
          <path
            d="M12 2.25a9.75 9.75 0 0 1 8.44 4.88"
            stroke="#4285f4"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          <path
            d="M20.44 7.13a9.75 9.75 0 0 1 0 9.74"
            stroke="#34a853"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          <path
            d="M20.44 16.87a9.75 9.75 0 0 1-16.88 0"
            stroke="#fbbc05"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          <path
            d="M3.56 16.87a9.75 9.75 0 0 1 8.44-14.62"
            stroke="#ea4335"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        </svg>
      )}
      <svg viewBox="0 0 24 24" className="ai-reply-sparkle-star">
        <path
          d="M12 1.8c.7 5.6 4.6 9.5 10.2 10.2-5.6.7-9.5 4.6-10.2 10.2-.7-5.6-4.6-9.5-10.2-10.2C7.4 11.3 11.3 7.4 12 1.8Z"
          fill={failed ? "#ea4335" : "#4285f4"}
        />
      </svg>
    </span>
  );
}

function renderActivityIcon(step: BuildStep) {
  const iconProps = { size: 15, strokeWidth: 1.85, "aria-hidden": true as const };
  const label = (step.label || "").toLowerCase();
  if (step.status === "failed") {
    return <AlertCircle {...iconProps} className="text-[#DC2626]" />;
  }
  if (step.id === "preview" || step.toolName === "preview_check") {
    return step.status === "running"
      ? <Eye {...iconProps} className="text-[#2563EB]" />
      : <CheckCircle2 {...iconProps} className="text-[#16A34A]" />;
  }
  if (step.toolName === "delete_file" || label.startsWith("removing ")) {
    return <Trash2 {...iconProps} className="text-[#64748B]" />;
  }
  if (step.id === "command" || label.includes("command")) {
    return <Terminal {...iconProps} className="text-[#64748B]" />;
  }
  if (step.id === "reading-file" || label.includes("reading") || label.includes("listing")) {
    return step.status === "running"
      ? <LoaderCircle {...iconProps} className="animate-spin text-[#2563EB]" />
      : <FileText {...iconProps} className="text-[#2563EB]" />;
  }
  if (step.id === "reading" || label.includes("read")) {
    return <FileText {...iconProps} className="text-[#64748B]" />;
  }
  if (step.id === "thinking" || label.includes("thought") || label.includes("thinking") || label.includes("analyz") || step.id === "planning" || label.includes("plan") || label.includes("agent step")) {
    return step.status === "running"
      ? <LoaderCircle {...iconProps} className="animate-spin text-[#2563EB]" />
      : <Lightbulb {...iconProps} className="text-[#64748B]" />;
  }
  if (step.id === "writing" || label.includes("edited") || label.includes("editing") || label.includes("writing")) {
    return step.status === "running"
      ? <LoaderCircle {...iconProps} className="animate-spin text-[#2563EB]" />
      : <Pencil {...iconProps} className="text-[#64748B]" />;
  }
  if (step.id === "syntax" || step.id === "testing" || label.includes("checking")) {
    return step.status === "running"
      ? <LoaderCircle {...iconProps} className="animate-spin text-[#2563EB]" />
      : <CheckCircle2 {...iconProps} className="text-[#16A34A]" />;
  }
  if (step.id === "saving" || step.id === "tool" || label.includes("working") || label.includes("building") || label.includes("finaliz") || label.includes("saved")) {
    return step.status === "complete"
      ? <CheckCircle2 {...iconProps} className="text-[#16A34A]" />
      : <Wrench {...iconProps} className="text-[#64748B]" />;
  }
  return <Code2 {...iconProps} className="text-[#64748B]" />;
}

function countSourceCitations(src: NonNullable<SearchState["sources"]>[number], idx: number, content: string): number {
  if (!content) return 0;
  let hits = 0;
  const escapedUrl = src.url ? src.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
  if (escapedUrl) {
    const urlMatches = content.match(new RegExp(escapedUrl, "gi"));
    if (urlMatches) hits += urlMatches.length;
  }
  const escapedDomain = src.domain ? src.domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
  if (escapedDomain) {
    const bracketDomainMatches = content.match(new RegExp(`\\[${escapedDomain}\\]`, "gi"));
    if (bracketDomainMatches) hits += bracketDomainMatches.length;
  }
  const numMatches = content.match(new RegExp(`\\[${idx + 1}\\]`, "g"));
  if (numMatches) hits += numMatches.length;
  return hits;
}

function DeepSearchPanel({ search, content = "" }: { search?: SearchState; content?: string }) {
  const sources = Array.isArray(search?.sources) ? search.sources : [];
  const queries = Array.isArray(search?.queries) ? search.queries.filter(Boolean) : [];
  const isSearching = search?.status === "searching";
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const open = userToggled !== null ? userToggled : (isSearching || sources.length > 0);

  if (!search) return null;

  if (search.status === "unavailable" || search.status === "empty") {
    return (
      <div className="ai-search-notice" role="status">
        {search.status === "unavailable"
          ? "DeepSearch unavailable: could not reach external search sources. Response below may not reflect live updates."
          : "DeepSearch ran, but no reliable matching live sources were found for this query."}
      </div>
    );
  }

  const clickableSources = sources
    .map((src, idx) => ({
      src,
      idx,
      href: safeExternalUrl(src.url),
      citations: countSourceCitations(src, idx, content),
    }))
    .filter((entry): entry is typeof entry & { href: string } => Boolean(entry.href));

  const distinctDomains = new Set(
    clickableSources.map((item) => item.src.domain).filter(Boolean)
  ).size;
  const explicitCitationTotal = clickableSources.reduce((sum, item) => sum + item.citations, 0);
  const displayCitationCount = explicitCitationTotal > 0 ? explicitCitationTotal : clickableSources.length;

  return (
    <section className="ai-search-card" aria-label="DeepSearch sources and citations">
      <button
        type="button"
        onClick={() => clickableSources.length && setUserToggled(!open)}
        className="ai-search-toggle"
        aria-expanded={clickableSources.length ? open : undefined}
      >
        {isSearching ? (
          <LoaderCircle size={15} className="shrink-0 animate-spin text-[var(--blue-text)]" aria-hidden="true" />
        ) : (
          <Globe size={15} className="shrink-0 text-[var(--blue-text)]" aria-hidden="true" />
        )}
        <span className="ai-search-stage">
          <strong className="font-semibold text-[var(--ink)]">DeepSearch</strong>
          {isSearching ? (
            <span className="text-[var(--muted)]">
              {" · "}
              {search.stage || "Searching live web sources..."}
              {clickableSources.length > 0 ? ` · ${clickableSources.length} found` : ""}
            </span>
          ) : (
            <span className="tabular-nums text-[var(--muted)]">
              {" · "}
              {displayCitationCount} {displayCitationCount === 1 ? "citation" : "citations"}
              {distinctDomains > 0 ? ` · ${distinctDomains} ${distinctDomains === 1 ? "domain" : "domains"}` : ""}
            </span>
          )}
        </span>
        {clickableSources.length > 0 && (
          open ? (
            <ChevronDown size={15} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
          ) : (
            <ChevronRight size={15} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
          )
        )}
      </button>

      {open && clickableSources.length > 0 && (
        <div className="ai-search-sources-wrap">
          {queries.length > 0 && (
            <p className="ai-search-queries">
              Searched: {queries.join(" · ")}
            </p>
          )}
          <div className="ai-search-source-deck no-scrollbar" role="list" aria-label="DeepSearch source cards">
            {clickableSources.map(({ src, idx, href, citations }) => {
              const excerpt = (src.snippet || src.excerpt || "").trim();
              const citationBadge = citations > 0 ? `[${idx + 1}] · Cited ${citations}×` : `[${idx + 1}]`;
              return (
                <a
                  key={`${src.id}-${idx}`}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  role="listitem"
                  className="ai-search-source-card"
                >
                  <div className="ai-search-source-card-top">
                    <span className="ai-search-citation-count tabular-nums">{citationBadge}</span>
                    <span className="ai-search-source-domain">{src.domain}</span>
                    <ExternalLink size={12.5} className="shrink-0 text-[var(--blue-text)]" aria-hidden="true" />
                  </div>
                  <span className="ai-search-source-title line-clamp-2">{src.title}</span>
                  {excerpt && (
                    <span className="ai-search-source-snippet line-clamp-2">{excerpt}</span>
                  )}
                  <span className="ai-search-source-meta">
                    {src.provider || src.domain}
                    {src.publishedAt ? ` · ${src.publishedAt}` : ""}
                    {src.verified ? " · Verified" : ""}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export function BuildReply({
  message,
  showActivity: _showActivity,
  onFile,
  onPreview,
  onRetry,
  onStop,
  onCopy,
  onAnimateImage,
  onEditImage,
  onVariationImage,
  onRegenerateMedia,
  onNotify,
  isBusy,
  availableFiles,
  hideAnalysis,
}: ReplyProps) {
  const run = message.run;
  const media = message.media;
  const mediaActive = Boolean(
    media && (media.status === "queued" || media.status === "generating" || media.status === "polishing")
  );
  const active = run?.status === "running" || mediaActive;
  const failed = !media && (run?.status === "failed" || run?.status === "stopped");
  const steps = Array.isArray(run?.steps) ? run.steps : [];
  const files = Array.isArray(run?.files) ? run.files : [];
  const checks = Array.isArray(run?.checks) ? run.checks : [];
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const analysisId = useId();

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const sync = () => setNow(Date.now());
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [active, run?.id]);

  const start = run?.startedAt;
  const end = active ? now : run?.finishedAt;
  const hasDuration = typeof start === "number" && Number.isFinite(start) && typeof end === "number" && Number.isFinite(end);
  const duration = hasDuration ? formatDuration(end - start) : null;
  const durationLabel = duration
    ? `${active ? "Running for" : run?.status === "stopped" ? "Stopped after" : "Ran for"} ${duration}`
    : null;

  const modelDisplayName = responseName(message, run);

  /* -------------------------------------------------------------------------- */
  /* BUILD PAGE CHAT REPLY UI (hideAnalysis is false/undefined)                 */
  /* -------------------------------------------------------------------------- */
  if (!hideAnalysis) {
    const allCommitted =
      (steps.some((step) => step.id === "saving" && step.status === "complete") &&
        (run?.status === "running" || run?.status === "complete")) ||
      run?.status === "complete";
    const resolveFileStatus = (file: BuildFileEntry): "writing" | "saved" | "failed" => {
      if (file.status === "saved" || file.status === "writing" || file.status === "failed") {
        return file.status;
      }
      if (allCommitted) return "saved";
      if (run?.status === "running") return "writing";
      return "failed";
    };
    const savedFilesCount = files.filter((f) => f.action !== "deleted" && resolveFileStatus(f) === "saved").length;
    const hasSavedFiles = savedFilesCount > 0;
    const runningStep = [...steps].reverse().find((step) => step.status === "running");
    const primaryActionLabel = active
      ? (runningStep?.label || "Working")
      : run?.status === "complete"
        ? "Build complete"
        : run?.status === "stopped"
          ? "Build stopped"
          : run?.status === "failed"
            ? "Build failed"
            : "Working";

    return (
      <article
        className="builder-reply animate-fade-up"
        aria-label="SUJITH AI Builder response"
        aria-busy={Boolean(active)}
      >
        {/* Header: Model Name • Running for Xs / Ran for Xm Ys */}
        <header className="builder-reply-header">
          <span className="builder-reply-model">{modelDisplayName}</span>
          {durationLabel && (
            <>
              <span className="builder-reply-dot" aria-hidden="true">•</span>
              <span className="builder-reply-timer" role="timer" aria-live="off">
                {durationLabel}
              </span>
            </>
          )}
        </header>

        {/* Builder Trace / Live Phase Toggle */}
        <div className={`builder-reply-trace${expanded ? " is-expanded" : ""}`}>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="builder-reply-trace-toggle"
            aria-expanded={expanded}
            aria-controls={analysisId}
            aria-label={expanded ? "Collapse builder steps" : "Expand builder steps"}
          >
            <span className="builder-reply-trace-icon">
              <BuilderStatusIcon active={active} failed={failed} />
            </span>
            <span className="builder-reply-trace-title">{primaryActionLabel}</span>
            {expanded ? (
              <ChevronDown size={16} strokeWidth={1.8} className="builder-reply-trace-chevron" />
            ) : (
              <ChevronRight size={16} strokeWidth={1.8} className="builder-reply-trace-chevron" />
            )}
          </button>

          <div id={analysisId} className="builder-reply-trace-collapse" inert={!expanded}>
            <div className="builder-reply-trace-inner">
              <ul className="builder-reply-steps">
                {steps.length === 0 ? (
                  <li className="builder-reply-step">
                    <span className="builder-reply-step-copy">
                      <p className="builder-reply-step-label">
                        {active ? "Preparing build..." : "No build operations recorded."}
                      </p>
                    </span>
                  </li>
                ) : (
                  steps.map((step, index) => {
                    const stepDuration = formatStepDuration(step);
                    return (
                      <li key={`${step.id}-${step.startedAt || 0}-${index}`} className="builder-reply-step" data-operation={step.id}>
                        <span className="builder-reply-step-icon">
                          {renderActivityIcon(step)}
                        </span>
                        <div className="builder-reply-step-copy">
                          <div className="builder-reply-step-row">
                            <p className="builder-reply-step-label">{builderStepLabel(step)}</p>
                            {stepDuration && (
                              <span className="builder-reply-step-duration">{stepDuration}</span>
                            )}
                          </div>
                          {step.detail && (
                            <p className="ai-reply-step-detail">{step.detail}</p>
                          )}
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <div className="builder-reply-files" role="group" aria-label="Workspace files">
            {files.map((file, index) => {
              const fileStatus = resolveFileStatus(file);
              const isDeleted = file.action === "deleted";
              const available = !availableFiles || availableFiles.includes(file.path);
              const clickable = !isDeleted && fileStatus === "saved" && available;
              return (
                <button
                  key={`${file.path}-${index}`}
                  type="button"
                  data-file-state={isDeleted ? "deleted" : fileStatus}
                  disabled={!clickable}
                  onClick={() => clickable && onFile(file.path)}
                  className={`builder-reply-file${isDeleted ? " is-deleted" : ""}`}
                  title={
                    isDeleted
                      ? `Deleted ${file.path}`
                      : clickable
                        ? `Open ${file.path}`
                        : fileStatus === "writing"
                          ? `Writing ${file.path}...`
                          : "Build interrupted before file completed"
                  }
                >
                  <span className="builder-reply-file-path">{file.path}</span>
                  {isDeleted ? (
                    <Trash2 size={14} strokeWidth={1.8} className="builder-reply-file-deleted" />
                  ) : fileStatus === "saved" ? (
                    <CheckCircle2 size={16} strokeWidth={1.85} className="builder-reply-file-check" />
                  ) : fileStatus === "writing" ? (
                    <LoaderCircle size={15} strokeWidth={1.85} className="builder-reply-file-pending" />
                  ) : (
                    <AlertCircle size={15} strokeWidth={1.85} className="builder-reply-file-failed" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Response Prose */}
        {!failed && message.content && (
          <div className="builder-reply-content">
            <RichText content={message.content} />
          </div>
        )}

        {/* Error Box if failed or stopped */}
        {failed && (
          <div className="ai-reply-issue">
            <div className="ai-reply-issue-head">
              <p>{run?.status === "stopped" ? "This build was stopped." : "This request needs your attention."}</p>
              {run?.errorDetail && (run.errorDetail.status || run.errorDetail.code) && (
                <span className="ai-reply-issue-code">
                  {run.errorDetail.status ? `HTTP ${run.errorDetail.status}` : ""}
                  {run.errorDetail.status && run.errorDetail.code ? " · " : ""}
                  {run.errorDetail.code || ""}
                </span>
              )}
            </div>
            <button type="button" onClick={() => setShowIssue((value) => !value)} aria-expanded={showIssue}>
              {showIssue ? "Hide details" : "Error details"}
            </button>
            {(showIssue || Boolean(run?.errorDetail)) && (
              <div className="ai-reply-issue-detail">
                <p>{run?.errorDetail?.message || message.content}</p>
                {run?.errorDetail?.hint && <p className="ai-reply-issue-hint">{run.errorDetail.hint}</p>}
              </div>
            )}
          </div>
        )}

        {/* Footer Action Bar */}
        <div className="builder-reply-footer">
          {active ? (
            <button type="button" onClick={onStop} className="builder-reply-stop">
              <Square size={11} aria-hidden="true" />
              <span>Stop build</span>
            </button>
          ) : (
            <div className="builder-reply-footer-row">
              <button
                type="button"
                onClick={hasSavedFiles ? onPreview : undefined}
                disabled={!hasSavedFiles}
                className="builder-reply-checkpoint"
                title={hasSavedFiles ? "Open checkpoint preview" : "Checkpoint"}
              >
                <Flag size={14} strokeWidth={1.7} aria-hidden="true" />
                <span>Checkpoint</span>
              </button>

              <div className="builder-reply-footer-actions">
                <button
                  type="button"
                  onClick={() => onCopy(message.content)}
                  disabled={!message.content}
                  className="builder-reply-icon-btn"
                  aria-label="Copy response"
                  title="Copy response"
                >
                  <Copy size={15.5} strokeWidth={1.7} aria-hidden="true" />
                </button>
                {run?.retryPrompt && (
                  <button
                    type="button"
                    onClick={() => onRetry(run.retryPrompt!)}
                    disabled={isBusy}
                    className="builder-reply-icon-btn"
                    aria-label={failed ? "Retry build" : "Run again"}
                    title={failed ? "Retry build" : "Run again"}
                  >
                    <RotateCcw size={15.5} strokeWidth={1.7} aria-hidden="true" />
                  </button>
                )}
                {hasSavedFiles && run?.status === "complete" && (
                  <button
                    type="button"
                    onClick={onPreview}
                    className="builder-reply-preview-btn"
                    aria-label="Open live preview"
                    title="Open live preview"
                  >
                    <CornerUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}

          {!active && checks.length > 0 && (
            <details className="builder-reply-checks" open={checks.some((check) => !check.passed)}>
              <summary>
                Check results
                {checks.some((check) => !check.passed)
                  ? ` (${checks.filter((check) => !check.passed).length} failed)`
                  : ` (${checks.length} passed)`}
              </summary>
              <ul>
                {checks.map((check, index) => (
                  <li key={`${index}-${check.name}`} className={check.passed ? "is-pass" : "is-fail"}>
                    {check.passed ? (
                      <CheckCircle2 size={13.5} strokeWidth={2} className="mt-0.5 shrink-0 text-[#16A34A]" aria-hidden="true" />
                    ) : (
                      <AlertCircle size={13.5} strokeWidth={2} className="mt-0.5 shrink-0 text-[#DC2626]" aria-hidden="true" />
                    )}
                    <span>
                      <strong>{check.name}</strong>
                      {check.detail ? ` — ${check.detail}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </article>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* HOME CHAT PAGE REPLY UI (hideAnalysis === true) - UNCHANGED                */
  /* -------------------------------------------------------------------------- */
  const modelCompany = responseCompany(message, run, modelDisplayName);

  return (
    <article
      className={`ai-reply animate-fade-up${media ? " is-media-reply" : ""}`}
      aria-label="SUJITH AI response"
      aria-busy={Boolean(active)}
    >
      {!media && (
        <header className="ai-reply-header flex items-center gap-2 py-1 text-xs text-[var(--ink-soft)]">
          <div className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1 shadow-2xs">
            {modelCompany && <CompanyLogo company={modelCompany} size={17} />}
            <span className="ai-reply-model font-bold text-[var(--ink)] tracking-[-0.01em]">{modelDisplayName}</span>
          </div>
        </header>
      )}

      {active && !media && !run?.search && (
        <div className="ai-reply-thinking mt-2.5 pl-1 text-[13.5px] font-semibold">
          Thinking...
        </div>
      )}

      {!media && run?.search && <DeepSearchPanel search={run.search} content={message.content} />}

      {media && (
        <MediaGenerationCard
          state={media}
          isBusy={isBusy}
          onStop={onStop}
          onRegenerate={(mediaState) =>
            onRegenerateMedia ? onRegenerateMedia(mediaState) : onRetry(mediaState.prompt)
          }
          onAnimateImage={onAnimateImage}
          onEditImage={onEditImage}
          onVariationImage={onVariationImage}
          onNotify={onNotify}
        />
      )}

      {!failed && message.content && <div className="ai-reply-content"><RichText content={message.content} /></div>}

      {failed && (
        <div className="ai-reply-issue">
          <div className="ai-reply-issue-head">
            <p>{run?.status === "stopped" ? "This response was stopped." : "This request needs your attention."}</p>
            {run?.errorDetail && (run.errorDetail.status || run.errorDetail.code) && (
              <span className="ai-reply-issue-code">
                {run.errorDetail.status ? `HTTP ${run.errorDetail.status}` : ""}
                {run.errorDetail.status && run.errorDetail.code ? " · " : ""}
                {run.errorDetail.code || ""}
              </span>
            )}
          </div>
          <button type="button" onClick={() => setShowIssue((value) => !value)} aria-expanded={showIssue}>
            {showIssue ? "Hide details" : "Error details"}
          </button>
          {(showIssue || Boolean(run?.errorDetail)) && (
            <div className="ai-reply-issue-detail">
              <p>{run?.errorDetail?.message || message.content}</p>
              {run?.errorDetail?.hint && <p className="ai-reply-issue-hint">{run.errorDetail.hint}</p>}
            </div>
          )}
        </div>
      )}

      {!media && (
        <div className="ai-reply-actions">
          {active ? (
            <button type="button" onClick={onStop} className="ai-reply-action"><Square size={11} aria-hidden="true" />Stop</button>
          ) : (
            <>
              <button type="button" onClick={() => onCopy(message.content)} disabled={!message.content} className="ai-reply-icon-action" aria-label="Copy response"><Copy size={13} aria-hidden="true" /></button>
              {run?.retryPrompt && <button type="button" onClick={() => onRetry(run.retryPrompt!)} disabled={isBusy} className="ai-reply-action"><RotateCcw size={12} aria-hidden="true" />{failed ? "Retry" : "Regenerate"}</button>}
            </>
          )}
        </div>
      )}
    </article>
  );
}
