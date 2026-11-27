import type { AndroidStack, BuildDiagnostic, WorkspaceFile } from "./types";

type ParsedWidgetKind =
  | "text"
  | "button"
  | "outlined-button"
  | "textfield"
  | "switch"
  | "checkbox"
  | "card"
  | "list-item"
  | "stat"
  | "divider";

type ParsedWidget = {
  id: string;
  kind: ParsedWidgetKind;
  label: string;
  sublabel?: string;
  actionTarget?: string;
  initialChecked?: boolean;
};

type ParsedScreen = {
  id: string;
  title: string;
  route: string;
  widgets: ParsedWidget[];
  isChatScreen?: boolean;
  isCalculatorScreen?: boolean;
  isTasksScreen?: boolean;
};

type ParsedAndroidApp = {
  stack: AndroidStack;
  appName: string;
  packageName: string;
  primaryColor: string;
  darkTheme: boolean;
  screens: ParsedScreen[];
  navItems: { label: string; targetRoute: string; icon: string }[];
  tabs: string[];
  fabLabel: string | null;
  listItems: { title: string; subtitle?: string; done?: boolean }[];
  starterMessages: { role: "assistant" | "user"; text: string }[];
  diagnostics: BuildDiagnostic[];
};

type StringLiteralToken = {
  value: string;
  start: number;
  end: number;
};

type CallBlock = {
  callee: string;
  args: string;
  lambdaBody: string;
  start: number;
  end: number;
};

