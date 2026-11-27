import { analyzeRequest, compilePlan } from "./src/lib/localCompiler.ts";
import { executeBuild } from "./src/lib/buildPipeline.ts";
import { checkSource, checkPreview } from "./src/lib/validation.ts";
import { DEFAULT_SETTINGS } from "./src/lib/types.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Run from the browser console on the Vite dev server. No network model mocks. */
export async function runLocalBuildChecks() {
  const results = [];
  for (const prompt of [
    "Build a task manager named Focus",
    "Build a calculator",
    "Build ai chat",
    "Build a portfolio website called Aditi",
    "Build a restaurant website",
    "Build a landing page called North",
  ]) {
    const plan = analyzeRequest(prompt, [], []);
    const files = compilePlan(plan, [], []);
    const source = checkSource(files);
    const runtime = await checkPreview(files, plan.spec?.kind ?? "imported");
    assert(files.length === 4, `${prompt}: expected four project files.`);
    assert([...source, ...runtime].every((check) => check.passed), `${prompt}: a source or browser check failed.`);
    results.push({ prompt, files: files.length, checks: source.length + runtime.length });
  }

  const files = compilePlan(analyzeRequest("Build a task manager named Focus", [], []), [], []);
  let committed;
  const edited = await executeBuild({
    prompt: "Change to dark theme and rename to Lantern",
    files,
    attachments: [],
    settings: DEFAULT_SETTINGS,
    signal: new AbortController().signal,
    report: () => {},
    onDraft: () => {},
    commit: (output) => { committed = output; },
  });
  assert(edited.run.status === "complete", "A supported edit should complete.");
  assert(committed.some((file) => file.path === "index.html" && file.content.includes("<title>Lantern</title>")), "Rename was not written to HTML.");
  assert(committed.some((file) => file.path === "styles.css" && file.content.includes("--page:#11151c")), "Dark theme was not written to CSS.");
  assert(edited.run.steps.every((step) => step.status === "complete"), "Completed steps must correspond to finished operations.");

  let invalidCommitted = false;
  const invalid = await executeBuild({
    prompt: "Import the attached source",
    files: committed,
    attachments: [{ id: "invalid-source", name: "app.js", size: 10, type: "text/javascript", text: "function {" }],
    settings: DEFAULT_SETTINGS,
    signal: new AbortController().signal,
    report: () => {},
    onDraft: () => {},
    commit: () => { invalidCommitted = true; },
  });
  assert(invalid.run.status === "failed" && !invalidCommitted, "Invalid code must not overwrite the saved project.");
  assert(invalid.run.checks.some((check) => !check.passed), "A syntax failure must be recorded as a failed check.");

  const abort = new AbortController();
  abort.abort();
  let cancelledCommitted = false;
  const cancelled = await executeBuild({
    prompt: "Build a calculator",
    files,
    attachments: [],
    settings: DEFAULT_SETTINGS,
    signal: abort.signal,
    report: () => {},
    onDraft: () => {},
    commit: () => { cancelledCommitted = true; },
  });
  assert(cancelled.run.status === "stopped" && !cancelledCommitted, "Cancellation must not save files.");

  const unsupported = analyzeRequest("Build a banking app with payments", files, []);
  assert(unsupported.action === "help", "Unsupported integrations must not be presented as implemented.");
  return { passed: true, projects: results, supportedEdits: true, syntaxRollback: true, cancellation: true, unsupportedRequests: true };
}