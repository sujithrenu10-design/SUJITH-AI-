import { assertSafeRemoteUrl } from "./mediaEngine.mjs";

const WIKI_USER_AGENT = "SujithIDE/1.0 (https://sujith-ide.local; support@sujith-ide.local) node-fetch";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "of", "in",
  "on", "at", "to", "for", "from", "by", "with", "about", "as", "into", "like", "through",
  "after", "before", "between", "under", "over", "again", "further", "then", "once", "here",
  "there", "when", "where", "why", "how", "what", "which", "who", "whom", "whose", "this",
  "that", "these", "those", "am", "and", "or", "but", "if", "so", "than", "too", "very",
  "just", "now", "tell", "me", "give", "explain", "show", "find", "search", "please", "name",
  "current", "latest", "recent", "today", "news", "info", "information", "details", "more",
  "his", "her", "their", "its", "he", "she", "they", "it", "them", "you", "your",
]);

const AUTHORITATIVE_DOMAINS = [
  "wikipedia.org",
  "wikidata.org",
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "bbc.co.uk",
  "britannica.com",
  "thehindu.com",
  "indianexpress.com",
  "ndtv.com",
  "cnbctv18.com",
  "economictimes.indiatimes.com",
  "hindustantimes.com",
  "livemint.com",
  "pmindia.gov.in",
  "gov.in",
  "tn.gov.in",
  "usa.gov",
  "who.int",
  "un.org",
  "nasa.gov",
  "nih.gov",
  "nature.com",
  "arxiv.org",
  "ieee.org",
  "developer.mozilla.org",
  "react.dev",
  "nextjs.org",
  "python.org",
  "nodejs.org",
  "typescriptlang.org",
  "github.com",
  "stackoverflow.com",
];

function decodeHtmlEntities(input = "") {
  return String(input)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCharCode(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCharCode(code) : "";
    });
}

