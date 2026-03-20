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
      `<a href="${escapeAttribute(sanitizeUrl(url))}" target="_blank" rel="noreferrer noopener">${label}</a>`,
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  html = html.replace(/\n/g, "<br>");

  for (const [index, tokenHtml] of codeTokens.entries()) {
    html = html.replace(`__CODE_TOKEN_${index}__`, tokenHtml);
  }

  return html;
}

function renderReasoningRail(text, streaming = false) {
  const reasoning = String(text || "").trim();

  if (!reasoning) {
    return "";
  }

  return `
    <section class="slide-ask-ai-reasoning-shell ${streaming ? "slide-ask-ai-reasoning-shell-live" : ""}" aria-label="${streaming ? "AI 思考过程" : "AI 思考记录"}">
      <div class="slide-ask-ai-reasoning-head">
        <span class="slide-ask-ai-reasoning-dot"></span>
        <span class="slide-ask-ai-reasoning-label">${streaming ? "思考中" : "思考记录"}</span>
      </div>
      <div class="slide-ask-ai-reasoning-window">
        <div class="slide-ask-ai-reasoning-track">${escapeHtml(reasoning).replace(/\n/g, "<br>")}</div>
      </div>
    </section>
  `;
}

function renderStreamingPlaceholder(text, hasReasoning = false) {
  const content = String(text || "");

  if (!content && !hasReasoning) {
    return `
      <div class="slide-ask-ai-typing" aria-label="AI 正在生成">
        <span></span><span></span><span></span>
      </div>
    `;
  }

  if (!content) {
    return "";
  }

  return `<p>${escapeHtml(content).replace(/\n/g, "<br>")}</p>`;
}

function renderMarkdownTarget(message) {
  const fallback = message.streaming
    ? renderStreamingPlaceholder(message.content, Boolean(message.reasoning))
    : `<p>${escapeHtml(message.content).replace(/\n/g, "<br>")}</p>`;

  return `
    <div class="slide-ask-ai-markdown-target" data-markdown-target="assistant">
      ${fallback}
    </div>
  `;
}

function renderAssistantMessageBody(message) {
  const reasoningRail = renderReasoningRail(
    message.reasoning,
    Boolean(message.reasoningStreaming),
  );

  return `${reasoningRail}${renderMarkdownTarget(message)}`;
}

function renderChatMessage(message, messageIndex = null) {
  const role = message.role === "user" ? "user" : "assistant";
  const messageIndexAttr =
    typeof messageIndex === "number"
      ? ` data-message-index="${messageIndex}"`
      : "";
  const body =
    role === "assistant"
      ? renderAssistantMessageBody(message)
      : `<p>${renderInlineMarkdown(message.content)}</p>`;

  return `
    <article class="slide-ask-ai-message slide-ask-ai-message-${role} ${message.streaming ? "slide-ask-ai-message-streaming" : ""}"${messageIndexAttr}>
      <div class="slide-ask-ai-message-body">${body}</div>
    </article>
  `;
}

function getMarkdownRuntime() {
  if (globalThis.__slideAskAiMarkdownRuntimePromise) {
    return globalThis.__slideAskAiMarkdownRuntimePromise;
  }

  globalThis.__slideAskAiMarkdownRuntimePromise = import(
    chrome.runtime.getURL("src/content/markdown-runtime.bundle.js")
  ).then((module) => {
    const runtime = module.default || module;
    if (typeof runtime?.warmup === "function") {
      void runtime.warmup().catch(() => {});
    }
    return runtime;
  }).catch((error) => {
    console.error("Slide Ask AI markdown runtime load failed", error);
    throw error;
  });

  return globalThis.__slideAskAiMarkdownRuntimePromise;
}

function enhanceAssistantMarkdownTarget(container, message) {
  const target = container?.querySelector?.(".slide-ask-ai-markdown-target");

  if (!target) {
    return;
  }

  if (!String(message?.content || "").trim()) {
    return;
  }

  target.dataset.markdownRuntime = "loading";

  void getMarkdownRuntime()
    .then((runtime) => {
      target.dataset.markdownRuntime = "ready";
      return runtime.renderInto(target, message.content);
    })
    .catch((error) => {
      target.dataset.markdownRuntime = "error";
      console.error("Slide Ask AI markdown render failed", error);
    });
}

function enhanceAssistantMarkdownThread(threadElement, messages) {
  if (!threadElement || !Array.isArray(messages)) {
    return;
  }

  const articles = Array.from(
    threadElement.querySelectorAll(".slide-ask-ai-message[data-message-index]"),
  );

  articles.forEach((article) => {
    const index = Number(article.getAttribute("data-message-index"));

    if (!Number.isFinite(index)) {
      return;
    }

    const message = messages[index];

    if (!message || message.hidden || message.role !== "assistant") {
      return;
    }

    enhanceAssistantMarkdownTarget(article, message);
  });
}
