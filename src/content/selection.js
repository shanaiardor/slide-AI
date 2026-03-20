function getInputSelection() {
  const activeElement = document.activeElement;

  if (
    !activeElement ||
    !(
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement
    )
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
    rect: activeElement.getBoundingClientRect(),
  };
}

function hasVisibleRect(rect) {
  return Boolean(rect) && (rect.width !== 0 || rect.height !== 0);
}

function getSelectionFocusRect(selection) {
  if (!selection.focusNode) {
    return null;
  }

  try {
    const focusRange = document.createRange();
    focusRange.setStart(selection.focusNode, selection.focusOffset);
    focusRange.setEnd(selection.focusNode, selection.focusOffset);

    const rect = focusRange.getBoundingClientRect();
    return hasVisibleRect(rect) ? rect : null;
  } catch (error) {
    return null;
  }
}

function getTrailingSelectionRect(range) {
  const clientRects = Array.from(range.getClientRects()).filter(hasVisibleRect);

  if (clientRects.length === 0) {
    return null;
  }

  return clientRects.reduce((current, rect) => {
    if (!current) {
      return rect;
    }

    const isLaterLine = rect.bottom > current.bottom + 1;
    const isSameLine = Math.abs(rect.bottom - current.bottom) <= 1;

    if (isLaterLine || (isSameLine && rect.right > current.right)) {
      return rect;
    }

    return current;
  }, null);
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

  const range = selection.getRangeAt(0);
  const rect =
    getSelectionFocusRect(selection) ||
    getTrailingSelectionRect(range) ||
    range.getBoundingClientRect();

  if (!hasVisibleRect(rect)) {
    return null;
  }

  return { text, rect };
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
