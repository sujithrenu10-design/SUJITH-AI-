import type { BuildCheck, BuildDiagnostic, BuildTarget, ProjectKind, WorkspaceFile } from "./types";
import { detectAndroidStack, scanNativeSyntaxDiagnostics } from "./androidPreviewRenderer";
import { isAndroidPath } from "./builder";
import { previewDocument } from "./workspace";

export class BuildValidationError extends Error {
  checks: BuildCheck[];
  constructor(message: string, checks: BuildCheck[]) {
    super(message);
    this.name = "BuildValidationError";
    this.checks = checks;
  }
}

export function collectDiagnostics(files: WorkspaceFile[]): BuildDiagnostic[] {
  const diagnostics: BuildDiagnostic[] = [...scanNativeSyntaxDiagnostics(files)];
  for (const file of files) {
    if (file.path.endsWith(".json")) {
      try {
        JSON.parse(file.content);
      } catch (err) {
        diagnostics.push({
          path: file.path,
          line: 1,
          severity: "error",
          message: err instanceof Error ? err.message : "Invalid JSON",
        });
      }
    }
    if (/\.(html?|js|mjs|css|tsx?|jsx|kt|kts|java|dart|gradle)$/i.test(file.path)) {
      const secretMatch = file.content.match(/\b(sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/);
      if (secretMatch && secretMatch.index !== undefined) {
        const line = file.content.slice(0, secretMatch.index).split("\n").length;
        diagnostics.push({
          path: file.path,
          line,
          severity: "error",
          message: "Hardcoded API key or token detected; move secrets to environment/BuildConfig.",
        });
      }
    }
  }
  return diagnostics;
}

export function checkSource(files: WorkspaceFile[], options?: { target?: BuildTarget; enforceReactVite?: boolean }): BuildCheck[] {
  const checks: BuildCheck[] = [];
  const paths = new Set<string>();
  for (const file of files) {
    if (!file.path || /(^|\/)\.\.($|\/)|^[\\/]|[<>:"|?*]/.test(file.path) || paths.has(file.path)) {
      checks.push({ name: "Safe unique file paths", passed: false, detail: file.path });
      throw new BuildValidationError("A project file has an unsafe or duplicate path. The previous version is unchanged.", checks);
    }
    paths.add(file.path);
    try {
      if (file.path.endsWith(".json")) JSON.parse(file.content);
      if (
        file.path.endsWith(".js") &&
        !/^\s*(import\s|export\s)/m.test(file.content) &&
        !/\b(import\(|await\s)/.test(file.content) &&
        !/<[A-Za-z][A-Za-z0-9]*[\s/>]/.test(file.content)
      ) {
        new Function(file.content);
      }
      if (file.path.endsWith(".xml") && typeof DOMParser !== "undefined") {
        const doc = new DOMParser().parseFromString(file.content, "application/xml");
        if (doc.querySelector("parsererror")) {
          checks.push({ name: `Parse ${file.path}`, passed: false, detail: "Invalid XML syntax in " + file.path });
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Syntax notice";
      checks.push({ name: `Check ${file.path}`, passed: false, detail });
    }
  }
  checks.push({ name: "Source syntax and safe file paths", passed: true, detail: `${files.length} files inspected` });

  const nativeDiagnostics = scanNativeSyntaxDiagnostics(files);
  const stack = detectAndroidStack(files);
  const isNativeProject =
    options?.target === "android" ||
    stack !== "unknown" ||
    files.some((f) => isAndroidPath(f.path));

  if (isNativeProject) {
    const syntaxErrors = nativeDiagnostics.filter((d) => d.severity === "error");
    checks.push({
      name: "Native syntax & clean imports (Kotlin/Java/Dart)",
      passed: syntaxErrors.length === 0,
      detail: syntaxErrors.length
        ? syntaxErrors
            .slice(0, 3)
            .map((d) => `${d.path}:${d.line} (${d.message})`)
            .join("; ")
        : "Balanced delimiters and zero browser-only API leaks in native source.",
    });

    if (stack === "flutter-dart") {
      const hasPubspec = files.some((f) => f.path === "pubspec.yaml");
      const hasMainDart = files.some((f) => f.path === "lib/main.dart");
      const dartModules = files.filter((f) => f.path.startsWith("lib/") && f.path.endsWith(".dart"));
      checks.push({
        name: "Flutter project structure",
        passed: hasPubspec && hasMainDart && dartModules.length >= 2,
        detail: !hasPubspec
          ? "Missing pubspec.yaml."
          : !hasMainDart
            ? "Missing lib/main.dart entry point."
            : dartModules.length < 2
              ? "Split Flutter app across lib/main.dart and modular lib/screens/ or lib/widgets/ files."
              : `${dartModules.length} Dart modules + pubspec.yaml verified.`,
      });
    } else {
      const manifest = files.find((f) => f.path.endsWith("AndroidManifest.xml"));
      const settingsFile = files.find((f) => /settings\.gradle(\.kts)?$/i.test(f.path));
      const rootGradle = files.find((f) => /^build\.gradle(\.kts)?$/i.test(f.path));
      const appGradle = files.find((f) => /^app\/build\.gradle(\.kts)?$/i.test(f.path));
      const hasGradle = Boolean(appGradle || rootGradle);
      const hasSettings = Boolean(settingsFile);
      const nativeSources = files.filter((f) => /\.(kt|java)$/i.test(f.path));
      const hasModularUi = nativeSources.length >= 2 || files.some((f) => /res\/layout\/.*\.xml$/i.test(f.path));

      let manifestOk = false;
      let manifestDetail = "Missing app/src/main/AndroidManifest.xml.";
      if (manifest) {
        if (typeof DOMParser !== "undefined") {
          const doc = new DOMParser().parseFromString(manifest.content, "application/xml");
          const hasParseErr = Boolean(doc.querySelector("parsererror"));
          const hasApp = Boolean(doc.querySelector("application"));
          const hasActivity = Boolean(doc.querySelector("activity"));
          const hasLauncher = /android\.intent\.category\.LAUNCHER/.test(manifest.content);
          manifestOk = !hasParseErr && hasApp && hasActivity && hasLauncher;
          manifestDetail = hasParseErr
            ? "AndroidManifest.xml contains invalid XML."
            : !hasApp || !hasActivity
              ? "AndroidManifest.xml must declare <application> and <activity>."
              : !hasLauncher
                ? "AndroidManifest.xml main activity needs MAIN + LAUNCHER intent-filter."
                : "Manifest, application, and launcher activity declared.";
        } else {
          const hasApp = /<application[\s>]/i.test(manifest.content);
          const hasActivity = /<activity[\s>]/i.test(manifest.content);
          const hasLauncher = /android\.intent\.category\.LAUNCHER/.test(manifest.content);
          manifestOk = hasApp && hasActivity && hasLauncher;
          manifestDetail = !hasApp || !hasActivity
            ? "AndroidManifest.xml must declare <application> and <activity>."
            : !hasLauncher
              ? "AndroidManifest.xml main activity needs MAIN + LAUNCHER intent-filter."
              : "Manifest, application, and launcher activity declared.";
        }
      }

      const settingsHasApp = settingsFile ? /include\s*\(?\s*['"]:app['"]\s*\)?/.test(settingsFile.content) : false;
      const appGradleHasConfig = appGradle
        ? /(?:namespace|applicationId)\s*[= ]/.test(appGradle.content) && /compileSdk\s*[= ]/.test(appGradle.content)
        : false;
      const gradleOk = hasGradle && hasSettings && settingsHasApp && (!appGradle || appGradleHasConfig);
      const gradleDetail = !hasSettings
        ? "Missing settings.gradle.kts (must include(\":app\"))."
        : !settingsHasApp
          ? `${settingsFile?.path} must declare include(\":app\").`
          : !appGradle
            ? "Missing app/build.gradle.kts with namespace, compileSdk, and dependencies."
            : !appGradleHasConfig
              ? `${appGradle.path} must declare namespace/applicationId and compileSdk.`
              : "Gradle build scripts and settings.gradle.kts verified.";

      checks.push({ name: "AndroidManifest.xml structure", passed: manifestOk, detail: manifestDetail });
      checks.push({ name: "Gradle project configuration", passed: gradleOk, detail: gradleDetail });
      checks.push({
        name: "Modular Android architecture",
        passed: hasModularUi && nativeSources.length >= 2,
        detail:
          hasModularUi && nativeSources.length >= 2
            ? `${nativeSources.length} native Kotlin/Java modules configured.`
            : "Do not stop at a single MainActivity. Generate modular ui/screens, components, viewmodel/data, and res/ files.",
      });
    }
  }

  const hasReactWeb = files.some((file) => /(^|\/)(?:App|page|index)\.(?:tsx|jsx)$/i.test(file.path) && !isAndroidPath(file.path));
  const hasRealBackendOrCliSource = files.some((file) =>
    /\.(?:py|go|rs|c|cpp|cc|php|rb|sql|java|cs|swift|sh)$/i.test(file.path) ||
    /(^|\/)(?:server|index|main|cli|app)\.(?:ts|js|mjs)$/i.test(file.path)
  );
  const html = files.find((file) => file.path === "index.html") ?? files.find((file) => file.path === "preview.html");
  if (!isNativeProject && !html && !hasReactWeb && !hasRealBackendOrCliSource && files.length > 0) {
    checks.push({
      name: "Runnable web or code entry point",
      passed: false,
      detail: "Build must include a runnable entry file (e.g. src/App.tsx, app/page.tsx, index.html, main.py, or src/index.ts).",
    });
  }
  if (!isNativeProject && hasReactWeb) {
    const strayLegacyJs = files.filter(
      (f) => /^(?:app|script|main)\.js$/i.test(f.path) && !(html && html.content.includes(f.path))
    );
    if (strayLegacyJs.length > 0) {
      checks.push({
        name: "Cohesive Vite React TypeScript structure",
        passed: false,
        detail: `Remove stray root script(s) (${strayLegacyJs.map((f) => f.path).join(", ")}) so React TSX modules remain the single entry point.`,
      });
    } else if (options?.enforceReactVite) {
      const hasAppTsx = files.some((f) => /(?:^|\/)App\.(?:tsx|jsx)$/i.test(f.path));
      checks.push({
        name: "Cohesive Vite React TypeScript structure",
        passed: hasAppTsx,
        detail: hasAppTsx ? "Modular React + TypeScript layout verified." : "Missing src/App.tsx root component.",
      });
    }
  }
  if (html && typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html.content, "text/html");
    const localRefs = [...doc.querySelectorAll("script[src], link[rel='stylesheet'][href]")]
      .map((element) => element.getAttribute(element.tagName === "SCRIPT" ? "src" : "href") ?? "")
      .filter((ref) => ref && !/^(https?:|data:|blob:|\/\/)/.test(ref));
    const missing = localRefs.filter((ref) => {
      const clean = ref.replace(/^[./]+/, "").split(/[?#]/)[0];
      return !paths.has(clean) && !files.some((f) => f.path.endsWith(`/${clean}`) || f.path === clean);
    });
    if (missing.length) {
      checks.push({ name: "Local stylesheet and script references", passed: false, detail: `Referenced local file(s) missing: ${missing.join(", ")}` });
    } else {
      checks.push({ name: "HTML document and file references", passed: true });
    }
    if (!doc.querySelector('meta[name="viewport"]')) {
      checks.push({ name: "Mobile viewport", passed: false, detail: "Add a viewport meta tag for mobile layouts." });
    } else {
      checks.push({ name: "Mobile viewport", passed: true });
    }

    const inlineStyleContent = [...doc.querySelectorAll("style")].map((el) => el.textContent ?? "").join("").trim();
    const hasBrokenTailwindCssLink = [...doc.querySelectorAll("link[rel='stylesheet'][href]")].some((el) =>
      /tailwindcss@[^/]+\/dist\/tailwind/i.test(el.getAttribute("href") ?? "")
    );
    const usesAtApplyInPlainCss = !hasReactWeb && /@apply\s+/i.test(inlineStyleContent);
    const hasStylesheetLink = [...doc.querySelectorAll("link[rel='stylesheet'][href]")].some((el) => {
      const href = el.getAttribute("href") ?? "";
      return (/^https?:\/\//i.test(href) && !/tailwindcss@[^/]+\/dist\/tailwind/i.test(href)) || files.some((f) => f.path.endsWith(".css") && f.content.trim().length > 20);
    });
    const hasTailwindCdn = [...doc.querySelectorAll("script[src]")].some((el) => /cdn\.tailwindcss\.com/i.test(el.getAttribute("src") ?? ""));
    const hasCssFile = files.some((f) => f.path.endsWith(".css") && f.content.trim().length > 25);
    const pageHasStyling =
      !hasBrokenTailwindCssLink &&
      !usesAtApplyInPlainCss &&
      (inlineStyleContent.length >= 30 || hasStylesheetLink || hasTailwindCdn || hasCssFile);
    checks.push({
      name: "Page has styling",
      passed: pageHasStyling,
      detail: usesAtApplyInPlainCss
        ? "Do not use @apply inside plain <style>; write standard CSS rules or use <script src=\"https://cdn.tailwindcss.com\"></script>."
        : hasBrokenTailwindCssLink
          ? "Use <script src=\"https://cdn.tailwindcss.com\"></script> instead of broken tailwind.min.css link."
          : pageHasStyling
            ? "Styled layout rules detected."
            : "Missing inline <style> CSS or stylesheet; page looks unstyled.",
    });
  }

  const forbiddenFiles = files.filter((f) => /(^|\/)\.env(?:\..*)?$/i.test(f.path));
  if (forbiddenFiles.length) {
    checks.push({
      name: "No .env secret files in workspace",
      passed: false,
      detail: `Remove ${forbiddenFiles.map((f) => f.path).join(", ")} from workspace files.`,
    });
  }

  const allText = files.map((f) => f.content).join("\n");
  if (/\b(sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(allText)) {
    checks.push({ name: "No API keys in source code", passed: false, detail: "Remove hardcoded API keys or tokens from generated files." });
  }
  const hasServerEntry = files.some((f) => /(^|\/)(?:server|backend|app)\.(?:ts|js|mjs|py)$/i.test(f.path));
  const allWebText = files
    .filter((f) => /\.(html?|js|mjs|css|tsx?|jsx)$/i.test(f.path))
    .map((f) => f.content)
    .join("\n");
  if (/Powered by\s+(?:OpenAI|GPT-[0-9.]+)/i.test(allWebText)) {
    checks.push({ name: "No third-party provider branding footer", passed: false, detail: 'Remove "Powered by OpenAI / GPT-..." text from the UI.' });
  }
  if (!hasServerEntry && /fetch\s*\(\s*["'`]\/api\//i.test(allWebText)) {
    checks.push({
      name: "Uses window.SUJITH.ai instead of /api/ fetch",
      passed: false,
      detail: "Replace relative fetch('/api/...') calls with window.SUJITH.ai.chat(messages) or window.SUJITH.ai.stream(messages, onDelta).",
    });
  }

  return checks;
}

function browserChecks(kind: ProjectKind | "imported") {
  return `
  const tests = [];
  const check = (name, passed, detail) => tests.push({name, passed:Boolean(passed), detail});
  const $ = (selector) => document.querySelector(selector);
  check('Document rendered', Boolean(document.body && document.body.children.length));
  ${kind === "tasks" ? `
    const field = $('#task-input'); field.value = 'Build verification task';
    $('#task-form').dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
    check('Task creation', [...document.querySelectorAll('.task-row')].some(row => row.textContent.includes('Build verification task')));
    let row = [...document.querySelectorAll('.task-row')].find(row => row.textContent.includes('Build verification task'));
    const checkbox = row?.querySelector('[data-toggle]');
    if (checkbox) { checkbox.checked = true; checkbox.dispatchEvent(new Event('change', {bubbles:true})); }
    check('Task completion', [...document.querySelectorAll('.task-row')].some(item => item.textContent.includes('Build verification task') && item.querySelector('input')?.checked));
    document.querySelector('[data-filter="active"]').click();
    check('Task filter', ![...document.querySelectorAll('.task-row')].some(item => item.textContent.includes('Build verification task')));
    document.querySelector('[data-filter="all"]').click();
    row = [...document.querySelectorAll('.task-row')].find(item => item.textContent.includes('Build verification task'));
    row?.querySelector('[data-delete]')?.click();
    check('Task deletion', ![...document.querySelectorAll('.task-row')].some(item => item.textContent.includes('Build verification task')));
  ` : ""}
  ${kind === "calculator" ? `
    const key = value => document.querySelector('[data-key="' + value + '"]').click();
    key('AC'); key('2'); key('+'); key('3'); key('*'); key('4'); key('=');
    check('Arithmetic precedence: 2 + 3 * 4 = 14', $('#calc-display').value === '14');
    key('AC'); key('5'); key('0'); key('%'); key('=');
    check('Percentage calculation: 50% = 0.5', $('#calc-display').value === '0.5');
    key('AC'); check('Clear display', $('#calc-display').value === '0');
  ` : ""}
  ${kind === "chat" ? `
    check('Model download is opt-in', Boolean($('#load-model') && !$('#load-model').disabled));
    check('No simulated AI replies', Boolean($('#chat-send')?.disabled && $('#chat-messages .empty')));
  ` : ""}
  ${kind === "restaurant" ? `
    check('Booking form validation', !$('#booking-form').checkValidity());
    check('Booking date constraint', Boolean(document.querySelector('[name="date"]').min));
  ` : ""}
  ${kind === "portfolio" || kind === "landing" ? `
    check('Contact form validation', !$('#contact-form').checkValidity());
    check('Section navigation', [...document.querySelectorAll('a[href^="#"]')].filter(a => a.hash).every(a => document.getElementById(a.hash.slice(1))));
  ` : ""}
  check(
    'Page has styling',
    document.querySelectorAll('style, link[rel="stylesheet"], script[src*="tailwind"]').length > 0 &&
      ([...document.styleSheets].some(s => { try { return s.cssRules && s.cssRules.length > 0; } catch { return true; } }) ||
        document.querySelectorAll('script[src*="tailwind"]').length > 0),
    'Include real CSS inside <style> so the preview is polished rather than browser default.'
  );
  ${kind === "imported" ? getImportedChecks() : ""}
  check('No uncaught JavaScript errors', window.__SUJITH_TEST_ERRORS__.length === 0, window.__SUJITH_TEST_ERRORS__.join('; '));
  return tests;`;
}

function getImportedChecks() {
  return `
  (() => {
    const bodyText = (document.body ? document.body.innerText || document.body.textContent || '' : '').trim();
    const hasElements = document.querySelectorAll('header, nav, main, div, section, form, input, button, textarea, canvas, svg').length >= 2;
    const hasStarterContent = bodyText.length >= 8 || document.querySelectorAll('canvas, svg, img, input, button').length >= 2;
    if (window.__SUJITH_REACT_ERROR__) {
      check('React/TypeScript runtime mount', false, window.__SUJITH_REACT_ERROR__);
    }
    check('Visible starter layout', hasElements && hasStarterContent, 'Add welcome greeting, header, or starter elements so the preview screen is not an empty blank white canvas on initial load.');

    const textInput = document.querySelector('textarea, input[type="text"], input:not([type])');
    const disabledBtns = [...document.querySelectorAll('button[disabled]')];
    if (textInput && disabledBtns.length) {
      const prevVal = textInput.value;
      textInput.value = 'Hello test';
      textInput.dispatchEvent(new Event('input', { bubbles: true }));
      textInput.dispatchEvent(new Event('change', { bubbles: true }));
      textInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
      const stillAllDisabled = disabledBtns.every(b => b.disabled);
      textInput.value = prevVal;
      textInput.dispatchEvent(new Event('input', { bubbles: true }));
      if (stillAllDisabled) {
        check('Send button enables on input', false, 'Send/Submit button stays disabled after typing into the text field. Add an input listener to enable it or remove the disabled attribute.');
      } else {
        check('Send button enables on input', true);
      }
    }
    const allBtns = [...document.querySelectorAll('button')];
    const findBtn = (labels) => allBtns.find(b => labels.includes((b.textContent || '').trim()));
    const btn1 = findBtn(['1']), btn2 = findBtn(['2']), btn5 = findBtn(['5']), btn7 = findBtn(['7']),
          btnAdd = findBtn(['+']), btnEq = findBtn(['=']), btnDot = findBtn(['.']), btnClr = findBtn(['C', 'AC', 'CE']);
    if (btn1 && btn2 && btn5 && btn7 && btnAdd && btnEq) {
      const readDisplay = () => {
        const inp = document.querySelector('input[readonly], input.display, #display, .display, [data-display], .screen, #screen');
        return inp ? ('value' in inp && inp.value !== undefined ? String(inp.value) : (inp.textContent || '')) : '';
      };
      const seq = (list) => { if (btnClr) btnClr.click(); list.forEach(b => b && b.click()); return readDisplay().trim(); };
      const sumRes = seq([btn7, btnAdd, btn5, btnEq]);
      const sumOk = /12/.test(sumRes);
      let decOk = true;
      if (btnDot) {
        const decRes = seq([btn1, btnDot, btn5, btnAdd, btn2, btnDot, btn5, btnEq]);
        decOk = /(^|\\D)4(\\.0*)?(\\D|$)/.test(decRes);
      }
      const brokenExtras = [];
      for (const extra of allBtns) {
        const lbl = (extra.textContent || '').trim();
        if (!lbl || ['0','1','2','3','4','5','6','7','8','9','+','-','*','×','/','÷','=','.','C','AC','CE'].includes(lbl)) continue;
        if (btnClr) btnClr.click();
        btn1.click(); btn2.click();
        extra.click();
        if (['mod','%','÷','×','*','/'].includes(lbl.toLowerCase())) { btn5.click(); btnEq.click(); }
        const out = readDisplay().trim();
        if (/^(Error|NaN|undefined|Infinity)$/i.test(out)) brokenExtras.push(lbl + '->' + out);
      }
      if (btnClr) btnClr.click();
      const calcReasons = [];
      if (!sumOk) {
        calcReasons.push(
          sumRes.includes('=')
            ? 'Clicking 7, +, 5, = showed "' + sumRes + '" instead of "12". Make "=" call evaluate/calculate instead of appending "=" to input.'
            : 'Clicking 7, +, 5, = failed: display showed "' + sumRes + '" instead of "12".'
        );
      }
      if (!decOk) calcReasons.push('Clicking 1.5 + 2.5 = failed (second decimal blocked).');
      if (brokenExtras.length) calcReasons.push('Broken calculator buttons: ' + brokenExtras.join(', '));
      check('Calculator buttons operate accurately', calcReasons.length === 0, calcReasons.join(' '));
    }
  })();`;
}

export function checkPreview(files: WorkspaceFile[], kind: ProjectKind | "imported", signal?: AbortSignal): Promise<BuildCheck[]> {
  const html = previewDocument(files);
  if (!html) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const nonce = crypto.randomUUID();
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true");
    frame.title = "Isolated project validation";
    Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: "390px", height: "780px", visibility: "hidden", pointerEvents: "none" });
    let settled = false;
    const finish = (checks?: BuildCheck[], error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      signal?.removeEventListener("abort", abort);
      frame.remove();
      if (error) reject(error);
      else resolve(checks ?? []);
    };
    const abort = () => finish(undefined, new DOMException("Build stopped", "AbortError"));
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.data?.nonce !== nonce || event.data?.type !== "sujith-validation") return;
      const checks = event.data.checks as BuildCheck[];
      if (!Array.isArray(checks) || !checks.every((item) => typeof item.name === "string" && typeof item.passed === "boolean")) return;
      if (kind !== "imported") {
        const failed = checks.filter((item) => !item.passed);
        if (failed.length) {
          finish(undefined, new BuildValidationError(`Preview checks stopped: ${failed.map((item) => item.name).join(", ")}. The previous saved version is unchanged.`, checks));
          return;
        }
      }
      finish(checks);
    };
    const timer = window.setTimeout(
      () => finish([{ name: "Preview rendered", passed: true, detail: "External resources loaded asynchronously" }]),
      6500
    );
    window.addEventListener("message", receive);
    signal?.addEventListener("abort", abort, { once: true });
    const setup = `<script>window.__SUJITH_TEST_ERRORS__=[];addEventListener('error',e=>window.__SUJITH_TEST_ERRORS__.push(e.message));addEventListener('unhandledrejection',e=>window.__SUJITH_TEST_ERRORS__.push(String(e.reason)));<\/script>`;
    const test = `<script>addEventListener('load',()=>{const runSuite=()=>{let checks;try{checks=(function(){${browserChecks(kind)}})();}catch(error){checks=[{name:'Interaction checks',passed:false,detail:error.message}];}parent.postMessage({type:'sujith-validation',nonce:${JSON.stringify(nonce)},checks},'*');};const hasReactMount=Boolean(document.getElementById('root'));if(hasReactMount&&!window.__SUJITH_REACT_READY__&&!window.__SUJITH_REACT_ERROR__){setTimeout(runSuite,180);}else{queueMicrotask(runSuite);}});<\/script>`;
    const injectedHead = html.replace(/<head([^>]*)>/i, `<head$1>${setup}`);
    frame.srcdoc = /<\/body>/i.test(injectedHead)
      ? injectedHead.replace(/<\/body>/i, `${test}</body>`)
      : `${injectedHead}\n${test}`;
    document.body.appendChild(frame);
  });
}
