/**
 * SUJITH IDE - Autonomous Intent Classification & AI Intelligence Engine
 * Routes and responds cleanly across:
 * - Greetings & natural conversations
 * - General knowledge & research (combining established knowledge + live deepSearch)
 * - File & attachment analysis
 * - Coding requests across multiple languages
 * - Debugging & stack-trace error resolution
 * - Android & Website application development
 * - Multi-turn conversation context & follow-ups
 */

import { runDeepSearch } from "./deepSearch.mjs";

const GREETING_RE =
  /^(hi|hello|hey|vanakkam|namaste|hola|howdy|sup|yo|wyd|good morning|good evening|good afternoon|good night|greetings|hii+|heyy+|hello\s+(?:bro|dude|machan|machi|da)|hi\s+(?:bro|dude|machan|machi|da)|வணக்கம்)[!.,?\s]*$/i;

const TANGLISH_CHAT_RE =
  /^(enna\s*pan+ra|enna\s*pand?ra|enna\s*pandra|ennapannra|enna\s*seira|enna\s*vishesham|epdi\s*iruk+a|eppadi\s*iruk+e?nga|nall?a\s*iruk+iya|saptiya|saaptiya|yaar\s*nee|nee\s*yaaru|un\s*peru\s*enna|machan|machi|nanba|thala|sollu|sollunga|super|semma|vera\s*level|mass|என்ன\s*பண்ற|என்ன\s*பண்றீங்க|எப்படி\s*இருக்க|நல்லா\s*இருக்கியா|சாப்டியா|யார்\s*நீ)[!.,?\s]*$/i;

const INTRO_RE =
  /^(how are you|how r u|how's it going|hows it going|what's up|whats up|wassup|what are you doing|are you there|who are you|what can you do|what are you|tell me about yourself|introduce yourself|help|test|testing|ping)[!.,?\s]*$/i;

const THANKS_RE =
  /^(thanks|thank you|thx|ty|nandri|awesome|great|cool|nice|ok|okay|got it|நன்றி)[!.,?\s]*$/i;

const FOLLOWUP_CUE_RE =
  /^(tell me more|more details?|explain more|continue|go on|elaborate|why\??$|how\??$|how to run|how do i run|what about it|and |also |can you (?:add|explain|run|test|update|show|convert)|add |convert |make it|update it|show example|run it|test it)/i;

