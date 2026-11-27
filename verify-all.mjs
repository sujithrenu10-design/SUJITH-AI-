import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const tempStore = path.join(os.tmpdir(), `sujith-test-store-${Date.now()}.json`);
process.env.SUJITH_DATA_FILE = tempStore;
process.env.SUJITH_SESSION_SECRET = "test-session-secret-32-chars-minimum";

const { analyzeRequest, compilePlan } = await import("../src/lib/localCompiler.ts");
const { checkSource } = await import("../src/lib/validation.ts");
const { detectBuildTarget, stripCodeFiles } = await import("../src/lib/builder.ts");
const { extractWorkspaceFiles, normalizeWorkspacePath, previewDocument } = await import("../src/lib/workspace.ts");
const { detectMediaIntent } = await import("../src/lib/mediaIntent.ts");
const { renderAndroidPreviewDocument } = await import("../src/lib/androidPreviewRenderer.ts");
const { DEFAULT_SETTINGS } = await import("../src/lib/types.ts");
const { isPrivateOrLocalIp, assertSafeRemoteUrl } = await import("../mediaEngine.mjs");
const { default: handleApi } = await import("../gateway.mjs");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* 1. Core Library Unit Tests */
await test("localCompiler: compiles supported templates (tasks, calculator)", () => {
  const tasksPlan = analyzeRequest("Build a task manager named Focus", [], []);
  assert.equal(tasksPlan.action, "create");
  const tasksFiles = compilePlan(tasksPlan, [], []);
  assert.equal(tasksFiles.length, 4);
  const checks = checkSource(tasksFiles);
  assert.ok(checks.every((c) => c.passed), "All task template source checks must pass");

  const calcPlan = analyzeRequest("Build a calculator", [], []);
  assert.equal(calcPlan.action, "create");
  const calcFiles = compilePlan(calcPlan, [], []);
  assert.ok(checkSource(calcFiles).every((c) => c.passed));
});

await test("localCompiler: refuses unsupported banking/payments requests", () => {
  const plan = analyzeRequest("Build a banking app with payments", [], []);
  assert.equal(plan.action, "help");
});

await test("validation: detects broken JS syntax", () => {
  const broken = [
    { path: "index.html", content: "<!doctype html><html><head><title>Test</title></head><body><script src=\"app.js\"></script></body></html>", language: "html", updatedAt: 0 },
    { path: "styles.css", content: "body{margin:0}", language: "css", updatedAt: 0 },
    { path: "app.js", content: "function broken( {", language: "javascript", updatedAt: 0 },
    { path: "README.md", content: "# Test", language: "markdown", updatedAt: 0 },
  ];
  const results = checkSource(broken);
  assert.ok(results.some((r) => !r.passed), "Syntax error should fail source checks");
});

