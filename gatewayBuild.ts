import { languageForPath, mergeWorkspaceFiles, previewDocument } from "./workspace";
import { checkPreview, checkSource, BuildValidationError } from "./validation";
import {
  BackendRequestError,
  streamBuilderAgent,
  streamGatewayChat,
  syncWorkspaceToServer,
  verifyWorkspaceOnServer,
  type ProviderAvailability,
} from "./gatewayClient";
import { estimateTokens, recordLocalUsage } from "./localUsage";
import { detectBuildTarget, shouldEnforceReactVite, stripCodeFiles } from "./builder";
import type { ModelSpec } from "./modelCatalog";
import {
  makeId,
  type AppSettings,
  type Attachment,
  type BuildCheck,
  type BuildFileEntry,
  type BuildRun,
  type BuildStep,
  type WorkspaceFile,
} from "./types";

function snapshot(run: BuildRun): BuildRun {
  return {
    ...run,
    steps: run.steps.map((step) => ({ ...step })),
    files: run.files.map((file) => ({ ...file })),
    checks: run.checks.map((check) => ({ ...check })),
    search: run.search
      ? {
          ...run.search,
          queries: [...run.search.queries],
          sources: run.search.sources.map((s) => ({ ...s })),
        }
      : undefined,
    errorDetail: run.errorDetail ? { ...run.errorDetail } : undefined,
  };
}

