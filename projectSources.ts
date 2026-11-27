import type { ProjectKind, WorkspaceFile } from "./types";

export type ProjectSpec = {
  version: 1;
  kind: ProjectKind;
  title: string;
  description: string;
  accent: string;
  dark: boolean;
};

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

function sharedRuntime() {
  return `const $ = (selector) => document.querySelector(selector);
const storage = {
  get(key, fallback) {
    try {
      const fromPreview = window.__SUJITH_APP_STATE__?.[key];
      const raw = fromPreview ?? localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    const raw = JSON.stringify(value);
    try { localStorage.setItem(key, raw); } catch { /* Isolated preview uses the parent state bridge. */ }
    if (window.parent !== window) window.parent.postMessage({ type: 'sujith-project-state', nonce: window.__SUJITH_PREVIEW_NONCE__, key, value: raw }, '*');
  }
};
const safe = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const uid = () => globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2);
const announce = (message) => { const node = $('#notice'); if (node) node.textContent = message; };
`;
}

function tasksContent() {
  return `<section class="workspace" aria-label="Task manager">
    <div class="section-heading"><div><span class="eyebrow">YOUR WORKSPACE</span><h2>Make room for what matters.</h2></div><span id="task-count" class="counter">0 tasks</span></div>
    <form id="task-form" class="inline-form"><label class="sr-only" for="task-input">New task</label><input id="task-input" placeholder="What needs to get done?" maxlength="180" required autocomplete="off"><button type="submit">Add task</button></form>
    <div class="filters" role="group" aria-label="Task filter"><button data-filter="all" aria-pressed="true">All</button><button data-filter="active" aria-pressed="false">Active</button><button data-filter="done" aria-pressed="false">Completed</button></div>
    <ul id="task-list" class="task-list"></ul><p id="task-empty" class="empty">A clear list. A fresh start. Add your first task above.</p>
    <button id="clear-completed" class="text-button" hidden>Clear completed tasks</button>
  </section>`;
}

function tasksScript() {
  return `${sharedRuntime()}
let tasks = storage.get('tasks', []);
if (!Array.isArray(tasks)) tasks = [];
let filter = 'all';
function render() {
  const visible = tasks.filter((task) => filter === 'all' || (filter === 'done' ? task.done : !task.done));
  $('#task-list').innerHTML = visible.map((task) => '<li class="task-row"><label><input type="checkbox" data-toggle="' + safe(task.id) + '" ' + (task.done ? 'checked' : '') + '><span class="' + (task.done ? 'is-done' : '') + '">' + safe(task.title) + '</span></label><button class="delete-task" data-delete="' + safe(task.id) + '" aria-label="Delete ' + safe(task.title) + '">Remove</button></li>').join('');
  $('#task-count').textContent = tasks.filter((task) => !task.done).length + ' active';
  $('#task-empty').hidden = visible.length > 0;
  $('#clear-completed').hidden = !tasks.some((task) => task.done);
  storage.set('tasks', tasks);
}
$('#task-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const title = $('#task-input').value.trim();
  if (!title) return;
  tasks.push({ id: uid(), title, done: false });
  $('#task-input').value = '';
  render(); announce('Task added.');
});
$('#task-list').addEventListener('change', (event) => {
  const target = event.target;
  if (!target.matches('[data-toggle]')) return;
  tasks = tasks.map((task) => task.id === target.dataset.toggle ? { ...task, done: target.checked } : task);
  render(); announce('Task updated.');
});
$('#task-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete]');
  if (!button) return;
  tasks = tasks.filter((task) => task.id !== button.dataset.delete); render(); announce('Task removed.');
});
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  render();
}));
$('#clear-completed').addEventListener('click', () => { tasks = tasks.filter((task) => !task.done); render(); announce('Completed tasks removed.'); });
render();`;
}

