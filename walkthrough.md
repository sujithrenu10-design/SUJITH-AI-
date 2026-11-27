# Security Summary

**Reviewed Files**: 61  
**Issues Resolved**: 8 (7 Fixed in Code, 1 Needs Follow-Up for Manual Key Rotation)

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Plaintext Secret Store & Legacy Keys | `gateway.mjs`, deleted `.sujith-gateway-store.json` | 21–126, 172–200 | Session store wrote raw user API keys inside the workspace root (`.sujith-gateway-store.json`), risking accidental bundling or exposure; 3 legacy user keys had previously been written in plaintext. | High | Needs Follow-Up | Deleted `.sujith-gateway-store.json`, moved storage to `os.tmpdir()/sujith-gateway/store.json` with `0o700`/`0o600` permissions, encrypted persisted keys with AES-256-GCM (`SUJITH_SESSION_SECRET`), stripped legacy `notrackApiKey` fields on load, and kept ephemeral session keys in memory only. Rotate the 3 previously stored NoTrack.ai keys externally. |
| Exposed Server Files & Dotfiles | `server.ts` | 26–38 | Static/Vite dev middleware could serve workspace dotfiles or backend server scripts (`gateway.mjs`, `mediaEngine.mjs`, `server.ts`) if requested directly. | High | Fixed | Added Express middleware blocking hidden dotfiles (except `/.well-known/`) and server modules with `404`. Excluded `.env` and server store files in `export-android-zip.js` and `.gitignore`. |
| Wildcard CORS Across API Routes | `gateway.mjs` | 56–88, 1212 | Gateway API responses and preflight headers previously allowed arbitrary origins (`*`), letting untrusted websites make cross-origin API reads/writes. | High | Fixed | Added `resolveCorsOrigin` and `corsHeadersForRequest` allowing only `ALLOWED_ORIGIN`, Capacitor origins, localhost origins, and matching host origins, applied consistently via `sendApiJson`. |
| Server-Side Request Forgery (SSRF) | `mediaEngine.mjs`, `gateway.mjs` | `mediaEngine.mjs:28–93, 221–241`, `gateway.mjs:2033` | Remote media downloads and GitHub artifact fetches did not validate resolved IPs or manual redirects, risking access to loopback, RFC1918, link-local metadata (`169.254.169.254`), or IPv4-mapped IPv6 targets. | High | Fixed | Enforced `https:`-only remote URLs, DNS + CIDR checking via `isPrivateOrLocalIp` and `assertSafeRemoteUrl` across redirect hops, and pinned artifact downloads in `gateway.mjs` to GitHub/Azure blob hosts. |
| Terminal Flag & Path Injection | `gateway.mjs` | 964–1060, 1765 | Workspace terminal allowed commands like `find`, `node`, `git`, `npm`, and file utilities without blocking dangerous flags (`-exec`, `-e`, `-c`) or parent/absolute path escapes (`../`). | High | Fixed | Added `validateTerminalArgs` to reject unsafe command flags, disallow `git config`/`daemon`, and confine file paths to the sandboxed `workspaceRoot`. |
| Unverified Paid Plan Activation | `gateway.mjs` | 1369–1445 | `/api/subscriptions/activate` allowed toggling to paid tiers without verified payment proof when Stripe was unconfigured. | Medium | Fixed | Restricted `/api/subscriptions/activate` (`501`) and `/api/subscriptions/checkout` without `STRIPE_SECRET_KEY` (`503`), requiring Stripe Checkout verification on `/api/subscriptions/verify` before upgrading from `FREE`. |
| Dynamic Code Evaluation (`Function`) | `src/lib/androidPreviewRenderer.ts` | 1184–1256 | Android preview calculator evaluated expressions via `new Function("return (" + expr + ")")` instead of a bounded parser. | Medium | Fixed | Replaced dynamic `Function` evaluation with a safe recursive-descent arithmetic parser (`evaluateCalcExpr`) supporting numbers, `+`, `-`, `*`, `/`, parentheses, and unary signs only. |
| Unescaped DOM `innerHTML` Writes | `src/lib/androidPreviewRenderer.ts` | 1287–1296 | Android preview tabs and list rows built HTML strings directly with `innerHTML`. | Medium | Fixed | Replaced `innerHTML` assignments with explicit `document.createElement` nodes and `.textContent` binding. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| API Keys & Secrets | `gateway.mjs`, `.env.example` | Server keys (`NOTRACK_API_KEY`, `STRIPE_SECRET_KEY`, `GITHUB_TOKEN`) load strictly from `process.env` and are masked (`maskApiKey`) before returning status metadata. |
| Signed Session Cookies/Headers | `gateway.mjs` | `x-sujith-session` tokens are HMAC-SHA256 signed and verified with constant-time `crypto.timingSafeEqual`. |
| Android ZIP & Repo Export | `export-android-zip.js`, `.gitignore` | `.env`, `.sujith-gateway-store.json`, `*.zip`, and temporary media/upload folders are excluded from generated archives and version control. |

## PoC Verification

### 1. Server Source & Dotfile Access Protection
#### Summary
| Field | Value |
|---|---|
| Issue Type | Sensitive File / Source Exposure |
| Impact | High |
| Affected File | `server.ts:26–38` |
| Test Scenario | `GET /.env`, `GET /.git/HEAD`, `GET /gateway.mjs`, `GET /mediaEngine.mjs`, `GET /server.ts` against running `node server.ts` (`NODE_ENV=production`) |