function stripTags(html = "") {
  return decodeHtmlEntities(String(html).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractDomain(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function sanitizeHttpUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const cleaned = decodeHtmlEntities(rawUrl).trim();
  if (!cleaned) return "";
  try {
    const u = new URL(cleaned);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    if (u.protocol === "http:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
      // Upgrade to https if valid external domain or keep clean https links only when safe
      u.protocol = "https:";
    }
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname.endsWith(".local")) {
      return "";
    }
    return u.toString();
  } catch {
    return "";
  }
}

function extractKeywords(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

function isIndiaRelated(text = "") {
  return /[\u0B80-\u0BFF]|\b(india|indian|tamil\s*nadu|chennai|bengaluru|delhi|mumbai|kerala|karnataka|andhra|telangana|rupee|inr|rbi|lok\s*sabha|vidhan|mla|mp|cm|chief\s*minister|pm\s*modi|stalin|vijay|dmk|aiadmk|tvk|bjp|isro|upi|aadhaar)\b/i.test(
    text
  );
}

function isTechnicalQuery(text = "") {
  return /\b(react|next\.?js|typescript|javascript|python|node\.?js|rust|golang|go|kotlin|flutter|android|api|sdk|llm|ai|openai|gemini|claude|github|npm|css|tailwind|sql|postgres|docker|kubernetes|linux|benchmark|bug|error|release|version|docs|documentation|framework|library)\b/i.test(
    text
  );
}

const CASUAL_SMALLTALK_RE =
  /^(hi|hello|hey|vanakkam|namaste|hola|howdy|sup|yo|wyd|good\s*(morning|afternoon|evening|night)|how are you|how r u|how's it going|hows it going|what's up|whats up|wassup|what are you doing|are you there|who are you|what are you|thanks|thank you|thx|nandri|ok|okay|cool|nice|great|super|semma|mass|bye|goodbye|test|testing|ping|enna\s*pan+ra|enna\s*pand?ra|enna\s*pandra|epdi\s*iruk+a|eppadi\s*iruk+e?nga|nall?a\s*iruk+iya|saptiya|saaptiya|yaar\s*nee|nee\s*yaaru|machan|machi|nanba|thala|bro|dude|வணக்கம்|என்ன\s*பண்ற|என்ன\s*பண்றீங்க|எப்படி\s*இருக்க|நல்லா\s*இருக்கியா|சாப்டியா|யார்\s*நீ)[!.,?\s]*$/i;

export function shouldRunDeepSearch({ query, history = [], isBuilderRequest = false, explicitDeepSearch = false }) {
  if (explicitDeepSearch) return true;
  if (isBuilderRequest) return false;
  if (!query || typeof query !== "string") return false;
  const clean = query.trim();
  if (clean.length < 3) return false;

  // Skip greetings, Tanglish/Tamil casual chat, pleasantries, and trivial acknowledgements
  if (CASUAL_SMALLTALK_RE.test(clean)) {
    return false;
  }

  // Skip explicit pure creative writing / simple math with no research intent
  if (/^\s*[\d\s+\-*/().=]+\s*$/.test(clean)) return false;
  if (/^(write|compose)\s+(a|an|me\s+a)?\s*(short\s+)?(poem|story|joke|song|haiku|rap|love letter)\b/i.test(clean) && !/\b(fact|source|cite|real|history|about\s+20\d\d)\b/i.test(clean)) {
    return false;
  }

  // Skip web search for direct coding / UI / script requests unless explicitly asking to search or verify latest releases/news
  const looksLikeCodingTask =
    /\b(html|css|javascript|typescript|jsx|tsx|python|sql|regex|json|code|coding|script|program|algorithm|function|component|snippet|webpage|website|calculator|predictor|portfolio|dashboard|form|button|navbar|animation|game)\b/i.test(clean) &&
    !/\b(search|verify|news|latest\s+release|latest\s+version|changelog|who\s+is|when\s+did|price|weather)\b/i.test(clean);
  if (looksLikeCodingTask) return false;

  // Explicit or implicit informational / factual / research triggers
  if (
    (/[\u0B80-\u0BFF]/.test(clean) && clean.split(/\s+/).length >= 2 && !CASUAL_SMALLTALK_RE.test(clean)) ||
    /\?/.test(clean) ||
    /\b20[12]\d\b/.test(clean) ||
    /\b(deep\s*search|web\s*search|search|research|verify|fact[\s-]*check|sources?|citations?|references?|links?)\b/i.test(clean) ||
    /\b(who|what|when|where|why|how|which|whose|whom)\b/i.test(clean) ||
    /\b(current|currently|incumbent|latest|recent|today|yesterday|tomorrow|now|date|time|year|news|update|trending|announce[ds]?)\b/i.test(
      clean
    ) ||
    /\b(cm|pm|minister|president|governor|leader|party|election|government|policy|law|budget|tax|gdp|economy|court|verdict)\b/i.test(
      clean
    ) ||
    /\b(weather|score|match|price|stock|market|rate|champion|winner|capital|population|ceo|founder|company|release|version|specs?|compare|comparison|vs|statistics|stats|report|study|data)\b/i.test(
      clean
    )
  ) {
    return true;
  }

  // Follow-up question inside an active multi-turn research conversation (only with clear follow-up cues)
  const priorTurns = Array.isArray(history) ? history.filter((m) => m && m.role !== "system" && typeof m.content === "string") : [];
  if (priorTurns.length >= 2) {
    const looksLikeFollowUp =
      /\b(he|she|they|his|her|their|its|it|this|that|these|those|above|more|details|elaborate|explain|party|achievements?|term|timeline|source|prove)\b/i.test(
        clean
      );
    const prevWasFactual = priorTurns
      .slice(-4)
      .some((m) => m.role === "user" && shouldRunDeepSearch({ query: m.content, history: [], isBuilderRequest: false }));
    if (looksLikeFollowUp && prevWasFactual) {
      return true;
    }
  }

  return false;
}

export function buildSearchQueries(query, history = []) {
  const clean = String(query || "").replace(/[?!]+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const nonSystem = Array.isArray(history)
    ? history.filter((m) => m && m.role !== "system" && typeof m.content === "string" && m.content.trim())
    : [];

  // Detect follow-up pronouns/short queries needing topic context from recent turn
  const needsContext =
    /\b(he|she|they|his|her|their|him|them|it|its|this|that|former|latter|more details|elaborate)\b/i.test(clean) ||
    clean.split(/\s+/).length <= 4;

  let contextualQuery = clean;
  if (needsContext && nonSystem.length >= 1) {
    const prevUser = [...nonSystem].reverse().find((m) => m.role === "user" && m.content.trim() !== query.trim());
    const prevAssistant = [...nonSystem].reverse().find((m) => m.role === "assistant");
    const topicTokens = extractKeywords(prevUser?.content || "").slice(0, 5);
    // Also pick bold/entity phrase from previous assistant message if present
    const boldEntityMatch = prevAssistant?.content?.match(/\*\*([A-Z][^*]{2,40})\*\*/);
    const entityHint = boldEntityMatch ? boldEntityMatch[1].trim() : "";
    const existingSet = new Set(extractKeywords(clean));
    const extraTopic = topicTokens.filter((t) => !existingSet.has(t));
    const combinedParts = [entityHint, ...extraTopic, clean].filter(Boolean);
    const merged = combinedParts.join(" ").replace(/\s+/g, " ").trim();
    if (merged.length > clean.length && merged.length <= 160) {
      contextualQuery = merged;
    }
  }

  const queries = [contextualQuery];
  if (contextualQuery !== clean && clean.split(/\s+/).length >= 4) {
    queries.push(clean);
  }

  // For queries asking "current" / leadership / statistics without an explicit year, add a year-anchored query
  const year = new Date().getUTCFullYear();
  if (
    queries.length < 2 &&
    /\b(current|latest|incumbent|now|today|recent|winner|gdp|population|rate|price|release)\b/i.test(contextualQuery) &&
    !/\b20[12]\d\b/.test(contextualQuery)
  ) {
    queries.push(`${contextualQuery} ${year}`);
  }

  return [...new Set(queries)].slice(0, 2);
}

function cleanWikitextValue(raw = "") {
  return String(raw)
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{(?:start date|bda|birth date)[^|}]*\|(\d{4})\|(\d{1,2})\|(\d{1,2})[^}]*\}\}/gi, "$1-$2-$3")
    .replace(/\{\{[^}]*\|([^|}]+)\}\}/g, "$1")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractInfoboxFacts(wikitext = "") {
  if (!wikitext) return "";
  const interestingKeys = [
    "incumbent",
    "incumbent_since",
    "office",
    "leader_name",
    "prime_minister",
    "president",
    "chief_minister",
    "capital",
    "population_total",
    "gdp_nominal",
    "founded",
    "developer",
    "latest release version",
    "latest_release_version",
    "latest_release_date",
    "party",
  ];
  const facts = [];
  for (const key of interestingKeys) {
    const escaped = key.replace(/_/g, "[_\\s]");
    const re = new RegExp(`^\\|\\s*${escaped}\\s*=\\s*(.+)$`, "im");
    const m = wikitext.match(re);
    if (m && m[1]) {
      const cleaned = cleanWikitextValue(m[1]);
      if (cleaned && cleaned.length <= 160) {
        facts.push(`${key.replace(/_/g, " ")}: ${cleaned}`);
      }
    }
  }
  return facts.join(" | ");
}