function calculatorContent() {
  return `<section class="workspace narrow" aria-label="Calculator"><span class="eyebrow">KEEP IT SIMPLE</span><h2>Numbers, without the noise.</h2><div class="calculator"><label class="sr-only" for="calc-display">Calculation</label><input id="calc-display" value="0" readonly aria-live="polite"><div class="calc-keys">${["AC", "DEL", "%", "/", "7", "8", "9", "*", "4", "5", "6", "-", "1", "2", "3", "+", "0", ".", "="].map((key) => `<button data-key="${key}" class="${key === "=" ? "equals" : ""}">${key}</button>`).join("")}</div></div><p class="helper">Keyboard: digits, operators, Enter to calculate, Escape to clear.</p></section>`;
}

function calculatorScript() {
  return `${sharedRuntime()}
let expression = '';
function calculate(source) {
  const tokens = source.match(/(?:\\d*\\.)?\\d+|[+*/%-]/g);
  if (!tokens || tokens.join('') !== source || tokens.length > 160) throw Error('Check the expression');
  let index = 0;
  function value() {
    let sign = 1;
    if (tokens[index] === '-') { sign = -1; index++; }
    const token = tokens[index++];
    if (!token || !/^(?:\\d*\\.)?\\d+$/.test(token)) throw Error('Enter a number');
    let number = Number(token) * sign;
    if (tokens[index] === '%') { number /= 100; index++; }
    return number;
  }
  function term() {
    let result = value();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const operator = tokens[index++]; const next = value();
      result = operator === '*' ? result * next : result / next;
    }
    return result;
  }
  let result = term();
  while (tokens[index] === '+' || tokens[index] === '-') { const operator = tokens[index++]; const next = term(); result = operator === '+' ? result + next : result - next; }
  if (index !== tokens.length || !Number.isFinite(result)) throw Error('Cannot calculate that');
  return String(Number(result.toPrecision(12)));
}
function input(key) {
  if (key === 'AC') expression = '';
  else if (key === 'DEL') expression = expression.slice(0, -1);
  else if (key === '=') { try { expression = calculate(expression || '0'); announce('Calculated.'); } catch (error) { announce(error.message); } }
  else if (/^[0-9.+*/%-]$/.test(key) && expression.length < 120) expression += key;
  $('#calc-display').value = expression || '0';
}
document.querySelectorAll('[data-key]').forEach((button) => button.addEventListener('click', () => input(button.dataset.key)));
document.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === '=') { event.preventDefault(); input('='); } else if (event.key === 'Escape') input('AC'); else if (event.key === 'Backspace') input('DEL'); else if (/^[0-9.+*/%-]$/.test(event.key)) input(event.key); });`;
}

function chatContent() {
  return `<section class="workspace chat-workspace" aria-label="AI chat"><div class="section-heading"><div><span class="eyebrow">ON-DEVICE INTELLIGENCE</span><h2>A little space to think.</h2></div><span class="counter" id="ai-status">Not loaded</span></div>
    <div id="model-setup" class="setup"><p>Real AI responses run on your device. Load the model once (about 1 GB). A WebGPU-compatible browser and internet are required for the first download.</p><button id="load-model">Load on-device AI</button><p id="load-status" class="helper" role="status">No model is loaded. No prompts are sent to a cloud service.</p></div>
    <div id="chat-messages" class="chat-messages" role="log" aria-live="polite"><p class="empty">Your conversation starts here.</p></div>
    <form id="chat-form" class="inline-form"><label class="sr-only" for="chat-input">Message</label><input id="chat-input" placeholder="Ask a question..." maxlength="3000" required disabled><button id="chat-send" type="submit" disabled>Send</button></form>
    <button id="clear-chat" class="text-button">Clear conversation</button></section>`;
}