export function detectAndroidStack(files: WorkspaceFile[]): AndroidStack {
  const hasDart = files.some((f) => f.path.endsWith(".dart") || f.path.endsWith("pubspec.yaml"));
  if (hasDart) return "flutter-dart";
  const hasKotlinCompose = files.some(
    (f) => f.path.endsWith(".kt") && (/@Composable\b|androidx\.compose|setContent\s*\{/.test(f.content) || /Screen\.kt$/i.test(f.path))
  );
  if (hasKotlinCompose || files.some((f) => f.path.endsWith(".kt"))) return "kotlin-compose";
  const hasJavaXml = files.some((f) => f.path.endsWith(".java") || /^app\/src\/main\/res\/layout\/.*\.xml$/i.test(f.path));
  if (hasJavaXml) return "java-xml";
  return "unknown";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function findLineNumber(content: string, index: number): number {
  return content.slice(0, Math.max(0, index)).split("\n").length;
}

function extractXmlErrorLine(msg: string): number {
  const m = msg.match(/\bline(?:\s+number)?\s*:?\s*(\d+)/i);
  return m ? Math.max(1, Number(m[1])) : 1;
}

export function scanNativeSyntaxDiagnostics(files: WorkspaceFile[]): BuildDiagnostic[] {
  const diagnostics: BuildDiagnostic[] = [];
  for (const file of files) {
    const lowerPath = file.path.toLowerCase();
    if (/\.(kt|kts|java|dart|gradle)$/i.test(lowerPath)) {
      const content = file.content;
      const isDart = lowerPath.endsWith(".dart");
      const supportsInterp = lowerPath.endsWith(".kt") || lowerPath.endsWith(".kts") || lowerPath.endsWith(".gradle") || isDart;
      const braceStack: number[] = [];
      const parenStack: number[] = [];
      const bracketStack: number[] = [];
      type InterpFrame = { quote: string; triple: boolean; braceBase: number };
      const interpStack: InterpFrame[] = [];

      let inLineComment = false;
      let inBlockComment = false;
      let quote: string | null = null;
      let tripleQuote = false;
      let rawString = false;

      for (let i = 0; i < content.length; i += 1) {
        const ch = content[i];
        const next = content[i + 1];

        if (inLineComment) {
          if (ch === "\n") inLineComment = false;
          continue;
        }
        if (inBlockComment) {
          if (ch === "*" && next === "/") {
            inBlockComment = false;
            i += 1;
          }
          continue;
        }

        if (quote) {
          if (!rawString && ch === "\\") {
            i += 1;
            continue;
          }
          if (!rawString && supportsInterp && ch === "$" && next === "{") {
            interpStack.push({ quote, triple: tripleQuote, braceBase: braceStack.length });
            quote = null;
            tripleQuote = false;
            rawString = false;
            i += 1;
            continue;
          }
          if (tripleQuote) {
            const delim = quote.repeat(3);
            if (content.slice(i, i + 3) === delim) {
              quote = null;
              tripleQuote = false;
              rawString = false;
              i += 2;
            }
            continue;
          }
          if (ch === quote) {
            quote = null;
            rawString = false;
          }
          continue;
        }

        if (ch === "/" && next === "/") {
          inLineComment = true;
          i += 1;
          continue;
        }
        if (ch === "/" && next === "*") {
          inBlockComment = true;
          i += 1;
          continue;
        }

        // Dart raw strings: r'...', r"...", r'''...''', r"""..."""
        if (isDart && ch === "r" && (next === '"' || next === "'") && (i === 0 || !/[A-Za-z0-9_$]/.test(content[i - 1]))) {
          const q = next;
          const isTriple = content.slice(i + 1, i + 4) === q.repeat(3);
          quote = q;
          tripleQuote = isTriple;
          rawString = true;
          i += isTriple ? 3 : 1;
          continue;
        }

        if (ch === '"' || (ch === "'" && (!tripleQuote))) {
          if (content.slice(i, i + 3) === '"""' || (isDart && content.slice(i, i + 3) === "'''")) {
            quote = ch;
            tripleQuote = true;
            rawString = false;
            i += 2;
            continue;
          }
          quote = ch;
          tripleQuote = false;
          rawString = false;
          continue;
        }

        if (ch === "{") {
          braceStack.push(i);
        } else if (ch === "}") {
          const activeInterp = interpStack[interpStack.length - 1];
          if (activeInterp && braceStack.length === activeInterp.braceBase) {
            interpStack.pop();
            quote = activeInterp.quote;
            tripleQuote = activeInterp.triple;
            rawString = false;
          } else if (!braceStack.length) {
            diagnostics.push({ path: file.path, line: findLineNumber(content, i), severity: "error", message: 'Unexpected closing brace "}"' });
          } else {
            braceStack.pop();
          }
        } else if (ch === "(") {
          parenStack.push(i);
        } else if (ch === ")") {
          if (!parenStack.length) {
            diagnostics.push({ path: file.path, line: findLineNumber(content, i), severity: "error", message: 'Unexpected closing parenthesis ")"' });
          } else {
            parenStack.pop();
          }
        } else if (ch === "[") {
          bracketStack.push(i);
        } else if (ch === "]") {
          if (!bracketStack.length) {
            diagnostics.push({ path: file.path, line: findLineNumber(content, i), severity: "error", message: 'Unexpected closing bracket "]"' });
          } else {
            bracketStack.pop();
          }
        }
      }

      if (quote) {
        diagnostics.push({
          path: file.path,
          line: findLineNumber(content, content.length - 1),
          severity: "error",
          message: `Unterminated ${tripleQuote ? quote.repeat(3) : quote} string literal`,
        });
      }
      if (interpStack.length) {
        diagnostics.push({
          path: file.path,
          line: findLineNumber(content, content.length - 1),
          severity: "error",
          message: "Unterminated string template interpolation ${...}",
        });
      }
      if (braceStack.length) {
        diagnostics.push({
          path: file.path,
          line: findLineNumber(content, braceStack[braceStack.length - 1]),
          severity: "error",
          message: `${braceStack.length} unclosed "{" brace(s)`,
        });
      }
      if (parenStack.length) {
        diagnostics.push({
          path: file.path,
          line: findLineNumber(content, parenStack[parenStack.length - 1]),
          severity: "error",
          message: `${parenStack.length} unclosed "(" parenthesis`,
        });
      }
      if (bracketStack.length) {
        diagnostics.push({
          path: file.path,
          line: findLineNumber(content, bracketStack[bracketStack.length - 1]),
          severity: "error",
          message: `${bracketStack.length} unclosed "[" bracket(s)`,
        });
      }
      if (/\bwindow\.SUJITH\b|\bdocument\.(getElementById|querySelector|createElement)\b|\blocalStorage\b/.test(content)) {
        const m = content.match(/\b(window\.SUJITH|document\.\w+|localStorage)\b/);
        diagnostics.push({
          path: file.path,
          line: m?.index !== undefined ? findLineNumber(content, m.index) : 1,
          severity: "error",
          message: `Browser-only API (${m?.[0] ?? "DOM"}) cannot be used in native ${file.path.split(".").pop()} source`,
        });
      }
      if (/\bTODO\s*\(/i.test(content)) {
        const m = content.match(/\bTODO\s*\(/i);
        diagnostics.push({
          path: file.path,
          line: m?.index !== undefined ? findLineNumber(content, m.index) : 1,
          severity: "error",
          message: "Unimplemented TODO() stub throws NotImplementedError at runtime; implement the full logic.",
        });
      }
    } else if (lowerPath.endsWith(".xml")) {
      if (typeof DOMParser !== "undefined") {
        const doc = new DOMParser().parseFromString(file.content, "application/xml");
        const err = doc.querySelector("parsererror");
        if (err) {
          const msg = (err.textContent || "Malformed XML").replace(/\s+/g, " ").slice(0, 160);
          diagnostics.push({
            path: file.path,
            line: extractXmlErrorLine(msg),
            severity: "error",
            message: msg,
          });
        }
      } else if (!/<[A-Za-z0-9:._-]+[\s\S]*>/.test(file.content)) {
        diagnostics.push({
          path: file.path,
          line: 1,
          severity: "error",
          message: "Malformed XML root element",
        });
      }
    }
  }
  return diagnostics;
}

/**
 * Character-level lexical scanner that extracts genuine string literals only,
 * preventing cross-quote regex backtracking over raw source code.
 */
function scanStringLiterals(source: string): StringLiteralToken[] {
  const tokens: StringLiteralToken[] = [];
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (source.slice(i, i + 3) === '"""') {
      const end = source.indexOf('"""', i + 3);
      if (end === -1) break;
      tokens.push({ value: source.slice(i + 3, end), start: i, end: end + 3 });
      i = end + 2;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      let val = "";
      i += 1;
      while (i < source.length) {
        const cur = source[i];
        if (cur === "\\") {
          const esc = source[i + 1];
          if (esc === "n") val += "\n";
          else if (esc === "t") val += " ";
          else if (esc !== undefined) val += esc;
          i += 2;
          continue;
        }
        if (cur === quote) {
          tokens.push({ value: val, start, end: i + 1 });
          break;
        }
        if (cur === "\n" && quote === "'") break;
        val += cur;
        i += 1;
      }
    }
  }
  return tokens;
}

function findMatchingDelimiter(source: string, openIdx: number, openChar = "{", closeChar = "}"): number {
  let depth = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let quote: string | null = null;

  for (let i = openIdx; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (source.slice(i, i + 3) === '"""') {
      const end = source.indexOf('"""', i + 3);
      if (end === -1) return source.length - 1;
      i = end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === openChar) depth += 1;
    else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return source.length - 1;
}

function extractBalancedBlock(source: string, openIdx: number, openChar = "{", closeChar = "}"): string {
  const closeIdx = findMatchingDelimiter(source, openIdx, openChar, closeChar);
  return source.slice(openIdx + 1, closeIdx);
}

function splitTopLevelArgs(args: string): string[] {
  const out: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let quote: string | null = null;
  for (let i = 0; i < args.length; i += 1) {
    const ch = args[i];
    if (quote) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (args.slice(i, i + 3) === '"""') {
      const end = args.indexOf('"""', i + 3);
      if (end === -1) break;
      i = end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (ch === "[") bracketDepth += 1;
    else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === "," && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      out.push(args.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = args.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function findCallBlocks(source: string, calleeNames: string[]): CallBlock[] {
  const results: CallBlock[] = [];
  const escaped = calleeNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\b(${escaped.join("|")})\\s*\\(`, "g");
  const stringRanges = scanStringLiterals(source);
  const insideStringOrComment = (pos: number) =>
    stringRanges.some((tok) => pos >= tok.start && pos < tok.end);

  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    if (insideStringOrComment(match.index)) continue;
    const parenOpen = source.indexOf("(", match.index + match[1].length);
    if (parenOpen === -1) continue;
    const parenClose = findMatchingDelimiter(source, parenOpen, "(", ")");
    const args = source.slice(parenOpen + 1, parenClose);
    let end = parenClose + 1;
    let lambdaBody = "";
    const afterArgs = source.slice(parenClose + 1).match(/^\s*\{/);
    if (afterArgs) {
      const braceOpen = parenClose + 1 + afterArgs[0].length - 1;
      const braceClose = findMatchingDelimiter(source, braceOpen, "{", "}");
      lambdaBody = source.slice(braceOpen + 1, braceClose);
      end = braceClose + 1;
    }
    results.push({
      callee: match[1],
      args,
      lambdaBody,
      start: match.index,
      end,
    });
  }
  return results;
}

function isLikelyCodeNoise(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length > 220) return true;
  if (/^(?:user|assistant|system|model|role|content|text|utf-8|application\/json|text\/plain|null|true|false)$/i.test(trimmed)) return true;
  if (/(?:_state\.update|\.copy\(|newUserMsg|currentInput|currentMessages|android\.|androidx\.|java\.|kotlin\.)/.test(trimmed)) return true;
  if (/^[a-z_][a-zA-Z0-9_]*$/.test(trimmed) && trimmed.length < 24 && /_/.test(trimmed)) return true;
  if (/^[{}()[\],.;:=<>+\-*/\\]+$/.test(trimmed)) return true;
  return false;
}

function cleanDisplayText(raw: string, strings: Record<string, string>): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const resMatch = trimmed.match(/stringResource\(\s*R\.string\.([A-Za-z0-9_]+)\s*\)/);
  if (resMatch && strings[resMatch[1]]) {
    return strings[resMatch[1]];
  }
  const cleaned = trimmed
    .replace(/\$\{[^}]+\}/g, "")
    .replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 2 || isLikelyCodeNoise(cleaned)) return null;
  return cleaned;
}

function extractFirstLiteral(expr: string, strings: Record<string, string>): string | null {
  const resMatch = expr.match(/stringResource\(\s*R\.string\.([A-Za-z0-9_]+)\s*\)/);
  if (resMatch && strings[resMatch[1]]) return strings[resMatch[1]];
  const lits = scanStringLiterals(expr);
  for (const lit of lits) {
    const cleaned = cleanDisplayText(lit.value, strings);
    if (cleaned) return cleaned;
  }
  return null;
}

function extractStringResources(files: WorkspaceFile[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const file of files) {
    if (!file.path.endsWith("strings.xml")) continue;
    const re = /<string\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/string>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(file.content)) !== null) {
      map[m[1]] = m[2].trim();
    }
  }
  return map;
}

function extractThemeMeta(files: WorkspaceFile[]): { primaryColor: string; darkTheme: boolean } {
  const all = files.map((f) => f.content).join("\n");
  let primaryColor = "#1a73e8";
  const colorMatch = all.match(/(?:primary|Purple40|PrimaryBlue|seedColor|colorPrimary)\s*=\s*(?:Color\()?(?:0x[Ff]{2}|#)([0-9A-Fa-f]{6})/i);
  if (colorMatch) {
    primaryColor = `#${colorMatch[1]}`;
  } else {
    const hexXml = all.match(/<color\s+name=["'][^"']*primary[^"']*["'][^>]*>#([0-9A-Fa-f]{6,8})<\/color>/i);
    if (hexXml) primaryColor = `#${hexXml[1].slice(-6)}`;
  }
  const darkTheme = /darkColorScheme|ThemeMode\.dark|Brightness\.dark|isDark\s*=\s*true/i.test(all);
  return { primaryColor, darkTheme };
}

const HELPER_COMPOSABLE_NAME_RE =
  /(?:Theme|Preview|Bubble|Indicator|Header|Footer|TopBar|BottomBar|AppBar|InputBar|Composer|Row|Item|Card|Chip|Badge|Button|Dialog|Sheet|Modal|Avatar|Banner|Logo|Icon|Divider|EmptyState|Overlay|CardContent|Toolbar)$/i;

function parseKotlinComposeApp(files: WorkspaceFile[], strings: Record<string, string>): ParsedAndroidApp {
  const ktFiles = files.filter((f) => f.path.endsWith(".kt"));
  const allKt = ktFiles.map((f) => f.content).join("\n\n");
  const { primaryColor, darkTheme } = extractThemeMeta(files);
  const pkgMatch = allKt.match(/^\s*package\s+([a-zA-Z0-9_.]+)/m);
  const packageName = pkgMatch?.[1] ?? "com.sujith.generated";

  let topBarTitle: string | null = null;
  for (const call of findCallBlocks(allKt, ["TopAppBar", "CenterAlignedTopAppBar", "LargeTopAppBar", "SmallTopAppBar", "MediumTopAppBar"])) {
    const combined = `${call.args}\n${call.lambdaBody}`;
    const candidate = extractFirstLiteral(combined, strings);
    if (candidate && !HELPER_COMPOSABLE_NAME_RE.test(candidate.replace(/\s+/g, ""))) {
      topBarTitle = candidate;
      break;
    }
  }

  const manifestLabel = files
    .find((f) => f.path.endsWith("AndroidManifest.xml"))
    ?.content.match(/android:label=["']([^"'@][^"']{1,42})["']/)?.[1];

  const appName =
    (strings["app_name"] && !isLikelyCodeNoise(strings["app_name"]) ? strings["app_name"] : null) ||
    topBarTitle ||
    manifestLabel ||
    "SUJITH Android App";

  const navItems: { label: string; targetRoute: string; icon: string }[] = [];
  for (const call of findCallBlocks(allKt, ["NavigationBarItem", "BottomNavigationItem"])) {
    const labelBlock = call.args.match(/label\s*=\s*\{([\s\S]*)/)?.[1] ?? call.args;
    const lbl = extractFirstLiteral(labelBlock, strings);
    const icon = call.args.match(/Icons\.(?:Default|Filled|Outlined|Rounded)\.([A-Za-z0-9_]+)/)?.[1] || "Circle";
    if (
      lbl &&
      lbl.length <= 24 &&
      !HELPER_COMPOSABLE_NAME_RE.test(lbl.replace(/\s+/g, "")) &&
      !navItems.some((item) => item.label.toLowerCase() === lbl.toLowerCase())
    ) {
      navItems.push({ label: lbl, targetRoute: lbl.toLowerCase().replace(/[^a-z0-9]+/g, "_"), icon });
    }
  }

  const tabs: string[] = [];
  for (const call of findCallBlocks(allKt, ["Tab", "LeadingIconTab"])) {
    const lbl = extractFirstLiteral(`${call.args}\n${call.lambdaBody}`, strings);
    if (lbl && lbl.length <= 24 && !tabs.includes(lbl)) {
      tabs.push(lbl);
    }
  }

  let fabLabel: string | null = null;
  for (const call of findCallBlocks(allKt, ["ExtendedFloatingActionButton", "FloatingActionButton"])) {
    if (call.callee === "ExtendedFloatingActionButton") {
      fabLabel = extractFirstLiteral(`${call.args}\n${call.lambdaBody}`, strings) || "+";
    } else if (!fabLabel) {
      fabLabel = "+";
    }
  }

  const composableRe = /@Composable\s+(?:private\s+|internal\s+|public\s+)?fun\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*(?::[^{\n]+)?\{/g;
  const candidateScreens: { screen: ParsedScreen; priority: number }[] = [];
  let compMatch: RegExpExecArray | null;
  while ((compMatch = composableRe.exec(allKt)) !== null) {
    const fnName = compMatch[1];
    if (HELPER_COMPOSABLE_NAME_RE.test(fnName)) continue;

    const braceStart = compMatch.index + compMatch[0].length - 1;
    const body = extractBalancedBlock(allKt, braceStart);
    const isExplicitScreen = /(?:Screen|Page|View|Tab|Route|Dashboard|Home|App)$/i.test(fnName);
    const hasContainerLayout = /\b(?:Scaffold|NavHost|LazyColumn|Column|Surface)\b/.test(body);
    if (!isExplicitScreen && !hasContainerLayout) continue;

    const widgets: ParsedWidget[] = [];
    let widgetIdx = 0;

    const addWidget = (w: Omit<ParsedWidget, "id">) => {
      if (isLikelyCodeNoise(w.label)) return;
      if (widgets.some((existing) => existing.kind === w.kind && existing.label === w.label)) return;
      widgets.push({ ...w, id: `w-${candidateScreens.length}-${widgetIdx += 1}` });
    };

    for (const tf of findCallBlocks(body, ["OutlinedTextField", "TextField", "BasicTextField"])) {
      const placeholderMatch = tf.args.match(/(?:placeholder|label)\s*=\s*\{/);
      let lbl: string | null = null;
      if (placeholderMatch && placeholderMatch.index !== undefined) {
        const sub = extractBalancedBlock(tf.args, placeholderMatch.index + placeholderMatch[0].length - 1);
        lbl = extractFirstLiteral(sub, strings);
      }
      if (!lbl) lbl = extractFirstLiteral(tf.args, strings);
      addWidget({ kind: "textfield", label: lbl || "Enter text" });
    }

    for (const btn of findCallBlocks(body, ["OutlinedButton", "TextButton", "FilledTonalButton", "ElevatedButton", "Button"])) {
      const btnKind = btn.callee === "OutlinedButton" || btn.callee === "TextButton" ? "outlined-button" : "button";
      const navTarget = btn.args.match(/navigate\(\s*["']([^"']+)["']/)?.[1];
      const lbl = extractFirstLiteral(btn.lambdaBody || btn.args, strings) || "Action";
      addWidget({ kind: btnKind, label: lbl, actionTarget: navTarget });
    }

    for (const sw of findCallBlocks(body, ["Switch", "Checkbox"])) {
      const nearby = body.slice(Math.max(0, sw.start - 140), sw.end + 140);
      const lbl = extractFirstLiteral(nearby, strings) || (sw.callee === "Switch" ? "Toggle option" : "Check option");
      addWidget({ kind: sw.callee === "Switch" ? "switch" : "checkbox", label: lbl, initialChecked: /checked\s*=\s*true/.test(sw.args) });
    }

    for (const txtCall of findCallBlocks(body, ["Text"])) {
      const topArgs = splitTopLevelArgs(txtCall.args);
      const firstArg = topArgs.find((a) => !/^(?:modifier|style|color|fontSize|fontWeight|maxLines|overflow|textAlign|letterSpacing|lineHeight)\s*=/.test(a)) ?? topArgs[0] ?? txtCall.args;
      const lit = extractFirstLiteral(firstArg, strings);
      if (!lit) continue;
      if (widgets.some((w) => w.label === lit)) continue;
      addWidget({ kind: lit.length > 48 ? "card" : "text", label: lit });
    }

    const lowerName = fnName.toLowerCase();
    const isChat =
      /chat|assistant|conversation|ai/.test(lowerName) ||
      (/sendmessage/i.test(body) && /(?:Outlined)?TextField/i.test(body)) ||
      (/LazyColumn/i.test(body) && /MessageBubble|ChatMessage/i.test(body) && /(?:Outlined)?TextField/i.test(body));
    const isCalc = /calc|calculator/.test(lowerName) || (/evaluate|calculate/i.test(body) && /"="/.test(body));
    const isTasks = /task|todo|note|expense|habit/.test(lowerName) || (/LazyColumn/i.test(body) && /Checkbox/i.test(body));

    const cleanFnTitle = fnName
      .replace(/Screen$/i, "")
      .replace(/Page$/i, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .trim();
    const displayTitle =
      !cleanFnTitle || /^(Main|App|Root|Home)$/i.test(cleanFnTitle) ? appName : cleanFnTitle;

    if (widgets.length > 0 || isChat || isCalc || isTasks || /Screen$/i.test(fnName)) {
      const priority = /Screen$/i.test(fnName) ? 3 : isChat || isCalc || isTasks ? 2 : 1;
      candidateScreens.push({
        priority,
        screen: {
          id: fnName.toLowerCase(),
          title: displayTitle,
          route: displayTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
          widgets,
          isChatScreen: isChat,
          isCalculatorScreen: isCalc,
          isTasksScreen: isTasks,
        },
      });
    }
  }

  candidateScreens.sort((a, b) => b.priority - a.priority);
  const screens: ParsedScreen[] = [];
  for (const item of candidateScreens) {
    if (!screens.some((s) => s.route === item.screen.route)) {
      screens.push(item.screen);
    }
  }

  const starterMessages: { role: "assistant" | "user"; text: string }[] = [];
  for (const msgCall of findCallBlocks(allKt, ["ChatMessage", "Message"])) {
    const argsList = splitTopLevelArgs(msgCall.args);
    const namedContent = argsList.find((a) => /^(?:content|text|message|body)\s*=/.test(a));
    const contentExpr = namedContent ? namedContent.replace(/^(?:content|text|message|body)\s*=\s*/, "") : argsList.find((a) => /^["']/.test(a));
    const lit = contentExpr && (/^["']/.test(contentExpr) || /stringResource\(/.test(contentExpr))
      ? extractFirstLiteral(contentExpr, strings)
      : null;
    if (lit && lit.length >= 6 && !starterMessages.some((m) => m.text === lit)) {
      starterMessages.push({
        role: /isUser\s*=\s*true|Role\.USER|["']user["']/i.test(msgCall.args) ? "user" : "assistant",
        text: lit,
      });
    }
  }

  const listItems: { title: string; subtitle?: string; done?: boolean }[] = [];
  for (const itemCall of findCallBlocks(allKt, ["Todo", "Task", "Note", "TodoItem", "TaskItem", "Product", "Contact", "Article"])) {
    const lits = scanStringLiterals(itemCall.args)
      .map((t) => cleanDisplayText(t.value, strings))
      .filter((v): v is string => typeof v === "string" && v.length >= 3);
    if (lits.length > 0) {
      const titleVal = lits[0];
      if (!listItems.some((item) => item.title === titleVal)) {
        listItems.push({ title: titleVal, subtitle: lits[1] });
      }
    }
  }

  return {
    stack: "kotlin-compose",
    appName,
    packageName,
    primaryColor,
    darkTheme,
    screens: screens.length
      ? screens
      : [
          {
            id: "main",
            title: appName,
            route: "main",
            widgets: [{ id: "w-default-1", kind: "card", label: `${appName} ready` }],
          },
        ],
    navItems,
    tabs,
    fabLabel,
    listItems,
    starterMessages,
    diagnostics: scanNativeSyntaxDiagnostics(files),
  };
}

function resolveAndroidString(raw: string, strings: Record<string, string>): string {
  const m = raw.match(/^@string\/([A-Za-z0-9_]+)$/);
  if (m && strings[m[1]]) return strings[m[1]];
  return raw;
}

function parseJavaXmlApp(files: WorkspaceFile[], strings: Record<string, string>): ParsedAndroidApp {
  const { primaryColor, darkTheme } = extractThemeMeta(files);
  const javaFiles = files.filter((f) => f.path.endsWith(".java"));
  const layoutFiles = files.filter((f) => /res\/layout\/.*\.xml$/i.test(f.path));
  const pkgMatch = javaFiles.map((f) => f.content).join("\n").match(/^\s*package\s+([a-zA-Z0-9_.]+)\s*;/m);
  const packageName = pkgMatch?.[1] ?? "com.sujith.generated";
  const appName = strings["app_name"] || "Android XML App";

  const screens: ParsedScreen[] = [];
  let wIdx = 0;

  for (const layout of layoutFiles) {
    if (typeof DOMParser === "undefined") continue;
    const doc = new DOMParser().parseFromString(layout.content, "application/xml");
    if (doc.querySelector("parsererror")) continue;
    const widgets: ParsedWidget[] = [];
    const elements = doc.querySelectorAll("*");
    elements.forEach((el) => {
      const tag = el.tagName.split(".").pop() || el.tagName;
      const textAttr = resolveAndroidString(el.getAttribute("android:text") || "", strings);
      const hintAttr = resolveAndroidString(el.getAttribute("android:hint") || "", strings);
      const titleAttr = resolveAndroidString(el.getAttribute("app:title") || el.getAttribute("android:title") || "", strings);
      if (tag === "TextView" && textAttr) {
        widgets.push({ id: `xml-${wIdx += 1}`, kind: "text", label: textAttr });
      } else if (tag === "EditText" || tag === "TextInputEditText") {
        widgets.push({ id: `xml-${wIdx += 1}`, kind: "textfield", label: hintAttr || textAttr || "Input field" });
      } else if (tag === "Button" || tag === "MaterialButton") {
        widgets.push({ id: `xml-${wIdx += 1}`, kind: "button", label: textAttr || "Button" });
      } else if (tag === "Switch" || tag === "SwitchMaterial") {
        widgets.push({ id: `xml-${wIdx += 1}`, kind: "switch", label: textAttr || "Option" });
      } else if (tag === "CheckBox") {
        widgets.push({ id: `xml-${wIdx += 1}`, kind: "checkbox", label: textAttr || "Check" });
      } else if (tag === "RecyclerView") {
        widgets.push({ id: `xml-${wIdx += 1}`, kind: "list-item", label: "Dynamic list items", sublabel: "RecyclerView adapter items" });
      } else if ((tag === "Toolbar" || tag === "MaterialToolbar") && titleAttr) {
        widgets.unshift({ id: `xml-${wIdx += 1}`, kind: "stat", label: titleAttr });
      }
    });

    const base = layout.path.split("/").pop()?.replace(/\.xml$/i, "") || "activity_main";
    const title = base.replace(/^activity_|^fragment_/i, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const allText = widgets.map((w) => w.label).join(" ").toLowerCase();
    screens.push({
      id: base,
      title,
      route: base,
      widgets,
      isChatScreen: /chat|message|ask ai|send/.test(allText) && widgets.some((w) => w.kind === "textfield"),
    });
  }

  return {
    stack: "java-xml",
    appName,
    packageName,
    primaryColor,
    darkTheme,
    screens: screens.length
      ? screens
      : [{ id: "main", title: appName, route: "main", widgets: [{ id: "xml-fallback", kind: "card", label: `${appName} Activity` }] }],
    navItems: screens.length > 1 ? screens.map((s) => ({ label: s.title, targetRoute: s.route, icon: "Circle" })) : [],
    tabs: [],
    fabLabel: files.some((f) => /FloatingActionButton/.test(f.content)) ? "+" : null,
    listItems: [],
    starterMessages: [],
    diagnostics: scanNativeSyntaxDiagnostics(files),
  };
}

function parseFlutterDartApp(files: WorkspaceFile[]): ParsedAndroidApp {
  const dartFiles = files.filter((f) => f.path.endsWith(".dart"));
  const allDart = dartFiles.map((f) => f.content).join("\n\n");
  const { primaryColor, darkTheme } = extractThemeMeta(files);
  const pubspec = files.find((f) => f.path.endsWith("pubspec.yaml"))?.content || "";
  const appName =
    allDart.match(/MaterialApp\([\s\S]{0,180}?title:\s*(['"])([\s\S]*?)\1/)?.[2] ||
    allDart.match(/AppBar\([\s\S]{0,180}?title:\s*(?:const\s+)?Text\(\s*(['"])([\s\S]*?)\1/)?.[2] ||
    pubspec.match(/^name:\s*([A-Za-z0-9_]+)/m)?.[1] ||
    "Flutter App";

  const navItems: { label: string; targetRoute: string; icon: string }[] = [];
  for (const call of findCallBlocks(allDart, ["BottomNavigationBarItem", "NavigationDestination"])) {
    const lbl = extractFirstLiteral(call.args.match(/label:\s*([^,)]+)/)?.[1] ?? call.args, {});
    if (lbl && !navItems.some((item) => item.label === lbl)) {
      navItems.push({ label: lbl, targetRoute: lbl.toLowerCase().replace(/[^a-z0-9]+/g, "_"), icon: "Circle" });
    }
  }

  const screens: ParsedScreen[] = [];
  const classRe = /class\s+([A-Za-z0-9_]+)\s+extends\s+(?:StatelessWidget|StatefulWidget|State<[A-Za-z0-9_]+>)\s*\{/g;
  let cm: RegExpExecArray | null;
  while ((cm = classRe.exec(allDart)) !== null) {
    const clsName = cm[1];
    if (HELPER_COMPOSABLE_NAME_RE.test(clsName.replace(/State$/, ""))) continue;
    if (/App$|Theme$|State$/.test(clsName) && !clsName.includes("Screen") && !clsName.includes("Home") && screens.length > 0) continue;
    const body = extractBalancedBlock(allDart, cm.index + cm[0].length - 1);
    const widgets: ParsedWidget[] = [];
    let idx = 0;

    const add = (w: Omit<ParsedWidget, "id">) => {
      if (isLikelyCodeNoise(w.label)) return;
      if (!widgets.some((e) => e.kind === w.kind && e.label === w.label)) {
        widgets.push({ ...w, id: `dart-${screens.length}-${idx += 1}` });
      }
    };

    for (const tf of findCallBlocks(body, ["TextField", "TextFormField"])) {
      const hint = extractFirstLiteral(tf.args.match(/(?:hintText|labelText):\s*([^,)]+)/)?.[1] ?? tf.args, {}) || "Enter message";
      add({ kind: "textfield", label: hint });
    }

    for (const btn of findCallBlocks(body, ["ElevatedButton", "FilledButton", "OutlinedButton", "TextButton"])) {
      const lbl = extractFirstLiteral(btn.args, {}) || "Submit";
      add({ kind: /Outlined|TextButton/.test(btn.callee) ? "outlined-button" : "button", label: lbl });
    }

    for (const sw of findCallBlocks(body, ["Switch", "SwitchListTile", "Checkbox", "CheckboxListTile"])) {
      const lbl = extractFirstLiteral(sw.args, {}) || (/Switch/.test(sw.callee) ? "Setting toggle" : "Checklist item");
      add({ kind: /Switch/.test(sw.callee) ? "switch" : "checkbox", label: lbl });
    }

    for (const txt of findCallBlocks(body, ["Text"])) {
      const val = extractFirstLiteral(txt.args.split(",")[0] ?? txt.args, {});
      if (val && !widgets.some((w) => w.label === val)) {
        add({ kind: val.length > 48 ? "card" : "text", label: val });
      }
    }

    const cleanTitle = clsName.replace(/^_+|Screen$|Page$|State$/g, "").replace(/([a-z])([A-Z])/g, "$1 $2").trim() || appName;
    const isChat = /chat|assistant|message/i.test(clsName) || (/TextField/.test(body) && /chat|send|ai/i.test(body));
    const isCalc = /calc/i.test(clsName) || (/evaluate/i.test(body) && /'='/i.test(body));
    if (widgets.length > 0 || isChat || isCalc) {
      screens.push({
        id: clsName.toLowerCase(),
        title: cleanTitle,
        route: cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        widgets,
        isChatScreen: isChat,
        isCalculatorScreen: isCalc,
      });
    }
  }

  return {
    stack: "flutter-dart",
    appName,
    packageName: pubspec.match(/^name:\s*([A-Za-z0-9_]+)/m)?.[1] || "sujith_flutter_app",
    primaryColor,
    darkTheme,
    screens: screens.length
      ? screens
      : [{ id: "home", title: appName, route: "home", widgets: [{ id: "dart-home", kind: "card", label: `${appName} Flutter UI` }] }],
    navItems,
    tabs: [],
    fabLabel: /FloatingActionButton\b/.test(allDart) ? "+" : null,
    listItems: [],
    starterMessages: [],
    diagnostics: scanNativeSyntaxDiagnostics(files),
  };
}

export function renderAndroidPreviewDocument(files: WorkspaceFile[]): string {
  const stack = detectAndroidStack(files);
  if (stack === "unknown") return "";
  const strings = extractStringResources(files);
  const parsed =
    stack === "kotlin-compose"
      ? parseKotlinComposeApp(files, strings)
      : stack === "java-xml"
        ? parseJavaXmlApp(files, strings)
        : parseFlutterDartApp(files);

  const safeData = JSON.stringify(parsed).replace(/</g, "\\u003c");
  const errorCount = parsed.diagnostics.filter((d) => d.severity === "error").length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(parsed.appName)}</title>
  <style>
    :root {
      --md-primary: ${parsed.primaryColor};
      --md-bg: ${parsed.darkTheme ? "#0f1115" : "#f8fafd"};
      --md-surface: ${parsed.darkTheme ? "#181b20" : "#ffffff"};
      --md-surface-2: ${parsed.darkTheme ? "#22262e" : "#f1f4f9"};
      --md-ink: ${parsed.darkTheme ? "#f1f3f4" : "#1f1f1f"};
      --md-muted: ${parsed.darkTheme ? "#9aa0a6" : "#5f6368"};
      --md-line: ${parsed.darkTheme ? "#2f343f" : "#e1e5ec"};
    }
    * { box-sizing: border-box; font-family: "Roboto", system-ui, -apple-system, sans-serif; }
    html, body { margin: 0; height: 100%; background: var(--md-bg); color: var(--md-ink); }
    body { display: flex; flex-direction: column; overflow: hidden; }
    .status-bar { height: 24px; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; font-size: 10px; font-weight: 600; color: var(--md-muted); background: var(--md-surface); flex-shrink: 0; }
    .top-bar { min-height: 52px; padding: 8px 14px; display: flex; align-items: center; gap: 10px; background: var(--md-surface); border-bottom: 1px solid var(--md-line); flex-shrink: 0; }
    .top-badge { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; background: var(--md-primary); color: #fff; font-weight: 700; font-size: 13px; flex-shrink: 0; }
    .top-title { font-size: 15px; font-weight: 600; line-height: 1.2; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stack-pill { font-size: 9px; font-weight: 600; padding: 3px 7px; border-radius: 6px; background: var(--md-surface-2); color: var(--md-muted); text-transform: uppercase; letter-spacing: .04em; }
    .tabs { display: flex; gap: 4px; padding: 6px 12px; background: var(--md-surface); border-bottom: 1px solid var(--md-line); overflow-x: auto; flex-shrink: 0; }
    .tab-btn { border: 0; background: transparent; color: var(--md-muted); padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; }
    .tab-btn.active { background: var(--md-surface-2); color: var(--md-primary); font-weight: 600; }
    .err-banner { background: #fce8e6; color: #b3261e; border-bottom: 1px solid #f2b8b5; padding: 10px 14px; font-size: 11px; flex-shrink: 0; }
    .err-banner strong { display: block; font-size: 11.5px; margin-bottom: 3px; }
    .err-list { margin: 4px 0 0; padding-left: 16px; }
    .content { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; position: relative; }
    .card { background: var(--md-surface); border: 1px solid var(--md-line); border-radius: 16px; padding: 13px 14px; box-shadow: 0 2px 10px -6px rgba(0,0,0,.15); }
    .card-title { font-size: 13.5px; font-weight: 600; margin: 0 0 4px; }
    .card-sub { font-size: 12px; color: var(--md-muted); margin: 0; line-height: 1.45; }
    .btn { border: 0; border-radius: 12px; background: var(--md-primary); color: #fff; padding: 11px 16px; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity .15s; }
    .btn:active { opacity: .82; }
    .btn-outline { border: 1px solid var(--md-line); border-radius: 12px; background: var(--md-surface); color: var(--md-ink); padding: 10px 14px; font-size: 12.5px; font-weight: 500; cursor: pointer; }
    .field { width: 100%; border: 1px solid var(--md-line); border-radius: 12px; padding: 10px 12px; font-size: 13px; background: var(--md-surface); color: var(--md-ink); outline: none; }
    .field:focus { border-color: var(--md-primary); }
    .toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--md-surface); border: 1px solid var(--md-line); border-radius: 14px; padding: 10px 13px; font-size: 13px; }
    .bottom-nav { display: flex; border-top: 1px solid var(--md-line); background: var(--md-surface); padding: 6px 8px; flex-shrink: 0; }
    .nav-btn { flex: 1; border: 0; background: transparent; color: var(--md-muted); padding: 6px 4px; border-radius: 10px; font-size: 11px; font-weight: 500; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .nav-btn.active { color: var(--md-primary); font-weight: 700; background: var(--md-surface-2); }
    .fab { position: fixed; right: 16px; bottom: 72px; min-width: 48px; height: 48px; padding: 0 16px; border-radius: 16px; border: 0; background: var(--md-primary); color: #fff; font-size: 18px; font-weight: 700; box-shadow: 0 8px 20px -6px rgba(0,0,0,.35); cursor: pointer; z-index: 20; }
    .chat-list { flex: 1; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding-bottom: 6px; }
    .bubble { max-width: 84%; padding: 10px 13px; border-radius: 16px; font-size: 13px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
    .bubble.user { align-self: flex-end; background: var(--md-primary); color: #fff; border-bottom-right-radius: 4px; }
    .bubble.assistant { align-self: flex-start; background: var(--md-surface); border: 1px solid var(--md-line); color: var(--md-ink); border-bottom-left-radius: 4px; }
    .chat-bar { display: flex; gap: 8px; padding: 8px 12px 10px; background: var(--md-surface); border-top: 1px solid var(--md-line); flex-shrink: 0; }
    .snackbar { position: fixed; left: 14px; right: 14px; bottom: 68px; background: #1f1f1f; color: #fff; padding: 10px 14px; border-radius: 12px; font-size: 12px; z-index: 30; display: none; }
    .calc-display { width: 100%; text-align: right; font-size: 28px; font-weight: 700; padding: 14px; border-radius: 16px; background: var(--md-surface); border: 1px solid var(--md-line); color: var(--md-ink); }
    .calc-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .calc-key { height: 50px; border-radius: 14px; border: 1px solid var(--md-line); background: var(--md-surface); color: var(--md-ink); font-size: 16px; font-weight: 600; cursor: pointer; }
    .calc-key.op { background: var(--md-surface-2); color: var(--md-primary); }
    .calc-key.eq { background: var(--md-primary); color: #fff; border-color: transparent; }
  </style>
</head>
<body>
  <div class="status-bar">
    <span>9:41</span>
    <span>5G · 100%</span>
  </div>
  <header class="top-bar">
    <div class="top-badge" id="app-badge">${escapeHtml(parsed.appName.slice(0, 1).toUpperCase())}</div>
    <div class="top-title" id="screen-title">${escapeHtml(parsed.appName)}</div>
    <span class="stack-pill">${escapeHtml(parsed.stack === "kotlin-compose" ? "Compose" : parsed.stack === "flutter-dart" ? "Flutter" : "XML")}</span>
  </header>
  ${
    errorCount > 0
      ? `<div class="err-banner"><strong>${errorCount} native syntax issue(s) detected</strong><ul class="err-list">${parsed.diagnostics
          .slice(0, 4)
          .map((d) => `<li>${escapeHtml(d.path)}:${d.line} — ${escapeHtml(d.message)}</li>`)
          .join("")}</ul></div>`
      : ""
  }
  <div id="tab-strip" class="tabs" style="display:none"></div>
  <main class="content" id="screen-body"></main>
  <form class="chat-bar" id="chat-bar" style="display:none">
    <input id="chat-input" class="field" placeholder="Ask ${escapeHtml(parsed.appName)}..." />
    <button type="submit" id="chat-send" class="btn">Send</button>
  </form>
  <button type="button" id="fab-btn" class="fab" style="display:none"></button>
  <nav id="bottom-nav" class="bottom-nav" style="display:none"></nav>
  <div id="snackbar" class="snackbar"></div>

  <script>
    const APP = ${safeData};
    let activeScreenIdx = 0;
    let activeTab = APP.tabs[0] || "";
    const screenBody = document.getElementById("screen-body");
    const screenTitle = document.getElementById("screen-title");
    const tabStrip = document.getElementById("tab-strip");
    const bottomNav = document.getElementById("bottom-nav");
    const fabBtn = document.getElementById("fab-btn");
    const chatBar = document.getElementById("chat-bar");
    const chatInput = document.getElementById("chat-input");
    const snackbar = document.getElementById("snackbar");

    const chatMessages = APP.starterMessages.length
      ? APP.starterMessages.slice()
      : [{ role: "assistant", text: "Hello! I am " + APP.appName + ". Send a message to start." }];
    const items = APP.listItems.length
      ? APP.listItems.slice()
      : [{ title: APP.appName + " item 1", subtitle: "Ready in Material 3 preview", done: false }];
    let calcExpr = "0";
    let snackTimer = null;

    function showToast(msg) {
      snackbar.textContent = msg;
      snackbar.style.display = "block";
      clearTimeout(snackTimer);
      snackTimer = setTimeout(() => { snackbar.style.display = "none"; }, 2200);
    }

    function renderNavigation() {
      if (APP.tabs.length > 0) {
        tabStrip.style.display = "flex";
        tabStrip.innerHTML = "";
        APP.tabs.forEach((tab) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "tab-btn" + (tab === activeTab ? " active" : "");
          btn.textContent = tab;
          btn.onclick = () => { activeTab = tab; renderScreen(); };
          tabStrip.appendChild(btn);
        });
      }
      const navTargets = APP.navItems.length > 1
        ? APP.navItems
        : APP.screens.length > 1
          ? APP.screens.map((s) => ({ label: s.title, targetRoute: s.route }))
          : [];
      if (navTargets.length > 1) {
        bottomNav.style.display = "flex";
        bottomNav.innerHTML = "";
        navTargets.forEach((item, idx) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "nav-btn" + (idx === activeScreenIdx ? " active" : "");
          btn.textContent = item.label;
          btn.onclick = () => {
            activeScreenIdx = Math.min(idx, APP.screens.length - 1);
            renderNavigation();
            renderScreen();
          };
          bottomNav.appendChild(btn);
        });
      } else {
        bottomNav.style.display = "none";
      }
      if (APP.fabLabel && !(APP.screens[activeScreenIdx] && APP.screens[activeScreenIdx].isChatScreen)) {
        fabBtn.style.display = "block";
        fabBtn.textContent = APP.fabLabel;
        fabBtn.onclick = () => {
          items.unshift({ title: "New item " + (items.length + 1), subtitle: "Added via FAB", done: false });
          renderScreen();
          showToast("Added new item");
        };
      } else {
        fabBtn.style.display = "none";
      }
    }

    function renderChatScreen() {
      chatBar.style.display = "flex";
      const list = document.createElement("div");
      list.className = "chat-list";
      chatMessages.forEach((m) => {
        const b = document.createElement("div");
        b.className = "bubble " + m.role;
        b.textContent = m.text;
        list.appendChild(b);
      });
      screenBody.appendChild(list);
      list.scrollTop = list.scrollHeight;
    }

    chatBar.addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = (chatInput.value || "").trim();
      if (!q) return;
      chatInput.value = "";
      chatMessages.push({ role: "user", text: q });
      const pending = { role: "assistant", text: "Thinking..." };
      chatMessages.push(pending);
      renderScreen();
      try {
        if (window.SUJITH && window.SUJITH.ai) {
          const turns = chatMessages.slice(0, -1).map((m) => ({ role: m.role, content: m.text }));
          const reply = await window.SUJITH.ai.stream(turns, (partial) => {
            pending.text = partial;
            renderScreen();
          });
          pending.text = reply || pending.text;
        } else {
          pending.text = "Connected preview chat. Open in SUJITH AI workspace to stream live replies.";
        }
      } catch (err) {
        pending.text = err && err.message ? err.message : "Could not get AI response.";
      }
      renderScreen();
    });

    function evaluateCalcExpr(raw) {
      const tokens = [];
      let idx = 0;
      const clean = String(raw || "").replace(/%/g, "/100").replace(/\\s+/g, "");
      if (!/^[0-9+\\-*/().]+$/.test(clean) || !clean) throw new Error("Invalid");
      while (idx < clean.length) {
        const ch = clean[idx];
        if ("+-*/()".includes(ch)) { tokens.push(ch); idx += 1; }
        else {
          let num = "";
          while (idx < clean.length && /[0-9.]/.test(clean[idx])) { num += clean[idx]; idx += 1; }
          const n = Number(num);
          if (!Number.isFinite(n)) throw new Error("Invalid number");
          tokens.push(n);
        }
      }
      let pos = 0;
      function parseExpr() {
        let val = parseTerm();
        while (tokens[pos] === "+" || tokens[pos] === "-") {
          const op = tokens[pos++];
          val = op === "+" ? val + parseTerm() : val - parseTerm();
        }
        return val;
      }
      function parseTerm() {
        let val = parseFactor();
        while (tokens[pos] === "*" || tokens[pos] === "/") {
          const op = tokens[pos++];
          const rhs = parseFactor();
          val = op === "*" ? val * rhs : val / rhs;
        }
        return val;
      }
      function parseFactor() {
        if (tokens[pos] === "-") { pos++; return -parseFactor(); }
        if (tokens[pos] === "+") { pos++; return parseFactor(); }
        if (tokens[pos] === "(") {
          pos++;
          const val = parseExpr();
          if (tokens[pos++] !== ")") throw new Error("Unbalanced");
          return val;
        }
        const tok = tokens[pos++];
        if (typeof tok !== "number") throw new Error("Expected number");
        return tok;
      }
      const out = parseExpr();
      if (pos !== tokens.length || !Number.isFinite(out)) throw new Error("Invalid");
      return out;
    }

    function renderCalculator() {
      const disp = document.createElement("input");
      disp.id = "calc-display";
      disp.className = "calc-display";
      disp.readOnly = true;
      disp.value = calcExpr;
      screenBody.appendChild(disp);

      const grid = document.createElement("div");
      grid.className = "calc-grid";
      const keys = ["AC", "(", ")", "/", "7", "8", "9", "*", "4", "5", "6", "-", "1", "2", "3", "+", "0", ".", "%", "="];
      keys.forEach((k) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "calc-key" + (k === "=" ? " eq" : ["/", "*", "-", "+", "%", "AC"].includes(k) ? " op" : "");
        btn.textContent = k;
        btn.onclick = () => {
          if (k === "AC") calcExpr = "0";
          else if (k === "=") {
            try {
              const res = evaluateCalcExpr(calcExpr);
              calcExpr = Number.isFinite(res) ? String(Number(res.toFixed(8))) : "Error";
            } catch {
              calcExpr = "Error";
            }
          } else {
            calcExpr = (calcExpr === "0" || calcExpr === "Error") && !["+", "-", "*", "/", "."].includes(k) ? k : calcExpr + k;
          }
          disp.value = calcExpr;
        };
        grid.appendChild(btn);
      });
      screenBody.appendChild(grid);
    }

    function renderScreen() {
      const scr = APP.screens[activeScreenIdx] || APP.screens[0];
      screenTitle.textContent = scr.title || APP.appName;
      screenBody.innerHTML = "";
      chatBar.style.display = "none";

      if (scr.isChatScreen) {
        renderChatScreen();
        return;
      }
      if (scr.isCalculatorScreen) {
        renderCalculator();
        return;
      }

      if (activeTab) {
        const tabBanner = document.createElement("div");
        tabBanner.className = "card";
        const tabTitleEl = document.createElement("p");
        tabTitleEl.className = "card-title";
        tabTitleEl.textContent = activeTab;
        const tabSubEl = document.createElement("p");
        tabSubEl.className = "card-sub";
        tabSubEl.textContent = "Showing " + scr.title + " section";
        tabBanner.append(tabTitleEl, tabSubEl);
        screenBody.appendChild(tabBanner);
      }

      const fieldInputs = [];
      scr.widgets.forEach((w) => {
        if (w.kind === "textfield") {
          const input = document.createElement("input");
          input.className = "field";
          input.placeholder = w.label;
          fieldInputs.push(input);
          screenBody.appendChild(input);
        } else if (w.kind === "button" || w.kind === "outlined-button") {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = w.kind === "button" ? "btn" : "btn-outline";
          btn.textContent = w.label;
          btn.onclick = () => {
            if (w.actionTarget) {
              const targetIdx = APP.screens.findIndex((s) => s.route === w.actionTarget.toLowerCase());
              if (targetIdx >= 0) {
                activeScreenIdx = targetIdx;
                renderNavigation();
                renderScreen();
                return;
              }
            }
            const firstVal = fieldInputs[0] ? fieldInputs[0].value.trim() : "";
            if (firstVal) {
              items.unshift({ title: firstVal, subtitle: w.label, done: false });
              fieldInputs[0].value = "";
              renderScreen();
            }
            showToast(w.label + " triggered");
          };
          screenBody.appendChild(btn);
        } else if (w.kind === "switch" || w.kind === "checkbox") {
          const row = document.createElement("label");
          row.className = "toggle-row";
          const span = document.createElement("span");
          span.textContent = w.label;
          const inp = document.createElement("input");
          inp.type = "checkbox";
          inp.checked = Boolean(w.initialChecked);
          row.append(span, inp);
          screenBody.appendChild(row);
        } else if (w.kind === "card" || w.kind === "stat") {
          const card = document.createElement("div");
          card.className = "card";
          const h = document.createElement("p");
          h.className = "card-title";
          h.textContent = w.label;
          card.appendChild(h);
          if (w.sublabel) {
            const p = document.createElement("p");
            p.className = "card-sub";
            p.textContent = w.sublabel;
            card.appendChild(p);
          }
          screenBody.appendChild(card);
        } else {
          const card = document.createElement("div");
          card.className = "card";
          const p = document.createElement("p");
          p.className = "card-sub";
          p.style.color = "var(--md-ink)";
          p.textContent = w.label;
          card.appendChild(p);
          screenBody.appendChild(card);
        }
      });

      if (scr.isTasksScreen || APP.listItems.length > 0) {
        items.forEach((it, idx) => {
          const row = document.createElement("div");
          row.className = "toggle-row";
          const left = document.createElement("div");
          const itemTitleEl = document.createElement("div");
          itemTitleEl.style.fontWeight = "600";
          if (it.done) {
            itemTitleEl.style.textDecoration = "line-through";
            itemTitleEl.style.opacity = ".6";
          }
          itemTitleEl.textContent = it.title;
          left.appendChild(itemTitleEl);
          if (it.subtitle) {
            const itemSubEl = document.createElement("div");
            itemSubEl.style.fontSize = "11px";
            itemSubEl.style.color = "var(--md-muted)";
            itemSubEl.textContent = it.subtitle;
            left.appendChild(itemSubEl);
          }
          const del = document.createElement("button");
          del.type = "button";
          del.className = "btn-outline";
          del.textContent = it.done ? "Done" : "Check";
          del.onclick = () => { items[idx].done = !items[idx].done; renderScreen(); };
          row.append(left, del);
          screenBody.appendChild(row);
        });
      }
    }

    renderNavigation();
    renderScreen();
  </script>
</body>
</html>`;
}
