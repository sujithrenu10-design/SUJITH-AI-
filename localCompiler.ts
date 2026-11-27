import type { Attachment, ProjectKind, WorkspaceFile } from "./types";
import { makeProjectSources, type ProjectSpec } from "./projectSources";

export type LocalPlan = {
  action: "create" | "edit" | "import" | "review" | "help";
  spec?: ProjectSpec;
  edits: { type: "theme" | "accent" | "rename" | "replace" | "footer"; value: string; from?: string }[];
  items: string[];
  explanation?: string;
};

const accents: Record<string, string> = { blue: "#2864dc", green: "#217251", purple: "#7950c3", violet: "#7950c3", red: "#b93a3a", orange: "#b35f22", pink: "#b13f79", teal: "#147d85", black: "#202731", gold: "#96721f" };

function savedSpec(files: WorkspaceFile[]) {
  const json = files.find((file) => file.path === "sujith.project.json");
  if (!json) return undefined;
  try { return JSON.parse(json.content) as ProjectSpec; } catch { return undefined; }
}

function namedTitle(prompt: string) {
  const match = prompt.match(/(?:called|named|title(?:d)?(?:\s+(?:to|is|as))?|rename(?:\s+(?:it|this|the\s+app|the\s+website))?\s+to)\s+["'`]?([^"'`\n,.!?]{2,65})/i);
  if (match) return match[1].replace(/\s+(with|and|using|in)\s+.*$/i, "").trim();
  return prompt.match(/["'`]([^"'`]{2,65})["'`]/)?.[1]?.trim();
}

function detectKind(prompt: string): ProjectKind {
  if (/\b(ai\s*chat|chat\s*(app|bot)|chatbot|chat\s+application|chatgpt)\b/i.test(prompt)) return "chat";
  if (/\b(todo|to-do|task|tasks|checklist)\b/i.test(prompt)) return "tasks";
  if (/\b(calculator|calculate|arithmetic)\b/i.test(prompt)) return "calculator";
  if (/\b(restaurant|cafe|coffee|dining|bakery)\b/i.test(prompt)) return "restaurant";
  if (/\b(portfolio|photograph|photographer|personal\s+(site|website))\b/i.test(prompt)) return "portfolio";
  return "landing";
}

function newSpec(prompt: string): ProjectSpec {
  const kind = detectKind(prompt);
  const names = { chat: "My AI Chat", tasks: "Clearspace Tasks", calculator: "Everyday Calculator", portfolio: "My Portfolio", restaurant: "Gather & Table", landing: "New Perspective" };
  const color = Object.keys(accents).find((word) => new RegExp(`\\b${word}\\b`, "i").test(prompt));
  return {
    version: 1,
    kind,
    title: namedTitle(prompt) || names[kind],
    description: prompt.replace(/\s+/g, " ").replace(/^(please\s+)?(build|create|make|design|generate|develop)\s+(me\s+)?(a|an|the)\s+/i, "").slice(0, 180),
    accent: prompt.match(/#[0-9a-f]{6}\b/i)?.[0] || accents[color ?? "blue"],
    dark: /\b(dark|black|night)\s*(theme|mode|background)?\b/i.test(prompt),
  };
}

export function analyzeRequest(prompt: string, files: WorkspaceFile[], attachments: Attachment[]): LocalPlan {
  const text = prompt.trim();
  const lower = text.toLowerCase();
  const codeFiles = attachments.filter((file) => file.text !== undefined && /\.(html|css|js|json)$/i.test(file.name));
  if (codeFiles.length && (!text || /\b(import|open|use|read|check|review|fix|edit|update)\b/i.test(text))) {
    return { action: "import", edits: [], items: [`Read ${codeFiles.length} attached source file${codeFiles.length === 1 ? "" : "s"}.`, "Check source syntax and local file references.", "Save valid files to the workspace without replacing unrelated files."] };
  }

  if (/\b(read|review|explain|inspect|check)\b/i.test(lower) && files.length && !/\b(create|build|make|add|change|fix)\b/i.test(lower)) {
    return { action: "review", edits: [], items: ["Read the current project source.", "Count files, lines, and page structure.", "Report only facts found in the files."] };
  }

  const edits: LocalPlan["edits"] = [];
  if (files.length) {
    if (/\b(dark|night)\s*(theme|mode|background)\b|\b(make|change|switch|turn)\b.*\bdark\b/i.test(text)) edits.push({ type: "theme", value: "dark" });
    else if (/\b(light|white)\s*(theme|mode|background)\b|\b(make|change|switch|turn)\b.*\blight\b/i.test(text)) edits.push({ type: "theme", value: "light" });
    const color = Object.keys(accents).find((word) => new RegExp(`\\b${word}\\b`, "i").test(text));
    const hex = text.match(/#[0-9a-f]{6}\b/i)?.[0];
    if ((color || hex) && /\b(color|colour|accent|primary|button|make|change|use|theme)\b/i.test(text)) edits.push({ type: "accent", value: hex || accents[color!] });
    if (/\b(rename|name|title)\b/i.test(text)) {
      const title = namedTitle(text);
      if (title) edits.push({ type: "rename", value: title });
    }
    const replace = text.match(/replace\s+["'`]([^"'`]+)["'`]\s+(?:with|to)\s+["'`]([^"'`]+)["'`]/i);
    if (replace) edits.push({ type: "replace", from: replace[1], value: replace[2] });
    if (/\b(remove|hide)\s+(the\s+)?footer\b/i.test(text)) edits.push({ type: "footer", value: "remove" });
    const creating = /\b(build|create|generate)\b/i.test(text) && /\b(new|another|different)\b/i.test(text);
    if (edits.length && !creating) {
      return { action: "edit", spec: savedSpec(files), edits, items: edits.map((edit) => edit.type === "theme" ? `Apply the ${edit.value} theme.` : edit.type === "accent" ? `Set the accent color to ${edit.value}.` : edit.type === "rename" ? `Rename the app to ${edit.value}.` : edit.type === "footer" ? "Remove the page footer." : `Replace the exact text "${edit.from}".`).concat("Recheck the changed source and save only after checks pass.") };
    }
  }

  if (/\b(build|create|make|design|generate|develop)\b/i.test(text) && /\b(website|site|page|app|application|chat|portfolio|calculator|tasks?|todo|to-do|restaurant|cafe)\b/i.test(text)) {
    const spec = newSpec(text);
    const unsupported = /\b(payment|stripe|authentication|sign-in|database|firebase|supabase|multiplayer|video\s+generat|image\s+generat|banking|trading)\b/i.test(text);
    if (unsupported) return { action: "help", edits: [], items: [], explanation: "That request needs backend services or integrations the local compiler does not provide. No files were changed. Use the optional on-device code engine for broader code generation, or provide source files to edit." };
    if (spec.kind === "landing" && /\b(weather|ecommerce|e-commerce|shopping|social|video|music|finance|fitness|map|booking\s+app|game)\b/i.test(text)) {
      return { action: "help", edits: [], items: [], explanation: "That app is outside the current local compiler's supported types, so no generic page was substituted. Use the optional on-device AI engine for broader generation, or start with tasks, calculator, chat, portfolio, restaurant, or a landing page." };
    }
    return { action: "create", spec, edits: [], items: [
      `Create ${spec.kind === "chat" ? "a chat app with real, opt-in on-device inference" : spec.kind === "tasks" ? "a task manager with add, complete, delete, and filtering" : spec.kind === "calculator" ? "a keyboard-accessible arithmetic calculator" : spec.kind === "restaurant" ? "a restaurant page with a locally saved booking form" : spec.kind === "portfolio" ? "a responsive portfolio with a downloadable contact form" : "a responsive landing page with navigation and contact form"}.`,
      `Use the title "${spec.title}" and a ${spec.dark ? "dark" : "light"} theme.`,
      "Write separate HTML, CSS, JavaScript, and project configuration files.",
      "Validate source, run the available browser checks, and save the result.",
    ] };
  }

  return { action: "help", edits: [], items: [], explanation: files.length
    ? 'The local compiler can read your project, change its theme or accent color, rename it, remove its footer, or replace exact text. Try: Change to dark theme, Rename to "My App", or Replace "old text" with "new text". For broader requests, choose On-device AI in Settings. No files were changed.'
    : 'I can build a task manager, calculator, portfolio, restaurant page, landing page, or an AI chat interface with a real on-device model loader. This default engine is a local source compiler, not a cloud language model. Describe one of these apps, or turn on the optional on-device AI engine in Settings.' };
}

export function compilePlan(plan: LocalPlan, files: WorkspaceFile[], attachments: Attachment[]): WorkspaceFile[] {
  if (plan.action === "create" && plan.spec) return makeProjectSources(plan.spec);
  if (plan.action === "import") {
    const map = new Map(files.map((file) => [file.path, file]));
    for (const file of attachments) {
      if (file.text === undefined || !/\.(html|css|js|json)$/i.test(file.name)) continue;
      const path = file.name.replace(/[^a-z0-9_./-]/gi, "_").split("/").filter((part) => part !== ".." && part !== ".").join("/");
      map.set(path, { path, content: file.text, language: path.endsWith(".js") ? "javascript" : path.split(".").pop()!, updatedAt: Date.now() });
    }
    return [...map.values()];
  }
  if (plan.action !== "edit") return files;

  return files.map((file) => {
    let content = file.content;
    for (const edit of plan.edits) {
      if (edit.type === "replace" && edit.from && /\.(html|css|js|json)$/i.test(file.path)) content = content.split(edit.from).join(edit.value);
      if (file.path.endsWith(".css")) {
        if (edit.type === "accent") content = content.replace(/--accent\s*:\s*[^;}]+/g, `--accent:${edit.value}`);
        if (edit.type === "theme") {
          const palette = edit.value === "dark" ? { page: "#11151c", surface: "#1b222c", ink: "#eef2f8", muted: "#a2adbb", line: "#303b48" } : { page: "#fafaf8", surface: "#ffffff", ink: "#1b232e", muted: "#6c7480", line: "#e2e6ea" };
          for (const [key, value] of Object.entries(palette)) content = content.replace(new RegExp(`--${key}\\s*:\\s*[^;}]+`, "g"), `--${key}:${value}`);
          content = content.replace(/color-scheme\s*:\s*(?:dark|light)/g, `color-scheme:${edit.value}`);
        }
      }
      if (file.path.endsWith(".html") && (edit.type === "rename" || edit.type === "footer")) {
        const doc = new DOMParser().parseFromString(content, "text/html");
        if (edit.type === "rename") {
          doc.title = edit.value;
          const brand = doc.querySelector(".brand"); if (brand) brand.textContent = edit.value;
          const title = doc.querySelector("h1"); if (title) title.textContent = edit.value;
          const footer = doc.querySelector("footer span"); if (footer) footer.textContent = edit.value;
        } else doc.querySelectorAll("footer").forEach((footer) => footer.remove());
        content = "<!doctype html>\n" + doc.documentElement.outerHTML;
      }
      if (file.path === "sujith.project.json" && plan.spec) {
        const spec = { ...plan.spec };
        if (edit.type === "rename") spec.title = edit.value;
        if (edit.type === "accent") spec.accent = edit.value;
        if (edit.type === "theme") spec.dark = edit.value === "dark";
        plan.spec = spec;
        content = JSON.stringify(spec, null, 2);
      }
    }
    return content === file.content ? file : { ...file, content, updatedAt: Date.now() };
  });
}

export function describeProject(files: WorkspaceFile[]) {
  const lines = files.reduce((total, file) => total + file.content.split("\n").length, 0);
  const html = files.find((file) => file.path.endsWith(".html"));
  const doc = html ? new DOMParser().parseFromString(html.content, "text/html") : undefined;
  const facts = [`${files.length} files`, `${lines.toLocaleString()} source lines`];
  if (doc) facts.push(`${doc.querySelectorAll("button").length} buttons`, `${doc.querySelectorAll("form").length} forms`, `page title: "${doc.title || "Untitled"}"`);
  return `Read the current project: ${facts.join(", ")}.\n\nFiles were inspected locally. No files were changed, and no model response was invented.`;
}

export function validateLocalEdit(plan: LocalPlan, before: WorkspaceFile[], after: WorkspaceFile[]) {
  if (plan.action !== "edit") return;
  if (!after.some((file) => before.find((old) => old.path === file.path)?.content !== file.content)) {
    const replacement = plan.edits.find((edit) => edit.type === "replace");
    throw new Error(replacement ? `The text "${replacement.from}" was not found. Nothing was changed.` : "That edit did not match the current files. Use the editor for a precise source change. Nothing was changed.");
  }
}

export const localCompilerDescription = "The local source compiler supports defined app types and source edits. It is not a general language model. Chat AI requires its own explicit model download; no replies are simulated.";