function chatScript() {
  return `${sharedRuntime()}
let engine = null;
let turns = [];
const embedded = window.parent !== window && Boolean(window.__SUJITH_PREVIEW_NONCE__);
const pending = new Map();
function requestHost(type, body = {}, onText = null) {
  return new Promise((resolve, reject) => {
    const requestId = uid();
    const timer = setTimeout(() => { pending.delete(requestId); reject(Error('The host did not respond. Close and reopen the preview to retry.')); }, 600000);
    pending.set(requestId, { resolve, reject, timer, onText });
    parent.postMessage({ type, nonce: window.__SUJITH_PREVIEW_NONCE__, requestId, ...body }, '*');
  });
}
addEventListener('message', (event) => {
  if (event.source !== parent || event.data?.nonce !== window.__SUJITH_PREVIEW_NONCE__ || event.data?.type !== 'sujith-ai-result') return;
  const item = pending.get(event.data.requestId); if (!item) return;
  const {state, payload} = event.data;
  if (state === 'progress') { $('#load-status').textContent = payload; return; }
  if (state === 'text') { if (item.onText) item.onText(payload); return; }
  clearTimeout(item.timer); pending.delete(event.data.requestId);
  if (state === 'error') item.reject(Error(payload)); else item.resolve(payload);
});
function append(role, content) {
  const empty = $('#chat-messages .empty'); if (empty) empty.remove();
  const item = document.createElement('div'); item.className = 'chat-message ' + role;
  const label = document.createElement('strong'); label.textContent = role === 'user' ? 'You' : 'Assistant';
  const text = document.createElement('p'); text.textContent = content;
  item.append(label, text); $('#chat-messages').append(item); item.scrollIntoView({block:'nearest'}); return text;
}
$('#load-model').addEventListener('click', async () => {
  if (!embedded && !navigator.gpu) { $('#load-status').textContent = 'This browser does not support WebGPU. Use a supported Chrome browser to run AI locally.'; return; }
  $('#load-model').disabled = true; $('#ai-status').textContent = 'Loading';
  try {
    if (embedded) {
      $('#load-status').textContent = 'Waiting for permission to load the local model in SUJITH AI.';
      await requestHost('sujith-ai-load');
      engine = { bridged: true };
    } else {
      const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm@0.2.89');
      engine = await CreateMLCEngine('Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', { initProgressCallback: (report) => { $('#load-status').textContent = report.text; } });
    }
    $('#ai-status').textContent = 'Ready'; $('#load-status').textContent = 'Model loaded. Responses are generated on this device.';
    $('#load-model').textContent = 'AI loaded'; $('#chat-input').disabled = false; $('#chat-send').disabled = false;
  } catch (error) { $('#load-model').disabled = false; $('#ai-status').textContent = 'Not loaded'; $('#load-status').textContent = 'Download could not finish: ' + error.message + '. You can retry.'; }
});
$('#chat-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (!engine) return;
  const prompt = $('#chat-input').value.trim(); if (!prompt) return;
  $('#chat-input').value = ''; append('user', prompt); turns.push({role:'user',content:prompt});
  $('#chat-send').disabled = true; $('#clear-chat').disabled = true; $('#ai-status').textContent = 'Thinking'; const output = append('assistant', '');
  try {
    let answer = '';
    if (engine.bridged) answer = await requestHost('sujith-ai-generate', { turns: turns.slice(-8) }, (text) => { output.textContent = text; });
    else {
      const chunks = await engine.chat.completions.create({ messages: [{role:'system',content:'You are a helpful assistant. Give concise, accurate answers.'}, ...turns.slice(-8)], stream:true, max_tokens:512 });
      for await (const chunk of chunks) { answer += chunk.choices[0]?.delta?.content || ''; output.textContent = answer; }
    }
    if (!answer.trim()) throw Error('The model did not return text');
    turns.push({role:'assistant',content:answer});
  } catch (error) { output.textContent = 'Generation stopped: ' + error.message; turns.pop(); }
  finally { $('#chat-send').disabled = false; $('#clear-chat').disabled = false; $('#ai-status').textContent = 'Ready'; }
});
$('#clear-chat').addEventListener('click', () => { turns = []; $('#chat-messages').innerHTML = '<p class="empty">Conversation cleared.</p>'; });`;
}

