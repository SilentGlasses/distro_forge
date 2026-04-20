import { distros, architectures, mirrors } from "./data/releases.js";
import { generate } from "./lib/generate.js";
import { initUi } from "./lib/ui.js";
import { debianMirrorList, ubuntuMirrorList, groupByCountry } from "./data/mirrors-list.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const form = $("#gen-form");
const distroSelect = $("#distro");
const releaseSelect = $("#release");
const formatSelect = $("#format");
const mirrorSelect = $("#mirror");
const archSelect = $("#arch");
const releaseNote = $("#release-note");
const componentsList = $("#components-list");
const errorEl = $("#form-error");
const outputPanel = $("#output-panel");
const outputEl = $("#output");
const outputFilename = $("#output-filename");
const instructionsEl = $("#instructions");
const copyBtn = $("#copy-btn");
const generateBtn = form.querySelector('button[type="submit"]');
const resetBtn = $("#reset-btn");

const suiteLabels = {
  release: $("#suite-release-name"),
  updates: $("#suite-updates-name"),
  backports: $("#suite-backports-name"),
  security: $("#suite-security-name"),
};

const releaseCheckbox = form.querySelector('input[name="suite-release"]');
const updatesCheckbox = form.querySelector('input[name="suite-updates"]');
const backportsCheckbox = form.querySelector('input[name="suite-backports"]');
const securityCheckbox = form.querySelector('input[name="suite-security"]');
const suiteCheckboxes = [releaseCheckbox, updatesCheckbox, backportsCheckbox, securityCheckbox];

const COMPONENTS_EMPTY_HTML =
  '<p class="check-empty">Pick a distribution to see components.</p>';

// --- rendering -----------------------------------------------------------

function renderArchitectures() {
  // Keep the placeholder, append the full list. No option is pre-selected.
  archSelect.innerHTML = '<option value="" disabled selected hidden>\u2014</option>';
  for (const a of architectures) {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = a.label;
    archSelect.appendChild(opt);
  }
}

function renderMirrors(distroKey) {
  mirrorSelect.innerHTML = '<option value="" disabled selected hidden>\u2014</option>';
  if (!distroKey) return;
  const defaultUrl = mirrors[distroKey].primary;
  const defaultHost = new URL(defaultUrl).host;
  const list = distroKey === "debian" ? debianMirrorList : ubuntuMirrorList;

  const cdn = document.createElement("option");
  cdn.value = defaultUrl;
  cdn.textContent = `Default CDN (${defaultHost})`;
  mirrorSelect.appendChild(cdn);

  for (const group of groupByCountry(list)) {
    const og = document.createElement("optgroup");
    og.label = group.label;
    for (const m of group.mirrors) {
      const opt = document.createElement("option");
      opt.value = m.url;
      opt.textContent = m.name;
      og.appendChild(opt);
    }
    mirrorSelect.appendChild(og);
  }
}

function renderComponents(distroKey) {
  componentsList.innerHTML = "";
  if (!distroKey) {
    componentsList.innerHTML = COMPONENTS_EMPTY_HTML;
    return;
  }
  const distro = distros[distroKey];
  for (const c of distro.components) {
    const id = `comp-${c}`;
    const wrap = document.createElement("label");
    wrap.className = "check";
    wrap.innerHTML = `
      <input type="checkbox" id="${id}" name="component" value="${c}" />
      <span><code>${c}</code></span>
    `;
    componentsList.appendChild(wrap);
  }
}

function renderReleases(distroKey) {
  releaseSelect.innerHTML = '<option value="" disabled selected hidden>Select\u2026</option>';
  if (!distroKey) return;
  const distro = distros[distroKey];
  for (const r of distro.releases) {
    const opt = document.createElement("option");
    const versionLabel = r.version ? ` ${r.version}` : "";
    const lts = r.isLTS ? " LTS" : "";
    opt.value = r.codename;
    opt.textContent = `${r.codename}${versionLabel} \u2014 ${r.status}${lts}`;
    releaseSelect.appendChild(opt);
  }
}

// --- state helpers -------------------------------------------------------

function currentDistroKey() {
  return distroSelect.value || "";
}

function currentRelease() {
  const key = currentDistroKey();
  if (!key || !releaseSelect.value) return null;
  const distro = distros[key];
  return distro.releases.find((r) => r.codename === releaseSelect.value) || null;
}

function clearSuiteCodenames() {
  suiteLabels.release.textContent = "";
  suiteLabels.updates.textContent = "";
  suiteLabels.backports.textContent = "";
  suiteLabels.security.textContent = "";
}

function disableSuites(all = true) {
  for (const el of suiteCheckboxes) {
    el.disabled = all;
    if (all) el.checked = false;
  }
}

function updateReleaseNote() {
  const r = currentRelease();
  if (!r) { releaseNote.textContent = ""; releaseNote.hidden = true; return; }
  let note = "";
  if (r.status === "unstable") {
    note = "sid has no -updates, -backports or -security suites; only the base suite applies.";
  } else if (r.status === "testing") {
    note = "Testing releases receive rolling changes and limited security support.";
  } else if (r.status === "oldstable") {
    note = "oldstable receives only LTS-style security updates via the normal security suite.";
  }
  releaseNote.textContent = note;
  releaseNote.hidden = !note;
}

