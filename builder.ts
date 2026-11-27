import type { BuildTarget, WorkspaceFile } from "./types";

export const WEBSITE_LANGUAGES = [
  "HTML", "CSS", "JavaScript", "TypeScript", "Python", "PHP", "Java", "Kotlin", "C#", "Ruby",
  "Go", "Rust", "C", "C++", "SQL", "Dart", "Swift", "Scala", "Perl", "Lua", "R",
  "React", "Next.js", "Angular", "Vue.js", "Svelte", "Node.js", "Express.js", "Django", "Flask",
  "Laravel", "ASP.NET", "Spring Boot", "Tailwind CSS", "Bootstrap", "jQuery", "WebAssembly",
  "GraphQL", "Solidity", "WebGL", "Three.js", "WebGPU", "Astro", "Nuxt.js", "Remix", "Gatsby", "WordPress",
] as const;

export const ANDROID_LANGUAGES = [
  "Kotlin", "Java", "Dart", "JavaScript", "TypeScript", "XML", "C", "C++", "C#", "Python",
  "Swift", "Rust", "Go", "PHP", "HTML", "CSS", "SQL", "Lua", "Ruby", "Scala", "Groovy",
  "Shell", "Bash", "Gradle", "Jetpack Compose", "Flutter", "React Native", "Android SDK", "NDK",
] as const;

export const WEB_BUILDER_RULE =
  "You are an autonomous senior full-stack software engineer inside SUJITH AI. Always write REAL, production-grade code — NEVER generate simulated delays, fake mock responses, canned placeholders, or tutorial-only text.\n" +
  "LANGUAGE & COHESIVE STACK SELECTION:\n" +
  "  A) DEFAULT WEB APP STACK (enforce whenever no other framework/language is explicitly requested): Real cohesive **Vite + React + TypeScript + Tailwind CSS** structure (`index.html`, `package.json`, `tsconfig.json`, `src/main.tsx`, `src/App.tsx`, `src/index.css` with `@import \"tailwindcss\";`, `src/types.ts`, and modular `src/components/*.tsx`). Never mix legacy vanilla root scripts like `app.js` or `script.js` alongside React `src/*.tsx` modules.\n" +
  "  B) REQUESTED REAL CODING LANGUAGES & FRAMEWORKS: Whenever the user explicitly asks for another language or framework, build cleanly in THAT exact language:\n" +
  "     - **Next.js (TypeScript)**: `app/page.tsx` (or `src/app/page.tsx`), `app/layout.tsx`, `app/globals.css`, `src/components/*.tsx`, `package.json`, `tsconfig.json`.\n" +
  "     - **Python (FastAPI / Flask / CLI / Data)**: `main.py` (or `app.py`), modular `.py` packages, `requirements.txt`.\n" +
  "     - **Node.js / Express / Go / Rust / C/C++ / PHP / Java / SQL**: complete runnable entry points, types/structs, dependency manifests.\n" +
  "     - **Vanilla HTML/CSS/JS**: ONLY when explicitly requested (`index.html`, `styles.css`, `app.js`).\n" +
  "ENGINEERING & UI STANDARDS (REAL IMPLEMENTATION, ZERO FAKE DEMOS):\n" +
  "1. Real Logic & State: Implement genuine algorithms, calculations, validation, error handling, keyboard shortcuts, and `localStorage` persistence where appropriate. NEVER use phrases or patterns like 'simulated asynchronous delays' or fake canned bot replies.\n" +
  "2. Complete Working Controls: Every rendered button, tab, sidebar drawer, search bar, filter, modal, copy button, and form MUST have real working event handlers and state.\n" +
  "3. Real AI Features (whenever building an AI chat / assistant web app): Build modular typed components (`Sidebar`, `MessageList`, `Composer`, `SettingsModal`) connected directly to `window.SUJITH.ai.stream(messages, onFullText, { systemPrompt, temperature })` / `window.SUJITH.ai.chat(...)` / `window.SUJITH.ai.abort()`.\n" +
  "4. Styling: Use clean Tailwind utility classes or standard CSS custom properties. Never reference broken external `tailwind.min.css` CDN stylesheets.\n" +
  "5. STRICTLY FORBIDDEN: `.env` files, hardcoded API keys/secrets, `TODO` stubs, ellipsis `...`, or `'Powered by OpenAI' / 'Powered by GPT-...'` footer text.";