export async function runCompanyModel({
  model,
  availability,
  prompt,
  history,
  files,
  attachments,
  settings,
  conversationId,
  signal,
  report,
  onStreamText,
  commit,
  mode = "builder",
  deepSearch,
}: {
  model: ModelSpec;
  availability: ProviderAvailability;
  prompt: string;
  history: { role: "user" | "assistant"; content: string }[];
  files: WorkspaceFile[];
  attachments: Attachment[];
  settings: AppSettings;
  conversationId: string;
  signal: AbortSignal;
  report: (run: BuildRun, text: string) => void;
  onStreamText: (text: string) => void;
  commit: (files: WorkspaceFile[], options?: { isFinal?: boolean }) => void;
  mode?: "chat" | "builder";
  deepSearch?: boolean;
}): Promise<{ run: BuildRun; content: string }> {
  let run: BuildRun = {
    id: makeId("run"),
    status: "running",
    engine: "notrack",
    modelName: model.name,
    companyName: model.companyName,
    company: model.company,
    usedProvider: "notrack",
    startedAt: Date.now(),
    steps: [
      {
        id: "thinking",
        label: mode === "builder" ? "Analyzing project" : "Thinking",
        detail: availability.notrackConfigured
          ? mode === "builder"
            ? `Inspecting workspace and planning architecture with ${model.name}.`
            : `Routing ${model.name} via NoTrack.ai backend.`
          : `Checking NoTrack.ai API key for ${model.name}. Configure your key in Settings -> NoTrack.ai API Key.`,
        status: "running",
        startedAt: Date.now(),
      },
    ],
    files: [],
    checks: [],
    retryPrompt: prompt,
  };
  report(snapshot(run), "");

  const finish = (content: string, status: BuildRun["status"]) => {
    const finishedAt = Date.now();
    run = {
      ...run,
      status,
      finishedAt,
      latencyMs: run.latencyMs ?? Math.max(1, finishedAt - run.startedAt),
    };
    report(snapshot(run), content);
    return { run, content };
  };

  const addWarning = (w: string) => {
    const clean = w.trim();
    if (!clean) return;
    if (!run.warning) run.warning = clean;
    else if (!run.warning.includes(clean)) run.warning = `${run.warning} · ${clean}`;
  };

  try {
    signal.throwIfAborted();

    /* ---------------------------------------------------------------------- */
    /* CHAT-ONLY MODE (Home Chat Page - unchanged behavior)                   */
    /* ---------------------------------------------------------------------- */
    if (mode === "chat") {
      const customSystem = settings.systemPrompt?.trim();
      const homepageChatCodingInstruction = `=== SUJITH IDE AI AGENT CORE INSTRUCTION ===
You are the primary AI intelligence and software engineering agent in SUJITH IDE Homepage Chat.
You excel at natural conversational chat, answering general knowledge and complex domain questions, writing production-grade code, debugging actual issues, and designing full mobile and web applications.

DYNAMIC INTENT HANDLING RULES:
1. GENERAL QUESTIONS & CONVERSATIONAL INQUIRIES:
   - For all general inquiries (e.g. "Best chess player", "What is AI?", "Explain quantum computing", "Hello", world history, science, arts, philosophy, concepts, or advice):
     • Provide direct, clear, engaging, and comprehensive answers in a modern conversational style (like ChatGPT / Claude / Gemini).
     • NEVER output technical debugging headings like "ROOT CAUSE" or "FIX" for general knowledge questions or conversations.
     • Answer directly in the language the user addresses you in (English, Tamil, Tanglish, or any other language).

2. CODING & ALGORITHM REQUESTS:
   - When the user asks to write, generate, or explain code (e.g. "Write a Python calculator", "Create a binary search in C++", "Implement a linked list"):
     • Provide a concise explanation of the approach.
     • Provide the complete, unabridged, production-ready code with full imports, error handling, input validation, and clear comments.
     • NEVER use placeholder stubs, '// TODO', '// implement here', or fake stubs.
     • Include runnable example usage, testing instructions, and time/space complexity notes.

3. DEBUGGING & ERROR RESOLUTION:
   - When the user provides an actual bug, error message, stack trace, or asks to fix broken code (e.g. "Fix this JavaScript error"):
     • Diagnose the actual failure mechanism and explain WHY the error occurs in plain, technically precise terms.
     • Provide the corrected code with the fix clearly highlighted.
     • Explain defensive coding patterns to prevent regressions.

4. MOBILE & APPLICATION DEVELOPMENT:
   - When the user asks to build an Android app or software application:
     • Provide real, complete project structure and source code (e.g., MainActivity.kt, layout/compose UI, AndroidManifest.xml, build.gradle.kts).
     • Include step-by-step instructions for running in Android Studio or building an APK.

5. EXECUTION & TRUTHFULNESS:
   - Be completely honest about execution: never fabricate test results, fake terminal banners, or claim runtime execution if running without attached live execution tools.`;

      const baseSystem = `You are ${model.name} (${model.companyName}) in Homepage Chat mode. Have natural, helpful conversations, answer general questions, explain concepts, and reply in whatever language the user uses (including English, Tamil, or Tanglish).\n\n${homepageChatCodingInstruction}`;
      const system = customSystem
        ? `${baseSystem}\n\n[USER CUSTOM SYSTEM INSTRUCTIONS]\n${customSystem}`
        : baseSystem;
      const textAttachments = attachments.filter((a) => a.text);
      const attachedContext = textAttachments
        .map((a) => `\n\n[Attached file: ${a.name}]\n${a.text}`)
        .join("");

      const conversationMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: system },
        ...history.slice(-20),
        { role: "user", content: `${prompt}${attachedContext}` },
      ];

      let passText = "";
      let passIn = conversationMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
      let passOut = 0;
      const passStartedAt = Date.now();
      let passFirstTokenAt = 0;
      let thinkingFinalized = false;
      const requestMaxTokens = Math.max(settings.maxTokens || 16384, 16384);

      try {
        passText = await streamGatewayChat({
          model,
          messages: conversationMessages,
          attachments,
          conversationId,
          temperature: settings.temperature,
          maxTokens: requestMaxTokens,
          deepSearch,
          signal,
          onDelta: (partial) => {
            passText = partial;
            if (!passFirstTokenAt && partial.length > 0) {
              passFirstTokenAt = Date.now();
              if (typeof run.ttftMs !== "number") {
                run.ttftMs = Math.max(1, passFirstTokenAt - passStartedAt);
              }
              if (!thinkingFinalized) {
                thinkingFinalized = true;
                run = {
                  ...run,
                  steps: run.steps
                    .map((step) =>
                      step.id === "thinking"
                        ? { ...step, status: "complete" as const, finishedAt: passFirstTokenAt, detail: `Planned response with ${model.name}.` }
                        : step
                    )
                    .concat({
                      id: "writing",
                      label: `Generating with ${model.name}`,
                      detail: "Streaming live via NoTrack.ai.",
                      status: "running" as const,
                      startedAt: passFirstTokenAt,
                    }),
                };
              }
            }
            run.streamedTokens = estimateTokens(partial);
            run.latencyMs = Math.max(1, Date.now() - run.startedAt);
            onStreamText(partial);
            report(snapshot(run), partial);
          },
          onSearch: (searchState) => {
            run = { ...run, search: searchState };
            report(snapshot(run), passText);
          },
          onWarning: (w) => {
            addWarning(w);
            report(snapshot(run), passText);
          },
          onMeta: (meta) => {
            if (typeof meta.inputTokens === "number") passIn = meta.inputTokens;
            if (typeof meta.outputTokens === "number") passOut = meta.outputTokens;
            if (typeof meta.streamedTokens === "number") run.streamedTokens = meta.streamedTokens;
            if (typeof meta.ttftMs === "number") run.ttftMs = meta.ttftMs;
            if (typeof meta.latencyMs === "number") run.latencyMs = meta.latencyMs;
            if (meta.actualModel) run.actualModel = meta.actualModel;
            if (meta.usedProvider) {
              run.usedProvider = meta.usedProvider;
              run.modelName = model.name;
              run.companyName = model.companyName;
              run.company = model.company;
            }
            run.inputTokens = passIn;
            run.outputTokens = passOut;
            report(snapshot(run), passText);
          },
        });
      } catch (err) {
        if (signal.aborted || (err instanceof DOMException && err.name === "AbortError")) throw err;
        if (err instanceof BackendRequestError && err.detail) {
          run.errorDetail = err.detail;
        }
        throw err;
      }

      const finalOut = passOut || estimateTokens(passText);
      run = {
        ...run,
        inputTokens: passIn,
        outputTokens: finalOut,
        streamedTokens: finalOut,
        steps: run.steps.map((step) =>
          step.status === "running" ? { ...step, status: "complete" as const, finishedAt: Date.now() } : step
        ),
      };
      recordLocalUsage({
        engine: model.name,
        modelId: model.officialModelId ?? model.id,
        inputTokens: passIn,
        outputTokens: finalOut,
      });
      return finish(passText, "complete");
    }

    /* ---------------------------------------------------------------------- */
    /* AUTONOMOUS BUILDER AGENT MODE                                          */
    /* ---------------------------------------------------------------------- */
    const targetMode = detectBuildTarget(prompt, settings.buildTarget, files);
    const android = targetMode === "android";
    const enforceReactVite = shouldEnforceReactVite(prompt, files, targetMode);
    const customSystem = settings.systemPrompt?.trim();
    const textAttachments = attachments.filter((a) => a.text);
    const totalWorkspaceLines = files.reduce((sum, f) => sum + f.content.split("\n").length, 0);

    const readingSteps: BuildStep[] =
      files.length > 0 || textAttachments.length > 0
        ? [
            {
              id: "reading",
              label: files.length > 0 ? "Read files" : "Reading attachments",
              detail:
                files.length > 0
                  ? `Loaded ${files.length} file${files.length === 1 ? "" : "s"} (${totalWorkspaceLines} lines)${textAttachments.length ? ` · ${textAttachments.length} attachment(s)` : ""}`
                  : `Loaded ${textAttachments.length} text attachment(s)`,
              status: "complete",
              startedAt: run.startedAt,
              finishedAt: Date.now(),
            },
          ]
        : [];

    run = {
      ...run,
      plan: android
        ? [
            "Inspect workspace and target native Android Studio / Flutter stack",
            "Write modular screens, viewmodels, resources, manifest, and Gradle scripts via tool calls",
            "Verify native syntax, manifest, and Gradle configuration",
          ]
        : [
            "Inspect workspace and architecture with autonomous tool calls",
            enforceReactVite
              ? "Generate cohesive Vite + React + TypeScript + Tailwind CSS modules"
              : "Generate complete runnable modules in requested stack",
            "Verify multi-file TypeScript compilation and isolated browser preview",
          ],
      steps: [...readingSteps, ...run.steps],
    };
    report(snapshot(run), "");

    const workspaceMap = new Map<string, WorkspaceFile>(files.map((f) => [f.path, { ...f }]));
    const fileEntries = new Map<string, BuildFileEntry>();
    let latestServerChecks: BuildCheck[] = [];
    let streamedProse = "";

    const getWorkspaceList = () => mergeWorkspaceFiles([], [...workspaceMap.values()]);

    const syncRunFiles = () => {
      run = {
        ...run,
        files: [...fileEntries.values()],
      };
    };

    const upsertStep = (incoming: BuildStep) => {
      const steps = [...run.steps];
      let matchIdx = -1;
      for (let i = steps.length - 1; i >= 0; i -= 1) {
        const s = steps[i];
        if (s.id === incoming.id && s.startedAt === incoming.startedAt && s.toolName === incoming.toolName) {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx === -1 && incoming.status !== "running") {
        for (let i = steps.length - 1; i >= 0; i -= 1) {
          const s = steps[i];
          if (s.status === "running" && s.id === incoming.id && s.toolName === incoming.toolName) {
            matchIdx = i;
            break;
          }
        }
      }
      // Replace initial placeholder "thinking" step cleanly
      if (matchIdx === -1 && incoming.id === "thinking") {
        const placeholderIdx = steps.findIndex((s) => s.id === "thinking" && s.status === "running");
        if (placeholderIdx !== -1) matchIdx = placeholderIdx;
      }

      if (matchIdx >= 0) {
        steps[matchIdx] = { ...steps[matchIdx], ...incoming };
      } else {
        steps.push(incoming);
      }
      run = { ...run, steps };
    };

    const runAgentPass = async (passPrompt: string, passHistory: { role: "user" | "assistant"; content: string }[], includeAttachments: boolean) => {
      let passProse = "";
      try {
        const completion = await streamBuilderAgent({
          model,
          conversationId,
          prompt: passPrompt,
          history: passHistory,
          files: getWorkspaceList().map((f) => ({ path: f.path, content: f.content })),
          attachments: includeAttachments ? attachments : [],
          targetMode,
          enforceReactVite,
          temperature: settings.temperature,
          maxTokens: Math.max(settings.maxTokens || 16384, 16384),
          customSystem,
          signal,
          onMeta: (meta) => {
            if (typeof meta.inputTokens === "number") run.inputTokens = meta.inputTokens;
            if (typeof meta.outputTokens === "number") run.outputTokens = meta.outputTokens;
            if (typeof meta.streamedTokens === "number") run.streamedTokens = meta.streamedTokens;
            if (typeof meta.ttftMs === "number" && typeof run.ttftMs !== "number") run.ttftMs = meta.ttftMs;
            if (typeof meta.latencyMs === "number") run.latencyMs = meta.latencyMs;
            if (meta.actualModel) run.actualModel = meta.actualModel;
            if (meta.usedProvider) {
              run.usedProvider = meta.usedProvider;
              run.modelName = model.name;
              run.companyName = model.companyName;
              run.company = model.company;
            }
            report(snapshot(run), stripCodeFiles(streamedProse));
          },
          onWarning: (w) => {
            addWarning(w);
            report(snapshot(run), stripCodeFiles(streamedProse));
          },
          onStep: (step) => {
            upsertStep(step);
            run.latencyMs = Math.max(1, Date.now() - run.startedAt);
            report(snapshot(run), stripCodeFiles(streamedProse));
          },
          onFileSaved: (saved) => {
            const nextFile: WorkspaceFile = {
              path: saved.path,
              content: saved.content,
              language: saved.language || languageForPath(saved.path),
              updatedAt: Date.now(),
            };
            workspaceMap.set(saved.path, nextFile);
            fileEntries.set(saved.path, {
              path: saved.path,
              action: saved.action,
              status: "saved",
            });
            syncRunFiles();
            // Incremental auto-save directly to React + localStorage
            commit(getWorkspaceList(), { isFinal: false });
            report(snapshot(run), stripCodeFiles(streamedProse));
          },
          onFileDeleted: (deletedPath) => {
            workspaceMap.delete(deletedPath);
            fileEntries.set(deletedPath, {
              path: deletedPath,
              action: "deleted",
              status: "saved",
            });
            syncRunFiles();
            commit(getWorkspaceList(), { isFinal: false });
            report(snapshot(run), stripCodeFiles(streamedProse));
          },
          onChecks: (serverChecks) => {
            latestServerChecks = serverChecks;
            run = { ...run, checks: serverChecks };
            report(snapshot(run), stripCodeFiles(streamedProse));
          },
          onDelta: (delta) => {
            passProse += delta;
            streamedProse = passProse;
            const visible = stripCodeFiles(streamedProse);
            onStreamText(visible);
            run.latencyMs = Math.max(1, Date.now() - run.startedAt);
            report(snapshot(run), visible);
          },
        });
        return completion;
      } catch (err) {
        if (signal.aborted || (err instanceof DOMException && err.name === "AbortError")) throw err;
        if (err instanceof BackendRequestError && err.detail) {
          run.errorDetail = err.detail;
        }
        throw err;
      }
    };

    const mainResult = await runAgentPass(prompt, history.slice(-8), true);
    let summaryText = mainResult.summary || stripCodeFiles(streamedProse);

    let merged = getWorkspaceList();
    let allChecks: BuildCheck[] = [];

    if (merged.length > 0) {
      const MAX_PREVIEW_REPAIRS = 2;

      for (let attempt = 0; attempt <= MAX_PREVIEW_REPAIRS; attempt += 1) {
        const sourceChecks = checkSource(merged, { target: targetMode, enforceReactVite });

        if (!latestServerChecks.length) {
          const serverCheck = await verifyWorkspaceOnServer(
            merged.map((f) => ({ path: f.path, content: f.content })),
            signal,
            { targetMode, enforceReactVite }
          );
          if (serverCheck.checkedFiles > 0) {
            const errs = serverCheck.diagnostics.filter((d) => d.severity === "error");
            latestServerChecks = [
              {
                name: "Compiler verification",
                passed: errs.length === 0,
                detail: errs.length
                  ? errs.slice(0, 5).map((e) => `${e.path}:${e.line} ${e.message}`).join(" | ")
                  : `Verified ${serverCheck.checkedFiles} file(s) with backend compiler.`,
              },
            ];
          }
        }

        let previewChecks: BuildCheck[] = [];
        if (!android && settings.interactionChecks && previewDocument(merged)) {
          const previewStart = Date.now();
          upsertStep({
            id: "preview",
            toolName: "preview_check",
            label: "Checking live preview",
            detail: "Mounting preview in isolated iframe and testing interactions.",
            status: "running",
            startedAt: previewStart,
          });
          report(snapshot(run), summaryText);

          previewChecks = await checkPreview(merged, "imported", signal);
          const previewFailed = previewChecks.filter((c) => !c.passed);

          upsertStep({
            id: "preview",
            toolName: "preview_check",
            label: "Checking live preview",
            detail: previewFailed.length
              ? `${previewFailed.length} preview check(s) failed: ${previewFailed.map((c) => c.name).join(", ")}`
              : `${previewChecks.length} live preview checks passed.`,
            status: "complete",
            startedAt: previewStart,
            finishedAt: Date.now(),
          });
        }

        // Merge compiler checks + unique source checks + preview checks
        const seenNames = new Set<string>();
        allChecks = [...latestServerChecks, ...sourceChecks, ...previewChecks].filter((c) => {
          if (seenNames.has(c.name)) return false;
          seenNames.add(c.name);
          return true;
        });

        run = { ...run, checks: allChecks };
        const failedChecks = allChecks.filter((c) => !c.passed);

        if (!failedChecks.length || attempt === MAX_PREVIEW_REPAIRS) {
          break;
        }

        // Targeted repair loop for browser preview / structural errors
        const failureSummary = failedChecks.map((c) => `- ${c.name}: ${c.detail || "Failed"}`).join("\n");
        const repairPrompt =
          `Automated verification and live browser preview checks found these issues in the workspace:\n${failureSummary}\n\n` +
          `Use read_file to inspect the relevant files, fix every error with edit_file / write_file / delete_file, then call run_checks and finish_build.`;

        latestServerChecks = [];
        const repairResult = await runAgentPass(repairPrompt, [], false);
        if (repairResult.summary) summaryText = repairResult.summary;
        merged = getWorkspaceList();
      }

      const saveStart = Date.now();
      upsertStep({
        id: "saving",
        label: "Workspace saved",
        detail: `Verified and saved ${merged.length} file${merged.length === 1 ? "" : "s"}.`,
        status: "running",
        startedAt: saveStart,
      });
      report(snapshot(run), summaryText);

      commit(merged, { isFinal: true });
      void syncWorkspaceToServer(
        conversationId,
        merged.map((f) => ({ path: f.path, content: f.content })),
        [],
        true
      );

      upsertStep({
        id: "saving",
        label: "Workspace saved",
        detail: `Verified and saved ${merged.length} file${merged.length === 1 ? "" : "s"}.`,
        status: "complete",
        startedAt: saveStart,
        finishedAt: Date.now(),
      });
    }

    const totalIn = run.inputTokens ?? estimateTokens(prompt);
    const totalOut = run.outputTokens ?? estimateTokens(summaryText);
    recordLocalUsage({
      engine: model.name,
      modelId: model.officialModelId ?? model.id,
      inputTokens: totalIn,
      outputTokens: totalOut,
    });

    const visibleSummary =
      summaryText?.trim() ||
      (merged.length > 0
        ? `Built ${fileEntries.size || merged.length} workspace file${(fileEntries.size || merged.length) === 1 ? "" : "s"} with ${model.name}.`
        : "Build completed.");

    return finish(visibleSummary, "complete");
  } catch (error) {
    const stopped = signal.aborted || (error instanceof DOMException && error.name === "AbortError");
    const message = stopped
      ? "Generation stopped."
      : error instanceof Error
        ? error.message
        : "The model request could not be completed.";
    run = {
      ...run,
      files: run.files.map((file) => (file.status === "writing" ? { ...file, status: "failed" } : file)),
      steps: run.steps.map((step) =>
        step.status === "running" ? { ...step, status: "failed", detail: message, finishedAt: Date.now() } : step
      ),
      checks: error instanceof BuildValidationError ? [...run.checks, ...error.checks] : run.checks,
    };
    return finish(message, stopped ? "stopped" : "failed");
  }
}
