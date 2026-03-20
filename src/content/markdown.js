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

function renderStreamingAssistantBody(text, hasReasoning = false) {
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

function renderMarkdown(markdown) {
  const lines = String(markdown || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
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
        `<pre><code class="language-${escapeAttribute(language)}">${escapeHtml(codeLines.join("\n"))}</code></pre>`,
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

      blocks.push(
        `<blockquote>${renderInlineMarkdown(quoteLines.join("\n"))}</blockquote>`,
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];

      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ""));
        index += 1;
      }

      blocks.push(
        `<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`,
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
        `<ol>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ol>`,
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

function renderAssistantMessageBody(message) {
  const reasoningRail = renderReasoningRail(
    message.reasoning,
    Boolean(message.reasoningStreaming),
  );

  if (message.streaming) {
    return `${reasoningRail}${renderStreamingAssistantBody(message.content, Boolean(message.reasoning))}`;
  }

  return `${reasoningRail}${renderMarkdown(message.content)}`;
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