#### How It Was Fixed
Express request middleware intercepts every incoming path prior to both API and static/Vite middleware and immediately ends with HTTP `404` for hidden segments (except `/.well-known/`) and backend server files.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Requests for `/.env`, `/.git/HEAD`, and `/gateway.mjs` enter the middleware in `server.ts:26` | Path normalized as `cleanPath` |
| 2 | Regex `/\/\.[^/]+/` and explicit server filename check at `server.ts:28–36` match | Guard triggers |
| 3 | Handler executes `res.status(404).end()` | **Blocked Safely (HTTP 404 observed for all 5 paths)** |

#### Conclusion
**Fix Verified** — Direct HTTP requests to dotfiles and backend scripts return `404` while `/` (`200`), `/manifest.webmanifest` (`200`), `/sw.js` (`200`), and `/api/health` (`200`) continue operating normally.

---

### 2. Strict Cross-Origin Resource Sharing (CORS)
#### Summary
| Field | Value |
|---|---|
| Issue Type | Permissive Cross-Origin Access Control |
| Impact | High |
| Affected File | `gateway.mjs:56–88, 1212` |
| Test Scenario | `GET /api/health` with `Origin: https://evil.example` vs `Origin: http://localhost:3000` |

#### How It Was Fixed
`resolveCorsOrigin` restricts `Access-Control-Allow-Origin` strictly to configured `ALLOWED_ORIGIN` values, Capacitor runtime schemes, loopback origins, or same-host origins, and every API response routes through `sendApiJson`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Request with `Origin: https://evil.example` reaches `sendApiJson` -> `sendJson` (`gateway.mjs:315, 1212`) | Calls `corsHeadersForRequest(req)` |
| 2 | `resolveCorsOrigin` checks allowlist and host matching (`gateway.mjs:56–76`) | Returns empty string `""` |
| 3 | Response omits `Access-Control-Allow-Origin` for `evil.example` while emitting `http://localhost:3000` for localhost | **Handled Safely (`tests/verify-all.mjs` PASS)** |

#### Conclusion
**Fix Verified** — Arbitrary external origins no longer receive CORS read permissions.

---

### 3. SSRF Protection on Remote Media Fetch
#### Summary
| Field | Value |
|---|---|
| Issue Type | Server-Side Request Forgery |
| Impact | High |
| Affected File | `mediaEngine.mjs:28–93, 221–241` |
| Test Scenario | `assertSafeRemoteUrl` tested with `http://example.com/img.png`, `https://localhost/secret`, `https://169.254.169.254/latest/meta-data`, and `isPrivateOrLocalIp("::ffff:127.0.0.1")` |

#### How It Was Fixed
`assertSafeRemoteUrl` enforces `https:`, rejects local/reserved hostnames, checks all DNS-resolved A/AAAA records via `isPrivateIpAddress` (covering loopback, RFC1918, CGNAT `100.64.0.0/10`, link-local `169.254.0.0/16`, IPv6 ULA/link-local, and `::ffff:` IPv4-mapped IPv6), and `downloadRemoteMedia` manually re-validates every HTTP redirect target.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `http://example.com/img.png` and `https://169.254.169.254/...` enter `assertSafeRemoteUrl` (`mediaEngine.mjs:72`) | Protocol / host evaluated |
| 2 | Non-HTTPS URL fails line `79–81`; private/loopback/DNS-mapped hosts fail `83–91` | Throws validation error before `fetch()` |
| 3 | All unit test assertions in `tests/verify-all.mjs` reject target URLs | **Blocked Safely (PASS)** |

#### Conclusion
**Fix Verified** — Private network hosts, cloud metadata endpoints, and unsafe redirects are rejected before opening outbound sockets.

---

### 4. Terminal Command Flag & Path Injection Defense
#### Summary
| Field | Value |
|---|---|
| Issue Type | Command Flag & Path Traversal Injection |
| Impact | High |
| Affected File | `gateway.mjs:964–1060, 1765` |
| Test Scenario | `POST /api/terminal` with `find . -exec id ;`, `node -e "console.log(1)"`, `git -c core.sshCommand=id status`, `cat ../../etc/passwd`, and `whoami` |

#### How It Was Fixed
`validateTerminalArgs` runs prior to `spawnSync`, blocking execution/eval/config flags (`-exec`, `-e`, `--eval`, `-c`, `git config`, `--script-shell`) and rejecting relative/absolute path escapes outside `workspaceRoot`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Malicious command strings arrive at `POST /api/terminal` (`gateway.mjs:1765`) | Tokenized into `bin` + `args` |
| 2 | `validateTerminalArgs(bin, args, workspaceRoot)` inspects command/flags/paths (`gateway.mjs:964–1059`) | Returns blocking message; `whoami` fails binary allowlist |
| 3 | Endpoint responds with HTTP `400` without spawning child process | **Blocked Safely (`tests/verify-all.mjs` PASS)** |

#### Conclusion
**Fix Verified** — All 5 dangerous flag, path-escape, and unallowlisted binary payloads returned HTTP `400`, while safe `ls` inside the workspace returned `200`.

---

### Verification Checks Run
- `npm install`: Clean, 0 vulnerabilities.
- `npx tsc --noEmit` & `npm run lint`: Passed with 0 errors.
- `npm test` (`tsx tests/verify-all.mjs`): **17 passed, 0 failed** (covering compiler, validator, workspace extractor/previewer, SSRF helpers, CORS, session auth, billing enforcement, terminal allowlist/arg guard, `/api/chat`, `/api/media`, `/api/android/cloud-apk`, and store key hygiene).
- `npm run build`: Built `dist/index.html`, `dist/manifest.webmanifest`, `dist/sw.js`, and `dist/icons/icon-{192,512}.png` cleanly.
- `npm run export:android-zip`: Built valid 60-entry archive (zero `.env`, store, or test upload leaks).
- Production server smoke check (`PORT=3099 NODE_ENV=production node server.ts`): Verified expected `200`/`404` behavior on app, PWA, API, and protected paths.
