import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { BuildReply } from "./src/components/BuildReply.tsx";
import { executeBuild } from "./src/lib/buildPipeline.ts";
import { DEFAULT_SETTINGS } from "./src/lib/types.ts";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

/** Run on the Vite dev page; file and step states come from a real build. */
export async function runReplyEventChecks() {
  const container = document.createElement("div");
  container.className = "app-shell";
  container.style.cssText = "position:fixed;left:-10000px;width:390px;height:auto";
  document.body.appendChild(container);
  const root = createRoot(container);
  let currentRun;
  let committedFiles;
  let signalSaving;
  let finishSave;
  const savingStarted = new Promise((resolve) => { signalSaving = resolve; });
  const allowSave = new Promise((resolve) => { finishSave = resolve; });

  const render = (run, content = "") => {
    currentRun = run;
    root.render(createElement(BuildReply, {
      message: { id: "test-reply", role: "assistant", content, createdAt: run.startedAt, run },
      showActivity: true,
      onFile: () => {},
      onPreview: () => {},
      onRetry: () => {},
      onStop: () => {},
      onCopy: () => {},
      isBusy: run.status === "running",
    }));
  };

  try {
    const build = executeBuild({
      prompt: "Build a calculator",
      files: [],
      attachments: [],
      settings: DEFAULT_SETTINGS,
      signal: new AbortController().signal,
      report: (run) => render(run),
      onDraft: () => {},
      commit: async (files) => {
        signalSaving();
        await allowSave;
        committedFiles = files;
      },
    });

    await savingStarted;
    await wait(80);
    const staged = [...container.querySelectorAll('[data-file-state="staged"]')];
    assert(staged.length === 4, "The actual staged files should appear during the save operation.");
    assert(staged.every((row) => row.disabled && !row.querySelector(".builder-reply-file-check")), "Staged files must not have green completion checks.");
    assert(currentRun.steps.find((step) => step.id === "saving")?.status === "running", "The real save must still be pending.");

    const timer = container.querySelector('[role="timer"]');
    const before = timer.textContent;
    await wait(1200);
    assert(timer.textContent !== before && timer.textContent.startsWith("Running for "), "The timer must advance using the run timestamp.");

    finishSave();
    const result = await build;
    render(result.run, result.content);
    await wait(80);
    const saved = [...container.querySelectorAll('[data-file-state="saved"]')];
    assert(committedFiles?.length === 4 && saved.length === 4, "Completed file rows must match the files actually committed.");
    assert(saved.every((row) => !row.disabled && row.querySelector(".builder-reply-file-check")), "Green checks must only appear after the save completes.");
    const displayed = [...container.querySelectorAll("[data-operation]")].map((row) => row.dataset.operation);
    assert(displayed.join(",") === result.run.steps.map((step) => step.id).join(","), "Analysis history must follow real event order.");
    const finished = container.querySelector('[role="timer"]').textContent;
    await wait(1100);
    assert(container.querySelector('[role="timer"]').textContent === finished, "Completed run duration must stay fixed.");

    const expandBtn = container.querySelector('[aria-label="Expand builder steps"]');
    expandBtn.click();
    await wait(50);
    const collapseBtn = container.querySelector('[aria-label="Collapse builder steps"]');
    assert(collapseBtn.getAttribute("aria-expanded") === "true", "Builder steps must expand accessibly.");
    collapseBtn.click();
    await wait(50);
    assert(container.querySelector('[aria-label="Expand builder steps"]').getAttribute("aria-expanded") === "false", "Builder steps must collapse accessibly.");
    assert(container.querySelector(".builder-reply-trace-collapse").hasAttribute("inert"), "Collapsed builder steps must not expose hidden controls to keyboard focus.");

    return { passed: true, stagedFiles: staged.length, committedFiles: saved.length, liveTimer: true, fixedDuration: true, chronologicalHistory: true, accessibleCollapse: true };
  } finally {
    finishSave?.();
    root.unmount();
    container.remove();
  }
}