async function searchWikipedia(query, lang = "en", signal) {
  const expandedQuery = String(query || "")
    .replace(/\bcm\b/gi, "chief minister")
    .replace(/\bpm\b/gi, "prime minister");
  const results = [];
  const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
    expandedQuery
  )}&gsrlimit=3&prop=extracts|info&exintro=1&explaintext=1&exchars=1000&inprop=url&format=json`;
  const res = await fetch(searchUrl, {
    headers: { "User-Agent": WIKI_USER_AGENT, Accept: "application/json" },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4500)]) : AbortSignal.timeout(4500),
  });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const data = await res.json();
  const pages = Object.values(data?.query?.pages || {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));

  // Fetch section-0 infobox for the top page when available (gives exact incumbent / release / stat fields!)
  let topInfoboxFacts = "";
  if (pages[0]?.title) {
    try {
      const infoUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
        pages[0].title
      )}&prop=revisions&rvprop=content&rvsection=0&format=json`;
      const infoRes = await fetch(infoUrl, {
        headers: { "User-Agent": WIKI_USER_AGENT, Accept: "application/json" },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000),
      });
      if (infoRes.ok) {
        const infoJson = await infoRes.json();
        const firstPage = Object.values(infoJson?.query?.pages || {})[0];
        const wikitext = firstPage?.revisions?.[0]?.["*"] || "";
        topInfoboxFacts = extractInfoboxFacts(wikitext);
      }
    } catch {
      // Infobox enrichment is optional
    }
  }

  for (let i = 0; i < pages.length; i += 1) {
    const p = pages[i];
    const url = sanitizeHttpUrl(p?.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(p?.title || "").replace(/\s+/g, "_"))}`);
    const extract = String(p?.extract || "").replace(/\s+/g, " ").trim();
    if (!url || !p?.title) continue;
    const enrichedSnippet = i === 0 && topInfoboxFacts ? `${topInfoboxFacts} — ${extract}` : extract;
    results.push({
      title: `${p.title} - Wikipedia`,
      url,
      domain: `${lang}.wikipedia.org`,
      snippet: enrichedSnippet.slice(0, 750),
      excerpt: enrichedSnippet.slice(0, 1200),
      provider: "Wikipedia",
      verified: true,
    });
  }
  return results;
}

async function searchBingNewsRss(query, mkt = "en-US", signal) {
  const rssUrl = `https://www.bing.com/news/search?format=rss&mkt=${encodeURIComponent(mkt)}&q=${encodeURIComponent(query)}`;
  const res = await fetch(rssUrl, {
    headers: {
      "User-Agent": BROWSER_USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4500)]) : AbortSignal.timeout(4500),
  });
  if (!res.ok) throw new Error(`Bing News RSS HTTP ${res.status}`);
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const results = [];
  for (const match of items.slice(0, 6)) {
    const block = match[1];
    const title = stripTags(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
    const rawLink = decodeHtmlEntities(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").trim();
    const pubDate = stripTags(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "");
    const description = stripTags(block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "");
    let directUrl = rawLink;
    try {
      const parsed = new URL(rawLink);
      const unwrapped = parsed.searchParams.get("url");
      if (unwrapped) directUrl = unwrapped;
    } catch {
      // Keep rawLink if URL parsing fails
    }
    const safeUrl = sanitizeHttpUrl(directUrl);
    if (!safeUrl || !title) continue;
    results.push({
      title,
      url: safeUrl,
      domain: extractDomain(safeUrl),
      snippet: description.slice(0, 500),
      publishedAt: pubDate || undefined,
      provider: "Bing News",
    });
  }
  return results;
}

async function searchGoogleNewsRss(query, indiaBias, signal) {
  const hl = indiaBias ? "en-IN" : "en-US";
  const gl = indiaBias ? "IN" : "US";
  const ceid = indiaBias ? "IN:en" : "US:en";
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${encodeURIComponent(ceid)}`;
  const res = await fetch(rssUrl, {
    headers: { "User-Agent": BROWSER_USER_AGENT },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4500)]) : AbortSignal.timeout(4500),
  });
  if (!res.ok) throw new Error(`Google News RSS HTTP ${res.status}`);
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const results = [];
  for (const match of items.slice(0, 6)) {
    const block = match[1];
    const title = stripTags(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
    const link = sanitizeHttpUrl(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "");
    const pubDate = stripTags(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "");
    const sourceMatch = block.match(/<source(?:\s+url="([^"]*)")?[^>]*>([\s\S]*?)<\/source>/);
    const sourceName = stripTags(sourceMatch?.[2] || "");
    const sourceHost = sourceMatch?.[1] ? extractDomain(decodeHtmlEntities(sourceMatch[1])) : "";
    if (!link || !title) continue;
    const cleanHeadline = title.replace(/\s+-\s+[^-]+$/, "").trim() || title;
    results.push({
      title,
      url: link,
      domain: sourceHost || "news.google.com",
      snippet: cleanHeadline,
      publishedAt: pubDate || undefined,
      provider: sourceName ? `Google News · ${sourceName}` : "Google News",
    });
  }
  return results;
}

async function searchWikidata(query, signal) {
  const expandedQuery = String(query || "")
    .replace(/\bcm\b/gi, "chief minister")
    .replace(/\bpm\b/gi, "prime minister")
    .trim();
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
    expandedQuery
  )}&language=en&limit=4&format=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": WIKI_USER_AGENT, Accept: "application/json" },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(3500)]) : AbortSignal.timeout(3500),
  });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  const data = await res.json();
  const results = [];
  for (const item of data?.search || []) {
    const entityUrl = sanitizeHttpUrl(item?.concepturi || (item?.id ? `https://www.wikidata.org/wiki/${item.id}` : ""));
    const label = String(item?.label || "").trim();
    const desc = String(item?.description || "").trim();
    if (!entityUrl || !label || !desc) continue;
    results.push({
      title: `${label} - Wikidata`,
      url: entityUrl,
      domain: "wikidata.org",
      snippet: `${label}: ${desc}`,
      provider: "Wikidata",
      verified: true,
    });
  }
  return results;
}

