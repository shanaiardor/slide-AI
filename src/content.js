const HOST_ID = "slide-ask-ai-root";
const MAX_PREVIEW_LENGTH = 240;
const DEFAULT_OPENING_QUESTION = "请解释这段内容，并告诉我重点。";

const state = {
  selectedText: "",
  selectedRect: null,
  panelOpen: false,
  loading: false,
  messages: [],
  statusMessage: ""
};

let elements = null;
let selectionTimer = 0;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function previewText(text) {
  const normalized = (text || "").trim();
  return normalized.length > MAX_PREVIEW_LENGTH
    ? `${normalized.slice(0, MAX_PREVIEW_LENGTH)}...`
    : normalized;
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(text) {
  return escapeHtml(text).replaceAll("`", "&#96;");
}

function sanitizeUrl(url) {
  const value = String(url || "").trim();

  if (!value) {
    return "#";
  }

  try {
    const resolved = new URL(value, window.location.href);
    return ["http:", "https:", "mailto:"].includes(resolved.protocol) ? resolved.href : "#";
  } catch {
    return "#";
  }
}

function renderInlineMarkdown(text) {
  const codeTokens = [];
  let html = escapeHtml(text);

  html = html.replace(/`([^`]+)`/g, (_match, code) => {
    const token = `__CODE_TOKEN_${codeTokens.length}__`;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, label, url) =>
      `<a href="${escapeAttribute(sanitizeUrl(url))}" target="_blank" rel="noreferrer noopener">${label}</a>`
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  html = html.replace(/\n/g, "<br>");

  for (const [index, tokenHtml] of codeTokens.entries()) {
    html = html.replace(`__CODE_TOKEN_${index}__`, tokenHtml);
  }

  return html;
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const codeFence = line.match(/^```([\w-]+)?\s*$/);

    if (codeFence) {
      const language = codeFence[1] || "";
      const codeLines = [];
      index += 1;

      while (index < lines.length && !/^```/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push(
        `<pre><code class="language-${escapeAttribute(language)}">${escapeHtml(codeLines.join("\n"))}</code></pre>`
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);

    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines = [];

      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }

      blocks.push(`<blockquote>${renderInlineMarkdown(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];

      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ""));
        index += 1;
      }

      blocks.push(
        `<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];

      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ""));
        index += 1;
      }

      blocks.push(
        `<ol>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ol>`
      );
      continue;
    }

    const paragraphLines = [];

    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^```/.test(lines[index]) &&
      !/^\s*>\s?/.test(lines[index]) &&
      !/^\s*[-*+]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    blocks.push(`<p>${renderInlineMarkdown(paragraphLines.join("\n"))}</p>`);
  }

  return blocks.join("");
}

function renderChatMessage(message) {
  const role = message.role === "user" ? "user" : "assistant";
  const body =
    role === "assistant"
      ? renderMarkdown(message.content)
      : `<p>${renderInlineMarkdown(message.content)}</p>`;

  return `
    <article class="slide-ask-ai-message slide-ask-ai-message-${role}">
      <div class="slide-ask-ai-message-body">${body}</div>
    </article>
  `;
}

