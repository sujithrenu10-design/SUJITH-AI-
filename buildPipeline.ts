import { analyzeRequest, compilePlan, describeProject, validateLocalEdit } from "./localCompiler";
import { generateOnDevice } from "./onDeviceAI";
import { checkPreview, checkSource, BuildValidationError } from "./validation";
import { createAndroidSources, extractWorkspaceFiles, mergeWorkspaceFiles } from "./workspace";
import { isAndroidBuildRequest, isBuildRequest, stripCodeFiles, WEB_BUILDER_RULE, ANDROID_BUILDER_RULE } from "./builder";
import { makeId, type AppSettings, type Attachment, type BuildRun, type WorkspaceFile } from "./types";

const paint = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export async function executeBuild({
  prompt,
  files,
  attachments,
  settings,
  signal,
  report,
  commit,
  onDraft,
}: {
  prompt: string;
  files: WorkspaceFile[];
  attachments: Attachment[];
  settings: AppSettings;
  signal: AbortSignal;
  report: (run: BuildRun) => void;
  commit: (files: WorkspaceFile[]) => Promise<void> | void;
  onDraft: (content: string) => void;
}): Promise<{ run: BuildRun; content: string }> {
  let run: BuildRun = { id: makeId("run"), status: "running", engine: settings.engine, startedAt: Date.now(), steps: [], files: [], checks: [], retryPrompt: prompt };
  const emit = () => report({ ...run, steps: run.steps.map((step) => ({ ...step })), files: [...run.files], checks: [...run.checks] });
  const updateDetail = (detail: string) => {
    run = { ...run, steps: run.steps.map((step, index) => index === run.steps.length - 1 ? { ...step, detail } : step) };
    emit();
  };

  async function phase<T>(id: string, label: string, detail: string, action: () => T | Promise<T>) {
    signal.throwIfAborted();
    run = { ...run, steps: [...run.steps, { id, label, detail, status: "running", startedAt: Date.now() }] };
    emit();
    await paint();
    signal.throwIfAborted();
    const result = await action();
    signal.throwIfAborted();
    run = { ...run, steps: run.steps.map((step) => step.id === id ? { ...step, status: "complete", finishedAt: Date.now() } : step) };
    emit();
    return result;
  }

  function finish(content: string, status: BuildRun["status"] = "complete") {
    run = { ...run, status, finishedAt: Date.now() };
    emit();
    return { run, content };
  }

  try {
    const plan = await phase("thinking", "Thinking", "Inspecting the request and available build actions.", () => analyzeRequest(prompt, files, attachments));
    await phase("reading", "Reading the code", `Reading ${files.length} project files and ${attachments.length} attachments.`, () => {
      const lines = files.reduce((total, file) => total + file.content.split("\n").length, 0);
      run = {
        ...run,
        steps: run.steps.map((step) => (step.id === "reading" ? { ...step, label: "Read files" } : step)),
      };
      updateDetail(files.length ? `Read ${files.length} files, ${lines.toLocaleString()} lines. ${files.slice(0, 3).map((file) => file.path).join(", ")}${files.length > 3 ? ", ..." : ""}` : attachments.length ? `Read ${attachments.filter((file) => file.text !== undefined).length} text attachments. Image inference is not part of the local compiler.` : "New workspace. No existing source files to read.");
    });

    if (settings.engine === "local" && plan.action === "help") return finish(plan.explanation ?? "Please describe the app you want to build.", "needs-input");
    if (settings.engine === "local" && plan.action === "review") return finish(describeProject(files));

    const android = isAndroidBuildRequest(prompt);
    await phase("planning", "Making a plan", "Preparing the build operations.", () => {
      run = { ...run, plan: settings.engine === "local" ? [...plan.items, ...(android ? ["Create an Android Studio WebView source project. APK compilation is not available in a browser."] : [])] : ["Read the current source and request code from the on-device model.", "Parse only complete file blocks.", "Validate output before replacing any saved files."] };
      updateDetail(`${run.plan!.length} build actions prepared from the request.`);
    });

    let response = "";
    const generated = await phase("writing", files.length ? "Editing files" : "Writing code", settings.engine === "local" ? "Generating source files with the local compiler." : "Loading the optional code model. The first download can take several minutes.", async () => {
      let next: WorkspaceFile[];
      if (settings.engine === "on-device") {
        const context = files.map((file) => `\n### ${file.path}\n${file.content}`).join("\n");
        const attached = attachments.filter((file) => file.text).map((file) => `\n### ${file.name}\n${file.text}`).join("\n");
        response = await generateOnDevice({
          prompt: `${prompt}\n\n${context ? "CURRENT PROJECT\n" + context : ""}${attached}`.slice(0, 16000),
          system: `You are a careful software engineer. Never claim to execute code or compile APKs. ${android ? ANDROID_BUILDER_RULE : WEB_BUILDER_RULE}`,
          signal,
          onProgress: updateDetail,
          onText: onDraft,
        });
        const parsed = extractWorkspaceFiles(response, android);
        if (!parsed.length && isBuildRequest(prompt, files.length > 0)) throw new Error("The model did not return any complete source files. Nothing was saved. Try a smaller request or use Local builder.");
        if (!parsed.length) return [];
        next = mergeWorkspaceFiles(files, parsed);
      } else {
        next = compilePlan(plan, files, attachments);
        validateLocalEdit(plan, files, next);
        if (android && plan.action === "create") next = [...next, ...createAndroidSources(plan.spec?.title ?? "My App", next)];
      }

      const changed = next.filter((file) => files.find((previous) => previous.path === file.path)?.content !== file.content);
      run = { ...run, files: changed.map((file) => ({ path: file.path, action: files.some((previous) => previous.path === file.path) ? "edited" : "created" })) };
      updateDetail(changed.length ? `${changed.length} file${changed.length === 1 ? "" : "s"} written in memory. Saved files are unchanged until checks pass.` : "No source changes returned.");
      return next;
    });

    if (!generated.length) return finish(stripCodeFiles(response));
    if (!run.files.length) return finish("The requested change produced no source differences. The existing project is unchanged.", "needs-input");

    await phase("syntax", "Checking files", "Parsing JavaScript, JSON, XML, and local file references.", () => {
      const checks = checkSource(generated);
      run = { ...run, checks: [...run.checks, ...checks] };
      updateDetail(`${checks.filter((check) => check.passed).length} source checks passed.`);
    });

    await phase("checking", "Checking files", "Running checks and isolated preview tests.", async () => {
      if (settings.interactionChecks && generated.some((file) => file.path === "index.html")) {
        const checks = await checkPreview(generated, settings.engine === "local" ? plan.spec?.kind ?? "imported" : "imported", signal);
        run = { ...run, checks: [...run.checks, ...checks] };
        updateDetail(`${checks.filter((check) => check.passed).length} browser checks passed.${plan.spec?.kind === "chat" ? " Model download was not run; AI is opt-in." : ""}`);
      }
    });

    await phase("saving", "Working", settings.autoSave ? "Writing checked source files to this device." : "Updating this session. Auto-save is turned off.", async () => {
      await commit(generated);
      updateDetail(settings.autoSave ? `${generated.length} files saved on this device.` : `${generated.length} files available in this session only.`);
    });

    const parts = [files.length ? `Updated ${run.files.length} file${run.files.length === 1 ? "" : "s"} in your project.` : `Built ${plan.spec?.kind === "tasks" ? "a working task manager" : plan.spec?.kind === "calculator" ? "a working calculator" : plan.spec?.kind === "chat" ? "an AI chat application" : "your website"}.`, "Open Preview to use it, or Files to edit the source."];
    if (settings.engine === "local" && plan.spec?.kind !== "chat") parts.push("Source generated and checked locally. No cloud model was called.");
    if (plan.spec?.kind === "chat") parts.push("AI replies require WebGPU and a one-time model download from inside the chat. These checks covered the interface, not AI inference.");
    if (android) parts.push("Android Studio source was generated, not an APK. Android compilation and signing must be performed in Android Studio.");
    if (!settings.interactionChecks) parts.push("Browser interaction checks are turned off; only source checks were run.");
    return finish(parts.join("\n\n"));
  } catch (error) {
    const stopped = signal.aborted || (error instanceof DOMException && error.name === "AbortError");
    const text = stopped ? "Build stopped. The previous saved project is unchanged." : error instanceof Error ? error.message : "This operation could not finish. The previous project is unchanged.";
    run = {
      ...run,
      steps: run.steps.map((step) => step.status === "running" ? { ...step, status: "failed", detail: text, finishedAt: Date.now() } : step),
      checks: error instanceof BuildValidationError ? [...run.checks, ...error.checks] : run.checks,
    };
    return finish(text, stopped ? "stopped" : "failed");
  }
}