async function searchDuckDuckGoInstant(query, signal) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": WIKI_USER_AGENT, Accept: "application/json" },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(3500)]) : AbortSignal.timeout(3500),
  });
  if (!res.ok) throw new Error(`DuckDuckGo IA HTTP ${res.status}`);
  const data = await res.json();
  const results = [];
  if (data?.AbstractText && data?.AbstractURL) {
    const safeUrl = sanitizeHttpUrl(data.AbstractURL);
    if (safeUrl) {
      results.push({
        title: data.Heading ? `${data.Heading} (${data.AbstractSource || extractDomain(safeUrl)})` : extractDomain(safeUrl),
        url: safeUrl,
        domain: extractDomain(safeUrl),
        snippet: String(data.AbstractText).trim().slice(0, 600),
        provider: data.AbstractSource || "DuckDuckGo IA",
        verified: true,
      });
    }
  }
  if (Array.isArray(data?.RelatedTopics)) {
    for (const item of data.RelatedTopics.slice(0, 3)) {
      if (item?.Text && item?.FirstURL) {
        const safeUrl = sanitizeHttpUrl(item.FirstURL);
        if (safeUrl) {
          results.push({
            title: String(item.Text).split(" - ")[0].slice(0, 110),
            url: safeUrl,
            domain: extractDomain(safeUrl),
            snippet: String(item.Text).slice(0, 400),
            provider: "DuckDuckGo IA",
          });
        }
      }
    }
  }
  return results;
}

