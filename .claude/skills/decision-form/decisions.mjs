// The one decision widget every Artifact uses to ask Łukasz / neoCRM staff something
// (CORE-44). Each question is exactly three buttons, in this order:
//   yes  — the straightforward "do it"
//   no   — the straightforward "don't"
//   more — an expanded variant, recommended by a named specialist (UX, Legal, QA, …)
// One of the three is marked recommended. Max 5 questions per round: anything a test
// will settle is decided by default and shown as such, not asked (TDD first).
//
// Used by decision-form/build.mjs (a standalone form) and ship-artifact/build.mjs
// (the "Needs your decision" box). The answer goes back as an artifact comment via
// comments.sendToClaude, which wakes the watching Claude Code session.

export const MAX_QUESTIONS = 5;
const KINDS = ["yes", "no", "more"];

export function validateQuestions(questions) {
  const errors = [];
  const need = (cond, msg) => cond || errors.push(msg);
  if (!Array.isArray(questions)) return ["questions: must be an array"];
  need(questions.length <= MAX_QUESTIONS, `max ${MAX_QUESTIONS} questions per round (got ${questions.length}) — decide the rest by default and prove it with a test`);
  const ids = new Set();
  for (const q of questions) {
    if (typeof q !== "object" || q === null) {
      errors.push(`"${String(q).slice(0, 40)}" is plain text — a decision needs 3 buttons; risks and skipped steps go in notes`);
      continue;
    }
    need(/^[A-Za-z0-9.-]{1,8}$/.test(q.id ?? ""), `question id "${q.id}": 1-8 chars, letters/digits`);
    need(!ids.has(q.id), `duplicate question id ${q.id}`);
    ids.add(q.id);
    need(typeof q.text === "string" && q.text.length > 0 && q.text.length <= 240, `${q.id}: text required, ≤ 240 chars`);
    need(!q.short || q.short.length <= 50, `${q.id}: short ≤ 50 chars`);
    need(!q.context || q.context.length <= 240, `${q.id}: context ≤ 240 chars`);
    const opts = Array.isArray(q.options) ? q.options : [];
    if (opts.length !== 3) {
      errors.push(`${q.id}: exactly 3 options (yes, no, more)`);
      continue;
    }
    need(opts.map((o) => o.kind).join() === KINDS.join(), `${q.id}: option kinds must be yes, no, more — in that order`);
    for (const o of opts) {
      need(typeof o.label === "string" && o.label.length > 0 && o.label.length <= 60, `${q.id}/${o.kind}: label required, ≤ 60 chars`);
      need(!o.detail || o.detail.length <= 200, `${q.id}/${o.kind}: detail ≤ 200 chars`);
    }
    const more = opts[2];
    need(typeof more.expert === "string" && more.expert.length > 0 && more.expert.length <= 30, `${q.id}/more: expert required (which specialist recommends it, e.g. "UX", "Legal"), ≤ 30 chars`);
    need(typeof more.detail === "string" && more.detail.length > 0, `${q.id}/more: detail required (what the expanded variant adds)`);
    need(opts.filter((o) => o.recommended).length === 1, `${q.id}: exactly one recommended option`);
  }
  return errors;
}

// Pure and closure-free: widget() inlines its source into the page, the test calls it directly.
export function answerSheet(data, state) {
  const lines = [`[decision-form] ${data.id}${data.ticket ? " (" + data.ticket + ")" : ""}: ${data.title}`];
  const skipped = [];
  for (const q of data.questions) {
    const kind = state.answers[q.id];
    const note = (state.notes[q.id] || "").trim().replace(/\s+/g, " ");
    if (!kind && !note) { skipped.push(q.id); continue; }
    const o = q.options.find((x) => x.kind === kind);
    lines.push(`${q.id} ${q.short || q.text.slice(0, 50)} → ${o ? `${kind}) ${o.label}` : "—"}${note ? " | " + note : ""}`);
  }
  if (skipped.length) lines.push(`Skipped: ${skipped.join(", ")}`);
  if ((state.final || "").trim()) lines.push("", "Notes:", state.final.trim());
  return lines.join("\n");
}