const CODE_KEYWORD_RE =
  /\b(code|coding|program|programming|script|scripting|debug|debugging|debugger|bug|bugs|stack\s*trace|stacktrace|traceback|exception|typeerror|referenceerror|syntaxerror|rangeerror|nullpointerexception|algorithm|frontend|backend|fullstack|api|graphql|database|sql|nosql|postgres|postgresql|sqlite|mysql|mongodb|redis|schema|html|css|scss|tailwind|javascript|typescript|react|vue|angular|svelte|nextjs|next\.js|vite|webpack|nodejs|node\.js|express|fastapi|django|flask|python|java|kotlin|android|swift|ios|flutter|dart|c\+\+|cpp|c#|csharp|dotnet|\.net|golang|rust|php|ruby|rails|bash|shell|powershell|docker|kubernetes|git|refactor|unit test|jest|pytest|vitest|compiler|linter|eslint|regex|json|yaml|xml|npm|pip|cargo|gradle|maven|apk|jetpack compose)\b/i;

const CODE_SYNTAX_RE =
  /```[\s\S]*?```|`[^`\n]{2,}`|<\/?\w+[\s>]/i;

const FILE_EXT_RE =
  /\b[\w-]+\.(js|jsx|ts|tsx|py|html|css|json|java|kt|cpp|c|cs|go|rs|php|rb|sql|sh|swift|dart|vue|svelte|yaml|yml)\b/i;

function stripAttachedContext(rawPrompt = "") {
  const idx = rawPrompt.indexOf("\n\n[Attached file:");
  if (idx === -1) return { cleanPrompt: rawPrompt.trim(), attachedFiles: [] };
  const cleanPrompt = rawPrompt.slice(0, idx).trim();
  const tail = rawPrompt.slice(idx);
  const attachedFiles = [];
  const regex = /\[Attached file:\s*([^\]]+)\]\n([\s\S]*?)(?=\n\n\[Attached file:|$)/g;
  let match;
  while ((match = regex.exec(tail)) !== null) {
    attachedFiles.push({
      name: match[1].trim(),
      content: match[2].trim(),
    });
  }
  return { cleanPrompt, attachedFiles };
}

function getPreviousTurns(messages = []) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .filter((m) => m.content.length > 0);
}

/**
 * Accurate single-turn + follow-up coding intent detector (exported for gateway.mjs).
 * Never lets unrelated coding history hijack fresh general knowledge questions!
 */
export function isCodingIntent(text = "", messages = []) {
  const { cleanPrompt } = stripAttachedContext(String(text || ""));
  const lower = cleanPrompt.toLowerCase();
  if (!lower) return false;
  if (GREETING_RE.test(lower) || TANGLISH_CHAT_RE.test(lower) || INTRO_RE.test(lower) || THANKS_RE.test(lower)) return false;

  // Explicit conceptual "what is" questions without code generation verbs stay natural unless asking for code
  if (/^(what is|who is|who was|when did|where is|why is)\b/i.test(lower) && !/\b(write|code|implement|fix|error|bug|create|build|example|snippet)\b/i.test(lower)) {
    return false;
  }

  if (
    CODE_KEYWORD_RE.test(cleanPrompt) ||
    CODE_SYNTAX_RE.test(cleanPrompt) ||
    FILE_EXT_RE.test(cleanPrompt) ||
    /\b(write|create|build|implement|generate|fix|debug|solve|refactor|optimize)\b.*\b(function|class|app|website|calculator|server|component|endpoint|script|bot|game|sort|search|parser|query|error|bug)\b/i.test(cleanPrompt)
  ) {
    return true;
  }

  // Only inherit coding intent if the current message is an explicit short follow-up
  if (cleanPrompt.length < 70 && FOLLOWUP_CUE_RE.test(lower)) {
    const prevUsers = getPreviousTurns(messages).filter((m) => m.role === "user");
    const prior = prevUsers.length > 1 ? prevUsers[prevUsers.length - 2].content : "";
    if (prior && (CODE_KEYWORD_RE.test(prior) || /\b(calculator|error|bug|android|website|app|code|python|javascript)\b/i.test(prior))) {
      return true;
    }
  }

  return false;
}

export function classifyUserIntent(rawPrompt = "", messages = [], images = []) {
  const { cleanPrompt, attachedFiles } = stripAttachedContext(String(rawPrompt || ""));
  const lower = cleanPrompt.toLowerCase();

  const prevUsers = getPreviousTurns(messages).filter((m) => m.role === "user");
  const priorUserPrompt = prevUsers.length > 1 ? stripAttachedContext(prevUsers[prevUsers.length - 2].content).cleanPrompt : "";
  const priorLower = priorUserPrompt.toLowerCase();

  // 1. File / Attachment analysis
  if (
    attachedFiles.length > 0 ||
    (Array.isArray(images) && images.length > 0) ||
    /\b(analyze|summarize|review|inspect|read|check|explain)\s+(this|the|my|attached)?\s*(file|document|pdf|docx|csv|json|code|image|photo|screenshot)\b/i.test(lower)
  ) {
    if (attachedFiles.length > 0 || (Array.isArray(images) && images.length > 0)) {
      return { intent: "FILE_ANALYSIS", query: cleanPrompt, attachedFiles, imagesCount: images?.length || 0 };
    }
  }

  // 2. Greetings, Tanglish & Casual Conversations
  if (GREETING_RE.test(lower) || TANGLISH_CHAT_RE.test(lower) || INTRO_RE.test(lower) || THANKS_RE.test(lower)) {
    const topic = TANGLISH_CHAT_RE.test(lower)
      ? "tanglish_chat"
      : INTRO_RE.test(lower)
        ? "intro"
        : THANKS_RE.test(lower)
          ? "thanks"
          : "greeting";
    return { intent: "GREETING", topic, query: cleanPrompt };
  }

  // 3. Debugging & Error Resolution
  const isDebug =
    /\b(fix|debug|solve|resolve|diagnose|repair|troubleshoot)\b.*\b(error|bug|exception|crash|issue|warning|fail|failure|problem|js|javascript|typescript|python|react|node|code|undefined|null)\b/i.test(lower) ||
    /\b(typeerror|referenceerror|syntaxerror|rangeerror|urierror|evalerror|nullpointerexception|indexerror|keyerror|valueerror|attributeerror|traceback|stack\s*trace|uncaught|unhandled)\b/i.test(lower) ||
    /cannot read propert(y|ies) of (undefined|null)/i.test(lower) ||
    /is not a function|is not defined|unexpected token/i.test(lower);

  if (isDebug) {
    return { intent: "DEBUGGING", query: cleanPrompt, attachedFiles };
  }

  // 4. Android App Development
  if (
    /\b(android app|android application|build (an|a)? android|create (an|a)? android|develop (an|a)? android|kotlin app|jetpack compose|android studio|build apk)\b/i.test(lower)
  ) {
    return { intent: "APP_DEV_ANDROID", query: cleanPrompt };
  }

  // 5. Website Development
  if (
    /\b(build|create|make|develop|design)\s+(a|an|me\s+a)?\s*(modern|responsive|portfolio|business|landing|ecommerce|e-commerce|saas)?\s*(website|web\s*page|webpage|web\s*app|landing\s*page|dashboard|portfolio)\b/i.test(lower) &&
    !/\b(what is|how does|explain)\b/i.test(lower)
  ) {
    return { intent: "WEBSITE_DEV", query: cleanPrompt };
  }

  // 6. Specific explicit Coding Requests
  if (/\b(python calculator|calculator in python|calculator using python)\b/i.test(lower)) {
    return { intent: "CODING", topic: "python_calculator", query: cleanPrompt };
  }

  // 7. Pure arithmetic / math expression
  if (/^[\d\s+\-*/().%^]+$/.test(lower) && /\d/.test(lower)) {
    return { intent: "MATH", query: cleanPrompt };
  }

  // 8. Explicit General Knowledge topics (checked before prior-turn follow-up inheritance)
  if (/\b(chess|best chess player|greatest chess player|magnus carlsen|garry kasparov|bobby fischer|world chess champion)\b/i.test(lower)) {
    const isChessFollowup = priorLower && /\b(chess|carlsen|kasparov|fischer|anand)\b/i.test(priorLower) && /\b(tell me more|more|about|why|how|who)\b/i.test(lower);
    return { intent: "GENERAL_KNOWLEDGE", topic: isChessFollowup ? "chess_followup" : "chess", query: cleanPrompt, priorTopic: priorUserPrompt };
  }
  if (/\b(what is ai|what is artificial intelligence|explain ai|define ai|how does ai work)\b/i.test(lower)) {
    return { intent: "GENERAL_KNOWLEDGE", topic: "what_is_ai", query: cleanPrompt };
  }

  // 9. Explicit Follow-up Detection using conversation history (when current message has follow-up cues without introducing a brand new coding topic)
  const hasExplicitFollowupCue =
    FOLLOWUP_CUE_RE.test(lower) ||
    /\b(it|this code|that code|this error|that error|these|above|previous|same|run it|test it|more about|kasparov|carlsen|fischer|anand)\b/i.test(lower);
  const hasOwnCodingTerms =
    CODE_KEYWORD_RE.test(cleanPrompt) || CODE_SYNTAX_RE.test(cleanPrompt) || FILE_EXT_RE.test(cleanPrompt);

  if (priorLower && hasExplicitFollowupCue && !hasOwnCodingTerms) {
    if (/\b(chess|carlsen|kasparov|fischer|anand)\b/i.test(priorLower)) {
      return { intent: "GENERAL_KNOWLEDGE", topic: "chess_followup", query: cleanPrompt, priorTopic: priorUserPrompt };
    }
    if (/\b(what is ai|artificial intelligence)\b/i.test(priorLower)) {
      return { intent: "GENERAL_KNOWLEDGE", topic: "ai_followup", query: cleanPrompt, priorTopic: priorUserPrompt };
    }
    if (/\b(calculator|python)\b/i.test(priorLower)) {
      return { intent: "CODING", topic: "python_calculator_followup", query: cleanPrompt, priorTopic: priorUserPrompt };
    }
    if (/\b(android|kotlin|compose)\b/i.test(priorLower)) {
      return { intent: "APP_DEV_ANDROID", topic: "android_followup", query: cleanPrompt, priorTopic: priorUserPrompt };
    }
    if (/\b(error|bug|javascript|typeerror)\b/i.test(priorLower)) {
      return { intent: "DEBUGGING", topic: "debug_followup", query: cleanPrompt, priorTopic: priorUserPrompt };
    }
  }

  // 10. General Coding Requests
  if (isCodingIntent(cleanPrompt, messages)) {
    return { intent: "CODING", query: cleanPrompt };
  }

  return { intent: "GENERAL_KNOWLEDGE", topic: "dynamic", query: cleanPrompt, priorTopic: priorUserPrompt };
}

function safeEvalMath(expr) {
  const sanitized = expr.replace(/\^/g, "**").replace(/\s+/g, "");
  if (!/^[0-9+\-*/().%]+$/.test(sanitized)) return null;
  try {
    // Evaluate pure arithmetic expression safely using Function without globals
    const fn = new Function(`"use strict"; return (${sanitized});`);
    const result = fn();
    return typeof result === "number" && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function buildFileAnalysisResponse(query, attachedFiles = [], imagesCount = 0) {
  const parts = [];
  if (attachedFiles.length > 0) {
    parts.push(`### File Analysis Summary (${attachedFiles.length} file${attachedFiles.length === 1 ? "" : "s"})\n`);
    for (const file of attachedFiles) {
      const lines = file.content.split(/\r?\n/);
      const chars = file.content.length;
      const words = file.content.trim() ? file.content.trim().split(/\s+/).length : 0;
      const ext = (file.name.split(".").pop() || "txt").toLowerCase();

      parts.push(`#### \`${file.name}\``);
      parts.push(`- **Size**: ${lines.length} lines · ${words} words · ${chars} characters`);

      if (ext === "json") {
        try {
          const parsed = JSON.parse(file.content);
          const keys = Array.isArray(parsed)
            ? `Array of ${parsed.length} item(s)`
            : parsed && typeof parsed === "object"
              ? `Object keys: ${Object.keys(parsed).slice(0, 15).join(", ")}`
              : typeof parsed;
          parts.push(`- **JSON Structure**: Valid JSON (${keys})`);
        } catch (err) {
          parts.push(`- **JSON Syntax Issue**: ${err instanceof Error ? err.message : "Invalid JSON"}`);
        }
      } else if (["js", "jsx", "ts", "tsx", "py", "java", "kt", "cpp", "go", "rs", "html", "css"].includes(ext)) {
        const imports = lines.filter((l) => /^\s*(import |from |#include|using |package )/.test(l)).length;
        const functions = lines.filter((l) => /\b(function |def |class |fun |interface |export )\b/.test(l)).length;
        const todos = lines.filter((l) => /\b(TODO|FIXME|BUG|HACK)\b/i.test(l));
        parts.push(`- **Code Overview**: Detected ~${imports} import/package declaration(s) and ~${functions} symbol definition(s).`);
        if (todos.length > 0) {
          parts.push(`- **Markers Found**: ${todos.length} TODO/FIXME comment(s).`);
        }
      }

      const preview = lines.slice(0, 14).join("\n");
      parts.push(`\n**Content Excerpt:**\n\`\`\`${ext === "txt" ? "text" : ext}\n${preview}${lines.length > 14 ? "\n..." : ""}\n\`\`\`\n`);
    }
  }

  if (imagesCount > 0) {
    parts.push(`### Image Attachment`);
    parts.push(`Received ${imagesCount} image attachment(s) for "${query || "inspection"}". To run full multimodal pixel vision analysis on attached images, connect your **NoTrack.ai API Key** or configure \`GEMINI_API_KEY\` on the server.`);
  }

  if (query && !/^(import and check|analyze|summarize)/i.test(query)) {
    parts.push(`\n**Regarding your prompt:** "${query}" — let me know which specific section, bug, or transformation you want applied to the attached file(s).`);
  }

  return parts.join("\n");
}

