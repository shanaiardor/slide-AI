const HOST_ID = "slide-ask-ai-root";
const MAX_PREVIEW_LENGTH = 240;
const DEFAULT_OPENING_QUESTION = "请解释这段内容，并告诉我重点。";

const state = {
  selectedText: "",
  selectedRect: null,
  panelOpen: false,
  panelPosition: null,
  loading: false,
  messages: [],
  statusMessage: "",
  extensionContextValid: true,
};

let elements = null;
let selectionTimer = 0;
let streamQueue = "";
let streamTimer = 0;
let streamMessageIndex = -1;
let streamPort = null;
let pendingStreamCompletion = null;
let triggerAttentionTimer = 0;
let triggerAttentionVisible = false;
let triggerPointerNear = false;
let panelDrag = null;

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
    return ["http:", "https:", "mailto:"].includes(resolved.protocol)
      ? resolved.href
      : "#";
  } catch {
    return "#";
  }
}

function getPageContext() {
  return {
    title: String(document.title || "").trim(),
    url: window.location.href,
    language: String(
      document.documentElement?.lang || navigator.language || "",
    ).trim(),
  };
}

function isExtensionContextInvalidError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("Extension context invalidated");
}

function handleExtensionContextInvalidated() {
  state.extensionContextValid = false;
  state.loading = false;
  state.panelOpen = true;
  state.statusMessage = "扩展已更新，请刷新当前网页后再试。";
  hideTrigger();
  renderPanel();
}

function safeRuntimeConnect(name) {
  try {
    return chrome.runtime.connect({ name });
  } catch (error) {
    if (isExtensionContextInvalidError(error)) {
      handleExtensionContextInvalidated();
      return null;
    }

    throw error;
  }
}
