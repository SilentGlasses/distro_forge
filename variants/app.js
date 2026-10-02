import { variants } from "../assets/data/variants.js";
import { initUi } from "../assets/lib/ui.js";
import { build } from "../assets/lib/variant.js";
import { renderInstructionContent } from "../assets/lib/instructions.js";
import { makePreCopyable } from "../assets/lib/copyable-code.js";

const $ = (s) => document.querySelector(s);

const form = $("#v-form");
const variantSelect = $("#v-variant");
const releaseSelect = $("#v-release");
const infoEl = $("#v-info");
const resetBtn = $("#v-reset");
const generateBtn = $("#v-generate");
const errorEl = $("#v-error");

const outputPanel = $("#v-output-panel");
const outputFilename = $("#v-output-filename");
const outputEl = $("#v-output");
let installEl = $("#v-install");
const INSTALL_PLACEHOLDER = "Installation steps will appear here after generation.";

function renderVariants() {
  // Group by family for readability.
  const byFamily = new Map();
  for (const v of variants) {
    const key = v.family === "ubuntu" ? "Ubuntu-derived" : "Debian-derived";
    if (!byFamily.has(key)) byFamily.set(key, []);
    byFamily.get(key).push(v);
  }
  for (const [label, list] of byFamily.entries()) {
    const og = document.createElement("optgroup");
    og.label = label;
    for (const v of list.sort((a, b) => a.name.localeCompare(b.name))) {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.name;
      og.appendChild(opt);
    }
    variantSelect.appendChild(og);
  }
}

function currentVariant() {
  return variants.find((v) => v.id === variantSelect.value) || null;
}

function currentRelease() {
  const v = currentVariant();
  if (!v) return null;
  return v.releases.find((r) => r.codename === releaseSelect.value) || null;
}

function renderReleases() {
  releaseSelect.innerHTML = '<option value="" disabled selected hidden>—</option>';
  const v = currentVariant();
  if (!v) { releaseSelect.disabled = true; return; }
  for (const r of v.releases) {
    const opt = document.createElement("option");
    opt.value = r.codename;
    opt.textContent = r.label || r.codename;
    releaseSelect.appendChild(opt);
  }
  releaseSelect.disabled = false;
  releaseSelect.value = "";
}

function updateInfo() {
  const v = currentVariant();
  if (!v) { infoEl.hidden = true; return; }
  infoEl.textContent = `${v.description} `;
  const href = safeHttpsUrl(v.homepage);
  if (href) {
    const link = document.createElement("a");
    link.href = href;
    link.rel = "noopener";
    link.target = "_blank";
    link.textContent = "upstream docs";
    infoEl.appendChild(link);
  }
  infoEl.hidden = false;
}

function updateGenerateEnabled() {
  generateBtn.disabled = !(variantSelect.value && releaseSelect.value);
}

function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }
function clearError() { errorEl.textContent = ""; errorEl.hidden = true; }

// Only allow absolute https links; anything else (javascript:, data:, ...) is dropped.
function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

variantSelect.addEventListener("change", () => {
  renderReleases();
  updateInfo();
  clearError();
  updateGenerateEnabled();
});
releaseSelect.addEventListener("change", () => {
  clearError();
  updateGenerateEnabled();
});

resetBtn.addEventListener("click", () => {
  variantSelect.value = "";
  renderReleases();
  updateInfo();
  clearError();
  updateGenerateEnabled();
  outputFilename.textContent = "variant.sources";
  outputEl.textContent = "Pick a variant and release, then click Generate.";
  outputEl.classList.add("empty");
  installEl = renderInstructionContent(installEl, "", INSTALL_PLACEHOLDER);
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  clearError();
  try {
    const { filename, contents, install } = build({
      variant: currentVariant(),
      release: currentRelease(),
    });
    outputFilename.textContent = filename;
    outputEl.textContent = contents;
    outputEl.classList.remove("empty");
    installEl = renderInstructionContent(installEl, install, INSTALL_PLACEHOLDER);
    outputPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showError(err.message || String(err));
  }
});

// Boot
initUi();
renderVariants();
updateGenerateEnabled();
installEl = renderInstructionContent(installEl, "", INSTALL_PLACEHOLDER);
makePreCopyable(outputEl);