async function searchTechSources(query, signal) {
  const results = [];
  const tasks = [
    fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=4`, {
      headers: { "User-Agent": WIKI_USER_AGENT },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4000)]) : AbortSignal.timeout(4000),
    }).then(async (r) => {
      if (!r.ok) return;
      const d = await r.json();
      for (const hit of d?.hits || []) {
        const safeUrl = sanitizeHttpUrl(hit?.url || (hit?.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : ""));
        if (!safeUrl || !hit?.title) continue;
        results.push({
          title: String(hit.title),
          url: safeUrl,
          domain: extractDomain(safeUrl),
          snippet: `${hit.title}${hit.created_at ? ` (${String(hit.created_at).slice(0, 10)})` : ""}${
            typeof hit.points === "number" ? ` · ${hit.points} points` : ""
          }`,
          publishedAt: hit.created_at ? String(hit.created_at).slice(0, 10) : undefined,
          provider: "Hacker News",
        });
      }
    }),
    fetch(
      `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(
        query
      )}&site=stackoverflow&pagesize=3`,
      {
        headers: { "User-Agent": WIKI_USER_AGENT },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4000)]) : AbortSignal.timeout(4000),
      }
    ).then(async (r) => {
      if (!r.ok) return;
      const d = await r.json();
      for (const item of d?.items || []) {
        const safeUrl = sanitizeHttpUrl(item?.link || "");
        if (!safeUrl || !item?.title) continue;
        results.push({
          title: decodeHtmlEntities(item.title),
          url: safeUrl,
          domain: "stackoverflow.com",
          snippet: `StackOverflow (${item.score ?? 0} votes, ${item.answer_count ?? 0} answers): ${decodeHtmlEntities(item.title)}`,
          provider: "StackOverflow",
        });
      }
    }),
    fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=3`,
      {
        headers: { "User-Agent": WIKI_USER_AGENT, Accept: "application/vnd.github+json" },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4000)]) : AbortSignal.timeout(4000),
      }
    ).then(async (r) => {
      if (!r.ok) return;
      const d = await r.json();
      for (const repo of d?.items || []) {
        const safeUrl = sanitizeHttpUrl(repo?.html_url || "");
        if (!safeUrl || !repo?.full_name) continue;
        results.push({
          title: `${repo.full_name} · GitHub`,
          url: safeUrl,
          domain: "github.com",
          snippet: `${repo.description || repo.full_name} (${repo.stargazers_count ?? 0} stars${repo.language ? `, ${repo.language}` : ""})`,
          publishedAt: repo.pushed_at ? String(repo.pushed_at).slice(0, 10) : undefined,
          provider: "GitHub",
          verified: true,
        });
      }
    }),
    fetch(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=3`,
      {
        headers: { "User-Agent": WIKI_USER_AGENT, Accept: "application/json" },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(3500)]) : AbortSignal.timeout(3500),
      }
    ).then(async (r) => {
      if (!r.ok) return;
      const d = await r.json();
      for (const obj of d?.objects || []) {
        const pkg = obj?.package;
        const safeUrl = sanitizeHttpUrl(pkg?.links?.npm || (pkg?.name ? `https://www.npmjs.com/package/${pkg.name}` : ""));
        if (!safeUrl || !pkg?.name) continue;
        results.push({
          title: `${pkg.name}@${pkg.version || "latest"} - npm`,
          url: safeUrl,
          domain: "npmjs.com",
          snippet: `${pkg.description || pkg.name} (Latest v${pkg.version || "unknown"})`,
          publishedAt: pkg.date ? String(pkg.date).slice(0, 10) : undefined,
          provider: "npm Registry",
          verified: true,
        });
      }
    }),
  ];
  await Promise.allSettled(tasks);
  return results;
}

