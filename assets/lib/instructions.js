// Lightweight renderer for install/help text that may contain fenced
// or indented command snippets.
import { makePreCopyable } from "./copyable-code.js";

function normaliseContainer(container) {
  if (!container) return null;
  if (container.tagName !== "PRE") return container;

  const replacement = document.createElement("div");
  replacement.id = container.id;
  replacement.className = container.className;
  replacement.classList.add("instructions-output");
  replacement.textContent = container.textContent;
  container.replaceWith(replacement);
  return replacement;
}

function parseBlocks(text) {
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Markdown-style fenced code block.
    if (line.trimStart().startsWith("```")) {
      i += 1; // skip opening fence
      const code = [];
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // skip closing fence when present
      blocks.push({ type: "code", text: code.join("\n").replace(/\n+$/g, "") });
      continue;
    }
    // Markdown-style bullet list.
    if (line.trimStart().startsWith("- ")) {
      const items = [];
      while (i < lines.length) {
        const current = lines[i];
        if (!current.trim()) {
          i += 1;
          break;
        }
        const trimmed = current.trimStart();
        if (!trimmed.startsWith("- ")) break;
        items.push(trimmed.slice(2).trim());
        i += 1;
      }
      if (items.length) {
        blocks.push({ type: "list", items });
      }
      continue;
    }

    // Plain indented shell snippet (e.g. "  sudo apt update").
    if (/^(?:\t| {2,})\S/.test(line)) {
      const code = [];
      while (i < lines.length) {
        const current = lines[i];
        if (!current.trim()) {
          code.push("");
          i += 1;
          continue;
        }
        if (/^(?:\t| {2,})\S/.test(current)) {
          code.push(current.replace(/^(?:\t| {2})/, ""));
          i += 1;
          continue;
        }
        break;
      }
      blocks.push({ type: "code", text: code.join("\n").replace(/\n+$/g, "") });
      continue;
    }

    // Paragraph text.
    const paragraph = [];
    while (i < lines.length) {
      const current = lines[i];
      if (!current.trim()) {
        i += 1;
        break;
      }
      const trimmed = current.trimStart();
      if (
        trimmed.startsWith("```") ||
        trimmed.startsWith("- ") ||
        /^(?:\t| {2,})\S/.test(current)
      ) {
        break;
      }
      paragraph.push(current.trim());
      i += 1;
    }

    const textValue = paragraph.join(" ").trim();
    if (textValue) {
      blocks.push({ type: "paragraph", text: textValue });
    }
  }

  return blocks;
}

function setPlaceholder(container, placeholder) {
  container.classList.add("empty");
  container.textContent = placeholder;
}
function appendInlineText(container, text) {
  const parts = String(text).split(/(`[^`]+`)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      const code = document.createElement("code");
      code.textContent = part.slice(1, -1);
      container.appendChild(code);
      continue;
    }
    container.appendChild(document.createTextNode(part));
  }
}

export function renderInstructionContent(container, text, placeholder) {
  const target = normaliseContainer(container);
  if (!target) return container;
  const value = String(text || "");
  if (!value.trim()) {
    setPlaceholder(target, placeholder);
    return target;
  }

  const blocks = parseBlocks(value);
  if (blocks.length === 0) {
    setPlaceholder(target, placeholder);
    return target;
  }

  target.classList.remove("empty");
  target.textContent = "";

  for (const block of blocks) {
    if (block.type === "code") {
      const pre = document.createElement("pre");
      pre.textContent = block.text;
      target.appendChild(makePreCopyable(pre));
      continue;
    }
    if (block.type === "list") {
      const ul = document.createElement("ul");
      for (const item of block.items) {
        const li = document.createElement("li");
        appendInlineText(li, item);
        ul.appendChild(li);
      }
      target.appendChild(ul);
      continue;
    }

    const p = document.createElement("p");
    appendInlineText(p, block.text);
    target.appendChild(p);
  }

  return target;
}