export const ANDROID_BUILDER_RULE =
  "You are an autonomous senior native Android Studio & Flutter mobile engineer inside SUJITH AI. Build a COMPLETE, compilable multi-file native project (never mention `window.SUJITH` or browser APIs in Kotlin/Java/Dart).\n" +
  "STACK SELECTION:\n" +
  "- Default: Kotlin + Jetpack Compose + Material 3 + Gradle Kotlin DSL (`.kts`).\n" +
  "- If user asks for Java / XML: Java + Android XML layouts (`app/src/main/res/layout/*.xml`).\n" +
  "- If user asks for Flutter / Dart: Flutter (`pubspec.yaml`, `lib/main.dart`, `lib/screens/*.dart`, `lib/widgets/*.dart`, `lib/services/*.dart`).\n" +
  "REQUIRED COMPLETE ANDROID STUDIO PROJECT FILES (NEVER omit Manifest or Gradle!):\n" +
  "1. Root & Module Gradle Scripts (compatible with AGP 8.7.3 + Kotlin 2.0.21 + JDK 17 + Android SDK 35):\n" +
  "   - `settings.gradle.kts` (`include(\":app\")`, `pluginManagement`, `dependencyResolutionManagement`)\n" +
  "   - `build.gradle.kts` (`plugins { id(\"com.android.application\") version \"8.7.3\" apply false; ... }`)\n" +
  "   - `gradle.properties` (`org.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8`, `android.useAndroidX=true`)\n" +
  "   - `app/build.gradle.kts` (matching `namespace = \"com.sujith.generated\"`, `applicationId`, `compileSdk = 35`, `minSdk = 24`, `targetSdk = 35`, `buildFeatures { compose = true }`, Compose BOM + Material 3 + Navigation dependencies)\n" +
  "2. Manifest & Resources:\n" +
  "   - `app/src/main/res/values/strings.xml` (real `app_name`)\n" +
  "   - `app/src/main/AndroidManifest.xml` (valid XML declaring `<application android:label=\"@string/app_name\">` and `android:name=\".MainActivity\"` with `MAIN` + `LAUNCHER` `<intent-filter>`)\n" +
  "3. Layered Modular Kotlin Compose Source Files under `app/src/main/java/com/sujith/generated/` (matching the package in `app/build.gradle.kts`):\n" +
  "   - `ui/theme/Theme.kt` (Material 3 color scheme + typography)\n" +
  "   - `data/Models.kt` & `viewmodel/AppViewModel.kt` (real state management, models, offline persistence/logic)\n" +
  "   - `components/Components.kt` (reusable Compose UI components)\n" +
  "   - `screens/*Screen.kt` (complete Material 3 screens using `Scaffold`, `TopAppBar`, `NavigationBar`, `LazyColumn`, `Card`, `OutlinedTextField`, `Button`, `FloatingActionButton`)\n" +
  "   - `MainActivity.kt` (wires `ComponentActivity` + `setContent` + theme + navigation)\n" +
  "4. QUALITY & VISUAL RULES:\n" +
  "   - Keep every file complete, cleanly balanced (`{}`, `()`, XML tags), and free of syntax errors, missing imports, ellipsis (`...`), or `TODO()` stubs.\n" +
  "   - If the user attaches a screenshot or UI design image, reproduce its exact screen structure, colors, cards, and navigation in native Compose/XML/Flutter.\n" +
  "   - STRICTLY FORBIDDEN: `.env`, hardcoded API keys, `server.js`, browser globals (`window.`, `document.`, `localStorage`) inside Kotlin/Java/Dart, or `'Powered by OpenAI' / 'Powered by GPT-...'` text.";