function landingContent(spec: ProjectSpec) {
  const restaurant = spec.kind === "restaurant";
  const portfolio = spec.kind === "portfolio";
  const heading = restaurant ? "Good food. Better company." : portfolio ? "Thoughtful work, made with care." : "A clearer way forward.";
  const callToAction = restaurant ? "Book a table" : portfolio ? "View my work" : "Explore more";
  const intro = restaurant ? "A warm table, a seasonal menu, and time well spent." : portfolio ? "A collection of ideas, experiences, and the work that brings them together." : spec.description;
  const secondTitle = restaurant ? "The menu" : portfolio ? "Selected work" : "Made for the way you work";
  const items = restaurant ? [["Seasonal bowl", "Fresh greens, roasted vegetables and a house dressing.", "$14"], ["House pasta", "Fresh pasta with slow-cooked tomato and basil.", "$19"], ["Daily dessert", "Something sweet, freshly made each day.", "$8"]] : portfolio ? [["Identity & direction", "An intentional visual language built around a clear idea.", "01"], ["Digital experiences", "Useful, considered experiences for everyday people.", "02"], ["Independent projects", "A space for experimentation, craft, and new perspectives.", "03"]] : [["Keep it focused", "A thoughtful starting point that gives the important things room to breathe.", "01"], ["Make it useful", "Straightforward navigation, accessible controls, and a layout that adapts.", "02"], ["Make it yours", "Every line of source is in your project. Edit it, export it, and own it.", "03"]];
  return `<section class="hero"><span class="eyebrow">${restaurant ? "COME AS YOU ARE" : portfolio ? "A SELECTED PORTFOLIO" : "BUILT AROUND YOUR IDEA"}</span><h1>${escapeHtml(spec.title)}</h1><h2>${heading}</h2><p>${escapeHtml(intro)}</p><a class="button" href="${restaurant ? "#booking" : "#work"}">${callToAction}<span aria-hidden="true"> &rarr;</span></a></section>
    <section id="work" class="workspace"><div class="section-heading"><h2>${secondTitle}</h2><span class="eyebrow">${restaurant ? "FRESH & SEASONAL" : "A FEW HIGHLIGHTS"}</span></div><div class="work-list">${items.map(([title, description, number]) => `<article><span class="work-number">${number}</span><div><h3>${title}</h3><p>${description}</p></div></article>`).join("")}</div></section>
    ${restaurant ? `<section id="booking" class="workspace"><span class="eyebrow">YOUR TABLE IS WAITING</span><h2>Plan a visit.</h2><form id="booking-form" class="contact-form"><label>Your name<input name="name" required maxlength="100" placeholder="Full name"></label><label>Email<input name="email" type="email" required placeholder="you@example.com"></label><div class="form-grid"><label>Date<input name="date" type="date" required></label><label>Guests<select name="guests">${[1,2,3,4,5,6].map((count) => `<option value="${count}">${count} ${count === 1 ? "guest" : "guests"}</option>`).join("")}</select></label></div><button type="submit">Save booking request</button><p class="helper">Requests are saved on this device. A restaurant server is not connected.</p><p id="booking-result" role="status"></p></form></section>` : `<section id="contact" class="workspace contact"><span class="eyebrow">LET'S CONNECT</span><h2>Start a conversation.</h2><p>Leave your details to create a downloadable contact request.</p><form id="contact-form" class="contact-form"><label>Name<input name="name" placeholder="Your name" required maxlength="100"></label><label>Email<input name="email" type="email" placeholder="you@example.com" required></label><label>Message<textarea name="message" rows="3" required maxlength="4000" placeholder="What are you thinking about?"></textarea></label><button type="submit">Download contact request</button><p class="helper">Downloads a text file. No email is sent automatically.</p></form></section>`}`;
}