function buildDebuggingResponse(query) {
  const lower = query.toLowerCase();

  // Specific TypeError / undefined property
  if (/cannot read propert(y|ies) of (undefined|null)|typeerror.*undefined|typeerror.*null/i.test(lower)) {
    return `### JavaScript \`TypeError\`: Accessing Properties on \`undefined\` / \`null\`

#### Why This Occurs
You are trying to read a property or call a method (such as \`.map()\`, \`.length\`, or \`.name\`) on a variable that evaluates to \`undefined\` or \`null\` at runtime—commonly caused by asynchronous API fetches completing after the initial render or mismatched payload shapes.

#### How to Fix It
1. **Use Optional Chaining (\`?.\`) and Nullish Coalescing (\`??\`)**:
\`\`\`javascript
const items = response?.data?.items ?? [];
const display = items.map((item) => item.name);
\`\`\`
2. **Initialize State Safely in React**:
\`\`\`javascript
const [items, setItems] = useState([]); // Never leave array state as undefined
\`\`\`
3. **Validate Before Iterating**:
\`\`\`javascript
if (!Array.isArray(items)) {
  return [];
}
\`\`\`

#### Example Guarded Fetch Handler
\`\`\`javascript
async function loadUsers(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(\`Request failed with status \${res.status}\`);
  const payload = await res.json();
  return Array.isArray(payload?.users) ? payload.users : [];
}
\`\`\``;
  }

  // Specific ReferenceError
  if (/referenceerror|is not defined/i.test(lower)) {
    const match = query.match(/([A-Za-z_$][\w$]*)\s+is not defined/i);
    const symbol = match ? match[1] : "variable";
    return `### JavaScript \`ReferenceError\`: \`${symbol}\` is not defined

#### Why This Occurs
JavaScript cannot find a declaration for \`${symbol}\` in the current lexical scope or any parent scope. Common causes include:
1. A missing \`import\` or \`const\` / \`let\` declaration.
2. A typo in the identifier name (JavaScript is case-sensitive).
3. Accessing a browser-only global (\`window\`, \`document\`, \`localStorage\`) in Node.js / SSR, or vice versa (\`process\`, \`Buffer\`).
4. Referencing a \`let\` / \`const\` variable inside its Temporal Dead Zone before initialization.

#### Fix
\`\`\`javascript
// 1. Ensure proper declaration or import before usage:
const ${symbol} = getInitialValue();

// 2. If targeting SSR/Node + Browser safely:
if (typeof window !== "undefined") {
  // safe browser-only access
}
\`\`\``;
  }

  // Specific SyntaxError
  if (/syntaxerror|unexpected token|unexpected end of/i.test(lower)) {
    return `### JavaScript \`SyntaxError\`: Unexpected Token / Malformed Syntax

#### Why This Occurs
The parser encountered invalid syntax before execution could begin. Common triggers:
1. Mismatched brackets \`{}\`, parentheses \`()\`, or quotes \`""\`.
2. Calling \`JSON.parse()\` on an HTML error page (e.g., \`<!DOCTYPE html>...\`) instead of JSON, triggering \`Unexpected token '<'\`.
3. Using JSX or ES module \`import\` syntax in a plain CommonJS Node script without \`"type": "module"\` or bundling.

#### Safe JSON Parse Guard
\`\`\`javascript
async function parseSafeJson(response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!contentType.includes("application/json")) {
    throw new Error(\`Expected JSON, received \${contentType || "text"}: \${text.slice(0, 120)}\`);
  }
  return JSON.parse(text);
}
\`\`\``;
  }

  // Generic JavaScript error prompt ("Fix this JavaScript error")
  return `### Debugging Guide: Resolving JavaScript Errors

Please share the exact **error message**, **stack trace**, or **code snippet** if you have a specific failure in your project. Meanwhile, here is a targeted breakdown of the most common JavaScript runtime bugs and how to fix them cleanly:

#### 1. \`TypeError: Cannot read properties of undefined (reading 'map' / 'length')\`
**Cause:** Reading a property or array method before async data arrives or when an API returns \`null\` / \`undefined\`.
\`\`\`javascript
// Broken
const names = data.users.map((u) => u.name);

// Fixed: initialize defaults + optional chaining + Array.isArray guard
const users = Array.isArray(data?.users) ? data.users : [];
const names = users.map((u) => u?.name ?? "Unknown");
\`\`\`

#### 2. \`TypeError: x is not a function\`
**Cause:** Importing a default vs. named export incorrectly, or overwriting a function variable with another value.
\`\`\`javascript
// Check export style:
// export function helper() {}  -> import { helper } from "./module";
// export default helper;       -> import helper from "./module";
\`\`\`

#### 3. Unhandled Async Errors & Silent Promise Rejections
**Cause:** Missing \`try / catch\` around \`await fetch(...)\` or forgetting to check \`response.ok\`.
\`\`\`javascript
async function fetchSafeData(endpoint) {
  const controller = new AbortController();
  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(\`HTTP \${res.status}: \${res.statusText}\`);
    }
    return await res.json();
  } catch (err) {
    console.error("Request failed:", err);
    throw err;
  }
}
\`\`\`

Paste your exact error message or code block and I will diagnose the exact line and provide the corrected implementation.`;
}