function getInputSelection() {
  const activeElement = document.activeElement;

  if (
    !activeElement ||
    !(activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
  ) {
    return null;
  }

  if (
    activeElement instanceof HTMLInputElement &&
    !["text", "search", "url", "tel"].includes(activeElement.type)
  ) {
    return null;
  }

  const start = activeElement.selectionStart ?? 0;
  const end = activeElement.selectionEnd ?? 0;
  const text = activeElement.value.slice(start, end).trim();

  if (!text) {
    return null;
  }

  return {
    text,
    rect: activeElement.getBoundingClientRect()
  };
}

function getPageSelection() {
  const inputSelection = getInputSelection();

  if (inputSelection) {
    return inputSelection;
  }

  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const text = selection.toString().trim();

  if (!text) {
    return null;
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect();

  if (!rect || (rect.width === 0 && rect.height === 0)) {
    return null;
  }

  return { text, rect };
}

function ensureUI() {
  if (elements) {
    return elements;
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.append(host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
      }

      .slide-ask-ai-layer {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
      }

      .slide-ask-ai-trigger,
      .slide-ask-ai-panel {
        pointer-events: auto;
        font-family: "Segoe UI", "PingFang SC", "Helvetica Neue", Arial, sans-serif;
      }

      .slide-ask-ai-hidden {
        display: none !important;
      }

      .slide-ask-ai-trigger {
        position: fixed;
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        background: linear-gradient(135deg, #0f766e, #2563eb);
        color: #fff;
        box-shadow: 0 14px 34px rgba(15, 23, 42, 0.22);
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }

      .slide-ask-ai-panel {
        position: fixed;
        top: 28px;
        right: 28px;
        width: min(460px, calc(100vw - 32px));
        max-height: min(78vh, 720px);
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 18px 18px 16px;
        border: 1px solid rgba(255, 255, 255, 0.65);
        border-radius: 24px;
        background:
          radial-gradient(circle at top right, rgba(56, 189, 248, 0.08), transparent 30%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.93), rgba(248, 250, 252, 0.95));
        color: #0f172a;
        box-shadow: 0 28px 90px rgba(15, 23, 42, 0.16);
        backdrop-filter: blur(22px);
      }

      .slide-ask-ai-status {
        min-height: 0;
        font-size: 13px;
        color: #334155;
        letter-spacing: 0.01em;
      }

      .slide-ask-ai-thread {
        margin: 0;
        max-height: 360px;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .slide-ask-ai-message {
        display: flex;
      }

      .slide-ask-ai-message-assistant {
        justify-content: flex-start;
      }

      .slide-ask-ai-message-user {
        justify-content: flex-end;
      }

      .slide-ask-ai-message-body {
        max-width: 88%;
        padding: 14px;
        border-radius: 18px;
        line-height: 1.65;
        font-size: 14px;
      }

      .slide-ask-ai-message-assistant .slide-ask-ai-message-body {
        background: #0f172a;
        color: #e2e8f0;
        border-top-left-radius: 8px;
      }

      .slide-ask-ai-message-user .slide-ask-ai-message-body {
        background: rgba(226, 232, 240, 0.9);
        color: #0f172a;
        border-top-right-radius: 8px;
      }

      .slide-ask-ai-message-body > :first-child {
        margin-top: 0;
      }

      .slide-ask-ai-message-body > :last-child {
        margin-bottom: 0;
      }

      .slide-ask-ai-message-body p,
      .slide-ask-ai-message-body ul,
      .slide-ask-ai-message-body ol,
      .slide-ask-ai-message-body blockquote,
      .slide-ask-ai-message-body pre,
      .slide-ask-ai-message-body h1,
      .slide-ask-ai-message-body h2,
      .slide-ask-ai-message-body h3,
      .slide-ask-ai-message-body h4,
      .slide-ask-ai-message-body h5,
      .slide-ask-ai-message-body h6 {
        margin: 0 0 12px;
      }

      .slide-ask-ai-message-body h1,
      .slide-ask-ai-message-body h2,
      .slide-ask-ai-message-body h3,
      .slide-ask-ai-message-body h4,
      .slide-ask-ai-message-body h5,
      .slide-ask-ai-message-body h6 {
        color: #f8fafc;
        line-height: 1.35;
      }

      .slide-ask-ai-message-user .slide-ask-ai-message-body h1,
      .slide-ask-ai-message-user .slide-ask-ai-message-body h2,
      .slide-ask-ai-message-user .slide-ask-ai-message-body h3,
      .slide-ask-ai-message-user .slide-ask-ai-message-body h4,
      .slide-ask-ai-message-user .slide-ask-ai-message-body h5,
      .slide-ask-ai-message-user .slide-ask-ai-message-body h6 {
        color: #0f172a;
      }

      .slide-ask-ai-message-body ul,
      .slide-ask-ai-message-body ol {
        padding-left: 20px;
      }

      .slide-ask-ai-message-body li + li {
        margin-top: 6px;
      }

      .slide-ask-ai-message-body blockquote {
        padding: 10px 12px;
        border-left: 3px solid rgba(96, 165, 250, 0.8);
        background: rgba(30, 41, 59, 0.6);
        color: #cbd5e1;
      }

      .slide-ask-ai-message-user .slide-ask-ai-message-body blockquote {
        background: rgba(203, 213, 225, 0.55);
        color: #334155;
      }

      .slide-ask-ai-message-body pre {
        overflow: auto;
        padding: 12px;
        border-radius: 12px;
        background: rgba(2, 6, 23, 0.95);
      }

      .slide-ask-ai-message-body code {
        font-family: "SFMono-Regular", "Consolas", "Liberation Mono", monospace;
        font-size: 12px;
      }

      .slide-ask-ai-message-body :not(pre) > code {
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(51, 65, 85, 0.85);
        color: #bfdbfe;
      }

      .slide-ask-ai-message-user .slide-ask-ai-message-body :not(pre) > code {
        background: rgba(148, 163, 184, 0.55);
        color: #1e293b;
      }

      .slide-ask-ai-message-body a {
        color: #7dd3fc;
        text-decoration: underline;
      }

      .slide-ask-ai-message-user .slide-ask-ai-message-body a {
        color: #0369a1;
      }

      .slide-ask-ai-composer {
        display: flex;
        align-items: flex-end;
        gap: 10px;
        padding-top: 2px;
      }

      .slide-ask-ai-input {
        flex: 1;
        min-height: 44px;
        max-height: 120px;
        resize: none;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 16px;
        padding: 12px 14px;
        font: 500 14px/1.5 "Segoe UI", "PingFang SC", "Helvetica Neue", Arial, sans-serif;
        color: #0f172a;
        background: rgba(255, 255, 255, 0.82);
        outline: none;
      }

      .slide-ask-ai-input::placeholder {
        color: #94a3b8;
      }

      .slide-ask-ai-send {
        flex: none;
        border: 0;
        border-radius: 999px;
        padding: 11px 16px;
        background: linear-gradient(135deg, #0f766e, #2563eb);
        color: #fff;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }

      .slide-ask-ai-send:disabled,
      .slide-ask-ai-input:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    </style>
    <div class="slide-ask-ai-layer">
      <button class="slide-ask-ai-trigger slide-ask-ai-hidden" type="button">问 AI</button>
      <section class="slide-ask-ai-panel slide-ask-ai-hidden">
        <div class="slide-ask-ai-status"></div>
        <div class="slide-ask-ai-thread slide-ask-ai-hidden"></div>
        <div class="slide-ask-ai-composer">
          <textarea
            class="slide-ask-ai-input"
            placeholder="继续追问..."
            rows="1"
          ></textarea>
          <button class="slide-ask-ai-send" type="button">发送</button>
        </div>
      </section>
    </div>
  `;

  elements = {
    host,
    trigger: shadow.querySelector(".slide-ask-ai-trigger"),
    panel: shadow.querySelector(".slide-ask-ai-panel"),
    status: shadow.querySelector(".slide-ask-ai-status"),
    thread: shadow.querySelector(".slide-ask-ai-thread"),
    input: shadow.querySelector(".slide-ask-ai-input"),
    send: shadow.querySelector(".slide-ask-ai-send")
  };

  elements.trigger.addEventListener("click", openPanelFromSelection);
  elements.send.addEventListener("click", submitFollowUp);
  elements.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitFollowUp();
    }
  });
  elements.input.addEventListener("input", () => {
    autoResizeInput();
    renderPanel();
  });

  return elements;
}

function autoResizeInput() {
  const ui = ensureUI();
  ui.input.style.height = "auto";
  ui.input.style.height = `${Math.min(ui.input.scrollHeight, 120)}px`;
}

function hideTrigger() {
  ensureUI().trigger.classList.add("slide-ask-ai-hidden");
}

function showTrigger(rect) {
  const ui = ensureUI();
  const top = clamp(rect.bottom + 10, 12, window.innerHeight - 52);
  const left = clamp(rect.right - 88, 12, window.innerWidth - 92);

  ui.trigger.style.top = `${top}px`;
  ui.trigger.style.left = `${left}px`;
  ui.trigger.classList.remove("slide-ask-ai-hidden");
}

function renderPanel() {
  const ui = ensureUI();

  ui.status.textContent = state.statusMessage;
  ui.status.classList.toggle("slide-ask-ai-hidden", !state.statusMessage);
  ui.input.disabled = state.loading || !state.selectedText;
  ui.send.disabled = state.loading || !state.selectedText || !ui.input.value.trim();

  const visibleMessages = state.messages.filter((message) => !message.hidden);

  if (visibleMessages.length > 0) {
    ui.thread.innerHTML = visibleMessages.map(renderChatMessage).join("");
    ui.thread.classList.remove("slide-ask-ai-hidden");
  } else {
    ui.thread.innerHTML = "";
    ui.thread.classList.add("slide-ask-ai-hidden");
  }

  if (state.panelOpen) {
    ui.panel.classList.remove("slide-ask-ai-hidden");
  } else {
    ui.panel.classList.add("slide-ask-ai-hidden");
  }

  if (state.panelOpen) {
    ui.input.placeholder = visibleMessages.length > 0 ? "继续追问..." : "输入问题...";
    ui.thread.scrollTop = ui.thread.scrollHeight;
  }
}

function openPanelFromSelection() {
  if (!state.selectedText || state.loading) {
    return;
  }

  state.panelOpen = true;
  state.messages = [];
  state.statusMessage = "AI 正在思考...";
  hideTrigger();
  renderPanel();
  void startConversation();
}

function closePanel() {
  state.panelOpen = false;
  state.loading = false;
  state.messages = [];
  state.statusMessage = "";
  ensureUI().input.value = "";
  autoResizeInput();
  renderPanel();
}

function updateStatus(message) {
  state.statusMessage = message;
  ensureUI().status.textContent = message;
}

async function submitQuestion() {
  if (!state.selectedText || state.loading) {
    return;
  }

  state.loading = true;
  state.statusMessage = "AI 正在思考...";
  renderPanel();

  try {
    const response = await chrome.runtime.sendMessage({
      type: "ASK_AI",
      selectedText: state.selectedText,
      conversationHistory: state.messages.map(({ role, content }) => ({ role, content }))
    });

    if (!response?.ok) {
      throw new Error(response?.error || "AI 请求失败。");
    }

    state.messages.push({
      role: "assistant",
      content: response.answer
    });
    updateStatus("");
  } catch (error) {
    updateStatus(error instanceof Error ? error.message : "请求失败，请稍后重试。");
  } finally {
    state.loading = false;
    renderPanel();
  }
}

async function askSelectedText() {
  await submitQuestion();
}

async function startConversation() {
  state.messages = [
    {
      role: "user",
      content: DEFAULT_OPENING_QUESTION,
      hidden: true
    }
  ];
  await askSelectedText();
}

async function submitFollowUp() {
  const ui = ensureUI();
  const followUp = ui.input.value.trim();

  if (!followUp || state.loading || !state.selectedText) {
    return;
  }

  state.messages.push({
    role: "user",
    content: followUp
  });
  ui.input.value = "";
  autoResizeInput();
  renderPanel();
  await askSelectedText();
}

function syncSelection() {
  if (state.panelOpen || state.loading) {
    return;
  }

  const selection = getPageSelection();

  if (!selection) {
    state.selectedText = "";
    state.selectedRect = null;
    hideTrigger();
    return;
  }

  state.selectedText = selection.text;
  state.selectedRect = selection.rect;
  showTrigger(selection.rect);
}

function scheduleSyncSelection() {
  window.clearTimeout(selectionTimer);
  selectionTimer = window.setTimeout(syncSelection, 60);
}

document.addEventListener("mouseup", scheduleSyncSelection, true);
document.addEventListener("keyup", scheduleSyncSelection, true);
document.addEventListener("selectionchange", scheduleSyncSelection, true);
window.addEventListener("scroll", () => {
  if (!state.panelOpen) {
    hideTrigger();
  }
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.panelOpen) {
    closePanel();
  }
});

document.addEventListener("mousedown", (event) => {
  if (!state.panelOpen || !elements) {
    return;
  }

  const path = event.composedPath();

  if (!path.includes(elements.host)) {
    closePanel();
  }
}, true);

ensureUI();
