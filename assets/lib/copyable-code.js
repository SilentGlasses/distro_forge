const COPY_ICON_SVG = `
<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
  <rect x="6" y="2" width="8" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"></rect>
  <rect x="2" y="6" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"></rect>
</svg>
`.trim();

const COPY_LABEL = "Copy code";
const COPIED_LABEL = "Copied";

function fallbackSelect(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function makePreCopyable(pre) {
  if (!pre || pre.tagName !== "PRE") return null;
  if (pre.parentElement && pre.parentElement.classList.contains("copyable-pre")) {
    return pre.parentElement;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "copyable-pre";

  if (pre.parentNode) pre.replaceWith(wrapper);
  wrapper.appendChild(pre);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "code-copy-btn";
  button.setAttribute("aria-label", COPY_LABEL);
  button.innerHTML = COPY_ICON_SVG;
  wrapper.appendChild(button);

  button.addEventListener("click", async () => {
    const text = pre.textContent || "";
    if (!text.trim()) return;

    const copied = await writeClipboard(text);
    if (!copied) fallbackSelect(pre);

    button.classList.add("copied");
    button.setAttribute("aria-label", COPIED_LABEL);
    clearTimeout(button.__copyTimer);
    button.__copyTimer = setTimeout(() => {
      button.classList.remove("copied");
      button.setAttribute("aria-label", COPY_LABEL);
    }, 1500);
  });

  return wrapper;
}