const BUILD_VERB = /\b(build|buld|biuld|bild|create|creat|make|maek|design|desing|generate|code|develop|update|change|modify|add|remove|fix|improve|redesign|write|prepare|convert|turn|pannu|pannan|pannanum|seiyanum|sey|kattu|kattanum|venum|banao|ready)\b/i;
const BUILD_NOUN = /\b(website|web ?site|landing ?page|web ?app|webapp|application|app|ai|bot|assistant|dashboard|portfolio|page|game|html|site|tool|calculator|screen|interface|ui|layout|todo|to-do|tracker|timer|clock|stopwatch|quiz|player|weather|notes|editor|converter|calendar|form|login|signup|shop|store|cart|chat|ai chat|chatbot|clone|blog|resume|card|counter|generator|planner|budget|expense|ecommerce|gallery|kanban|pomodoro|snake|chess|tic ?tac ?toe|react|next\.?js|angular|vue|svelte|tailwind|bootstrap|three\.?js|webgl|webgpu|flutter|compose|android|apk|kotlin|python|django|flask|laravel|wordpress|fastapi|express|spring boot|rust|golang|php|ndk|native|project)\b/i;
const CASUAL_QUESTION = /^\s*(?:hi+|hello+|hey+|vanakkam|namaste|good\s+(?:morning|afternoon|evening|night)|how are you|thanks?|thank you|nandri|ok(?:ay)?|yes|no|what is|who is|why |how does|how do |can you explain|explain |define |difference between)\b/i;

export function isAndroidBuildRequest(prompt: string) {
  return /\b(android|apk|jetpack compose|android studio|android sdk|ndk|flutter|dart|kotlin|gradle|xml layout)\b/i.test(prompt);
}

export function isWebsiteBuildRequest(prompt: string) {
  return /\b(website|web ?site|web ?app|webapp|web ?page|landing ?page|html|css|javascript|typescript|react|tsx|jsx|next\.?js|tailwind|vue|svelte|browser|python|fastapi|flask|django|node\.?js|express|golang|rust|c\+\+|php|sql)\b/i.test(prompt);
}

export function detectBuildTarget(
  prompt: string,
  defaultTarget: BuildTarget,
  existingFiles: WorkspaceFile[] = []
): BuildTarget {
  const wantsAndroid = isAndroidBuildRequest(prompt);
  const wantsWeb = isWebsiteBuildRequest(prompt);
  if (wantsAndroid && !wantsWeb) return "android";
  if (wantsWeb && !wantsAndroid) return "website";
  if (existingFiles.length > 0) {
    return isAndroidProject(existingFiles) ? "android" : "website";
  }
  return defaultTarget;
}

export function shouldEnforceReactVite(
  prompt: string,
  existingFiles: WorkspaceFile[] = [],
  targetMode: BuildTarget = "website"
): boolean {
  if (targetMode === "android") return false;
  const explicitlyOtherStack =
    /\b(vanilla html|plain html|html only|only html|html\/css\/js|static html|next\.?js|nuxt|svelte|vue|angular|astro|remix|python|fastapi|flask|django|golang|\bgo\b|rust|c\+\+|php|ruby|java\b|spring boot|cli tool|command line|sql schema)\b/i.test(
      prompt
    );
  if (explicitlyOtherStack) return false;
  const wantsReactExplicitly = /\b(react|vite|tsx|tailwind)\b/i.test(prompt);
  if (wantsReactExplicitly) return true;
  if (existingFiles.length > 0) {
    const hasReact = existingFiles.some((f) => /\.(?:tsx|jsx)$/i.test(f.path));
    const hasOtherRuntime = existingFiles.some((f) =>
      /\.(?:py|go|rs|php|rb|java)$/i.test(f.path) || /^(?:app\/page\.tsx|src\/app\/page\.tsx)$/i.test(f.path)
    );
    if (hasOtherRuntime && !hasReact) return false;
  }
  return true;
}