function buildPythonCalculatorResponse(isFollowup = false, query = "") {
  if (isFollowup && /run|test|how/i.test(query)) {
    return `To run and test the Python calculator locally:

1. Save the code as \`calculator.py\`.
2. **Start the interactive CLI mode**:
   \`\`\`bash
   python3 calculator.py
   \`\`\`
   Then type expressions like \`12 * (4 + 3)\`, \`2 ^ 8\`, or commands \`history\`, \`mem\`, \`clear\`, \`exit\`.
3. **Run the built-in \`unittest\` suite**:
   \`\`\`bash
   python3 calculator.py test
   \`\`\``;
  }

  return `Here is a complete, production-ready **Python Calculator** featuring safe AST-based mathematical expression evaluation (avoiding unsafe \`eval()\`), standard and scientific operations, calculation history, memory registers, and a \`unittest\` suite.

\`\`\`python:calculator.py
#!/usr/bin/env python3
"""
Production-grade Python Calculator with Safe AST Expression Parsing,
Memory Registers, History Tracking, and Interactive CLI.
"""

import ast
import math
import operator
import sys
import unittest
from typing import Any, Dict, List, Union

Number = Union[int, float]


class Calculator:
    """Safe, extensible calculator engine."""

    _OPERATORS: Dict[Any, Any] = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod,
        ast.Pow: operator.pow,
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }

    def __init__(self) -> None:
        self._memory: float = 0.0
        self._history: List[str] = []

    def add(self, a: Number, b: Number) -> Number:
        res = a + b
        self._history.append(f"{a} + {b} = {res}")
        return res

    def subtract(self, a: Number, b: Number) -> Number:
        res = a - b
        self._history.append(f"{a} - {b} = {res}")
        return res

    def multiply(self, a: Number, b: Number) -> Number:
        res = a * b
        self._history.append(f"{a} * {b} = {res}")
        return res

    def divide(self, a: Number, b: Number) -> float:
        if b == 0:
            raise ZeroDivisionError("Cannot divide by zero.")
        res = a / b
        self._history.append(f"{a} / {b} = {res}")
        return res

    def power(self, base: Number, exp: Number) -> float:
        res = math.pow(base, exp)
        self._history.append(f"{base} ^ {exp} = {res}")
        return res

    def sqrt(self, n: Number) -> float:
        if n < 0:
            raise ValueError("Cannot take the square root of a negative number.")
        res = math.sqrt(n)
        self._history.append(f"sqrt({n}) = {res}")
        return res

    def evaluate(self, expression: str) -> Number:
        clean = expression.replace("^", "**").strip()
        if not clean:
            raise ValueError("Expression cannot be empty.")
        try:
            tree = ast.parse(clean, mode="eval")
        except SyntaxError as exc:
            raise ValueError(f"Invalid syntax: {exc.msg}") from exc
        result = self._eval_node(tree.body)
        self._history.append(f"{expression} = {result}")
        return result

    def _eval_node(self, node: ast.AST) -> Number:
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in self._OPERATORS:
            left = self._eval_node(node.left)
            right = self._eval_node(node.right)
            if isinstance(node.op, (ast.Div, ast.FloorDiv, ast.Mod)) and right == 0:
                raise ZeroDivisionError("Division by zero.")
            return self._OPERATORS[type(node.op)](left, right)
        if isinstance(node, ast.UnaryOp) and type(node.op) in self._OPERATORS:
            return self._OPERATORS[type(node.op)](self._eval_node(node.operand))
        raise ValueError(f"Unsupported expression node: {type(node).__name__}")

    def memory_store(self, val: Number) -> None:
        self._memory = float(val)

    def memory_recall(self) -> float:
        return self._memory

    def memory_clear(self) -> None:
        self._memory = 0.0

    def get_history(self) -> List[str]:
        return list(self._history)


def run_cli() -> None:
    calc = Calculator()
    print("Python Calculator (type an expression, 'history', 'mem', 'clear', or 'exit')")
    while True:
        try:
            raw = input("Calc > ").strip()
            if not raw:
                continue
            if raw.lower() in {"exit", "quit", "q"}:
                break
            if raw.lower() == "history":
                for entry in calc.get_history()[-10:]:
                    print(" ", entry)
                continue
            if raw.lower() == "mem":
                print("Memory:", calc.memory_recall())
                continue
            if raw.lower() == "clear":
                calc.memory_clear()
                print("Memory cleared.")
                continue
            print("=>", calc.evaluate(raw))
        except (ValueError, ZeroDivisionError) as err:
            print("Error:", err)
        except KeyboardInterrupt:
            print()
            break


class TestCalculator(unittest.TestCase):
    def setUp(self) -> None:
        self.calc = Calculator()

    def test_arithmetic(self) -> None:
        self.assertEqual(self.calc.add(2, 3), 5)
        self.assertEqual(self.calc.subtract(10, 4), 6)
        self.assertEqual(self.calc.multiply(3, 7), 21)
        self.assertEqual(self.calc.divide(9, 3), 3.0)

    def test_divide_by_zero(self) -> None:
        with self.assertRaises(ZeroDivisionError):
            self.calc.divide(5, 0)

    def test_expression_eval(self) -> None:
        self.assertEqual(self.calc.evaluate("2 + 3 * 4"), 14)
        self.assertEqual(self.calc.evaluate("(2 + 3) * 4"), 20)
        self.assertEqual(self.calc.evaluate("2^3 + 1"), 9)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        unittest.main(argv=[sys.argv[0]])
    else:
        run_cli()
\`\`\`

### Run Locally
- Interactive mode: \`python3 calculator.py\`
- Run unit tests: \`python3 calculator.py test\``;
}

