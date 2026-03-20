function openPanelFromSelection() {
  if (!state.selectedText || state.loading) {
    return;
  }

  if (!state.extensionContextValid) {
    handleExtensionContextInvalidated();
    return;
  }

  state.panelOpen = true;
  state.messages = [];
  state.statusMessage = "";
  hideTrigger();
  renderPanel();
  void startConversation();
}

function closePanel() {
  state.panelOpen = false;
  state.loading = false;
  state.messages = [];
  state.statusMessage = "";
  state.extensionContextValid = true;
  stopPanelDrag();
  resetStreamState();
  ensureUI().input.value = "";
  autoResizeInput();
  renderPanel();
}

async function submitQuestion() {
  if (!state.selectedText || state.loading || !state.extensionContextValid) {
    return;
  }

  state.loading = true;
  state.statusMessage = "";
  resetStreamState();
  state.messages.push({
    role: "assistant",
    content: "",
    streaming: true,
  });
  streamMessageIndex = state.messages.length - 1;
  renderPanel();

  try {
    streamPort = safeRuntimeConnect("ask-ai-stream");

    if (!streamPort) {
      return;
    }

    streamPort.onMessage.addListener((message) => {
      if (message?.type === "chunk") {
        enqueueStreamDelta(message.delta || "");
        return;
      }

      if (message?.type === "done") {
        pendingStreamCompletion = message;

        if (!streamQueue && !streamTimer) {
          finalizeStream();
        }

        return;
      }

      if (message?.type === "error") {
        if (
          streamMessageIndex >= 0 &&
          state.messages[streamMessageIndex]?.streaming
        ) {
          state.messages.splice(streamMessageIndex, 1);
        }

        resetStreamState();
        state.loading = false;
        updateStatus(message.error || "请求失败，请稍后重试。");
        renderPanel();
      }
    });

    streamPort.onDisconnect.addListener(() => {
      if (
        state.loading &&
        !pendingStreamCompletion &&
        state.extensionContextValid
      ) {
        if (
          streamMessageIndex >= 0 &&
          state.messages[streamMessageIndex]?.streaming
        ) {
          state.messages.splice(streamMessageIndex, 1);
        }

        resetStreamState();
        state.loading = false;
        updateStatus("连接已中断，请稍后重试。");
        renderPanel();
      }
    });

    streamPort.postMessage({
      type: "ASK_AI_STREAM",
      selectedText: state.selectedText,
      pageContext: getPageContext(),
      conversationHistory: state.messages
        .filter((message) => String(message.content || "").trim())
        .map(({ role, content }) => ({ role, content })),
    });
  } catch (error) {
    if (
      streamMessageIndex >= 0 &&
      state.messages[streamMessageIndex]?.streaming
    ) {
      state.messages.splice(streamMessageIndex, 1);
    }

    resetStreamState();
    state.loading = false;
    updateStatus(
      error instanceof Error ? error.message : "请求失败，请稍后重试。",
    );
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
      hidden: true,
    },
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
    content: followUp,
  });
  ui.input.value = "";
  autoResizeInput();
  renderPanel();
  await askSelectedText();
}

document.addEventListener("mouseup", scheduleSyncSelection, true);
document.addEventListener("keyup", scheduleSyncSelection, true);
document.addEventListener("selectionchange", scheduleSyncSelection, true);
window.addEventListener(
  "scroll",
  () => {
    if (!state.panelOpen) {
      hideTrigger();
    }
  },
  true,
);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.panelOpen) {
    closePanel();
  }
});

document.addEventListener(
  "pointermove",
  (event) => {
    updateTriggerProximity(event.clientX, event.clientY);
    dragPanel(event);
  },
  true,
);

document.addEventListener("pointerup", stopPanelDrag, true);
document.addEventListener("pointercancel", stopPanelDrag, true);
window.addEventListener("blur", stopPanelDrag);
window.addEventListener(
  "resize",
  () => {
    if (state.panelOpen && state.panelPosition) {
      applyPanelPosition();
    }
  },
  true,
);

document.addEventListener(
  "mousedown",
  (event) => {
    if (!state.panelOpen || !elements) {
      return;
    }

    const path = event.composedPath();

    if (!path.includes(elements.host)) {
      closePanel();
    }
  },
  true,
);

ensureUI();