async function searchOptionalApiProviders(query, signal) {
  const results = [];
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  const serperKey = process.env.SERPER_API_KEY?.trim();
  const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim();

  const tasks = [];
  if (tavilyKey) {
    tasks.push(
      fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavilyKey, query, max_results: 5, include_answer: false }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4500)]) : AbortSignal.timeout(4500),
      }).then(async (r) => {
        if (!r.ok) return;
        const d = await r.json();
        for (const item of d?.results || []) {
          const safeUrl = sanitizeHttpUrl(item?.url);
          if (!safeUrl || !item?.title) continue;
          results.push({
            title: String(item.title),
            url: safeUrl,
            domain: extractDomain(safeUrl),
            snippet: String(item.content || "").slice(0, 600),
            provider: "Tavily",
            verified: true,
          });
        }
      })
    );
  }
  if (serperKey) {
    tasks.push(
      fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": serperKey },
        body: JSON.stringify({ q: query, num: 5 }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4500)]) : AbortSignal.timeout(4500),
      }).then(async (r) => {
        if (!r.ok) return;
        const d = await r.json();
        for (const item of d?.organic || []) {
          const safeUrl = sanitizeHttpUrl(item?.link);
          if (!safeUrl || !item?.title) continue;
          results.push({
            title: String(item.title),
            url: safeUrl,
            domain: extractDomain(safeUrl),
            snippet: String(item.snippet || "").slice(0, 500),
            publishedAt: item.date || undefined,
            provider: "Google Serper",
            verified: true,
          });
        }
      })
    );
  }
  if (braveKey) {
    tasks.push(
      fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
        headers: { Accept: "application/json", "X-Subscription-Token": braveKey },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4500)]) : AbortSignal.timeout(4500),
      }).then(async (r) => {
        if (!r.ok) return;
        const d = await r.json();
        for (const item of d?.web?.results || []) {
          const safeUrl = sanitizeHttpUrl(item?.url);
          if (!safeUrl || !item?.title) continue;
          results.push({
            title: String(item.title),
            url: safeUrl,
            domain: extractDomain(safeUrl),
            snippet: String(item.description || "").slice(0, 500),
            publishedAt: item.age || undefined,
            provider: "Brave Search",
            verified: true,
          });
        }
      })
    );
  }

  if (tasks.length) await Promise.allSettled(tasks);
  return results;
}

