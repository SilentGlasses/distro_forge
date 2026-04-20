import { distros } from "../assets/data/releases.js";
import { initUi } from "../assets/lib/ui.js";
import { build, isSupported, uniqueCategories } from "../assets/lib/third-party.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const form = $("#tp-form");
const distroSelect = $("#tp-distro");
const releaseSelect = $("#tp-release");
const search = $("#tp-search");
const list = $("#tp-list");
const resetBtn = $("#tp-reset");
const generateBtn = $("#tp-generate");
const errorEl = $("#tp-error");

const outputPanel = $("#tp-output-panel");
const outputFilename = $("#tp-output-filename");
const sourcesEl = $("#tp-output-sources");
const keysEl = $("#tp-output-keys");
const installEl = $("#tp-output-install");
const copySourcesBtn = $("#tp-copy-sources");
const copyKeysBtn = $("#tp-copy-keys");

// --- state --------------------------------------------------------------

let allRepos = [];        // every repo listed in repos.json
let enabledIds = new Set(); // IDs referenced by index.txt
let visibleRepos = [];    // repos after enabled-filter

// --- loading -----------------------------------------------------------

async function loadData() {
  const [reposRes, indexRes] = await Promise.all([
    fetch("../data/third-party/repos.json"),
    fetch("../data/third-party/index.txt"),
  ]);
  if (!reposRes.ok) throw new Error(`Failed to load repos.json (${reposRes.status}).`);
  if (!indexRes.ok) throw new Error(`Failed to load index.txt (${indexRes.status}).`);
  const repos = await reposRes.json();
  const indexText = await indexRes.text();
  const enabled = new Set(
    indexText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
  );
  allRepos = repos;
  enabledIds = enabled;
  visibleRepos = repos.filter((r) => enabled.has(r.id));
}

// --- rendering ---------------------------------------------------------

function renderReleases(distroKey) {
  releaseSelect.innerHTML = '<option value="" disabled selected hidden>—</option>';
  if (!distroKey) { releaseSelect.disabled = true; return; }
  for (const r of distros[distroKey].releases) {
    // Only offer releases where at least one repo declares support.
    const anySupport = visibleRepos.some((repo) => {
      const list = repo.supports?.[distroKey];
      return Array.isArray(list) && list.includes(r.codename);
    });
    if (!anySupport) continue;
    const opt = document.createElement("option");
    opt.value = r.codename;
    const versionLabel = r.version ? ` ${r.version}` : "";
    const lts = r.isLTS ? " LTS" : "";
    opt.textContent = `${r.codename}${versionLabel} \u2014 ${r.status}${lts}`;
    releaseSelect.appendChild(opt);
  }
  releaseSelect.disabled = false;
  releaseSelect.value = "";
}

function renderList() {
  const q = search.value.trim().toLowerCase();
  const distro = distroSelect.value;
  const codename = releaseSelect.value;

  const matchSearch = (r) => {
    if (!q) return true;
    const hay = `${r.name} ${r.description || ""} ${r.category || ""} ${r.id}`.toLowerCase();
    return hay.includes(q);
  };

  const cats = uniqueCategories(visibleRepos);
  list.innerHTML = "";
  let anyVisible = false;

  for (const cat of cats) {
    const members = visibleRepos
      .filter((r) => (r.category || "Other") === cat)
      .filter(matchSearch)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (members.length === 0) continue;

    const h = document.createElement("h3");
    h.className = "category-heading";
    h.textContent = cat;
    list.appendChild(h);

    const grid = document.createElement("div");
    grid.className = "card-grid";
    for (const r of members) {
      anyVisible = true;
      const card = document.createElement("label");
      card.className = "repo-card";
      const supported = distro && codename ? isSupported(r, distro, codename) : true;
      const checkboxId = `tp-${r.id}`;
      card.innerHTML = `
        <header>
          <h3>${escapeHtml(r.name)}</h3>
          <a href="${escapeAttr(r.homepage)}" rel="noopener" target="_blank">docs</a>
        </header>
        <p>${escapeHtml(r.description || "")}</p>
        <div class="meta">
          <span><code>${escapeHtml(r.id)}</code></span>
          <span>fp: <code>${escapeHtml(prettyFp(r.gpg.fingerprint))}</code></span>
        </div>
        <label class="check">
          <input type="checkbox" id="${checkboxId}" value="${escapeAttr(r.id)}"
                 ${supported ? "" : "disabled"} />
          <span>${supported ? "Include" : `Not available on ${distro || "this release"}`}</span>
        </label>
      `;
      grid.appendChild(card);
    }
    list.appendChild(grid);
  }

  if (!anyVisible) {
    const empty = document.createElement("p");
    empty.className = "empty-hits";
    empty.textContent = q
      ? `No repositories match \u201c${q}\u201d.`
      : "No repositories enabled. Edit data/third-party/index.txt to enable some.";
    list.appendChild(empty);
  }

  updateGenerateEnabled();
}

