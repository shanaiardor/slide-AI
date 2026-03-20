async function askAI(message, sender) {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const apiKey = (settings.apiKey || "").trim();
  const selectedText = trimSelection(message.selectedText);
  const conversationHistory = getEffectiveConversationHistory(message);

  if (!selectedText) {
    await appendDebugLog("warn", "validation_failed", {
      reason: "missing_selected_text"
    });
    throw new Error("没有检测到选中文本。");
  }

  if (!apiKey) {
    await appendDebugLog("warn", "validation_failed", {
      reason: "missing_api_key"
    });
    throw new Error("请先在插件弹窗中配置 API Key。");
  }

  const pageContext = resolvePageContext(message, sender);
  const systemPrompt = applySystemPromptVariables(
    (settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt).trim(),
    pageContext
  );
  const promptText = buildPromptText(selectedText, conversationHistory);
  const chatMessages = buildChatMessages(systemPrompt, selectedText, conversationHistory);
  const requestMode = settings.apiMode || DEFAULT_SETTINGS.apiMode;
  const modes =
    requestMode === "responses"
      ? ["responses"]
      : requestMode === "chat_completions"
        ? ["chat_completions"]
        : ["responses", "chat_completions"];

  const errors = [];
  let result = null;

  await appendDebugLog("info", "ask_ai_started", {
    apiBaseUrl: normalizeBaseUrl(settings.apiBaseUrl),
    apiKeyMasked: maskApiKey(apiKey),
    model: (settings.model || DEFAULT_SETTINGS.model).trim(),
    requestMode,
    reasoningEffort: isDoubaoSeedModel(settings.model) ? settings.reasoningEffort : null,
    selectedLength: selectedText.length,
    selectedPreview: previewText(selectedText),
    conversationLength: conversationHistory.length,
    lastTurnPreview: previewText(conversationHistory[conversationHistory.length - 1]?.content || ""),
    pageContext,
    systemPromptPreview: previewText(systemPrompt, 200)
  });

  for (const mode of modes) {
    const endpoint = resolveEndpoint(settings.apiBaseUrl, mode);

    try {
      await appendDebugLog("info", "request_attempt", {
        endpoint,
        mode
      });

      result =
        mode === "responses"
          ? await requestResponses(endpoint, settings, apiKey, systemPrompt, promptText)
          : await requestChatCompletions(endpoint, settings, apiKey, chatMessages);

      await appendDebugLog("info", "request_succeeded", {
        endpoint,
        mode,
        resolvedMode: result.endpointMode,
        answerLength: result.answer.length
      });

      break;
    } catch (error) {
      errors.push(error);

      await appendDebugLog("error", "request_failed", {
        endpoint,
        mode,
        status: error?.status || null,
        message: error instanceof Error ? error.message : "未知错误"
      });

      if (requestMode !== "auto") {
        throw error;
      }

      if (error?.status !== 404) {
        throw error;
      }

      await appendDebugLog("warn", "fallback_after_404", {
        failedMode: mode,
        nextMode: mode === "responses" ? "chat_completions" : null
      });
    }
  }

  if (!result) {
    throw errors[errors.length - 1] || new Error("AI 请求失败。");
  }

  return {
    answer: result.answer,
    model: (settings.model || DEFAULT_SETTINGS.model).trim(),
    endpointMode: result.endpointMode
  };
}

async function streamAskAI(message, port) {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const apiKey = (settings.apiKey || "").trim();
  const selectedText = trimSelection(message.selectedText);
  const conversationHistory = getEffectiveConversationHistory(message);

  if (!selectedText) {
    safePortPostMessage(port, {
      type: "error",
      error: "没有检测到选中文本。"
    });
    return;
  }

  if (!apiKey) {
    safePortPostMessage(port, {
      type: "error",
      error: "请先在插件弹窗中配置 API Key。"
    });
    return;
  }

  const pageContext = resolvePageContext(message, port?.sender);
  const systemPrompt = applySystemPromptVariables(
    (settings.systemPrompt || DEFAULT_SETTINGS.systemPrompt).trim(),
    pageContext
  );
  const promptText = buildPromptText(selectedText, conversationHistory);
  const chatMessages = buildChatMessages(systemPrompt, selectedText, conversationHistory);
  const requestMode = settings.apiMode || DEFAULT_SETTINGS.apiMode;
  const modes =
    requestMode === "responses"
      ? ["responses"]
      : requestMode === "chat_completions"
        ? ["chat_completions"]
        : ["chat_completions", "responses"];

  for (const mode of modes) {
    const endpoint = resolveEndpoint(settings.apiBaseUrl, mode);

    try {
      const result =
        mode === "chat_completions"
          ? await streamChatCompletions(endpoint, settings, apiKey, chatMessages, port)
          : await requestResponses(endpoint, settings, apiKey, systemPrompt, promptText);

      if (mode === "responses") {
        safePortPostMessage(port, {
          type: "chunk",
          delta: result.answer
        });
      }

      safePortPostMessage(port, {
        type: "done",
        answer: result.answer,
        endpointMode: result.endpointMode,
        model: (settings.model || DEFAULT_SETTINGS.model).trim()
      });
      return;
    } catch (error) {
      if (requestMode !== "auto" || error?.status !== 404) {
        safePortPostMessage(port, {
          type: "error",
          error: error instanceof Error ? error.message : "未知错误"
        });
        return;
      }
    }
  }

  safePortPostMessage(port, {
    type: "error",
    error: "AI 请求失败。"
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureDefaults();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureDefaults();
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ask-ai-stream") {
    return;
  }

  port.onMessage.addListener((message) => {
    if (message?.type !== "ASK_AI_STREAM") {
      return;
    }

    void streamAskAI(message, port);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_LAST_REQUEST_METRICS") {
    chrome.storage.local
      .get({ [LAST_REQUEST_METRICS_KEY]: null })
      .then((stored) => {
        sendResponse({ ok: true, metrics: stored[LAST_REQUEST_METRICS_KEY] });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "读取性能指标失败"
        });
      });

    return true;
  }

  if (message?.type === "GET_DEBUG_LOGS") {
    chrome.storage.local
      .get({ [DEBUG_LOGS_KEY]: [] })
      .then((stored) => {
        sendResponse({ ok: true, logs: stored[DEBUG_LOGS_KEY] || [] });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "读取调试日志失败"
        });
      });

    return true;
  }

  if (message?.type === "CLEAR_DEBUG_LOGS") {
    clearDebugLogs()
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "清空调试日志失败"
        });
      });

    return true;
  }

  if (message?.type !== "ASK_AI") {
    return;
  }

  askAI(message, sender)
    .then((result) => {
      sendResponse({ ok: true, ...result });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "未知错误"
      });
    });

  return true;
});