async function fetchPageExcerpt(rawUrl, signal) {
  try {
    // Strict SSRF verification before fetching any external article body
    const safeUrlObj = await assertSafeRemoteUrl(rawUrl);
    if (safeUrlObj.hostname === "news.google.com") return null; // Wrapper page needs client redirect
    const res = await fetch(safeUrlObj.toString(), {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(3200)]) : AbortSignal.timeout(3200),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return null;
    const rawHtml = (await res.text()).slice(0, 200_000);
    if (!rawHtml) return null;

    const metaDesc =
      rawHtml.match(/<meta[^>]+(?:name=["']description["']|property=["']og:description["'])[^>]+content=["']([^"']+)["']/i)?.[1] ||
      rawHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name=["']description["']|property=["']og:description["'])/i)?.[1] ||
      "";
    const metaPubDate =
      rawHtml.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i)?.[1] || "";

    const bodyNoNoise = rawHtml
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(?:nav|header|footer|aside)[\s\S]*?<\/(?:nav|header|footer|aside)>/gi, " ");

    const paragraphs = [...bodyNoNoise.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => stripTags(m[1]))
      .filter((t) => t.length >= 45 && !/cookie|subscribe|sign in|privacy policy|all rights reserved|javascript/i.test(t))
      .slice(0, 6);

    const combined = [stripTags(metaDesc), ...paragraphs].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (combined.length < 60) return null;
    return {
      excerpt: combined.slice(0, 1400),
      publishedAt: metaPubDate ? metaPubDate.slice(0, 10) : undefined,
    };
  } catch {
    return null;
  }
}

function scoreCandidate(item, queryKeywords, rawQueryLower = "") {
  const titleLower = String(item.title || "").toLowerCase();
  const snippetLower = String(item.snippet || "").toLowerCase();
  const excerptLower = String(item.excerpt || "").toLowerCase();
  const haystack = `${titleLower} ${snippetLower} ${excerptLower}`;

  let matchedWords = 0;
  let weighted = 0;
  for (const kw of queryKeywords) {
    if (titleLower.includes(kw)) {
      matchedWords += 1;
      weighted += 2.2;
    } else if (haystack.includes(kw)) {
      matchedWords += 1;
      weighted += 1;
    }
  }
  if (queryKeywords.length > 0 && matchedWords === 0) return -1;
  // Require meaningful overlap on multi-word queries unless authoritative encyclopedia/entity hit
  if (queryKeywords.length >= 3 && matchedWords < 2 && !item.verified) {
    return -1;
  }

  let score = weighted * 10;
  if (rawQueryLower && rawQueryLower.length >= 5 && haystack.includes(rawQueryLower)) {
    score += 18;
  }
  const domain = item.domain || "";
  if (AUTHORITATIVE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    score += 18;
  }
  if (item.verified) score += 8;
  if (item.publishedAt) {
    const parsedTime = Date.parse(item.publishedAt);
    if (Number.isFinite(parsedTime)) {
      const ageDays = (Date.now() - parsedTime) / 86_400_000;
      if (ageDays <= 14) score += 20;
      else if (ageDays <= 120) score += 12;
      else if (ageDays <= 365) score += 6;
      else if (ageDays > 730 && !/\b20[01]\d|202[0-3]\b/.test(rawQueryLower)) score -= 12;
    }
  }
  if ((item.snippet || "").length >= 60) score += 4;
  return score;
}

export async function runDeepSearch(rawQuery, { history = [], signal, onProgress } = {}) {
  const emitProgress = (payload) => {
    if (typeof onProgress === "function") {
      try {
        onProgress(payload);
      } catch {
        // Ignore listener errors
      }
    }
  };

  const queries = buildSearchQueries(rawQuery, history);
  if (!queries.length) {
    const emptyState = {
      status: "empty",
      stage: "Query too short for web search",
      queries: [],
      sources: [],
    };
    emitProgress(emptyState);
    return emptyState;
  }

  const primaryQuery = queries[0];
  const secondaryQuery = queries[1] || primaryQuery;
  const indiaBias = isIndiaRelated(`${rawQuery} ${primaryQuery}`);
  const techBias = isTechnicalQuery(`${rawQuery} ${primaryQuery}`);
  const hasTamilScript = /[\u0B80-\u0BFF]/.test(rawQuery);
  const queryKeywords = extractKeywords(primaryQuery);

  emitProgress({
    status: "searching",
    stage: `Searching live sources for "${primaryQuery}"...`,
    queries,
    sources: [],
  });

  const providerCalls = [
    { name: "Wikipedia", fn: () => searchWikipedia(primaryQuery, "en", signal) },
    { name: "Wikidata", fn: () => searchWikidata(primaryQuery, signal) },
    { name: "Bing News", fn: () => searchBingNewsRss(primaryQuery, indiaBias ? "en-IN" : "en-US", signal) },
    { name: "Google News", fn: () => searchGoogleNewsRss(secondaryQuery, indiaBias, signal) },
    { name: "DuckDuckGo IA", fn: () => searchDuckDuckGoInstant(primaryQuery, signal) },
    { name: "Optional Search API", fn: () => searchOptionalApiProviders(primaryQuery, signal) },
  ];

  if (indiaBias) {
    providerCalls.push({
      name: "Bing News Global",
      fn: () => searchBingNewsRss(secondaryQuery, "en-US", signal),
    });
  }
  if (hasTamilScript) {
    providerCalls.push({
      name: "Tamil Wikipedia",
      fn: () => searchWikipedia(rawQuery, "ta", signal),
    });
  }
  if (techBias) {
    providerCalls.push({
      name: "Tech Sources",
      fn: () => searchTechSources(primaryQuery, signal),
    });
  }

  const settled = await Promise.allSettled(providerCalls.map((p) => p.fn()));
  let networkSucceeded = 0;
  let networkFailed = 0;
  const rawCandidates = [];

  for (let i = 0; i < settled.length; i += 1) {
    const outcome = settled[i];
    const providerName = providerCalls[i].name;
    if (outcome.status === "fulfilled") {
      if (providerName !== "Optional Search API") networkSucceeded += 1;
      for (const item of outcome.value || []) {
        rawCandidates.push(item);
      }
    } else if (providerName !== "Optional Search API") {
      networkFailed += 1;
    }
  }

  // Deduplicate by URL and normalized title while keeping diverse reliable domains
  const seenUrls = new Set();
  const seenTitles = new Set();
  const scored = [];
  const rawLower = primaryQuery.toLowerCase();
  for (const cand of rawCandidates) {
    const normUrl = cand.url.replace(/#.*$/, "");
    const normTitle = String(cand.title || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .slice(0, 75);
    if (seenUrls.has(normUrl) || (normTitle && seenTitles.has(normTitle))) continue;
    const score = scoreCandidate(cand, queryKeywords, rawLower);
    if (score < 0) continue;
    seenUrls.add(normUrl);
    if (normTitle) seenTitles.add(normTitle);
    scored.push({ ...cand, _score: score });
  }

  scored.sort((a, b) => b._score - a._score);

  // Pick up to 7 diverse sources (guaranteeing top verified Wikipedia hit if relevant, plus max 2 per domain)
  const domainCounts = new Map();
  const selected = [];
  const topWiki = scored.find((item) => item.provider === "Wikipedia");
  if (topWiki) {
    selected.push(topWiki);
    domainCounts.set(topWiki.domain, 1);
  }
  for (const item of scored) {
    if (selected.length >= 7) break;
    if (selected.includes(item)) continue;
    const count = domainCounts.get(item.domain) || 0;
    if (count >= 2 && selected.length >= 3) continue;
    domainCounts.set(item.domain, count + 1);
    selected.push(item);
  }

  if (networkSucceeded === 0 && selected.length === 0) {
    const unavailableState = {
      status: "unavailable",
      stage: "Live web search is currently unavailable",
      queries,
      sources: [],
      error: "Could not reach external search providers (network or upstream error).",
    };
    emitProgress(unavailableState);
    return unavailableState;
  }

  if (selected.length === 0) {
    const emptyState = {
      status: "empty",
      stage: "No matching live web sources found",
      queries,
      sources: [],
      error: `Searched ${networkSucceeded} source feeds for "${primaryQuery}", but found no reliable matching pages.`,
    };
    emitProgress(emptyState);
    return emptyState;
  }

  const interimSources = selected.map((s, idx) => ({
    id: String(idx + 1),
    title: s.title,
    url: s.url,
    domain: s.domain,
    snippet: s.snippet,
    publishedAt: s.publishedAt,
    provider: s.provider,
    verified: Boolean(s.verified),
  }));

  emitProgress({
    status: "searching",
    stage: `Verifying facts across ${interimSources.length} retrieved sources...`,
    queries,
    sources: interimSources,
  });

  // Fetch readable full-article excerpts from the top non-Wikipedia direct publisher URLs (SSRF-protected)
  const enrichTargets = selected
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => !item.excerpt && item.domain !== "news.google.com")
    .slice(0, 3);

  await Promise.allSettled(
    enrichTargets.map(async ({ item, idx }) => {
      const fetched = await fetchPageExcerpt(item.url, signal);
      if (fetched?.excerpt) {
        selected[idx].excerpt = fetched.excerpt;
        selected[idx].verified = true;
        if (!selected[idx].publishedAt && fetched.publishedAt) {
          selected[idx].publishedAt = fetched.publishedAt;
        }
      }
    })
  );

  const finalSources = selected.map((s, idx) => ({
    id: String(idx + 1),
    title: s.title,
    url: s.url,
    domain: s.domain,
    snippet: s.snippet,
    excerpt: s.excerpt || s.snippet,
    publishedAt: s.publishedAt,
    provider: s.provider,
    verified: Boolean(s.verified),
  }));

  const completeState = {
    status: "complete",
    stage: `Verified ${finalSources.length} sources across ${new Set(finalSources.map((s) => s.domain)).size} domains`,
    queries,
    sources: finalSources,
    providerStats: { succeeded: networkSucceeded, failed: networkFailed },
  };
  emitProgress(completeState);
  return completeState;
}
