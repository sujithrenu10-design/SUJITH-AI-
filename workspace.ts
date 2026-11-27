import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { renderAndroidPreviewDocument } from "./androidPreviewRenderer";
import { extractHtml, isAndroidPath } from "./builder";
import type { WorkspaceFile } from "./types";

export function normalizeWorkspacePath(path: string) {
  return path
    .replace(/^[./\\]+/, "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

export function languageForPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  const names: Record<string, string> = {
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    kt: "kotlin",
    kts: "kotlin",
    java: "java",
    dart: "dart",
    py: "python",
    php: "php",
    cs: "csharp",
    rb: "ruby",
    go: "go",
    rs: "rust",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    hpp: "cpp",
    sql: "sql",
    swift: "swift",
    scala: "scala",
    pl: "perl",
    pm: "perl",
    lua: "lua",
    r: "r",
    sh: "bash",
    bash: "bash",
    groovy: "groovy",
    gradle: "groovy",
    xml: "xml",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sol: "solidity",
    graphql: "graphql",
    gql: "graphql",
    vue: "vue",
    svelte: "svelte",
    astro: "astro",
    wat: "wasm",
    md: "markdown",
    properties: "properties",
    pro: "text",
    cmake: "cmake",
    txt: "text",
  };
  return names[extension ?? ""] ?? "text";
}

function putFile(files: Map<string, WorkspaceFile>, path: string, content: string, language?: string) {
  let safePath = normalizeWorkspacePath(path);
  if (!safePath || !content.trim()) return;
  if (/(^|\/)\.env(\.|$)/i.test(safePath)) return;

  if (/^(?:public|tailwindcss|tailwind|react)\/index\.html$/i.test(safePath)) safePath = "index.html";
  else if (/^public\/styles?\.css$/i.test(safePath)) safePath = "styles.css";
  else if (/^public\/(?:app|script|main)\.js$/i.test(safePath)) safePath = "app.js";

  files.set(safePath, {
    path: safePath,
    content: content.trim(),
    language: language ?? languageForPath(safePath),
    updatedAt: Date.now(),
  });
}

function inferNativePath(lang: string, code: string, files: Map<string, WorkspaceFile>): string | null {
  if (lang === "xml") {
    if (/<manifest\b/i.test(code) && !files.has("app/src/main/AndroidManifest.xml")) {
      return "app/src/main/AndroidManifest.xml";
    }
    if (/<resources\b/i.test(code) && /<string\b/i.test(code) && !files.has("app/src/main/res/values/strings.xml")) {
      return "app/src/main/res/values/strings.xml";
    }
    if (/<resources\b/i.test(code) && /<color\b/i.test(code) && !files.has("app/src/main/res/values/colors.xml")) {
      return "app/src/main/res/values/colors.xml";
    }
    if (/<(?:LinearLayout|RelativeLayout|ConstraintLayout|androidx\.|ScrollView|FrameLayout)/i.test(code) && !files.has("app/src/main/res/layout/activity_main.xml")) {
      return "app/src/main/res/layout/activity_main.xml";
    }
  }
  if (lang === "gradle" || lang === "kts" || lang === "groovy" || lang === "kotlin") {
    const isKts = lang === "kts" || /plugins\s*\{|include\s*\(\s*":app"\s*\)|namespace\s*=/.test(code);
    if (/(?:pluginManagement|dependencyResolutionManagement|rootProject\.name|include\s*\(?\s*['"]:app['"]\s*\)?)/.test(code)) {
      const target = isKts ? "settings.gradle.kts" : "settings.gradle";
      if (!files.has(target)) return target;
    }
    if (/\bandroid\s*\{/.test(code) && /\bdefaultConfig\s*\{/.test(code)) {
      const target = isKts ? "app/build.gradle.kts" : "app/build.gradle";
      if (!files.has(target)) return target;
    }
    if (/\bplugins\s*\{/.test(code) && /\bapply\s+false\b/.test(code)) {
      const target = isKts ? "build.gradle.kts" : "build.gradle";
      if (!files.has(target)) return target;
    }
  }
  if ((lang === "yaml" || lang === "yml") && /\bflutter\s*:/.test(code) && !files.has("pubspec.yaml")) {
    return "pubspec.yaml";
  }
  if (lang === "dart") {
    if (/\bvoid\s+main\s*\(/.test(code) && /\brunApp\s*\(/.test(code) && !files.has("lib/main.dart")) {
      return "lib/main.dart";
    }
    const cls = code.match(/class\s+([A-Za-z0-9_]+)\s+extends\s+(?:Stateless|Stateful)Widget/)?.[1];
    if (cls) {
      const snake = cls.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
      const target = `lib/screens/${snake}.dart`;
      if (!files.has(target)) return target;
    }
  }
  if (lang === "kotlin" || lang === "kt" || lang === "java") {
    const ext = lang === "java" ? "java" : "kt";
    const pkg = code.match(/^\s*package\s+([a-zA-Z0-9_.]+)/m)?.[1] || "com.sujith.generated";
    const pkgDir = pkg.replace(/\./g, "/");
    const cls = code.match(/\b(?:class|object|interface)\s+([A-Za-z0-9_]+)/)?.[1];
    const fn = !cls ? code.match(/@Composable\s+(?:private\s+|internal\s+)?fun\s+([A-Za-z0-9_]+)/)?.[1] : undefined;
    const name = cls || fn;
    if (name) {
      const subDir = /Screen$/i.test(name)
        ? "screens/"
        : /Theme|Color|Type/i.test(name)
          ? "ui/theme/"
          : /ViewModel$/i.test(name)
            ? "viewmodel/"
            : "";
      const target = `app/src/main/java/${pkgDir}/${subDir}${name}.${ext}`;
      if (!files.has(target)) return target;
    }
  }
  if (lang === "properties" && /android\.useAndroidX/.test(code) && !files.has("gradle.properties")) {
    return "gradle.properties";
  }
  return null;
}

export function extractWorkspaceFiles(text: string, androidBuild = false): WorkspaceFile[] {
  const files = new Map<string, WorkspaceFile>();

  const html = extractHtml(text);
  if (html) putFile(files, "index.html", html, "html");

  const cleanFilePath = (raw: string) =>
    raw
      .trim()
      .replace(/^(?:file|path|filepath)\s*:\s*/i, "")
      .replace(/^['"`(\[]+|['"`)\]:,]+$/g, "")
      .trim();

  // 1. Named fence forms: ```lang:path/to/file, ```lang path="...", ```lang file="...", ```lang filename="..."
  const namedPattern = /```([\w.+-]*)(?:\s+(?:path|file|filepath|filename)\s*=\s*|\s*:\s*)([^\n]+)\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = namedPattern.exec(text)) !== null) {
    const rawPath = cleanFilePath(match[2]);
    if (!rawPath || !/[./]/.test(rawPath)) continue;
    putFile(files, rawPath, match[3], languageForPath(rawPath) || match[1].toLowerCase());
  }

  // 2. Trailing unclosed named fence (e.g., if generation stopped mid-file so diagnostics catch & repair it)
  const unclosedNamed = text.match(/```([\w.+-]*)(?:\s+(?:path|file|filepath|filename)\s*=\s*|\s*:\s*)([^\n]+)\n([\s\S]+)$/i);
  if (unclosedNamed && !unclosedNamed[3].includes("```")) {
    const rawPath = cleanFilePath(unclosedNamed[2]);
    if (rawPath && /[./]/.test(rawPath) && !files.has(normalizeWorkspacePath(rawPath)) && unclosedNamed[3].trim().length > 16) {
      putFile(files, rawPath, unclosedNamed[3], languageForPath(rawPath) || unclosedNamed[1].toLowerCase());
    }
  }

  // 3. Extract heading/bold/numbered-filename + fenced code blocks
  const lines = text.split("\n");
  let nextPath = "";
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(
      /^(?:#{1,4}\s+|[-*+]\s+|\d+[.)]\s+)?(?:[*_]{2})?(?:file(?:name|path)?\s*:\s*)?[`*_]*([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]{1,12})[`*_]*:?\s*$/i
    );
    if (heading && !heading[1].startsWith("http")) {
      nextPath = cleanFilePath(heading[1]);
      continue;
    }

    if (!nextPath) continue;
    const fence = lines[index].match(/^```[\w.+-]*\s*$/);
    if (!fence) {
      if (lines[index].trim()) nextPath = "";
      continue;
    }
    const code: string[] = [];
    index += 1;
    while (index < lines.length && !/^```\s*$/.test(lines[index])) {
      code.push(lines[index]);
      index += 1;
    }
    if (code.length) {
      putFile(files, nextPath, code.join("\n"));
    }
    nextPath = "";
  }

  // 4. Comment header directives inside unnamed blocks: // filepath:, # filepath:, <!-- filepath: ... -->
  const commentDirective = /```([\w.+-]*)\s*\n\s*(?:(?:\/\/|#)\s*(?:filepath|file)\s*:\s*([^\n]+)|<!--\s*(?:filepath|file)\s*:\s*([^\n]+?)\s*-->)\n([\s\S]*?)```/gi;
  while ((match = commentDirective.exec(text)) !== null) {
    const rawPath = cleanFilePath(match[2] || match[3] || "");
    if (!rawPath) continue;
    putFile(files, rawPath, match[4], languageForPath(rawPath) || match[1].toLowerCase());
  }

  // 5. Fallback for truly unnamed web/native/systems blocks
  const unnamedPattern = /```(html|css|javascript|js|jsx|tsx|typescript|ts|python|py|go|golang|rust|rs|cpp|c\+\+|c|php|ruby|rb|sql|kotlin|kt|kts|java|dart|xml|gradle|groovy|yaml|yml|properties)(?![^\n]*(?:[:=]))\s*\n([\s\S]*?)```/gi;
  while ((match = unnamedPattern.exec(text)) !== null) {
    const lang = match[1].toLowerCase();
    const code = match[2].trim();
    if (!code || /^(?:\/\/|#)\s*(?:filepath|file)\s*:/i.test(code)) continue;
    if (lang === "html") {
      if (!files.has("index.html")) putFile(files, "index.html", code, "html");
      continue;
    }
    if (lang === "css" && !files.has("styles.css") && !files.has("style.css") && !files.has("src/styles.css")) {
      putFile(files, "styles.css", code, "css");
      continue;
    }
    if ((lang === "javascript" || lang === "js") && !files.has("app.js") && !files.has("script.js") && !files.has("main.js")) {
      putFile(files, "app.js", code, "javascript");
      continue;
    }
    if ((lang === "typescript" || lang === "ts") && ![...files.keys()].some((k) => k.endsWith(".ts") || k.endsWith(".tsx"))) {
      putFile(files, "src/main.ts", code, "typescript");
      continue;
    }
    if ((lang === "tsx" || lang === "jsx") && ![...files.keys()].some((k) => k.endsWith(".tsx") || k.endsWith(".jsx"))) {
      putFile(files, `src/App.${lang}`, code, lang);
      continue;
    }
    if ((lang === "python" || lang === "py") && !files.has("main.py")) {
      putFile(files, "main.py", code, "python");
      continue;
    }
    if ((lang === "go" || lang === "golang") && !files.has("main.go")) {
      putFile(files, "main.go", code, "go");
      continue;
    }
    if ((lang === "rust" || lang === "rs") && !files.has("src/main.rs")) {
      putFile(files, "src/main.rs", code, "rust");
      continue;
    }
    if ((lang === "cpp" || lang === "c++") && !files.has("main.cpp")) {
      putFile(files, "main.cpp", code, "cpp");
      continue;
    }
    if (lang === "c" && !files.has("main.c")) {
      putFile(files, "main.c", code, "c");
      continue;
    }
    if (lang === "php" && !files.has("index.php")) {
      putFile(files, "index.php", code, "php");
      continue;
    }
    if ((lang === "ruby" || lang === "rb") && !files.has("main.rb")) {
      putFile(files, "main.rb", code, "ruby");
      continue;
    }
    if (lang === "sql" && !files.has("schema.sql")) {
      putFile(files, "schema.sql", code, "sql");
      continue;
    }
    if (androidBuild || /\b(?:kotlin|kt|kts|java|dart|xml|gradle|groovy|yaml|properties)\b/.test(lang)) {
      const inferred = inferNativePath(lang, code, files);
      if (inferred) putFile(files, inferred, code, languageForPath(inferred));
    }
  }

  return [...files.values()];
}

export function mergeWorkspaceFiles(current: WorkspaceFile[], incoming: WorkspaceFile[]) {
  const merged = new Map(current.map((file) => [file.path, file]));
  for (const file of incoming) merged.set(file.path, file);
  return [...merged.values()].sort((a, b) => {
    if (a.path === "index.html") return -1;
    if (b.path === "index.html") return 1;
    return a.path.localeCompare(b.path);
  });
}

export function replaceOrMergeWorkspaceFiles(
  current: WorkspaceFile[],
  incoming: WorkspaceFile[],
  targetMode: "website" | "android"
) {
  const hadAndroid = current.some((f) => isAndroidPath(f.path));
  const incomingIsAndroid = incoming.some((f) => isAndroidPath(f.path));
  const incomingIsWeb = incoming.some(
    (f) => f.path === "index.html" || /(?:^|\/)(?:App|page|index)\.(?:tsx|jsx)$/i.test(f.path)
  );
  // If switching stacks cleanly (e.g. Android -> Website or Website -> Android), replace old stack files so stale files don't collide.
  if (
    (targetMode === "website" && hadAndroid && incomingIsWeb && !incomingIsAndroid) ||
    (targetMode === "android" && !hadAndroid && incomingIsAndroid && !incomingIsWeb)
  ) {
    return mergeWorkspaceFiles([], incoming);
  }
  return mergeWorkspaceFiles(current, incoming);
}

const STORAGE_POLYFILL_SCRIPT = `<script>
(function(){
  function makeStore(){
    var data = (window.__SUJITH_APP_STATE__ && typeof window.__SUJITH_APP_STATE__ === "object") ? Object.assign({}, window.__SUJITH_APP_STATE__) : {};
    return {
      getItem: function(k){ return Object.prototype.hasOwnProperty.call(data, String(k)) ? data[String(k)] : null; },
      setItem: function(k, v){
        var key = String(k), val = String(v);
        data[key] = val;
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: "sujith-project-state", nonce: window.__SUJITH_PREVIEW_NONCE__, key: key, value: JSON.stringify(val) }, "*");
          }
        } catch (e) {}
      },
      removeItem: function(k){ delete data[String(k)]; },
      clear: function(){ data = {}; },
      key: function(i){ return Object.keys(data)[i] || null; },
      get length(){ return Object.keys(data).length; }
    };
  }
  try {
    var s = window.localStorage;
    s.setItem("__sujith_probe__", "1");
    s.removeItem("__sujith_probe__");
  } catch (e) {
    try { Object.defineProperty(window, "localStorage", { value: makeStore(), configurable: true }); } catch (_) {}
  }
  try {
    var ss = window.sessionStorage;
    ss.setItem("__sujith_probe__", "1");
    ss.removeItem("__sujith_probe__");
  } catch (e) {
    try { Object.defineProperty(window, "sessionStorage", { value: makeStore(), configurable: true }); } catch (_) {}
  }
})();
</script>`;

const SUJITH_AI_BRIDGE_SCRIPT = `<script>
(function(){
  window.SUJITH = window.SUJITH || {};
  var activeRequestIds = new Set();
  function formatTurns(messages){
    if (!Array.isArray(messages)) return [];
    return messages.slice(-12).map(function(m){
      var role = (m && (m.role === "assistant" || m.role === "system")) ? m.role : "user";
      return { role: role, content: String((m && m.content) || "").slice(0, 10000) };
    });
  }
  function callBridge(messages, onDelta, options){
    return new Promise(function(resolve, reject){
      var turns = formatTurns(messages);
      if (!turns.length) {
        reject(new Error("Please provide at least one message."));
        return;
      }
      var opts = (options && typeof options === "object") ? options : {};
      var requestId = "sujith_ai_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      activeRequestIds.add(requestId);
      var settled = false;
      var latest = "";
      var timer = setTimeout(function(){
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("AI request timed out."));
      }, 65000);
      function cleanup(){
        clearTimeout(timer);
        activeRequestIds.delete(requestId);
        window.removeEventListener("message", onMessage);
        if (opts.signal && typeof opts.signal.removeEventListener === "function") {
          opts.signal.removeEventListener("abort", handleAbort);
        }
      }
      function handleAbort(){
        if (settled) return;
        settled = true;
        cleanup();
        try {
          window.parent.postMessage({ type: "sujith-ai-abort", nonce: window.__SUJITH_PREVIEW_NONCE__, requestId: requestId }, "*");
        } catch (_) {}
        reject(new DOMException("Generation stopped.", "AbortError"));
      }
      if (opts.signal) {
        if (opts.signal.aborted) { handleAbort(); return; }
        if (typeof opts.signal.addEventListener === "function") {
          opts.signal.addEventListener("abort", handleAbort, { once: true });
        }
      }
      function onMessage(event){
        var data = event.data;
        if (!data || data.nonce !== window.__SUJITH_PREVIEW_NONCE__ || data.requestId !== requestId) return;
        if (data.type !== "sujith-ai-result") return;
        if (data.state === "text" || data.state === "delta") {
          latest = String(data.payload || "");
          if (typeof onDelta === "function") {
            try { onDelta(latest); } catch (_) {}
          }
        } else if (data.state === "done") {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(String(data.payload || latest));
        } else if (data.state === "error") {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(String(data.payload || "AI request failed.")));
        }
      }
      window.addEventListener("message", onMessage);
      window.parent.postMessage({
        type: "sujith-ai-chat",
        nonce: window.__SUJITH_PREVIEW_NONCE__,
        requestId: requestId,
        turns: turns,
        options: {
          temperature: typeof opts.temperature === "number" ? opts.temperature : undefined,
          maxTokens: typeof opts.maxTokens === "number" ? opts.maxTokens : undefined,
          systemPrompt: typeof opts.systemPrompt === "string" ? opts.systemPrompt.slice(0, 4000) : undefined
        }
      }, "*");
    });
  }
  window.SUJITH.ai = {
    chat: function(messages, options){ return callBridge(messages, undefined, options); },
    stream: function(messages, onDelta, options){ return callBridge(messages, onDelta, options); },
    abort: function(){
      activeRequestIds.forEach(function(id){
        try {
          window.parent.postMessage({ type: "sujith-ai-abort", nonce: window.__SUJITH_PREVIEW_NONCE__, requestId: id }, "*");
        } catch (_) {}
      });
    }
  };
})();
</script>`;

function buildReactPreviewDocument(files: WorkspaceFile[]) {
  const entry =
    files.find((f) => /(^|\/)App\.(tsx|jsx)$/i.test(f.path)) ??
    files.find((f) => /(^|\/)app\/page\.(tsx|jsx)$/i.test(f.path)) ??
    files.find((f) => /(^|\/)pages\/index\.(tsx|jsx)$/i.test(f.path)) ??
    files.find((f) => /\.(tsx|jsx)$/i.test(f.path) && !/(^|\/)(main|index|layout|_app|_document)\.(tsx|jsx)$/i.test(f.path)) ??
    files.find((f) => /\.(tsx|jsx)$/i.test(f.path));
  if (!entry) return "";

  const htmlFile =
    files.find((f) => f.path === "index.html") ??
    files.find((f) => f.path === "preview.html") ??
    files.find((f) => f.path.toLowerCase().endsWith(".html"));
  const titleMatch = htmlFile?.content.match(/<title>([\s\S]*?)<\/title>/i);
  const safeTitle = (titleMatch?.[1]?.trim() || "Live React App Preview").replace(/</g, "&lt;");
  const externalHeadLinks = htmlFile
    ? [...htmlFile.content.matchAll(/<link\b[^>]*href=["']https?:\/\/[^"']+["'][^>]*>/gi)].map((m) => m[0]).join("\n  ")
    : "";

  const cssContent = files
    .filter((f) => f.path.endsWith(".css"))
    .map((f) =>
      f.content
        .replace(/^\s*@import\s+["']tailwindcss["']\s*;?\s*$/gm, "")
        .replace(/^\s*@tailwind\s+(?:base|components|utilities)\s*;?\s*$/gm, "")
    )
    .join("\n\n");

  const bundleableFiles = files.filter(
    (f) =>
      /\.(tsx|jsx|ts|js|mjs|json)$/i.test(f.path) &&
      !isAndroidPath(f.path) &&
      !/^(?:package(?:-lock)?|tsconfig(?:\.\w+)?|vite\.config|next\.config|tailwind\.config|postcss\.config)\./i.test(f.path)
  );
  const serializedModules = JSON.stringify(
    bundleableFiles.map((m) => ({ path: m.path, content: m.content }))
  ).replace(/</g, "\\u003c");
  const entryPathJson = JSON.stringify(entry.path);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  ${externalHeadLinks}
  ${STORAGE_POLYFILL_SCRIPT}
  ${SUJITH_AI_BRIDGE_SCRIPT}
  <script src="https://cdn.tailwindcss.com"></script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>${cssContent}</style>
</head>
<body class="min-h-screen bg-white text-slate-900">
  <div id="root"></div>
  <script>
    (function () {
      var RAW_MODULES = ${serializedModules};
      var ENTRY_PATH = ${entryPathJson};
      var moduleMap = {};
      RAW_MODULES.forEach(function (m) { moduleMap[m.path] = m.content; });

      function normalizeRel(baseDir, target) {
        var parts = (baseDir ? baseDir.split("/") : []).concat(target.split("/"));
        var out = [];
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i];
          if (!p || p === ".") continue;
          if (p === "..") out.pop();
          else out.push(p);
        }
        return out.join("/");
      }

      function resolvePath(fromPath, request) {
        var cleanReq = request;
        if (cleanReq.startsWith("@/")) {
          var aliasTarget = cleanReq.slice(2);
          var aliasCandidates = [
            "src/" + aliasTarget, aliasTarget,
            "src/" + aliasTarget + ".tsx", "src/" + aliasTarget + ".ts", "src/" + aliasTarget + ".jsx", "src/" + aliasTarget + ".js",
            aliasTarget + ".tsx", aliasTarget + ".ts", aliasTarget + ".jsx", aliasTarget + ".js"
          ];
          for (var a = 0; a < aliasCandidates.length; a++) {
            if (Object.prototype.hasOwnProperty.call(moduleMap, aliasCandidates[a])) return aliasCandidates[a];
          }
        }
        if (!cleanReq.startsWith(".")) return cleanReq;
        var baseDir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
        var clean = normalizeRel(baseDir, cleanReq);
        var candidates = [
          clean,
          clean + ".tsx", clean + ".ts", clean + ".jsx", clean + ".js", clean + ".json",
          clean + "/index.tsx", clean + "/index.ts", clean + "/index.jsx", clean + "/index.js"
        ];
        for (var i = 0; i < candidates.length; i++) {
          if (Object.prototype.hasOwnProperty.call(moduleMap, candidates[i])) return candidates[i];
        }
        return null;
      }

      function createJsxRuntime(R) {
        function jsxFactory(type, props, maybeKey) {
          var nextProps = props ? Object.assign({}, props) : {};
          var children = nextProps.children;
          delete nextProps.children;
          if (maybeKey !== undefined) nextProps.key = maybeKey;
          if (children === undefined) return R.createElement(type, nextProps);
          if (Array.isArray(children)) return R.createElement.apply(R, [type, nextProps].concat(children));
          return R.createElement(type, nextProps, children);
        }
        return {
          __esModule: true,
          Fragment: R.Fragment,
          jsx: jsxFactory,
          jsxs: jsxFactory,
          jsxDEV: jsxFactory
        };
      }

      function flattenClasses() {
        var out = [];
        for (var i = 0; i < arguments.length; i++) {
          var arg = arguments[i];
          if (!arg) continue;
          if (typeof arg === "string" || typeof arg === "number") out.push(String(arg));
          else if (Array.isArray(arg)) {
            var nested = flattenClasses.apply(null, arg);
            if (nested) out.push(nested);
          } else if (typeof arg === "object") {
            Object.keys(arg).forEach(function (k) { if (arg[k]) out.push(k); });
          }
        }
        return out.join(" ");
      }

      var lucideProxy = new Proxy({}, {
        get: function (_, iconName) {
          if (iconName === "__esModule") return true;
          return function LucideFallback(props) {
            var size = (props && props.size) || 18;
            var cls = (props && props.className) || "";
            return React.createElement(
              "svg",
              {
                width: size,
                height: size,
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: 2,
                strokeLinecap: "round",
                strokeLinejoin: "round",
                className: cls,
                "aria-hidden": true
              },
              React.createElement("circle", { cx: 12, cy: 12, r: 9 }),
              React.createElement("path", { d: "M12 8v8M8 12h8" })
            );
          };
        }
      });

      var nextLinkShim = {
        __esModule: true,
        default: function NextLink(props) {
          var rest = Object.assign({}, props);
          var href = typeof rest.href === "string" ? rest.href : "#";
          delete rest.href;
          return React.createElement("a", Object.assign({ href: href }, rest), rest.children);
        }
      };

      var nextImageShim = {
        __esModule: true,
        default: function NextImage(props) {
          var rest = Object.assign({}, props);
          delete rest.priority;
          delete rest.fill;
          return React.createElement("img", rest);
        }
      };

      var nextNavShim = {
        __esModule: true,
        useRouter: function () {
          return {
            push: function (p) { if (typeof p === "string") window.location.hash = p; },
            replace: function (p) { if (typeof p === "string") window.location.hash = p; },
            back: function () { window.history.back(); },
            refresh: function () {}
          };
        },
        usePathname: function () { return window.location.pathname || "/"; },
        useSearchParams: function () { return new URLSearchParams(window.location.search); }
      };

      var cache = {};
      function loadModule(modPath) {
        if (cache[modPath]) return cache[modPath].exports;
        var source = moduleMap[modPath];
        if (typeof source !== "string") {
          throw new Error("Module not found: " + modPath);
        }
        if (modPath.endsWith(".json")) {
          var jsonMod = { exports: JSON.parse(source) };
          cache[modPath] = jsonMod;
          return jsonMod.exports;
        }
        var cleanSource = source.replace(/^\s*["']use (?:client|server)["'];?\s*/gm, "");
        var transformed = Babel.transform(cleanSource, {
          filename: modPath,
          presets: [["react", { runtime: "classic" }], "typescript"],
          plugins: ["transform-modules-commonjs"]
        }).code;
        var jsxRuntimeMod = createJsxRuntime(React);
        var mod = { exports: {} };
        cache[modPath] = mod;
        var localRequire = function (req) {
          if (req === "react") return React;
          if (req === "react/jsx-runtime" || req === "react/jsx-dev-runtime") return jsxRuntimeMod;
          if (req === "react-dom" || req === "react-dom/client") {
            return Object.assign({}, ReactDOM, { createRoot: ReactDOM.createRoot });
          }
          if (req === "lucide-react") return lucideProxy;
          if (req === "clsx" || req === "classnames") {
            return Object.assign(flattenClasses, { __esModule: true, default: flattenClasses, clsx: flattenClasses });
          }
          if (req === "tailwind-merge") {
            return { __esModule: true, twMerge: flattenClasses, twJoin: flattenClasses };
          }
          if (req === "next/link") return nextLinkShim;
          if (req === "next/image") return nextImageShim;
          if (req === "next/navigation") return nextNavShim;
          if (/\.(css|scss|sass|less|png|jpe?g|gif|svg|webp)$/i.test(req)) return {};
          var resolved = resolvePath(modPath, req);
          if (!resolved || !Object.prototype.hasOwnProperty.call(moduleMap, resolved)) {
            throw new Error("Cannot resolve '" + req + "' from " + modPath);
          }
          return loadModule(resolved);
        };
        var fn = new Function("require", "module", "exports", "React", transformed);
        fn(localRequire, mod, mod.exports, React);
        return mod.exports;
      }

      window.addEventListener("DOMContentLoaded", function () {
        var rootEl = document.getElementById("root");
        try {
          if (typeof React === "undefined" || typeof ReactDOM === "undefined" || typeof Babel === "undefined") {
            throw new Error("React/Babel preview runtime failed to load. Check network access or inspect files in the Code Editor.");
          }
          var exports = loadModule(ENTRY_PATH);
          var RootComp = exports.default || exports.App || exports.Page || exports.Home || Object.values(exports).find(function (v) { return typeof v === "function"; });
          if (!RootComp) throw new Error("No React component exported from " + ENTRY_PATH);
          ReactDOM.createRoot(rootEl).render(React.createElement(RootComp));
          window.__SUJITH_REACT_READY__ = true;
        } catch (err) {
          window.__SUJITH_REACT_ERROR__ = err && err.message ? err.message : String(err);
          if (window.__SUJITH_TEST_ERRORS__) window.__SUJITH_TEST_ERRORS__.push(window.__SUJITH_REACT_ERROR__);
          rootEl.innerHTML = '<div style="padding:20px;font-family:system-ui,sans-serif;color:#b3261e;background:#fce8e6;border-radius:12px;margin:16px"><strong>Preview Error</strong><pre style="white-space:pre-wrap;margin-top:8px;font-size:12px">' + String(window.__SUJITH_REACT_ERROR__).replace(/</g, "&lt;") + '</pre></div>';
        }
      });
    })();
  </script>
</body>
</html>`;
}

export function previewDocument(files: WorkspaceFile[]) {
  const androidPreview = renderAndroidPreviewDocument(files);
  const htmlFile =
    files.find((file) => file.path === "index.html") ??
    files.find((file) => file.path === "preview.html") ??
    files.find((file) => file.path.toLowerCase().endsWith(".html"));

  const hasReactSource = files.some((file) => /\.(tsx|jsx)$/i.test(file.path) && !isAndroidPath(file.path));
  const hasVanillaEntryScript = Boolean(
    htmlFile &&
    files.some(
      (f) =>
        /\.(?:js|mjs)$/i.test(f.path) &&
        !isAndroidPath(f.path) &&
        !/config\.(?:js|mjs)$/i.test(f.path) &&
        htmlFile.content.includes(f.path.split("/").pop() ?? f.path)
    )
  );
  const htmlNeedsReactRuntime =
    hasReactSource &&
    (!htmlFile ||
      /<script\b[^>]*src=["'][^"']*\.(?:tsx|jsx)["']/i.test(htmlFile.content) ||
      (/id=["']root["']/i.test(htmlFile.content) && !hasVanillaEntryScript));

  if (htmlNeedsReactRuntime) {
    const reactPreview = buildReactPreviewDocument(files);
    if (reactPreview) return reactPreview;
  }

  if (!htmlFile) {
    if (androidPreview) return androidPreview;
    return "";
  }

  let html = htmlFile.content;
  const unlinkedCss: string[] = [];
  const unlinkedJs: string[] = [];
  const tsScripts: WorkspaceFile[] = [];

  for (const file of files) {
    if (file.path.endsWith(".css") && file.path !== htmlFile.path) {
      const baseName = file.path.split("/").pop() ?? file.path;
      const escape = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const linkRe = new RegExp(`<link\\b[^>]*href=["'][^"']*${escape}["'][^>]*>`, "gi");
      if (linkRe.test(html)) {
        html = html.replace(linkRe, () => `<style>\n${file.content}\n</style>`);
      } else {
        unlinkedCss.push(file.content);
      }
    }
    if ((file.path.endsWith(".js") || file.path.endsWith(".mjs")) && file.path !== htmlFile.path && !isAndroidPath(file.path) && !/config\.(?:js|mjs)$/i.test(file.path)) {
      const baseName = file.path.split("/").pop() ?? file.path;
      const escape = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const scriptRe = new RegExp(`<script\\b[^>]*src=["'][^"']*${escape}["'][^>]*>\\s*</script>`, "gi");
      if (scriptRe.test(html)) {
        html = html.replace(scriptRe, () => `<script>\n${file.content.replace(/<\/script/gi, "<\\/script")}\n</script>`);
      } else {
        unlinkedJs.push(file.content.replace(/<\/script/gi, "<\\/script"));
      }
    }
    if (file.path.endsWith(".ts") && !isAndroidPath(file.path) && !/(?:^|\/)(?:vite|vitest|tailwind|next)\.config\.ts$/i.test(file.path)) {
      const baseName = file.path.split("/").pop() ?? file.path;
      const escape = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const scriptRe = new RegExp(`<script\\b[^>]*src=["'][^"']*${escape}["'][^>]*>\\s*</script>`, "gi");
      if (scriptRe.test(html)) {
        html = html.replace(scriptRe, () => `<script type="text/babel" data-presets="typescript">\n${file.content.replace(/<\/script/gi, "<\\/script")}\n</script>`);
      } else {
        tsScripts.push(file);
      }
    }
  }

  let unlinkedTsBlock = "";
  if (tsScripts.length > 0) {
    if (!/babel\.min\.js/i.test(html)) {
      const babelTag = `<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>`;
      if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${babelTag}\n</head>`);
      else html = `${babelTag}\n${html}`;
    }
    unlinkedTsBlock = tsScripts
      .map((f) => `<script type="text/babel" data-presets="typescript">\n${f.content.replace(/<\/script/gi, "<\\/script")}\n</script>`)
      .join("\n");
  }

  if (unlinkedCss.length) {
    const styleBlock = `<style>\n${unlinkedCss.join("\n\n")}\n</style>`;
    if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${styleBlock}\n</head>`);
    else html = `${styleBlock}\n${html}`;
  }

  const combinedScripts = [
    unlinkedJs.length ? `<script>\n${unlinkedJs.join("\n\n")}\n</script>` : "",
    unlinkedTsBlock,
  ]
    .filter(Boolean)
    .join("\n");
  if (combinedScripts) {
    if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${combinedScripts}\n</body>`);
    else html = `${html}\n${combinedScripts}`;
  }

  if (/<head([^>]*)>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n${STORAGE_POLYFILL_SCRIPT}\n${SUJITH_AI_BRIDGE_SCRIPT}`);
  } else {
    html = `<head>${STORAGE_POLYFILL_SCRIPT}\n${SUJITH_AI_BRIDGE_SCRIPT}</head>\n${html}`;
  }

  if (!/<!doctype html/i.test(html)) html = `<!doctype html>\n${html}`;
  return html;
}

function zipAndDownload(files: Record<string, string>, fileName: string) {
  const archive: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    const clean = normalizeWorkspacePath(path);
    if (clean) archive[clean] = strToU8(content);
  }
  const bytes = zipSync(archive, { level: 6 });
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function importZipArchive(buffer: ArrayBuffer): WorkspaceFile[] {
  const entries = unzipSync(new Uint8Array(buffer));
  const out: WorkspaceFile[] = [];
  for (const [rawPath, bytes] of Object.entries(entries)) {
    if (rawPath.endsWith("/")) continue;
    const clean = normalizeWorkspacePath(rawPath);
    if (!clean || /(^|\/)(node_modules|\.gradle|build|\.git)\//i.test(clean) || /(^|\/)\.env(?:\.|$)/i.test(clean)) continue;
    if (bytes.byteLength > 1_500_000) continue;
    const content = strFromU8(bytes);
    out.push({
      path: clean,
      content,
      language: languageForPath(clean),
      updatedAt: Date.now(),
    });
  }
  return out;
}

export function exportWebsite(files: WorkspaceFile[], title: string) {
  const source: Record<string, string> = {};
  for (const file of files) source[file.path] = file.content;
  const html = previewDocument(files);
  if (html && !source["index.html"] && !files.some((f) => /\.(kt|java|dart)$/.test(f.path))) {
    source["index.html"] = html;
  }
  source["README.md"] = `# ${title}\n\nProject exported from SUJITH AI.\n`;
  zipAndDownload(source, `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sujith-project"}.zip`);
}

function androidScaffold(title: string, websiteFiles: WorkspaceFile[], generatedFiles: WorkspaceFile[]) {
  const projectName = title.replace(/[^A-Za-z0-9 ]/g, "").trim() || "SujithApp";
  const generated = Object.fromEntries(generatedFiles.map((file) => [file.path, file.content]));
  const hasFlutter = generatedFiles.some((f) => f.path.endsWith(".dart") || f.path === "pubspec.yaml");

  if (hasFlutter) {
    const mergedFlutter: Record<string, string> = {};
    for (const file of generatedFiles) mergedFlutter[file.path] = file.content;
    if (!mergedFlutter[".github/workflows/sujith-android-apk.yml"]) {
      mergedFlutter[".github/workflows/sujith-android-apk.yml"] = `name: Build Flutter Android APK\non:\n  workflow_dispatch:\n  push:\n    branches: [ main, master ]\njobs:\n  build-apk:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-java@v4\n        with: { distribution: temurin, java-version: "17" }\n      - uses: subosito/flutter-action@v2\n        with: { channel: stable, cache: true }\n      - run: flutter pub get\n      - run: flutter build apk --debug\n      - uses: actions/upload-artifact@v4\n        with:\n          name: sujith-android-debug-apk\n          path: build/app/outputs/flutter-apk/*.apk\n`;
    }
    mergedFlutter["README-ANDROID.md"] = `# ${projectName} - Flutter Android Project\n\nRun \`flutter pub get && flutter build apk --debug\` or push to GitHub Actions to build a debug APK.\n`;
    return mergedFlutter;
  }

  const merged: Record<string, string> = {
    "settings.gradle.kts":
      generated["settings.gradle.kts"] ??
      `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }\nrootProject.name = "${projectName.replace(/\s+/g, "")}"\ninclude(":app")\n`,
    "build.gradle.kts":
      generated["build.gradle.kts"] ??
      `plugins {\n    id("com.android.application") version "8.7.3" apply false\n    id("org.jetbrains.kotlin.android") version "2.0.21" apply false\n    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false\n}\n`,
    "gradle.properties":
      generated["gradle.properties"] ??
      `org.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8\nandroid.useAndroidX=true\nkotlin.code.style=official\n`,
    "app/build.gradle.kts":
      generated["app/build.gradle.kts"] ??
      `plugins {\n    id("com.android.application")\n    id("org.jetbrains.kotlin.android")\n    id("org.jetbrains.kotlin.plugin.compose")\n}\n\nandroid {\n    namespace = "com.sujith.generated"\n    compileSdk = 35\n    defaultConfig {\n        applicationId = "com.sujith.generated"\n        minSdk = 24\n        targetSdk = 35\n        versionCode = 1\n        versionName = "1.0"\n    }\n    buildFeatures { compose = true }\n    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }\n    kotlinOptions { jvmTarget = "17" }\n}\n\ndependencies {\n    implementation(platform("androidx.compose:compose-bom:2024.12.01"))\n    implementation("androidx.activity:activity-compose:1.9.3")\n    implementation("androidx.compose.ui:ui")\n    implementation("androidx.compose.material3:material3")\n    implementation("androidx.navigation:navigation-compose:2.8.5")\n}\n`,
    "app/src/main/res/values/strings.xml":
      generated["app/src/main/res/values/strings.xml"] ??
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">${projectName}</string>\n</resources>\n`,
    "app/src/main/AndroidManifest.xml":
      generated["app/src/main/AndroidManifest.xml"] ??
      `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <uses-permission android:name="android.permission.INTERNET" />\n    <application android:label="@string/app_name" android:usesCleartextTraffic="false" android:allowBackup="false">\n        <activity android:name=".MainActivity" android:exported="true">\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n        </activity>\n    </application>\n</manifest>\n`,
    ".github/workflows/sujith-android-apk.yml":
      generated[".github/workflows/sujith-android-apk.yml"] ??
      `name: Build Android Debug APK\non:\n  workflow_dispatch:\n  push:\n    branches: [ main, master ]\njobs:\n  build-apk:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-java@v4\n        with: { distribution: temurin, java-version: "17" }\n      - uses: android-actions/setup-android@v3\n      - uses: gradle/actions/setup-gradle@v4\n        with: { gradle-version: "8.11.1" }\n      - run: gradle assembleDebug --stacktrace\n      - uses: actions/upload-artifact@v4\n        with:\n          name: sujith-android-debug-apk\n          path: app/build/outputs/apk/debug/*.apk\n`,
    "README-ANDROID.md": `# ${projectName} - Android Studio Project\n\nIncludes native source modules, Gradle build files, AndroidManifest.xml, and GitHub Actions APK CI workflow.\n\n## Build an APK\n- **Local**: Open this directory in Android Studio (JDK 17 + Android SDK 35) and run \`gradle assembleDebug\` or Build > Build APK(s).\n- **Cloud**: Push to GitHub to run \`.github/workflows/sujith-android-apk.yml\` and download the compiled debug APK artifact.\n`,
  };

  for (const file of generatedFiles) {
    merged[file.path] = file.content;
  }
  const hasNativeEntry = generatedFiles.some((f) => /\.(kt|java)$/i.test(f.path));
  if (!hasNativeEntry) {
    const bundledWebsite = websiteFiles.filter((file) => !file.path.startsWith("app/") && !file.path.startsWith("src/"));
    for (const file of bundledWebsite) merged[`app/src/main/assets/${file.path}`] = file.content;
    if (!bundledWebsite.some((file) => file.path === "index.html")) {
      const doc = previewDocument(websiteFiles);
      if (doc) merged["app/src/main/assets/index.html"] = doc;
    }
    merged["app/src/main/java/com/sujith/generated/MainActivity.kt"] =
      `package com.sujith.generated\n\nimport android.app.Activity\nimport android.os.Bundle\nimport android.webkit.WebChromeClient\nimport android.webkit.WebView\nimport android.webkit.WebViewClient\n\nclass MainActivity : Activity() {\n    override fun onCreate(savedInstanceState: Bundle?) {\n        super.onCreate(savedInstanceState)\n        val webView = WebView(this)\n        webView.settings.javaScriptEnabled = true\n        webView.settings.domStorageEnabled = true\n        webView.webChromeClient = WebChromeClient()\n        webView.webViewClient = WebViewClient()\n        setContentView(webView)\n        webView.loadUrl("file:///android_asset/index.html")\n    }\n}\n`;
  }
  return merged;
}

export function exportAndroidProject(title: string, websiteFiles: WorkspaceFile[], generatedFiles: WorkspaceFile[]) {
  const files = androidScaffold(title, websiteFiles, generatedFiles);
  zipAndDownload(files, `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sujith-android"}-android-studio.zip`);
}

export function createAndroidSources(title: string, websiteFiles: WorkspaceFile[]): WorkspaceFile[] {
  return Object.entries(androidScaffold(title, websiteFiles, [])).map(([path, content]) => ({
    path,
    content,
    language: languageForPath(path),
    updatedAt: Date.now(),
  }));
}
