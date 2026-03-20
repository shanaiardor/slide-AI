function normalizePromptVariableValue(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function resolvePageContext(message, sender) {
  const messageContext = message?.pageContext || {};
  const fallbackUrl = sender?.tab?.url || "";
  const fallbackTitle = sender?.tab?.title || "";
  const resolvedUrl = String(messageContext.url || fallbackUrl || "").trim();
  let parsedUrl = null;

  if (resolvedUrl) {
    try {
      parsedUrl = new URL(resolvedUrl);
    } catch (_error) {
      parsedUrl = null;
    }
  }

  return {
    title: normalizePromptVariableValue(messageContext.title || fallbackTitle),
    url: resolvedUrl,
    origin: parsedUrl?.origin || "",
    domain: parsedUrl?.hostname || "",
    pathname: parsedUrl?.pathname || "",
    language: normalizePromptVariableValue(messageContext.language || "")
  };
}

function applySystemPromptVariables(systemPrompt, pageContext, selectedText = "") {
  const variableValues = {
    title: pageContext.title,
    url: pageContext.url,
    origin: pageContext.origin,
    domain: pageContext.domain,
    pathname: pageContext.pathname,
    language: pageContext.language,
    selected_text: selectedText
  };

  return String(systemPrompt || "").replace(/\{([a-z_]+)\}/g, (match, key) =>
    SYSTEM_PROMPT_VARIABLES.includes(key) ? variableValues[key] || "" : match
  );
}

function trimSelection(text) {
  const normalized = (text || "").trim();
  return normalized.length > 12000 ? normalized.slice(0, 12000) : normalized;
}

function normalizeConversationHistory(conversationHistory) {
  if (!Array.isArray(conversationHistory)) {
    return [];
  }

  return conversationHistory
    .filter((message) => ["user", "assistant"].includes(message?.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").trim()
    }))
    .filter((message) => message.content);
}

function getEffectiveConversationHistory(message) {
  const history = normalizeConversationHistory(message.conversationHistory);

  if (history.length > 0) {
    return history;
  }

  const question = (message.question || "").trim() || "请解释这段内容，并告诉我重点。";
  return [
    {
      role: "user",
      content: question
    }
  ];
}

function buildPromptText(selectedText, conversationHistory) {
  const transcript = conversationHistory
    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
    .join("\n\n");

  return [
    "下面是我在网页中选中的内容：",
    selectedText,
    "",
    "请你始终围绕这段内容和下面的对话上下文回答。",
    "",
    transcript
  ].join("\n");
}

function buildChatMessages(systemPrompt, selectedText, conversationHistory) {
  return [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "system",
      content:
        "用户已经在网页中选中了一段内容。请始终围绕这段内容和后续追问来回答，不要脱离上下文。"
    },
    {
      role: "user",
      content: `选中文本：\n${selectedText}`
    },
    ...conversationHistory.map((message) => ({
      role: message.role,
      content: message.content
    }))
  ];
}
