function ensureUI() {
  if (elements) {
    return elements;
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.append(host);

  host.innerHTML = `
    <style>
      #slide-ask-ai-root {
        all: initial;
      }

      #slide-ask-ai-root * {
        box-sizing: border-box;
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
        width: 14px;
        height: 14px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        background: rgba(255, 255, 255, 0.82);
        color: #2563eb;
        border: 1px solid rgba(148, 163, 184, 0.32);
        backdrop-filter: blur(12px);
        font-size: 0;
        cursor: pointer;
        opacity: 0.26;
        transform: scale(0.94);
        transition:
          transform 140ms ease,
          border-color 140ms ease,
          background 140ms ease,
          opacity 140ms ease;
      }

      .slide-ask-ai-trigger:hover,
      .slide-ask-ai-trigger.slide-ask-ai-trigger-active {
        opacity: 0.92;
        transform: translateY(-1px) scale(1);
        background: rgba(255, 255, 255, 0.96);
        border-color: rgba(37, 99, 235, 0.28);
      }

      .slide-ask-ai-trigger:focus-visible {
        opacity: 0.92;
        outline: 0;
        border-color: rgba(37, 99, 235, 0.35);
      }

      .slide-ask-ai-trigger svg {
        width: 7px;
        height: 7px;
        display: block;
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

      .slide-ask-ai-drag-handle {
        margin: -4px 0 2px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        user-select: none;
        touch-action: none;
      }

      .slide-ask-ai-drag-handle::before {
        content: "";
        width: 40px;
        height: 4px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.38);
        transition: background 140ms ease;
      }

      .slide-ask-ai-drag-handle:hover::before {
        background: rgba(100, 116, 139, 0.52);
      }

      .slide-ask-ai-panel.slide-ask-ai-panel-dragging .slide-ask-ai-drag-handle {
        cursor: grabbing;
      }

      .slide-ask-ai-panel.slide-ask-ai-panel-dragging .slide-ask-ai-drag-handle::before {
        background: rgba(59, 130, 246, 0.5);
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
        padding-right: 4px;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .slide-ask-ai-thread::-webkit-scrollbar {
        width: 0;
        height: 0;
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
        background:
          radial-gradient(circle at top right, rgba(125, 211, 252, 0.18), transparent 34%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.95));
        color: #0f172a;
        border-top-left-radius: 8px;
        border: 1px solid rgba(226, 232, 240, 0.92);
      }

      .slide-ask-ai-message-user .slide-ask-ai-message-body {
        background: linear-gradient(135deg, #0f766e, #2563eb);
        color: #eff6ff;
        border-top-right-radius: 8px;
        box-shadow: 0 12px 28px rgba(37, 99, 235, 0.16);
      }

      .slide-ask-ai-message-body > :first-child {
        margin-top: 0;
      }

      .slide-ask-ai-message-body > :last-child {
        margin-bottom: 0;
      }

      .slide-ask-ai-markdown-target {
        min-height: 0;
      }

      .slide-ask-ai-markdown-target .shiki,
      .slide-ask-ai-markdown-target .slide-ask-ai-code-fallback {
        overflow: auto;
        margin: 0 0 12px;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid rgba(148, 163, 184, 0.18);
        background: rgba(248, 250, 252, 0.96) !important;
        font-size: 12px;
        line-height: 1.6;
      }

      .slide-ask-ai-markdown-target .shiki code,
      .slide-ask-ai-markdown-target .slide-ask-ai-code-fallback code {
        display: block;
        min-width: fit-content;
        background: transparent;
        padding: 0;
        color: inherit;
      }

      .slide-ask-ai-markdown-target .shiki .line {
        display: block;
      }

      .slide-ask-ai-markdown-target table {
        width: 100%;
        border-collapse: collapse;
        margin: 0 0 12px;
        font-size: 12px;
      }

      .slide-ask-ai-markdown-target th,
      .slide-ask-ai-markdown-target td {
        padding: 8px 10px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        text-align: left;
        vertical-align: top;
      }

      .slide-ask-ai-markdown-target th {
        background: rgba(241, 245, 249, 0.92);
      }

      .slide-ask-ai-markdown-target hr {
        height: 1px;
        margin: 14px 0;
        border: 0;
        background: rgba(148, 163, 184, 0.24);
      }

      .slide-ask-ai-reasoning-shell {
        position: relative;
        margin: -2px 0 12px;
        padding: 10px 12px 11px;
        border-radius: 14px;
        background:
          linear-gradient(180deg, rgba(226, 232, 240, 0.42), rgba(248, 250, 252, 0.78));
        border: 1px solid rgba(148, 163, 184, 0.22);
        overflow: hidden;
      }

      .slide-ask-ai-reasoning-shell::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 2px;
        background: linear-gradient(180deg, rgba(14, 165, 233, 0.78), rgba(15, 118, 110, 0.52));
      }

      .slide-ask-ai-reasoning-shell-live::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 40%, rgba(14, 165, 233, 0.08));
        pointer-events: none;
      }

      .slide-ask-ai-reasoning-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }

      .slide-ask-ai-reasoning-dot {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: #0ea5e9;
        box-shadow: 0 0 0 4px rgba(14, 165, 233, 0.12);
      }

      .slide-ask-ai-reasoning-shell-live .slide-ask-ai-reasoning-dot {
        animation: slide-ask-ai-reasoning-pulse 1.3s infinite ease-in-out;
      }

      .slide-ask-ai-reasoning-label {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.16em;
        color: #0369a1;
        text-transform: uppercase;
      }

      .slide-ask-ai-reasoning-window {
        max-height: 74px;
        overflow: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
        mask-image: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.88) 14%, rgba(0, 0, 0, 1) 82%, transparent 100%);
      }

      .slide-ask-ai-reasoning-window::-webkit-scrollbar {
        width: 0;
        height: 0;
      }

      .slide-ask-ai-reasoning-track {
        font: 500 11px/1.45 "SFMono-Regular", "Cascadia Code", "JetBrains Mono", "Fira Code", monospace;
        color: rgba(15, 23, 42, 0.72);
        white-space: normal;
        word-break: break-word;
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
        color: #0f172a;
        line-height: 1.35;
      }

      .slide-ask-ai-message-user .slide-ask-ai-message-body h1,
      .slide-ask-ai-message-user .slide-ask-ai-message-body h2,
      .slide-ask-ai-message-user .slide-ask-ai-message-body h3,
      .slide-ask-ai-message-user .slide-ask-ai-message-body h4,
      .slide-ask-ai-message-user .slide-ask-ai-message-body h5,
      .slide-ask-ai-message-user .slide-ask-ai-message-body h6 {
        color: #eff6ff;
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
        border-left: 3px solid rgba(37, 99, 235, 0.55);
        background: rgba(241, 245, 249, 0.9);
        color: #334155;
      }

      .slide-ask-ai-message-user .slide-ask-ai-message-body blockquote {
        background: rgba(255, 255, 255, 0.14);
        color: #dbeafe;
      }

      .slide-ask-ai-message-body pre {
        overflow: auto;
        padding: 12px;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.08);
        border: 1px solid rgba(148, 163, 184, 0.22);
      }

      .slide-ask-ai-message-body code {
        font-family: "SFMono-Regular", "Consolas", "Liberation Mono", monospace;
        font-size: 12px;
      }

      .slide-ask-ai-message-body :not(pre) > code {
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(226, 232, 240, 0.95);
        color: #0f172a;
      }

      .slide-ask-ai-message-user .slide-ask-ai-message-body :not(pre) > code {
        background: rgba(255, 255, 255, 0.16);
        color: #eff6ff;
      }

      .slide-ask-ai-message-body a {
        color: #2563eb;
        text-decoration: underline;
      }

      .slide-ask-ai-message-user .slide-ask-ai-message-body a {
        color: #dbeafe;
      }

      .slide-ask-ai-typing {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 18px;
      }

      .slide-ask-ai-typing span {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: rgba(59, 130, 246, 0.65);
        animation: slide-ask-ai-pulse 1s infinite ease-in-out;
      }

      .slide-ask-ai-typing span:nth-child(2) {
        animation-delay: 0.12s;
      }

      .slide-ask-ai-typing span:nth-child(3) {
        animation-delay: 0.24s;
      }

      @keyframes slide-ask-ai-pulse {
        0%, 80%, 100% {
          transform: translateY(0);
          opacity: 0.35;
        }

        40% {
          transform: translateY(-2px);
          opacity: 1;
        }
      }

      @keyframes slide-ask-ai-reasoning-pulse {
        0%, 100% {
          transform: scale(1);
          opacity: 0.72;
        }

        50% {
          transform: scale(1.14);
          opacity: 1;
        }
      }

      .slide-ask-ai-composer {
        display: flex;
        align-items: center;
        gap: 10px;
        padding-top: 2px;
      }

      .slide-ask-ai-input {
        flex: 1;
        resize: none;
        overflow-y: auto;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 15px;
        padding: 11px 13px;
        font: 500 14px/1.3 "Segoe UI", "PingFang SC", "Helvetica Neue", Arial, sans-serif;
        color: #0f172a;
        background: rgba(255, 255, 255, 0.82);
        outline: none;
        transition:
          background 180ms ease,
          border-color 180ms ease;
      }

      .slide-ask-ai-input:focus {
        border-color: rgba(37, 99, 235, 0.3);
        background: rgba(255, 255, 255, 0.92);
      }

      .slide-ask-ai-input::placeholder {
        color: #94a3b8;
      }

      .slide-ask-ai-send {
        height: 38px;
        flex: none;
        border: 0;
        border-radius: 999px;
        padding: 0 16px;
        background: linear-gradient(135deg, #0f766e, #2563eb);
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
      }

      .slide-ask-ai-send:disabled,
      .slide-ask-ai-input:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    </style>
    <div class="slide-ask-ai-layer">
      <button class="slide-ask-ai-trigger slide-ask-ai-hidden" type="button" aria-label="问 AI">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
          <path
            d="M12 3L13.9 8.1L19 10L13.9 11.9L12 17L10.1 11.9L5 10L10.1 8.1L12 3Z"
            fill="currentColor"
          />
          <path
            d="M18.5 16L19.2 17.8L21 18.5L19.2 19.2L18.5 21L17.8 19.2L16 18.5L17.8 17.8L18.5 16Z"
            fill="currentColor"
            opacity="0.9"
          />
        </svg>
      </button>
      <section class="slide-ask-ai-panel slide-ask-ai-hidden">
        <div class="slide-ask-ai-drag-handle" aria-hidden="true"></div>
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
    trigger: host.querySelector(".slide-ask-ai-trigger"),
    panel: host.querySelector(".slide-ask-ai-panel"),
    handle: host.querySelector(".slide-ask-ai-drag-handle"),
    status: host.querySelector(".slide-ask-ai-status"),
    thread: host.querySelector(".slide-ask-ai-thread"),
    composer: host.querySelector(".slide-ask-ai-composer"),
    input: host.querySelector(".slide-ask-ai-input"),
    send: host.querySelector(".slide-ask-ai-send"),
  };

  elements.trigger.addEventListener("click", openPanelFromSelection);
  elements.handle.addEventListener("pointerdown", startPanelDrag);
  elements.send.addEventListener("click", submitFollowUp);
  elements.input.addEventListener("keydown", (event) => {
    const isComposing = event.isComposing || event.keyCode === 229;

    if (!isComposing && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitFollowUp();
    }
  });
  elements.input.addEventListener("input", () => {
    renderPanel();
  });

  return elements;
}

function autoResizeInput() {
  const ui = ensureUI();
}

function resetStreamState() {
  if (streamRenderFrame) {
    window.cancelAnimationFrame(streamRenderFrame);
  }

  if (streamPort) {
    try {
      streamPort.disconnect();
    } catch {}
  }

  streamQueue = "";
  streamReasoningQueue = "";
  streamRenderFrame = 0;
  streamMessageIndex = -1;
  streamPort = null;
  pendingStreamCompletion = null;
}

function finalizeStream() {
  if (streamMessageIndex >= 0 && state.messages[streamMessageIndex]) {
    state.messages[streamMessageIndex].streaming = false;
    state.messages[streamMessageIndex].reasoningStreaming = false;
  }

  state.loading = false;
  state.statusMessage = "";
  renderPanel();
  resetStreamState();
}

function syncStreamingMessageView() {
  const ui = ensureUI();
  const message = state.messages[streamMessageIndex];

  if (!message || streamMessageIndex < 0) {
    resetStreamState();
    return;
  }

  const body = ui.thread.querySelector(
    `.slide-ask-ai-message[data-message-index="${streamMessageIndex}"] .slide-ask-ai-message-body`,
  );

  if (!body) {
    renderPanel();
    return;
  }

  body.innerHTML = renderAssistantMessageBody(message);
  enhanceAssistantMarkdownTarget(body, message);
  const reasoningWindow = body.querySelector(".slide-ask-ai-reasoning-window");

  if (reasoningWindow) {
    reasoningWindow.scrollTop = reasoningWindow.scrollHeight;
  }

  ui.thread.scrollTop = ui.thread.scrollHeight;
}

function flushStreamQueue() {
  if (streamMessageIndex < 0 || !state.messages[streamMessageIndex]) {
    resetStreamState();
    return;
  }

  streamRenderFrame = 0;

  if (!streamQueue && !streamReasoningQueue) {
    if (pendingStreamCompletion) {
      finalizeStream();
    }

    return;
  }

  state.messages[streamMessageIndex].reasoning += streamReasoningQueue;
  state.messages[streamMessageIndex].content += streamQueue;
  streamReasoningQueue = "";
  streamQueue = "";
  syncStreamingMessageView();

  if (pendingStreamCompletion && !streamQueue && !streamReasoningQueue) {
    finalizeStream();
  }
}

function scheduleStreamFlush() {
  if (!streamRenderFrame) {
    streamRenderFrame = window.requestAnimationFrame(flushStreamQueue);
  }
}

function enqueueStreamDelta(delta) {
  if (!delta) {
    return;
  }

  streamQueue += delta;
  scheduleStreamFlush();
}

function enqueueStreamReasoningDelta(delta) {
  if (!delta) {
    return;
  }

  streamReasoningQueue += delta;
  scheduleStreamFlush();
}

function hideTrigger() {
  const ui = ensureUI();
  ui.trigger.classList.add("slide-ask-ai-hidden");
  ui.trigger.classList.remove("slide-ask-ai-trigger-active");
  triggerPointerNear = false;
  triggerAttentionVisible = false;

  if (triggerAttentionTimer) {
    window.clearTimeout(triggerAttentionTimer);
    triggerAttentionTimer = 0;
  }
}

function syncTriggerAppearance() {
  if (!elements) {
    return;
  }

  elements.trigger.classList.toggle(
    "slide-ask-ai-trigger-active",
    triggerPointerNear || triggerAttentionVisible,
  );
}

function pulseTriggerAttention() {
  triggerAttentionVisible = true;
  syncTriggerAppearance();

  if (triggerAttentionTimer) {
    window.clearTimeout(triggerAttentionTimer);
  }

  triggerAttentionTimer = window.setTimeout(() => {
    triggerAttentionVisible = false;
    triggerAttentionTimer = 0;
    syncTriggerAppearance();
  }, 1200);
}

function updateTriggerProximity(clientX, clientY) {
  if (!elements || elements.trigger.classList.contains("slide-ask-ai-hidden")) {
    if (triggerPointerNear) {
      triggerPointerNear = false;
      syncTriggerAppearance();
    }
    return;
  }

  const rect = elements.trigger.getBoundingClientRect();
  const dx = Math.max(rect.left - clientX, 0, clientX - rect.right);
  const dy = Math.max(rect.top - clientY, 0, clientY - rect.bottom);
  const nextValue = Math.hypot(dx, dy) <= 44;

  if (nextValue !== triggerPointerNear) {
    triggerPointerNear = nextValue;
    syncTriggerAppearance();
  }
}

function showTrigger(rect) {
  const ui = ensureUI();
  const top = clamp(rect.bottom + 4, 6, window.innerHeight - 20);
  const left = clamp(rect.right + 4, 6, window.innerWidth - 20);

  ui.trigger.style.top = `${top}px`;
  ui.trigger.style.left = `${left}px`;
  ui.trigger.classList.remove("slide-ask-ai-hidden");
  pulseTriggerAttention();
}

function clampPanelPosition(left, top, panelRect) {
  const viewportPadding = 12;
  const maxLeft = Math.max(
    viewportPadding,
    window.innerWidth - panelRect.width - viewportPadding,
  );
  const maxTop = Math.max(
    viewportPadding,
    window.innerHeight - panelRect.height - viewportPadding,
  );

  return {
    left: clamp(left, viewportPadding, maxLeft),
    top: clamp(top, viewportPadding, maxTop),
  };
}

function applyPanelPosition() {
  const ui = ensureUI();

  if (!state.panelPosition) {
    ui.panel.style.top = "";
    ui.panel.style.left = "";
    ui.panel.style.right = "";
    return;
  }

  const panelRect = ui.panel.getBoundingClientRect();
  const nextPosition = clampPanelPosition(
    state.panelPosition.left,
    state.panelPosition.top,
    panelRect,
  );

  state.panelPosition = nextPosition;
  ui.panel.style.top = `${nextPosition.top}px`;
  ui.panel.style.left = `${nextPosition.left}px`;
  ui.panel.style.right = "auto";
}

function stopPanelDrag() {
  if (!panelDrag || !elements) {
    return;
  }

  if (panelDrag.pointerId !== undefined) {
    try {
      elements.handle.releasePointerCapture(panelDrag.pointerId);
    } catch {}
  }

  elements.panel.classList.remove("slide-ask-ai-panel-dragging");
  panelDrag = null;
}

function startPanelDrag(event) {
  if (!elements || !state.panelOpen || event.button !== 0) {
    return;
  }

  const panelRect = elements.panel.getBoundingClientRect();
  panelDrag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - panelRect.left,
    offsetY: event.clientY - panelRect.top,
  };

  state.panelPosition = {
    left: panelRect.left,
    top: panelRect.top,
  };
  elements.panel.classList.add("slide-ask-ai-panel-dragging");

  try {
    elements.handle.setPointerCapture(event.pointerId);
  } catch {}

  event.preventDefault();
}

function dragPanel(event) {
  if (!panelDrag || !elements || !state.panelOpen) {
    return;
  }

  const panelRect = elements.panel.getBoundingClientRect();
  state.panelPosition = clampPanelPosition(
    event.clientX - panelDrag.offsetX,
    event.clientY - panelDrag.offsetY,
    panelRect,
  );
  applyPanelPosition();
}

function renderPanel() {
  const ui = ensureUI();

  ui.status.textContent = state.statusMessage;
  ui.status.classList.toggle("slide-ask-ai-hidden", !state.statusMessage);

  const visibleMessages = state.messages.filter((message) => !message.hidden);
  const hasAssistantResponse = visibleMessages.some(
    (message) =>
      message.role === "assistant" &&
      !message.streaming &&
      message.content.trim(),
  );

  ui.composer.classList.toggle("slide-ask-ai-hidden", !hasAssistantResponse);
  ui.input.disabled =
    state.loading ||
    !state.selectedText ||
    !hasAssistantResponse ||
    !state.extensionContextValid;
  ui.send.disabled =
    state.loading ||
    !state.selectedText ||
    !hasAssistantResponse ||
    !ui.input.value.trim() ||
    !state.extensionContextValid;

  if (hasAssistantResponse) {
    autoResizeInput();
  }

  if (visibleMessages.length > 0) {
    ui.thread.innerHTML = state.messages
      .map((message, index) =>
        message.hidden ? "" : renderChatMessage(message, index),
      )
      .join("");
    enhanceAssistantMarkdownThread(ui.thread, state.messages);
    ui.thread.classList.remove("slide-ask-ai-hidden");
  } else {
    ui.thread.innerHTML = "";
    ui.thread.classList.add("slide-ask-ai-hidden");
  }

  if (state.panelOpen) {
    ui.panel.classList.remove("slide-ask-ai-hidden");
    applyPanelPosition();
  } else {
    ui.panel.classList.add("slide-ask-ai-hidden");
  }

  if (state.panelOpen) {
    ui.input.placeholder = "继续追问...";
    ui.thread.scrollTop = ui.thread.scrollHeight;
  }
}

function updateStatus(message) {
  state.statusMessage = message;
  ensureUI().status.textContent = message;
}