function applyReleaseSelection() {
  const r = currentRelease();
  if (!r) {
    clearSuiteCodenames();
    disableSuites(true);
    updateReleaseNote();
    return;
  }
  const distroKey = currentDistroKey();

  // Update the codename chips next to each suite checkbox.
  suiteLabels.release.textContent = r.codename;
  suiteLabels.updates.textContent = `${r.codename}-updates`;
  suiteLabels.backports.textContent = `${r.codename}-backports`;
  suiteLabels.security.textContent =
    distroKey === "debian"
      ? (r.securitySuite || "")
      : `${r.codename}-security`;

  // Enable suites the release actually supports. Leave them unchecked so the
  // user has to make an explicit choice (no default-on here).
  const unstable = r.status === "unstable";
  releaseCheckbox.disabled = false;
  updatesCheckbox.disabled = unstable;
  securityCheckbox.disabled = unstable || !suiteLabels.security.textContent;
  backportsCheckbox.disabled = unstable || r.hasBackports === false;

  // If a previously-checked suite is now invalid, drop it.
  for (const el of suiteCheckboxes) if (el.disabled) el.checked = false;

  updateReleaseNote();
}

function applyDistroSelection(distroKey) {
  if (distroKey) {
    document.body.dataset.distro = distroKey;
  } else {
    delete document.body.dataset.distro;
  }

  // Populate / reset every downstream field. Nothing is pre-selected.
  renderReleases(distroKey);
  renderMirrors(distroKey);
  renderComponents(distroKey);
  clearSuiteCodenames();
  disableSuites(true);

  // Enable or disable downstream selects based on whether distro is picked.
  const hasDistro = !!distroKey;
  releaseSelect.disabled = !hasDistro;
  formatSelect.disabled = !hasDistro;
  mirrorSelect.disabled = !hasDistro;
  archSelect.disabled = !hasDistro;

  // Reset their values to the placeholder.
  releaseSelect.value = "";
  formatSelect.value = "";
  mirrorSelect.value = "";
  archSelect.value = "";

  updateReleaseNote();
}

// --- form collection ------------------------------------------------------

function selectedComponents() {
  return $$('#components-list input[name="component"]:checked').map((el) => el.value);
}

function collectConfig() {
  const distroKey = currentDistroKey();
  const defaultUrl = distroKey ? mirrors[distroKey].primary : "";
  const selectedMirror = mirrorSelect.value;
  // Treat "Default CDN" as no override so generator logic stays unchanged.
  const primaryMirror = selectedMirror && selectedMirror !== defaultUrl ? selectedMirror : "";

  return {
    distro: distroKey,
    release: currentRelease(),
    format: formatSelect.value,
    architectures: [archSelect.value],
    components: selectedComponents(),
    suites: {
      release: releaseCheckbox.checked && !releaseCheckbox.disabled,
      updates: updatesCheckbox.checked && !updatesCheckbox.disabled,
      backports: backportsCheckbox.checked && !backportsCheckbox.disabled,
      security: securityCheckbox.checked && !securityCheckbox.disabled,
    },
    includeSrc: false,
    primaryMirror,
    securityMirror: "",
  };
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.textContent = "";
  errorEl.hidden = true;
}

function updateGenerateEnabled() {
  const hasAllDropdowns =
    !!distroSelect.value &&
    !!releaseSelect.value &&
    !!formatSelect.value &&
    !!mirrorSelect.value &&
    !!archSelect.value;
  const hasComponent = selectedComponents().length > 0;
  const hasSuite = suiteCheckboxes.some((el) => el.checked && !el.disabled);
  generateBtn.disabled = !(hasAllDropdowns && hasComponent && hasSuite);
}

// --- event wiring ---------------------------------------------------------

distroSelect.addEventListener("change", () => {
  applyDistroSelection(distroSelect.value);
  clearError();
  updateGenerateEnabled();
});

releaseSelect.addEventListener("change", () => {
  applyReleaseSelection();
  updateGenerateEnabled();
});

// Any other form input change (format, arch, component, suite) just revalidates.
form.addEventListener("change", (e) => {
  if (e.target === distroSelect || e.target === releaseSelect) return;
  updateGenerateEnabled();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  clearError();
  try {
    const cfg = collectConfig();
    const { filename, contents, instructions } = generate(cfg);
    outputFilename.textContent = filename;
    outputEl.textContent = contents;
    outputEl.classList.remove("empty");
    instructionsEl.textContent = instructions;
    instructionsEl.classList.remove("empty");
    copyBtn.disabled = false;
    outputPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showError(err.message || String(err));
  }
});

function resetAll() {
  // Wipe every form selection back to the initial empty state.
  distroSelect.value = "";
  applyDistroSelection("");
  mirrorSelect.value = "";
  clearError();

  // Reset the output panel to its placeholder state.
  outputFilename.textContent = "sources.list";
  outputEl.textContent =
    "Fill out the form above and click Generate to produce your sources file.";
  outputEl.classList.add("empty");
  instructionsEl.textContent = "Instructions will appear here once you generate a file.";
  instructionsEl.classList.add("empty");
  copyBtn.disabled = true;
  copyBtn.textContent = "Copy";

  updateGenerateEnabled();
  distroSelect.focus();
}

resetBtn.addEventListener("click", resetAll);

copyBtn.addEventListener("click", async () => {
  const text = outputEl.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const original = copyBtn.textContent;
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = original), 1500);
  } catch {
    // Fallback: select the pre so the user can Ctrl-C manually.
    const range = document.createRange();
    range.selectNodeContents(outputEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    copyBtn.textContent = "Select & copy manually";
  }
});

// --- boot -----------------------------------------------------------------

initUi();                    // shared theme toggle + active-nav highlighting
renderArchitectures();
applyDistroSelection("");    // initial empty state — no defaults picked
updateGenerateEnabled();