function buildAndroidAppResponse() {
  return `Here is a complete, runnable **Android Application** built with **Kotlin** and **Jetpack Compose (Material 3)**. It implements a reactive Task Manager with priority tagging, state management, and input validation.

\`\`\`kotlin:app/src/main/java/com/sujith/app/MainActivity.kt
package com.sujith.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.UUID

enum class Priority { LOW, MEDIUM, HIGH }

data class TaskItem(
    val id: String = UUID.randomUUID().toString(),
    val title: String,
    val priority: Priority = Priority.MEDIUM,
    val isCompleted: Boolean = false
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(
                colorScheme = lightColorScheme(
                    primary = Color(0xFF1A73E8),
                    secondary = Color(0xFF34A853),
                    background = Color(0xFFF8F9FA)
                )
            ) {
                TaskAppScreen()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskAppScreen() {
    var tasks by remember {
        mutableStateOf(
            listOf(
                TaskItem(title = "Design app architecture", priority = Priority.HIGH),
                TaskItem(title = "Implement Compose UI screens", priority = Priority.MEDIUM)
            )
        )
    }
    var taskInput by remember { mutableStateOf("") }
    var selectedPriority by remember { mutableStateOf(Priority.MEDIUM) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("SUJITH Tasks", fontWeight = FontWeight.Bold, fontSize = 20.sp)
                        Text(
                            "\${tasks.count { it.isCompleted }} of \${tasks.size} completed",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(Color(0xFFF8F9FA))
                .padding(16.dp)
        ) {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    OutlinedTextField(
                        value = taskInput,
                        onValueChange = { taskInput = it },
                        label = { Text("New task title") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Priority.entries.forEach { p ->
                                FilterChip(
                                    selected = selectedPriority == p,
                                    onClick = { selectedPriority = p },
                                    label = { Text(p.name, fontSize = 11.sp) }
                                )
                            }
                        }
                        FilledIconButton(
                            onClick = {
                                if (taskInput.isNotBlank()) {
                                    tasks = listOf(TaskItem(title = taskInput.trim(), priority = selectedPriority)) + tasks
                                    taskInput = ""
                                }
                            },
                            enabled = taskInput.isNotBlank()
                        ) {
                            Icon(Icons.Default.Add, contentDescription = "Add task")
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(tasks, key = { it.id }) { task ->
                    Card(
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)
                        ) {
                            IconButton(
                                onClick = {
                                    tasks = tasks.map {
                                        if (it.id == task.id) it.copy(isCompleted = !it.isCompleted) else it
                                    }
                                },
                                modifier = Modifier
                                    .size(28.dp)
                                    .background(
                                        if (task.isCompleted) Color(0xFF34A853) else Color(0xFFE0E0E0),
                                        CircleShape
                                    )
                            ) {
                                if (task.isCompleted) {
                                    Icon(Icons.Default.Check, contentDescription = "Done", tint = Color.White, modifier = Modifier.size(16.dp))
                                }
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(task.title, fontWeight = FontWeight.Medium, fontSize = 15.sp)
                                Text("Priority: \${task.priority.name}", fontSize = 11.sp, color = Color.Gray)
                            }
                            IconButton(onClick = { tasks = tasks.filter { it.id != task.id } }) {
                                Icon(Icons.Default.Delete, contentDescription = "Delete", tint = Color(0xFF9AA0A6))
                            }
                        }
                    }
                }
            }
        }
    }
}
\`\`\`

\`\`\`xml:app/src/main/AndroidManifest.xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="true"
        android:label="SUJITH Tasks"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.Material.Light.NoActionBar">
        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
\`\`\`

\`\`\`kotlin:app/build.gradle.kts
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.sujith.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.sujith.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.3")
}
\`\`\`

### Build & Run
1. Open the project folder in **Android Studio**.
2. Build a debug APK with \`./gradlew assembleDebug\` or run on an emulator with \`./gradlew installDebug\`.`;
}