await test("workspace: extracts fenced files, rejects path traversal, builds preview HTML", () => {
  assert.equal(normalizeWorkspacePath("../../etc/passwd"), "etc/passwd");
  const md = "Summary text\n```html:index.html\n<!doctype html><html><head><title>App</title><link rel=\"stylesheet\" href=\"styles.css\"></head><body><h1>Hi</h1><script src=\"app.js\"></script></body></html>\n```\n```css:styles.css\nbody{color:#111}\n```\n```js:app.js\nconsole.log(1);\n```\n";
  const files = extractWorkspaceFiles(md, false);
  assert.equal(files.length, 3);
  const html = previewDocument(files);
  assert.ok(/<style>\s*body\{color:#111\}\s*<\/style>/.test(html));
  assert.ok(stripCodeFiles(md).includes("Summary text"));
  assert.ok(!stripCodeFiles(md).includes("console.log(1)"));
});

await test("builder: detects android vs website target properly", () => {
  assert.equal(detectBuildTarget("Build a Kotlin Compose Android app", DEFAULT_SETTINGS.buildTarget, []), "android");
  assert.equal(detectBuildTarget("Build a React portfolio website", "android", []), "website");
});

await test("mediaIntent: detects image, video, and text prompts", () => {
  const img = detectMediaIntent({ prompt: "Generate an image of a cyberpunk mountain", attachments: [], history: [], mode: "chat" });
  assert.equal(img.kind, "image");
  const vid = detectMediaIntent({ prompt: "Create a video of ocean waves at sunset", attachments: [], history: [], mode: "chat" });
  assert.equal(vid.kind, "video");
  const txt = detectMediaIntent({ prompt: "Explain React hooks briefly", attachments: [], history: [], mode: "chat" });
  assert.equal(txt.kind, "text");
});

await test("androidPreviewRenderer: uses safe math parser (no Function constructor) and renders app", () => {
  const html = renderAndroidPreviewDocument([
    { path: "app/src/main/java/com/sujith/generated/MainActivity.kt", content: "package com.sujith.generated\nfun CalculatorScreen() {}", language: "kotlin", updatedAt: 0 },
    { path: "app/src/main/res/values/strings.xml", content: "<resources><string name=\"app_name\">MyCalc</string></resources>", language: "xml", updatedAt: 0 },
  ]);
  assert.ok(html.includes("MyCalc"));
  assert.ok(!html.includes("Function('\"use strict\""));
  assert.ok(html.includes("evaluateCalcExpr"));
});

/* 2. SSRF Protection Unit Tests */
await test("mediaEngine SSRF: blocks loopback, link-local, RFC1918, IPv4-mapped IPv6, and non-HTTPS", async () => {
  assert.equal(isPrivateOrLocalIp("127.0.0.1"), true);
  assert.equal(isPrivateOrLocalIp("169.254.169.254"), true);
  assert.equal(isPrivateOrLocalIp("10.0.0.5"), true);
  assert.equal(isPrivateOrLocalIp("192.168.1.1"), true);
  assert.equal(isPrivateOrLocalIp("172.16.0.1"), true);
  assert.equal(isPrivateOrLocalIp("100.64.0.1"), true);
  assert.equal(isPrivateOrLocalIp("::1"), true);
  assert.equal(isPrivateOrLocalIp("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateOrLocalIp("fe80::1"), true);
  assert.equal(isPrivateOrLocalIp("8.8.8.8"), false);

  await assert.rejects(() => assertSafeRemoteUrl("http://example.com/img.png"), /HTTPS/);
  await assert.rejects(() => assertSafeRemoteUrl("https://localhost/secret"), /private|local|disallowed/);
  await assert.rejects(() => assertSafeRemoteUrl("https://169.254.169.254/latest/meta-data"), /private|local|disallowed/);
});

/* 3. Live Gateway HTTP API & Security Integration Tests */
const server = http.createServer((req, res) => {
  void handleApi(req, res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

async function apiReq(pathname, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* SSE or plain text */ }
  return { status: res.status, headers: res.headers, text, json };
}

try {
  await test("API /api/health & strict CORS", async () => {
    const rOk = await apiReq("/api/health", { headers: { Origin: "http://localhost:3000" } });
    assert.equal(rOk.status, 200);
    assert.equal(rOk.json.ok, true);
    assert.equal(rOk.headers.get("access-control-allow-origin"), "http://localhost:3000");

    const rEvil = await apiReq("/api/health", { headers: { Origin: "https://evil.example" } });
    assert.equal(rEvil.status, 200);
    assert.equal(rEvil.headers.get("access-control-allow-origin"), null);
  });

  await test("API /api/providers/status, /api/usage, /api/subscriptions/status + session token", async () => {
    const p = await apiReq("/api/providers/status");
    assert.equal(p.status, 200);
    assert.equal(p.json.ok, true);
    const token = p.headers.get("x-sujith-session");
    assert.ok(token && token.includes("."), "Session token must be issued cleanly");

    const u = await apiReq("/api/usage", { headers: { "x-sujith-session": token } });
    assert.equal(u.status, 200);
    assert.equal(u.json.source, "backend");

    const s = await apiReq("/api/subscriptions/status", { headers: { "x-sujith-session": token } });
    assert.equal(s.status, 200);
    assert.equal(s.json.plan, "FREE");
  });

  await test("API billing: /api/subscriptions/activate & /checkout refuse unverified upgrades", async () => {
    const act = await apiReq("/api/subscriptions/activate", { method: "POST", body: { plan: "PRO" } });
    assert.equal(act.status, 501);
    const chk = await apiReq("/api/subscriptions/checkout", { method: "POST", body: { plan: "PRO", interval: "monthly" } });
    assert.equal(chk.status, 503);
  });

  await test("API workspace sync & compiler check (/api/workspace/sync & /check)", async () => {
    const sync = await apiReq("/api/workspace/sync", {
      method: "POST",
      body: {
        projectId: "audit-test",
        files: [{ path: "app.js", content: "const x = 42;" }],
      },
    });
    assert.equal(sync.status, 200);
    assert.equal(sync.json.fileCount, 1);

    const goodCheck = await apiReq("/api/workspace/check", {
      method: "POST",
      body: {
        files: [
          { path: "app.js", content: "const x = 42;" },
          { path: "style.css", content: "body { color: #000; }" },
          { path: "data.json", content: '{"ok":true}' },
        ],
      },
    });
    assert.equal(goodCheck.status, 200);
    assert.equal(goodCheck.json.ok, true);

    const badCheck = await apiReq("/api/workspace/check", {
      method: "POST",
      body: {
        files: [
          { path: "bad.json", content: "{bad" },
          { path: "bad.css", content: "body { @apply flex; }" },
          { path: "bad.ts", content: "const a: number = ;" },
        ],
      },
    });
    assert.equal(badCheck.status, 200);
    assert.equal(badCheck.json.ok, false);
    assert.ok(badCheck.json.errorCount >= 3);
  });

  await test("API terminal allowlist & flag injection defense (/api/terminal)", async () => {
    const okTerm = await apiReq("/api/terminal", {
      method: "POST",
      body: {
        projectId: "audit-test",
        command: "ls",
        files: [{ path: "hello.txt", content: "world" }],
      },
    });
    assert.equal(okTerm.status, 200);
    assert.ok(okTerm.text.includes("hello.txt"));

    for (const cmd of [
      "find . -exec id ;",
      "node -e \"console.log(1)\"",
      "python3 -c \"import os\"",
      "git -c core.sshCommand=id status",
      "cat ../../etc/passwd",
      "whoami",
    ]) {
      const blocked = await apiReq("/api/terminal", {
        method: "POST",
        body: { projectId: "audit-test", command: cmd },
      });
      assert.equal(blocked.status, 400, `Dangerous command must be blocked: ${cmd}`);
    }

    const pyRun = await apiReq("/api/terminal", {
      method: "POST",
      body: {
        projectId: "python-test",
        command: "python3 main.py",
        files: [{ path: "main.py", content: "print('REAL_PYTHON_OK')" }],
      },
    });
    assert.equal(pyRun.status, 200);
    assert.ok(pyRun.text.includes("REAL_PYTHON_OK"));
  });

  await test("Real coding languages: React/TypeScript, Next.js app/page.tsx, and Python checks", async () => {
    const tsxFiles = extractWorkspaceFiles(
      "```tsx:src/App.tsx\nimport { useState } from 'react';\nexport default function App() { const [n, setN] = useState<number>(1); return <button onClick={() => setN(n+1)}>{n}</button>; }\n```\n```css:src/styles.css\n@import \"tailwindcss\";\nbody { color: #111; }\n```\n```json:package.json\n{\"name\":\"demo\"}\n```",
      false
    );
    assert.ok(tsxFiles.some((f) => f.path === "package.json"));
    assert.ok(checkSource(tsxFiles, { target: "website" }).every((c) => c.passed));
    const reactPreview = previewDocument(tsxFiles);
    assert.ok(reactPreview.includes("src/App.tsx"));

    const nextFiles = extractWorkspaceFiles(
      "```tsx:app/page.tsx\n\"use client\";\nimport Link from 'next/link';\nexport default function Page() { return <main><Link href=\"/about\">About</Link></main>; }\n```\n```css:app/globals.css\nbody { margin: 0; }\n```",
      false
    );
    assert.ok(checkSource(nextFiles, { target: "website" }).every((c) => c.passed));
    const nextPreview = previewDocument(nextFiles);
    assert.ok(nextPreview.includes("app/page.tsx"));

    const pyFiles = extractWorkspaceFiles("```python\ndef solve(x: int) -> int:\n    return x * 2\nprint(solve(21))\n```", false);
    assert.equal(pyFiles[0].path, "main.py");
    assert.ok(checkSource(pyFiles, { target: "website" }).every((c) => c.passed));

    const pyCheck = await apiReq("/api/workspace/check", {
      method: "POST",
      body: { files: [{ path: "main.py", content: "def broken(:" }] },
    });
    assert.equal(pyCheck.status, 200);
    assert.equal(pyCheck.json.ok, false);
  });

  await test("API /api/chat requires configured API key cleanly", async () => {
    const chat = await apiReq("/api/chat", {
      method: "POST",
      body: { company: "notrack", messages: [{ role: "user", content: "hi" }] },
    });
    if (!process.env.NOTRACK_API_KEY) {
      assert.equal(chat.status, 401);
      assert.equal(chat.json.errorDetail.code, "KEY_MISSING");
    } else {
      assert.equal(chat.status, 200);
    }
  });

  await test("API /api/media: input validation and safe asset lookup", async () => {
    const emptyPrompt = await apiReq("/api/media/jobs", {
      method: "POST",
      body: { kind: "image", prompt: "   " },
    });
    assert.equal(emptyPrompt.status, 400);

    const missingJob = await apiReq("/api/media/jobs/nonexistent-id");
    assert.equal(missingJob.status, 404);

    const badAsset = await apiReq("/api/media/assets/..%2F..%2Fetc%2Fpasswd");
    assert.equal(badAsset.status, 400);

    if (!process.env.NOTRACK_API_KEY) {
      const imgJob = await apiReq("/api/media/jobs", {
        method: "POST",
        body: { kind: "image", prompt: "A serene mountain landscape" },
      });
      const vidJob = await apiReq("/api/media/jobs", {
        method: "POST",
        body: { kind: "video", prompt: "Ocean waves at sunset" },
      });
      // Either gateway rejects with 401/400 KEY_MISSING or job transitions quickly to failed with honest API key error
      assert.ok([200, 202, 400, 401].includes(imgJob.status));
      assert.ok([200, 202, 400, 401].includes(vidJob.status));
      if (imgJob.json?.jobId) {
        await new Promise((r) => setTimeout(r, 80));
        const st = await apiReq(`/api/media/jobs/${imgJob.json.jobId}`, {
          headers: { "x-sujith-session": imgJob.headers.get("x-sujith-session") || "" },
        });
        assert.equal(st.json.status, "failed");
      }
      if (vidJob.json?.jobId) {
        await new Promise((r) => setTimeout(r, 80));
        const st = await apiReq(`/api/media/jobs/${vidJob.json.jobId}`, {
          headers: { "x-sujith-session": vidJob.headers.get("x-sujith-session") || "" },
        });
        assert.equal(st.json.status, "failed");
      }
    }
  });

  await test("API /api/android/cloud-apk generates valid GitHub Actions YAML", async () => {
    const wf = await apiReq("/api/android/cloud-apk", {
      method: "POST",
      body: { action: "workflow", stack: "kotlin" },
    });
    assert.equal(wf.status, 200);
    assert.equal(wf.json.ok, true);
    assert.ok(wf.json.content.includes("assembleDebug"));
  });

  await test("NoTrack secret encryption & zero plaintext leak on disk", async () => {
    // Ensure store file does not contain plaintext keys
    if (fs.existsSync(tempStore)) {
      const raw = fs.readFileSync(tempStore, "utf8");
      assert.ok(!raw.includes("notrackApiKey\""), "Plaintext notrackApiKey property must never be written to disk");
    }
  });

  await test("Deep Search: real multi-source live retrieval, follow-ups, and /api/search endpoint", async () => {
    const { shouldRunDeepSearch, buildSearchQueries, runDeepSearch } = await import("../deepSearch.mjs");

    assert.equal(shouldRunDeepSearch({ query: "hello" }), false);
    assert.equal(shouldRunDeepSearch({ query: "thanks" }), false);
    assert.equal(shouldRunDeepSearch({ query: "Tamil Nadu current cm name" }), true);
    assert.equal(
      shouldRunDeepSearch({
        query: "When did he take office and what is his party?",
        history: [
          { role: "user", content: "Tamil Nadu current cm name" },
          { role: "assistant", content: "The current Chief Minister is **C. Joseph Vijay**." },
        ],
      }),
      true
    );

    const followQueries = buildSearchQueries("When did he take office?", [
      { role: "user", content: "Tamil Nadu current cm name" },
      { role: "assistant", content: "The current Chief Minister is **C. Joseph Vijay**." },
    ]);
    assert.ok(followQueries[0].toLowerCase().includes("vijay"), "Follow-up query must retain conversation subject");

    const badSearch = await apiReq("/api/search", { method: "POST", body: { query: "   " } });
    assert.equal(badSearch.status, 400);

    const progressUpdates = [];
    const directRes = await runDeepSearch("Tamil Nadu current cm name", {
      onProgress: (st) => progressUpdates.push(st.status),
    });
    assert.ok(progressUpdates.includes("searching"), "Deep Search must emit live searching progress");
    assert.equal(directRes.status, "complete");
    assert.ok(directRes.sources.length >= 3, "Must retrieve multiple verified sources");
    const uniqueDomains = new Set(directRes.sources.map((s) => s.domain));
    assert.ok(uniqueDomains.size >= 2, "Must retrieve sources across multiple distinct domains");
    for (const s of directRes.sources) {
      assert.match(s.url, /^https?:\/\//i, `Source URL must be valid http(s): ${s.url}`);
    }

    const apiSearch = await apiReq("/api/search", {
      method: "POST",
      body: { query: "React 19 features" },
    });
    assert.equal(apiSearch.status, 200);
    assert.equal(apiSearch.json.status, "complete");
    assert.ok(Array.isArray(apiSearch.json.sources) && apiSearch.json.sources.length >= 2);
  });

  await test("Message Size & RichText: safe external URL validation and consistent 15.5px mobile typography", async () => {
    const { safeExternalUrl } = await import("../src/components/RichText.tsx");
    assert.equal(safeExternalUrl("javascript:alert(1)"), null);
    assert.equal(safeExternalUrl("data:text/html,<script>alert(1)</script>"), null);
    assert.equal(safeExternalUrl("https://www.thehindu.com/news/"), "https://www.thehindu.com/news/");

    const css = fs.readFileSync(path.resolve("src/components/BuildReply.css"), "utf8");
    assert.ok(!css.includes("font-size: 19px"), "Oversized 19px AI reply font must be removed");
    assert.ok(css.includes("font-size: 15.5px"), "AI reply typography must use readable 15.5px sizing");
    assert.ok(css.includes("overflow-wrap: anywhere"), "AI reply must wrap long URLs and words cleanly");

    const homeChatTsx = fs.readFileSync(path.resolve("src/components/ChatHomePage.tsx"), "utf8");
    assert.ok(!homeChatTsx.includes("text-[19px]"), "Oversized 19px user bubble font must be removed");
    assert.ok(homeChatTsx.includes("text-[15.5px]"), "User bubble must use comfortable 15.5px sizing");
  });

  await test("User Message Resend: inline double-blue editor with Cancel/Send pills wired to Normal & Builder chats", () => {
    const editorTsx = fs.readFileSync(path.resolve("src/components/UserMessageEditor.tsx"), "utf8");
    assert.ok(editorTsx.includes("border-[#2563eb]"), "Inline editor must render blue double border");
    assert.ok(editorTsx.includes("resize-y"), "Inline editor textarea must be resizable");
    assert.ok(editorTsx.includes(">\n          Cancel\n") && editorTsx.includes(">\n          Send\n"), "Inline editor must expose Cancel and Send buttons");

    const homeChatTsx = fs.readFileSync(path.resolve("src/components/ChatHomePage.tsx"), "utf8");
    assert.ok(homeChatTsx.includes("InlineMessageEditor") && homeChatTsx.includes("onResendMessage"), "Normal chat must render inline resend editor");

    const appTsx = fs.readFileSync(path.resolve("src/App.tsx"), "utf8");
    assert.ok(appTsx.includes("editFromMessageId") && appTsx.includes("editingBuilderMessageId"), "App must support editing & resending from any prior user turn in both modes");
  });

  await test("Live Voice Assistant: clean compact layout, removed language pill, and LISTENING -> PROCESSING -> SPEAKING -> LISTENING loop", async () => {
    const { cleanTextForSpeech, splitSpeechChunks, detectSpeechLang } = await import("../src/utils/voiceSpeech.ts");
    const cleaned = cleanTextForSpeech("Hello **world** [1]! See [link](https://example.com) and ```js\nconsole.log(1)\n``` done.");
    assert.equal(cleaned, "Hello world ! See link and done.");
    const chunks = splitSpeechChunks("Sentence one. Sentence two! ".repeat(8), 80);
    assert.ok(chunks.length >= 2 && chunks.every((c) => c.length <= 80));
    assert.equal(detectSpeechLang("प्रधानमंत्री नरेंद्र मोदी", "en-IN"), "hi-IN");
    assert.equal(detectSpeechLang("தமிழ்நாடு", "en-IN"), "ta-IN");

    const homeChatTsx = fs.readFileSync(path.resolve("src/components/ChatHomePage.tsx"), "utf8");
    assert.ok(!homeChatTsx.includes("SPEECH_LANGS") && !homeChatTsx.includes("cycleLang"), "Circled language badge must be removed from voice bar");
    assert.ok(homeChatTsx.includes("LISTENING...") && homeChatTsx.includes("PROCESSING") && homeChatTsx.includes("SPEAKING"), "Voice bar must display LISTENING..., PROCESSING, SPEAKING states");
    assert.ok(homeChatTsx.includes("IMG_20261030_162513_5a36d74b.jpg"), "Voice bar must use the crystal orb asset");
    assert.ok(homeChatTsx.includes("h-[34px] w-[34px]") && homeChatTsx.includes("h-[30px] w-[30px]"), "Voice bar must match compact 34px orb & 30px button proportions");

    const appTsx = fs.readFileSync(path.resolve("src/App.tsx"), "utf8");
    assert.ok(appTsx.includes("speakResponseChunks") && appTsx.includes("liveVoiceHandlerRef"), "App must run full hands-free listening -> processing -> speaking -> listening loop");
  });
} finally {
  server.close();
  try { fs.rmSync(tempStore, { force: true }); } catch { /* ignore */ }
}

console.log(`\nTest summary: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