export function isBuildRequest(prompt: string, hasExistingProject = false) {
  const clean = prompt.trim();
  if (!clean) return false;
  if (CASUAL_QUESTION.test(clean) && !BUILD_VERB.test(clean)) {
    return false;
  }
  if (
    BUILD_VERB.test(clean) ||
    BUILD_NOUN.test(clean) ||
    hasExistingProject ||
    /^\s*(?:a |an )?(?:simple |modern |real |interactive )?[a-z0-9 .+_-]{0,40}\b(app|website|web ?app|calculator|game|dashboard|todo|tracker|timer|tool|chat|clone|store|portfolio|player|weather|editor|notes|form|login|shop|planner|kanban)\b/i.test(clean)
  ) {
    return true;
  }
  return clean.split(/\s+/).length >= 1 && !/\?\s*$/.test(clean);
}

export function extractHtml(text: string): string | null {
  const namedClosed = text.match(/```html(?:\s*:\s*[^\n]+|\s+path=[^\n]+)?\s*\n([\s\S]*?)```/i);
  if (namedClosed) return namedClosed[1].trim();
  const closed = text.match(/```html\s*\n([\s\S]*?)```/i);
  if (closed) return closed[1].trim();
  const open = text.match(/```html(?:\s*:\s*[^\n]+)?\s*\n([\s\S]*)$/i);
  if (open && /<(html|body|div|main|section|header|!doctype)/i.test(open[1])) return open[1].trim();
  const document = text.match(/<!doctype html[\s\S]*<\/html>/i);
  return document ? document[0] : null;
}

export function stripCodeFiles(text: string) {
  const cleaned = text
    .replace(/(`{3,}|~{3,})[\w.+-]*(?:\s*:\s*[^\n]+|\s+path=[^\n]+)?\s*\n[\s\S]*?(?:\1|$)/gi, "");

  const lines = cleaned.split("\n");

  const isHeadingOrDivider = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^[-_*]{3,}$/.test(trimmed)) return true;
    if (/^#{1,6}\s+/.test(trimmed)) return true;
    if (/^\d+\.\s+[`*_]*(?:[A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,12}|\.?[A-Za-z0-9_./-]+)[`*_]*(?:\s*\(.*?\))?:?$/i.test(trimmed)) return true;
    if (/^\d+\.\s+[`*_]*(?:project file tree|directory structure|file structure|source files?|components?|package\.json|\.env)[`*_]*/i.test(trimmed)) return true;
    if (/^[`*_]*(?:[A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,12}|\.?[A-Za-z0-9_./-]+)[`*_]*(?:\s*\(.*?\))?:?$/i.test(trimmed)) return true;
    return false;
  };

  const isTreeOrIntroLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/[├└│─]/.test(trimmed)) return true;
    if (/^(?:install dependencies|create (?:this )?file|do not commit this file|save (?:this )?(?:as|to)|project file tree|directory structure|run the project|dependencies|configuration|environment variables?)\b/i.test(
      trimmed.replace(/[*_`:]/g, "").trim()
    )) return true;
    if (/^[-*+]\s+`?[A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,12}`?/i.test(trimmed)) return true;
    if (/^(?:OPENAI_API_KEY|PORT|GEMINI_API_KEY|ANTHROPIC_API_KEY)\s*=/i.test(trimmed)) return true;
    if (/^it is listed in \.gitignore/i.test(trimmed)) return true;
    return false;
  };

  const kept: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      kept.push(line);
      continue;
    }
    if (isTreeOrIntroLine(line)) {
      continue;
    }
    if (isHeadingOrDivider(line)) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j += 1;
      if (j >= lines.length || isHeadingOrDivider(lines[j]) || isTreeOrIntroLine(lines[j])) {
        continue;
      }
    }
    kept.push(line);
  }

  return kept
    .join("\n")
    .replace(/(?:^\s*[-_*]{3,}\s*$\n?)+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function siteTitle(html: string) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim().slice(0, 60) || "index.html" : "index.html";
}

export function isAndroidPath(path: string) {
  return (
    path.endsWith(".kt") ||
    path.endsWith(".kts") ||
    path.endsWith(".dart") ||
    path.endsWith("AndroidManifest.xml") ||
    path === "pubspec.yaml" ||
    /^app\/(?:src\/|build\.gradle|proguard)/i.test(path)
  );
}

export function isAndroidProject(files: WorkspaceFile[]) {
  return files.some((file) => isAndroidPath(file.path));
}