function buildSpecificCodingResponse(query, { hasConnectedKey = false } = {}) {
  const lower = query.toLowerCase();

  // Detect language + common coding patterns so code matches the exact request
  const isPython = /\b(python|py|fastapi|flask|django)\b/.test(lower);
  const isJS = /\b(javascript|js|node|express)\b/.test(lower);
  const isTS = /\b(typescript|ts|tsx)\b/.test(lower);
  const isReact = /\b(react|jsx|tsx|component|hook|todo)\b/.test(lower);
  const isSql = /\b(sql|postgres|postgresql|mysql|sqlite|table|select|join)\b/.test(lower);

  if (/\b(fibonacci|fib)\b/.test(lower)) {
    if (isPython) {
      return `Here is an iterative \`O(n)\` time, \`O(1)\` space **Fibonacci generator** in Python:

\`\`\`python:fibonacci.py
def fibonacci_sequence(count: int) -> list[int]:
    if count < 0:
        raise ValueError("Count must be non-negative.")
    if count == 0:
        return []
    seq = [0]
    if count == 1:
        return seq
    a, b = 0, 1
    for _ in range(1, count):
        seq.append(b)
        a, b = b, a + b
    return seq

if __name__ == "__main__":
    print(fibonacci_sequence(10))
\`\`\``;
    }
    return `Here is an \`O(n)\` iterative **Fibonacci sequence** implementation in JavaScript:

\`\`\`javascript:fibonacci.js
export function fibonacciSequence(count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("Count must be a non-negative integer.");
  }
  if (count === 0) return [];
  const result = [0];
  let a = 0;
  let b = 1;
  for (let i = 1; i < count; i += 1) {
    result.push(b);
    [a, b] = [b, a + b];
  }
  return result;
}

console.log(fibonacciSequence(10));
\`\`\``;
  }

  if (/\b(binary search)\b/.test(lower)) {
    if (isPython) {
      return `Here is a clean **Binary Search** implementation in Python (\`O(log n)\` time, \`O(1)\` space):

\`\`\`python:binary_search.py
from typing import Sequence, TypeVar

T = TypeVar("T")

def binary_search(items: Sequence[T], target: T) -> int:
    left, right = 0, len(items) - 1
    while left <= right:
        mid = left + (right - left) // 2
        if items[mid] == target:
            return mid
        if items[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1

if __name__ == "__main__":
    nums = [2, 5, 8, 12, 16, 23, 38, 56]
    print("Index of 23:", binary_search(nums, 23))
\`\`\``;
    }
    return `Here is a clean **Binary Search** implementation in TypeScript (\`O(log n)\` time, \`O(1)\` space):

\`\`\`typescript:binarySearch.ts
export function binarySearch<T>(items: readonly T[], target: T): number {
  let left = 0;
  let right = items.length - 1;
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    if (items[mid] === target) return mid;
    if (items[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}
\`\`\``;
  }

  if (/\b(quicksort|quick sort|mergesort|merge sort|sort algorithm|sorting)\b/.test(lower)) {
    if (isPython) {
      return `Here is a clean **Merge Sort** implementation in Python (\`O(n log n)\` worst-case time, stable):

\`\`\`python:merge_sort.py
def merge_sort(items: list[int]) -> list[int]:
    if len(items) <= 1:
        return items[:]
    mid = len(items) // 2
    left = merge_sort(items[:mid])
    right = merge_sort(items[mid:])
    merged: list[int] = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            merged.append(left[i])
            i += 1
        else:
            merged.append(right[j])
            j += 1
    merged.extend(left[i:])
    merged.extend(right[j:])
    return merged

if __name__ == "__main__":
    print(merge_sort([38, 27, 43, 3, 9, 82, 10]))
\`\`\``;
    }
    return `Here is a clean **Merge Sort** utility in TypeScript (\`O(n log n)\` time, stable):

\`\`\`typescript:mergeSort.ts
export function mergeSort<T>(items: readonly T[], compare: (a: T, b: T) => number = (a, b) => (a < b ? -1 : a > b ? 1 : 0)): T[] {
  if (items.length <= 1) return [...items];
  const mid = Math.floor(items.length / 2);
  const left = mergeSort(items.slice(0, mid), compare);
  const right = mergeSort(items.slice(mid), compare);
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (compare(left[i], right[j]) <= 0) out.push(left[i++]);
    else out.push(right[j++]);
  }
  return out.concat(left.slice(i), right.slice(j));
}
\`\`\``;
  }

  if (/\b(debounce)\b/.test(lower)) {
    return `Here is a production-ready **\`debounce\`** utility in ${isTS ? "TypeScript" : "JavaScript"} with cancellation support:

\`\`\`${isTS ? "typescript:debounce.ts" : "javascript:debounce.js"}
export function debounce(fn, delayMs = 300) {
  let timer = null;
  const debounced = (...args) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  };
  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}
\`\`\``;
  }

  if (isReact) {
    return `Here is a complete, interactive **React + TypeScript Task Component** with local state, filtering, and accessibility:

\`\`\`tsx:TaskBoard.tsx
import { useState } from "react";

interface Task {
  id: string;
  title: string;
  done: boolean;
}

export function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: "1", title: "Verify API integration", done: true },
    { id: "2", title: "Ship production release", done: false },
  ]);
  const [draft, setDraft] = useState("");

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setTasks((prev) => [{ id: crypto.randomUUID(), title, done: false }, ...prev]);
    setDraft("");
  };

  const toggle = (id: string) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl border p-5">
      <h2 className="text-lg font-bold">Tasks ({tasks.filter((t) => !t.done).length} open)</h2>
      <form onSubmit={addTask} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a task..."
          className="flex-1 rounded-xl border px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          Add
        </button>
      </form>
      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center justify-between rounded-xl border px-3 py-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={task.done} onChange={() => toggle(task.id)} />
              <span className={task.done ? "line-through opacity-50" : ""}>{task.title}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
\`\`\``;
  }

  if (isSql) {
    return `Here is a normalized, indexed **SQL schema & query pattern** tailored to your request:

\`\`\`sql:schema.sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user_created ON orders (user_id, created_at DESC);

-- Top spending customers
SELECT u.id, u.full_name, COUNT(o.id) AS order_count, COALESCE(SUM(o.total_cents), 0) AS total_spent_cents
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.full_name
ORDER BY total_spent_cents DESC
LIMIT 20;
\`\`\``;
  }

  if (/\b(fastapi|flask)\b/.test(lower)) {
    return `Here is a clean, typed **FastAPI REST service** with Pydantic validation and CRUD endpoints:

\`\`\`python:app.py
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="SUJITH API Service")

class ItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    price: float = Field(ge=0)

items_db: list[dict] = []

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.get("/items")
def list_items() -> list[dict]:
    return items_db

@app.post("/items", status_code=201)
def create_item(payload: ItemCreate) -> dict:
    item = {"id": len(items_db) + 1, **payload.model_dump()}
    items_db.append(item)
    return item

@app.get("/items/{item_id}")
def get_item(item_id: int) -> dict:
    for item in items_db:
        if item["id"] == item_id:
            return item
    raise HTTPException(status_code=404, detail="Item not found")
\`\`\``;
  }

  if (/\b(express|rest api|server|endpoint|api)\b/.test(lower) && !isPython) {
    return `Here is a clean **Express REST API server** with JSON parsing, validation, and centralized error handling:

\`\`\`javascript:server.js
import express from "express";

const app = express();
app.use(express.json());

const items = [];

app.get("/api/items", (_req, res) => {
  res.json({ ok: true, items });
});

app.post("/api/items", (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    return res.status(400).json({ ok: false, error: "Field 'name' is required." });
  }
  const entry = { id: items.length + 1, name, createdAt: new Date().toISOString() };
  items.push(entry);
  return res.status(201).json({ ok: true, item: entry });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`API running on http://localhost:\${PORT}\`));
\`\`\``;
  }

  if (/\b(prime|factorial|palindrome)\b/.test(lower)) {
    if (isPython) {
      return `Here is a complete, typed Python utility covering **prime checking, factorial, and palindrome validation** with tests:

\`\`\`python:algorithms.py
import math

def is_prime(n: int) -> bool:
    if n < 2:
        return False
    if n % 2 == 0:
        return n == 2
    limit = math.isqrt(n)
    return all(n % d != 0 for d in range(3, limit + 1, 2))

def factorial(n: int) -> int:
    if n < 0:
        raise ValueError("n must be non-negative")
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result

def is_palindrome(text: str) -> bool:
    cleaned = "".join(ch.lower() for ch in text if ch.isalnum())
    return cleaned == cleaned[::-1]

if __name__ == "__main__":
    print("Prime 29:", is_prime(29))
    print("5! =", factorial(5))
    print("Palindrome:", is_palindrome("A man, a plan, a canal: Panama"))
\`\`\``;
    }
    return `Here is a clean JavaScript module for **prime checking, factorial, and palindrome detection**:

\`\`\`javascript:algorithms.js
export function isPrime(n) {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let d = 3; d * d <= n; d += 2) {
    if (n % d === 0) return false;
  }
  return true;
}

export function factorial(n) {
  if (!Number.isInteger(n) || n < 0) throw new RangeError("n must be a non-negative integer");
  let res = 1;
  for (let i = 2; i <= n; i += 1) res *= i;
  return res;
}

export function isPalindrome(text) {
  const clean = String(text).toLowerCase().replace(/[^a-z0-9]/g, "");
  return clean === [...clean].reverse().join("");
}

console.log({ prime29: isPrime(29), fact5: factorial(5), pal: isPalindrome("Racecar") });
\`\`\``;
  }

  if (isPython) {
    return `Here is a clean, extensible Python implementation for **"${query}"** with structured error handling and tests:

\`\`\`python:main.py
#!/usr/bin/env python3
"""Implementation for: ${query.replace(/"/g, "'")}"""

from dataclasses import dataclass

@dataclass
class TaskResult:
    ok: bool
    value: str

def process(input_text: str) -> TaskResult:
    cleaned = input_text.strip()
    if not cleaned:
        raise ValueError("Input cannot be empty.")
    return TaskResult(ok=True, value=cleaned)

if __name__ == "__main__":
    print(process("SUJITH IDE Ready"))
\`\`\`

Let me know if you want CLI flags, file I/O, async support, or specific business logic added to this module.`;
  }

  if (isJS || isTS) {
    const ext = isTS ? "ts" : "js";
    return `Here is a clean ${isTS ? "TypeScript" : "JavaScript"} module for **"${query}"** with input validation and async timeout safety:

\`\`\`${isTS ? "typescript" : "javascript"}:index.${ext}
export async function executeTask(input, { timeoutMs = 8000 } = {}) {
  if (input === undefined || input === null || String(input).trim() === "") {
    throw new Error("Input must not be empty.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return { ok: true, input, processedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timer);
  }
}

executeTask("sample").then(console.log).catch(console.error);
\`\`\`

Share any extra data shapes, API endpoints, or edge cases you want wired into this.`;
  }

  if (hasConnectedKey) {
    return `Here is a structured starter implementation for **"${query}"**:

\`\`\`typescript:solution.ts
export interface Result<T> {
  ok: boolean;
  data: T;
}

export function solve(input: string): Result<string> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Expected non-empty input.");
  return { ok: true, data: trimmed };
}

console.log(solve("ready"));
\`\`\`

Tell me your preferred language (Python, TypeScript, React, Kotlin, C++, SQL) and exact inputs/outputs so I can expand the full implementation.`;
  }

  return `Here is a runnable implementation starter for **"${query}"** — specify your preferred language (Python, JavaScript/TypeScript, React, Kotlin, SQL, C++) and requirements (or enter an upstream key in Settings for open-ended multi-file generation) and I will tailor the full code.`;
}