const DEFAULT_UI = {
  send: "Send to Claude", copy: "Copy answers", notesTitle: "Notes", notesPlaceholder: "Anything else Claude should know…",
  yes: "Yes", no: "No", more: "More",
  questionNote: "Add a comment", recommended: "recommended", answered: "answered", sending: "Sending…",
  sent: "Sent. Claude continues in the VS Code thread and replies in the comments.",
  copied: "Copied. Paste into the Claude chat.", copyFailed: "Copy was refused. Select the text below and copy it by hand.",
  noClaude: "Sending to Claude is not available here. Use Copy answers and paste into the chat.",
  consent: "Allow comments from this page, then press Send again.", failed: "Could not send",
};

const CSS = `
.dw{display:grid;gap:14px}
.dw-q{display:grid;gap:10px;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
.dw-q[data-answered="true"]{border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}
.dw-head{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:baseline}
.dw-id{font:500 12px var(--mono);color:var(--accent);background:var(--accent-soft);padding:1px 7px;border-radius:6px}
.dw-text{font-weight:500;text-wrap:pretty}
.dw-ctx{grid-column:2;font-size:13.5px;color:var(--muted)}
.dw-opts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
@media (max-width:620px){.dw-opts{grid-template-columns:1fr}}
.dw-btn{display:grid;gap:4px;align-content:start;text-align:left;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--ink);font:inherit;cursor:pointer;min-height:44px}
.dw-btn:hover{border-color:color-mix(in srgb,var(--accent) 50%,var(--line))}
.dw-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.dw-btn[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft);box-shadow:inset 0 0 0 1px var(--accent)}
.dw-top{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.dw-kind{font:600 11px var(--mono);letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
.dw-btn[data-kind="yes"] .dw-kind{color:var(--ok)}
.dw-btn[data-kind="no"] .dw-kind{color:var(--deny)}
.dw-btn[data-kind="more"] .dw-kind{color:var(--accent)}
.dw-label{font-weight:500;line-height:1.35}
.dw-detail{font-size:13px;color:var(--muted);line-height:1.4}
.dw-rec{padding:0 7px;border-radius:99px;font:500 11px var(--mono);background:var(--ok-soft);color:var(--ok)}
.dw-note{font-size:13px;color:var(--muted)}
.dw-note summary{cursor:pointer;width:max-content}
.dw textarea{width:100%;box-sizing:border-box;min-height:64px;margin-top:6px;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font:14px/1.5 var(--sans);resize:vertical}
.dw-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.dw-progress{font:500 13px var(--mono);color:var(--muted);font-variant-numeric:tabular-nums;margin-right:auto}
.dw-status{flex-basis:100%;font-size:13.5px}
.dw-status.ok{color:var(--ok)} .dw-status.err{color:var(--deny)}
.dw .btn:disabled{opacity:.5;cursor:not-allowed}
@media (prefers-reduced-motion:no-preference){.dw-btn{transition:background .12s,border-color .12s}}
`;