function landingScript(kind: ProjectKind) {
  return `${sharedRuntime()}
${kind === "restaurant" ? `const date = new Date(); const today = date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0'); document.querySelector('[name="date"]').min = today;
$('#booking-form').addEventListener('submit', (event) => { event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return; const data = Object.fromEntries(new FormData(form)); storage.set('booking', data); $('#booking-result').textContent = 'Request saved for ' + data.name + ' on ' + data.date + '. Contact the restaurant to confirm availability.'; announce('Booking request saved on this device.'); });` : `$('#contact-form').addEventListener('submit', (event) => { event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return; const data = Object.fromEntries(new FormData(form)); const content = 'Name: ' + data.name + '\\nEmail: ' + data.email + '\\n\\n' + data.message; const url = URL.createObjectURL(new Blob([content], {type:'text/plain'})); const link = document.createElement('a'); link.href = url; link.download = 'contact-request.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); announce('Contact request downloaded. No email has been sent.'); });`}`;
}

const baseStyles = `:root{--accent:ACCENT;--page:PAGE;--surface:SURFACE;--ink:INK;--muted:MUTED;--line:LINE;--radius:18px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:SCHEME}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--page);color:var(--ink);line-height:1.6}button,input,textarea,select{font:inherit}button,.button{cursor:pointer;border:0;background:var(--accent);color:#fff;padding:11px 20px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;transition:opacity .2s,transform .2s}button:hover,.button:hover{opacity:.88}button:active{transform:scale(.98)}button:disabled{cursor:not-allowed;opacity:.45}button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:3px}input,textarea,select{width:100%;border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--surface);color:var(--ink);min-width:0}h1,h2,h3,p{margin-top:0}h1{font-size:clamp(36px,8vw,76px);line-height:1.05;letter-spacing:-.055em;max-width:900px;margin:15px auto}h2{font-size:clamp(24px,4vw,38px);line-height:1.2;letter-spacing:-.035em;margin-bottom:16px}h3{font-size:19px;letter-spacing:-.02em;margin-bottom:5px}p{color:var(--muted)}[hidden]{display:none!important}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}header{height:76px;max-width:1160px;margin:auto;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:0 28px;border-bottom:1px solid var(--line)}.brand{font-weight:750;font-size:17px;letter-spacing:-.03em;color:var(--ink);text-decoration:none;max-width:65%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}nav{display:flex;gap:24px}nav a{color:var(--muted);text-decoration:none;font-size:13px}.hero{padding:100px 24px 90px;text-align:center;border-bottom:1px solid var(--line)}.hero h2{font-size:clamp(18px,2.5vw,25px);font-weight:500;letter-spacing:-.02em;color:var(--muted)}.hero p{max-width:580px;margin:20px auto 32px}.eyebrow{font-size:10px;letter-spacing:.17em;font-weight:700;color:var(--accent)}.workspace{max-width:940px;margin:auto;padding:60px 28px}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:24px}.section-heading h2{margin-bottom:0}.counter{flex-shrink:0;border:1px solid var(--line);font-size:12px;padding:5px 11px;border-radius:999px;color:var(--muted)}.inline-form{display:flex;gap:8px}.inline-form input{flex:1}.inline-form button{flex-shrink:0}.filters{display:flex;gap:4px;margin:20px 0}.filters button,.text-button{background:transparent;color:var(--muted);padding:7px 13px;font-size:12px}.filters button[aria-pressed="true"]{background:var(--surface);box-shadow:inset 0 0 0 1px var(--line);color:var(--ink)}.task-list{padding:0;list-style:none}.task-row{border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;padding:15px 2px}.task-row label{display:flex;align-items:center;gap:12px;flex:1;min-width:0}.task-row span{overflow-wrap:anywhere}.task-row input{width:18px;height:18px;accent-color:var(--accent)}.task-row .delete-task{background:transparent;padding:5px 8px;font-size:11px;color:var(--muted)}.is-done{text-decoration:line-through;color:var(--muted)}.empty{padding:30px 12px;text-align:center;font-size:13px;color:var(--muted)}.text-button{margin-top:12px}.helper{font-size:11px;line-height:1.6;margin:10px 0;color:var(--muted)}.narrow{max-width:450px}.calculator{border:1px solid var(--line);padding:18px;border-radius:24px;background:var(--surface);margin-top:24px}.calculator input{height:76px;font-size:32px;text-align:right;border:0;background:transparent}.calc-keys{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}.calc-keys button{border-radius:14px;background:var(--page);color:var(--ink);height:54px;border:1px solid var(--line);font-size:18px}.calc-keys .equals{grid-column:span 2;background:var(--accent);color:white;border:0}.work-list{border-top:1px solid var(--line)}.work-list article{display:flex;gap:32px;padding:28px 0;border-bottom:1px solid var(--line)}.work-number{color:var(--accent);font-size:13px;min-width:28px}.work-list p{font-size:14px;max-width:570px;margin:5px 0}.contact{max-width:700px}.contact-form{display:grid;gap:16px;margin-top:26px;max-width:600px}.contact-form label{display:grid;gap:6px;font-size:12px;color:var(--muted)}.contact-form button{justify-self:start}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.setup{padding:18px;border:1px solid var(--line);border-radius:18px;background:var(--surface);font-size:13px}.chat-workspace{max-width:800px}.chat-messages{min-height:160px;max-height:480px;overflow-y:auto;padding:20px 0}.chat-message{max-width:88%;padding:12px 15px;border:1px solid var(--line);border-radius:16px;margin:10px 0;font-size:14px;background:var(--surface)}.chat-message.user{margin-left:auto}.chat-message strong{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:var(--accent)}.chat-message p{margin:5px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--ink)}footer{display:flex;justify-content:space-between;gap:16px;max-width:1160px;margin:auto;padding:24px 28px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}#notice{min-height:20px;font-size:11px;color:var(--muted);max-width:884px;margin:0 auto;padding:0 0 12px}@media(max-width:600px){header{height:66px;padding:0 20px}nav{gap:15px}.hero{padding:70px 22px 60px}.workspace{padding:38px 22px}.section-heading{gap:12px;align-items:flex-start}.inline-form{gap:6px}.inline-form button{padding:10px 14px;font-size:12px}h2{font-size:27px}.section-heading .eyebrow{font-size:8px}.work-list article{gap:20px;padding:22px 0}footer{padding:20px}.form-grid{gap:10px}#notice{padding:0 22px 14px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}`;

export function makeProjectSources(spec: ProjectSpec): WorkspaceFile[] {
  const title = escapeHtml(spec.title);
  const app = ["tasks", "calculator", "chat"].includes(spec.kind);
  const content = spec.kind === "tasks" ? tasksContent() : spec.kind === "calculator" ? calculatorContent() : spec.kind === "chat" ? chatContent() : landingContent(spec);
  const script = spec.kind === "tasks" ? tasksScript() : spec.kind === "calculator" ? calculatorScript() : spec.kind === "chat" ? chatScript() : landingScript(spec.kind);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHtml(spec.description)}"><title>${title}</title><link rel="stylesheet" href="styles.css"></head>
<body><header><a class="brand" href="#">${title}</a><nav aria-label="Main navigation">${app ? '<a href="#main">Workspace</a>' : `<a href="#work">${spec.kind === "restaurant" ? "Menu" : "Work"}</a><a href="#${spec.kind === "restaurant" ? "booking" : "contact"}">${spec.kind === "restaurant" ? "Visit" : "Contact"}</a>`}</nav></header><main id="main">${content}</main><div id="notice" aria-live="polite" role="status"></div><footer><span>${title}</span><span>Made with care.</span></footer><script src="app.js"></script></body></html>`;
  const palette: Record<string, string> = {
    ACCENT: spec.accent,
    PAGE: spec.dark ? "#11151c" : "#fafaf8",
    SURFACE: spec.dark ? "#1b222c" : "#ffffff",
    INK: spec.dark ? "#eef2f8" : "#1b232e",
    MUTED: spec.dark ? "#a2adbb" : "#6c7480",
    LINE: spec.dark ? "#303b48" : "#e2e6ea",
    SCHEME: spec.dark ? "dark" : "light",
  };
  const css = baseStyles.replace(/ACCENT|PAGE|SURFACE|INK|MUTED|LINE|SCHEME/g, (key) => palette[key]);
  const now = Date.now();
  return [
    { path: "index.html", language: "html", content: html, updatedAt: now },
    { path: "styles.css", language: "css", content: css, updatedAt: now },
    { path: "app.js", language: "javascript", content: script, updatedAt: now },
    { path: "sujith.project.json", language: "json", content: JSON.stringify(spec, null, 2), updatedAt: now },
  ];
}