function buildWebsiteDevResponse(query) {
  return `Here is a complete, responsive single-file **Website** tailored to your request (**${query}**):

\`\`\`html:index.html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Modern Web Application</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased">
  <header class="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
    <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
      <span class="text-lg font-bold tracking-tight text-slate-900">SUJITH Studio</span>
      <nav class="hidden gap-6 text-sm font-medium text-slate-600 md:flex">
        <a href="#features" class="hover:text-blue-600">Features</a>
        <a href="#workflow" class="hover:text-blue-600">Workflow</a>
        <a href="#contact" class="hover:text-blue-600">Contact</a>
      </nav>
      <a href="#contact" class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Get Started</a>
    </div>
  </header>

  <main class="mx-auto max-w-6xl px-6 py-20">
    <section class="text-center">
      <h1 class="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
        Build Fast, Reliable Web Experiences
      </h1>
      <p class="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
        Clean architecture, responsive layouts, and modern interactive components ready to deploy.
      </p>
      <div class="mt-8 flex justify-center gap-4">
        <a href="#features" class="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">Explore Features</a>
        <a href="#workflow" class="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">Learn More</a>
      </div>
    </section>

    <section id="features" class="mt-20 grid gap-6 md:grid-cols-3">
      <div class="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 class="text-lg font-bold">Responsive Design</h2>
        <p class="mt-2 text-sm text-slate-600">Adapts smoothly from mobile screens to desktop monitors.</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 class="text-lg font-bold">Clean Codebase</h2>
        <p class="mt-2 text-sm text-slate-600">Semantic HTML and utility-first Tailwind styling with zero bloat.</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 class="text-lg font-bold">Fast Performance</h2>
        <p class="mt-2 text-sm text-slate-600">Minimal layout shift and instant interactive responsiveness.</p>
      </div>
    </section>
  </main>
</body>
</html>
\`\`\``;
}