/** { css, html, script } for one decision round. `data`: {id, ticket?, title, questions, ui?, finalNotes?}. */
export function widget(data) {
  const ui = { ...DEFAULT_UI, ...(data.ui || {}) };
  const payload = JSON.stringify({ ...data, ui }).replace(/</g, "\\u003c");
  const mount = `dw-${data.id}`;
  const html = `<div class="dw" id="${mount}"></div>`;
  const script = `<script type="application/json" id="${mount}-data">${payload}</script>
<script>
(() => {
  const answerSheet = ${answerSheet.toString()};
  const D = JSON.parse(document.getElementById(${JSON.stringify(mount + "-data")}).textContent);
  const UI = D.ui, root = document.getElementById(${JSON.stringify(mount)});
  const KEY = "decision-form:" + D.id;
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "text") n.textContent = v; else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach((c) => c && n.append(c));
    return n;
  };
  let state = { answers: {}, notes: {}, final: "" };
  try { state = Object.assign(state, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  const KIND = { yes: UI.yes, no: UI.no, more: UI.more };

  for (const q of D.questions) {
    const opts = el("div", { class: "dw-opts", role: "group", "aria-label": q.text },
      q.options.map((o) => {
        const b = el("button", { type: "button", class: "dw-btn", "data-kind": o.kind, "aria-pressed": String(state.answers[q.id] === o.kind) },
          el("span", { class: "dw-top" },
            el("span", { class: "dw-kind", text: o.kind === "more" && o.expert ? KIND.more + " · " + o.expert : KIND[o.kind] }),
            o.recommended ? el("span", { class: "dw-rec", text: UI.recommended }) : null),
          el("span", { class: "dw-label", text: o.label }),
          o.detail ? el("span", { class: "dw-detail", text: o.detail }) : null);
        b.addEventListener("click", () => {
          if (state.answers[q.id] === o.kind) delete state.answers[q.id]; else state.answers[q.id] = o.kind;
          save(); refresh();
        });
        return b;
      }));
    const ta = el("textarea", { "aria-label": UI.questionNote + " " + q.id, maxlength: "600" });
    ta.value = state.notes[q.id] || "";
    ta.addEventListener("input", () => { state.notes[q.id] = ta.value; save(); });
    const det = el("details", { class: "dw-note" }, el("summary", { text: UI.questionNote }), ta);
    if (ta.value) det.open = true;
    root.append(el("div", { class: "dw-q", "data-q": q.id },
      el("div", { class: "dw-head" }, el("span", { class: "dw-id", text: q.id }), el("span", { class: "dw-text", text: q.text }),
        q.context ? el("span", { class: "dw-ctx", text: q.context }) : null),
      opts, det));
  }
  if (D.finalNotes !== false) {
    const fin = el("textarea", { placeholder: UI.notesPlaceholder, "aria-label": UI.notesTitle, maxlength: "2000" });
    fin.value = state.final || "";
    fin.addEventListener("input", () => { state.final = fin.value; save(); });
    root.append(el("details", { class: "dw-note", open: !!fin.value }, el("summary", { text: UI.notesTitle }), fin));
  }
  const progress = el("span", { class: "dw-progress" });
  const copy = el("button", { type: "button", class: "btn", text: UI.copy });
  const send = el("button", { type: "button", class: "btn primary", text: UI.send });
  const stat = el("p", { class: "dw-status", hidden: true });
  root.append(el("div", { class: "dw-bar" }, progress, copy, send, stat));

  function refresh() {
    let n = 0;
    for (const box of root.querySelectorAll(".dw-q")) {
      const a = state.answers[box.dataset.q];
      if (a) n++;
      box.dataset.answered = String(!!a);
      box.querySelectorAll(".dw-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === a)));
    }
    progress.textContent = n + "/" + D.questions.length + " " + UI.answered;
  }
  refresh();
  const status = (msg, kind) => { stat.hidden = false; stat.textContent = msg; stat.className = "dw-status " + (kind || ""); };
  const bytes = (s) => new TextEncoder().encode(s).length;
  function chunks(text, max = 3800) {
    const out = []; let cur = "";
    for (const line of text.split("\\n")) {
      const next = cur ? cur + "\\n" + line : line;
      if (bytes(next) > max && cur) { out.push(cur); cur = line; } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  }
  copy.addEventListener("click", async () => {
    const text = answerSheet(D, state);
    try { await navigator.clipboard.writeText(text); status(UI.copied, "ok"); }
    catch {
      status(UI.copyFailed, "err");
      const pre = root.querySelector(".dw-fallback") || el("textarea", { class: "dw-fallback", readonly: true });
      stat.after(pre); pre.value = text; pre.select();
    }
  });
  let comments = null;
  (async () => {
    comments = await window.claude?.use?.("comments");
    if (!comments) { send.disabled = true; send.title = UI.noClaude; }
  })();
  send.addEventListener("click", async () => {
    if (!comments) { status(UI.noClaude, "err"); return; }
    try { if ((await comments.canSendToClaude()) !== "available") { status(UI.noClaude, "err"); return; } }
    catch { status(UI.noClaude, "err"); return; }
    send.disabled = true; send.textContent = UI.sending;
    try {
      const parts = chunks(answerSheet(D, state));
      const anchor = await comments.anchorFor(root);
      let threadId = null;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!threadId) threadId = (await comments.create({ anchor, text: parts[i] })).threadId;
        else await comments.reply(threadId, parts[i]);
      }
      const last = parts[parts.length - 1];
      await comments.sendToClaude(threadId ? { threadId, text: last } : { anchor, text: last });
      status(UI.sent, "ok");
    } catch (e) {
      const code = e && e.code;
      status(code === "consent_required" ? UI.consent : UI.failed + " (" + (code || "error") + "). " + UI.noClaude, "err");
    } finally { send.disabled = false; send.textContent = UI.send; }
  });
})();
</script>`;
  return { css: CSS, html, script };
}