function prettyFp(fp) {
  return fp.replace(/\s+/g, "").match(/.{1,4}/g)?.join(" ") ?? fp;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// --- state helpers -----------------------------------------------------

function selectedRepoIds() {
  return $$("#tp-list input[type=checkbox]:checked:not(:disabled)").map((el) => el.value);
}

function updateGenerateEnabled() {
  const hasDistro = !!distroSelect.value;
  const hasRelease = !!releaseSelect.value;
  const hasAny = selectedRepoIds().length > 0;
  generateBtn.disabled = !(hasDistro && hasRelease && hasAny);
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}
function clearError() {
  errorEl.textContent = "";
  errorEl.hidden = true;
}

// --- events ------------------------------------------------------------

distroSelect.addEventListener("change", () => {
  renderReleases(distroSelect.value);
  renderList();
  clearError();
});
releaseSelect.addEventListener("change", () => { renderList(); clearError(); });
search.addEventListener("input", renderList);

list.addEventListener("change", (e) => {
  if (e.target && e.target.matches('input[type="checkbox"]')) {
    updateGenerateEnabled();
  }
});

resetBtn.addEventListener("click", () => {
  distroSelect.value = "";
  releaseSelect.disabled = true;
  releaseSelect.innerHTML = '<option value="" disabled selected hidden>—</option>';
  search.value = "";
  clearError();
  renderList();
  sourcesEl.textContent = "Pick a distribution and release, select one or more repos, then click Generate.";
  sourcesEl.classList.add("empty");
  keysEl.textContent = "Shell commands to install the signing keys will appear here.";
  keysEl.classList.add("empty");
  installEl.textContent = "Short guidance to drop the sources in place will appear here.";
  installEl.classList.add("empty");
  outputFilename.textContent = "third-party.sources";
  copySourcesBtn.disabled = true;
  copyKeysBtn.disabled = true;
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  clearError();
  try {
    const ids = new Set(selectedRepoIds());
    const selected = visibleRepos.filter((r) => ids.has(r.id));
    const out = build({
      repos: selected,
      distro: distroSelect.value,
      codename: releaseSelect.value,
    });
    outputFilename.textContent = out.filename;
    sourcesEl.textContent = out.sources;
    sourcesEl.classList.remove("empty");
    keysEl.textContent = out.keyInstall;
    keysEl.classList.remove("empty");
    installEl.textContent = out.install;
    installEl.classList.remove("empty");
    copySourcesBtn.disabled = false;
    copyKeysBtn.disabled = false;
    outputPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showError(err.message || String(err));
  }
});

function wireCopy(button, sourceEl) {
  button.addEventListener("click", async () => {
    const text = sourceEl.textContent;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const original = button.textContent;
      button.textContent = "Copied!";
      setTimeout(() => (button.textContent = original), 1500);
    } catch {
      // Fallback: select the pre.
      const range = document.createRange();
      range.selectNodeContents(sourceEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      button.textContent = "Select & copy manually";
    }
  });
}
wireCopy(copySourcesBtn, sourcesEl);
wireCopy(copyKeysBtn, keysEl);

// --- boot --------------------------------------------------------------

initUi();
loadData()
  .then(() => renderList())
  .catch((err) => {
    list.innerHTML = "";
    showError(err.message || String(err));
  });