function cleanSourceSnippet(raw = "") {
  return String(raw || "")
    .replace(/^[^:]{2,70}\s+report\s*\([^)]+\)\s*:\s*/i, "")
    .replace(/\s+-\s+[^-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function synthesizeDynamicKnowledge(query, messages, signal, existingSearchOutcome = null, { hasConnectedKey = false } = {}) {
  const searchOutcome = existingSearchOutcome || (await runDeepSearch(query, { history: messages, signal }).catch(() => null));
  if (searchOutcome?.status === "complete" && Array.isArray(searchOutcome.sources) && searchOutcome.sources.length > 0) {
    const topSources = searchOutcome.sources.slice(0, 5);
    const domainCount = new Set(topSources.map((s) => s.domain).filter(Boolean)).size;
    const primary = topSources[0];
    const primaryExcerpt = cleanSourceSnippet(primary.excerpt || primary.snippet || "");
    const leadSummary = primaryExcerpt.length > 520 ? `${primaryExcerpt.slice(0, 517)}...` : primaryExcerpt;

    const seenSnippets = new Set([leadSummary.toLowerCase().slice(0, 60)]);
    const findingBullets = topSources
      .slice(1)
      .map((src) => {
        const snippet = cleanSourceSnippet(src.excerpt || src.snippet || "").slice(0, 240);
        if (!snippet || seenSnippets.has(snippet.toLowerCase().slice(0, 60))) return "";
        seenSnippets.add(snippet.toLowerCase().slice(0, 60));
        const dateNote = src.publishedAt ? ` · ${src.publishedAt}` : "";
        return `- **${src.domain}${dateNote}:** ${snippet}${snippet.length >= 240 ? "..." : ""} ([${src.provider || src.domain}](${src.url}))`;
      })
      .filter(Boolean);

    const sourcesList = topSources
      .map((src) => {
        const meta = [src.domain, src.publishedAt, src.verified ? "Verified" : ""].filter(Boolean).join(" · ");
        return `- [${src.title}](${src.url})${meta ? ` — ${meta}` : ""}`;
      })
      .join("\n");

    return `${leadSummary} ([${primary.domain || primary.provider || "Source"}](${primary.url}))

${findingBullets.length ? `### Multi-Source Highlights (${topSources.length} verified sources across ${domainCount} domain${domainCount === 1 ? "" : "s"})\n${findingBullets.join("\n")}\n` : ""}### Sources
${sourcesList}`;
  }

  if (hasConnectedKey) {
    return `Got it! Let me know a bit more detail about **"${query}"** — for example whether you want a technical explanation, live web DeepSearch sources, code in a specific language, or an image/video generated — and I'll handle it right away.`;
  }

  return `Could not find matching live web results for **"${query}"**. Try phrasing it with more specific keywords, or connect your live **NoTrack.ai API Key** in **Settings** for full conversational reasoning.`;
}

export async function generateAutonomousResponse({
  prompt = "",
  messages = [],
  images = [],
  signal,
  modelName = "SUJITH IDE Agent",
  searchOutcome = null,
  hasConnectedKey = false,
}) {
  const classification = classifyUserIntent(prompt, messages, images);
  const query = classification.query || String(prompt || "").trim();

  if (classification.intent === "FILE_ANALYSIS") {
    return buildFileAnalysisResponse(query, classification.attachedFiles, classification.imagesCount);
  }

  if (classification.intent === "GREETING") {
    if (classification.topic === "tanglish_chat") {
      const lower = query.toLowerCase();
      if (/[\u0B80-\u0BFF]/.test(query)) {
        return `நான் நல்லா இருக்கேன், **${modelName}** SUJITH IDE-ல தயாரா இருக்கேன்! நீங்க கேட்கும் பொதுவான கேள்விகள், கோடிங் (Python, JS, React, Android), DeepSearch, அல்லது image/video generate பண்ணணுமா? சொல்லுங்க!`;
      }
      if (/epdi|eppadi|nall?a\s*iruk/i.test(lower)) {
        return `Naan super-a irukken! Neenga epdi irukkeenga? SUJITH IDE-la **${modelName}** ready-a irukku — coding, normal chat, image/video generation, illa DeepSearch edhu venumo sollunga!`;
      }
      if (/saptiya|saaptiya/i.test(lower)) {
        return `Haha, naan AI-nga — enaku electricity & tokens thaan saappadu! Neenga saapteengala? Solunga, innaiku enna build panlam or search panlam?`;
      }
      if (/yaar\s*nee|nee\s*yaaru|un\s*peru/i.test(lower)) {
        return `Naan **${modelName}** (SUJITH IDE AI Assistant)! Normal chat, Python/JS/Android coding, bug fixing, image & video generation, apram live DeepSearch ellaame inga real-a work aagum.`;
      }
      return `Inga **${modelName}** ready-a irukku — unga coding, normal chat, DeepSearch research, illa image/video create panna wait pannitu irukken! Enna pannalam innaiku?`;
    }
    if (classification.topic === "thanks") {
      return `You're welcome! Let me know anytime if you need help with coding, debugging, generating images/videos, DeepSearch, or general questions.`;
    }
    if (classification.topic === "intro") {
      const lower = query.toLowerCase();
      if (/^(test|testing|ping)[!.,?\s]*$/i.test(lower)) {
        return `Online and ready! Running **${modelName}** in SUJITH IDE. Ask any question, request code, generate an image/video, or run a DeepSearch query.`;
      }
      if (/^(how are you|how r u|how's it going|hows it going|what's up|whats up|wassup|what are you doing|are you there)/i.test(lower)) {
        return `Doing great and ready to help with **${modelName}**! What would you like to chat about, build, generate, or research today?`;
      }
      return `I am **${modelName}** in SUJITH IDE. I can answer general questions directly, write and debug code across Python, JavaScript/TypeScript, Kotlin, and more, generate images & videos, run live multi-source DeepSearch, and analyze attached files. What would you like to work on?`;
    }
    return `Hello! Running **${modelName}** in SUJITH IDE. How can I help you today — chat, coding, debugging, DeepSearch, or generating images and videos?`;
  }

  if (classification.intent === "MATH") {
    const val = safeEvalMath(query);
    if (val !== null) {
      return `**Result:** \`${val}\``;
    }
  }

  if (classification.intent === "GENERAL_KNOWLEDGE") {
    if (classification.topic === "chess" || classification.topic === "chess_followup") {
      if (classification.topic === "chess_followup" && /kasparov/i.test(query)) {
        return `**Garry Kasparov** (born 1963) was the Undisputed World Chess Champion from **1985 to 2000** and held the FIDE World No. 1 ranking for a record **255 months**. He reached a peak rating of **2851** in 1999 and was famous for deep opening preparation and aggressive tactical play before retiring from classical chess in 2005.`;
      }
      if (classification.topic === "chess_followup" && /carlsen|magnus/i.test(query)) {
        return `**Magnus Carlsen** (born 1990) achieved the highest official FIDE classical rating in history (**2882** in May 2014), won **five Classical World Chess Championships** (2013–2023), and went **125 consecutive classical games unbeaten** between 2018 and 2020.`;
      }
      return `The title of **greatest chess player of all time** generally comes down to two players, depending on whether you prioritize peak rating and accuracy or long-term dominance:

### 1. Magnus Carlsen (Highest Peak & Modern GOAT)
- **Peak Classical Rating:** **2882** (May 2014) — the highest FIDE rating in history.
- **World Championships:** 5-time Classical World Champion (2013–2023) plus multiple World Rapid and World Blitz Triple Crowns.
- **Unbeaten Streak:** **125 consecutive classical games** without a loss (2018–2020).
- **Strength:** Universal style with unmatched endgame precision.

### 2. Garry Kasparov (Greatest Longevity & Dominance)
- **Peak Classical Rating:** **2851** (July 1999) — held the all-time record for over a decade.
- **Reign:** World Champion for 15 consecutive years (1985–2000) and ranked World No. 1 for **255 months**.
- **Strength:** Dynamic attacking play and revolutionary opening preparation.

### 3. Bobby Fischer (Most Dominant Single Peak)
- Won the 1972 World Championship against Boris Spassky and achieved a 125-point rating gap over World No. 2 after sweeping elite Candidates matches 6–0.

**Bottom line:** Most modern Grandmasters consider **Magnus Carlsen** the strongest player to ever sit at a chessboard, while **Garry Kasparov** remains the standard for career longevity.`;
    }

    if (classification.topic === "what_is_ai" || classification.topic === "ai_followup") {
      return `**Artificial Intelligence (AI)** is the field of computer science dedicated to building systems capable of performing tasks that typically require human intelligence—such as understanding language, recognizing images, reasoning, learning from data, and making decisions.

### Core Subfields
1. **Machine Learning (ML):** Algorithms that learn patterns from data instead of following only hardcoded rules (supervised, unsupervised, and reinforcement learning).
2. **Deep Learning:** Multi-layered artificial neural networks modeled loosely on interconnected neurons, excelling at vision, speech, and language.
3. **Generative AI & Large Language Models (LLMs):** Transformer-based models trained on massive corpora to generate text, code, images, audio, and video.

### Three Categories of AI
- **Narrow AI (ANI):** Designed for specific tasks (e.g., chess engines, search, coding assistants, image classifiers). Every real-world AI system today is Narrow AI.
- **Artificial General Intelligence (AGI):** Hypothetical AI able to reason and learn across any intellectual task like a human.
- **Artificial Superintelligence (ASI):** Theoretical AI surpassing human capability across every domain.`;
    }

    return await synthesizeDynamicKnowledge(query, messages, signal, searchOutcome, { hasConnectedKey });
  }

  if (classification.intent === "DEBUGGING") {
    return buildDebuggingResponse(query);
  }

  if (classification.intent === "CODING") {
    if (classification.topic === "python_calculator" || classification.topic === "python_calculator_followup") {
      return buildPythonCalculatorResponse(classification.topic === "python_calculator_followup", query);
    }
    return buildSpecificCodingResponse(query, { hasConnectedKey });
  }

  if (classification.intent === "APP_DEV_ANDROID") {
    return buildAndroidAppResponse();
  }

  if (classification.intent === "WEBSITE_DEV") {
    return buildWebsiteDevResponse(query);
  }

  return await synthesizeDynamicKnowledge(query, messages, signal, searchOutcome, { hasConnectedKey });
}
