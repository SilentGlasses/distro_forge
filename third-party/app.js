import { distros } from "../assets/data/releases.js";
import { initUi } from "../assets/lib/ui.js";
import { build, isSupported, uniqueCategories } from "../assets/lib/third-party.js";
import { renderInstructionContent } from "../assets/lib/instructions.js";
import { makePreCopyable } from "../assets/lib/copyable-code.js";

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
let installEl = $("#tp-output-install");
const INSTALL_PLACEHOLDER = "Short guidance to drop the sources in place will appear here.";

// --- state --------------------------------------------------------------

let allRepos = [];        // every repo listed in repos.json
let enabledIds = new Set(); // IDs referenced by index.txt
let visibleRepos = [];    // repos after enabled-filter
let openCategories = new Set();
let selectedRepoState = new Set();

const CATEGORY_ICONS = {
  Browsers: "🌐",
  "Dev tools": "🛠️",
  Databases: "🗄️",
  Monitoring: "📈",
  Communication: "💬",
  Desktop: "🖥️",
  Networking: "🔌",
  Security: "🛡️",
  "Security / privacy": "🔐",
  Other: "📦",
};

const REPO_BADGES = {
  "firefox-mozillateam": [
    "Firefox",
    "Beta",
    "Nightly",
    "ESR",
  ],
  "google-chrome": [
    "Stable",
    "Beta",
    "Unstable",
  ],
  "microsoft-edge": [
    "Stable",
    "Beta",
    "Dev",
  ],
};
const SOURCE_URL_OVERRIDES = {
  "firefox-mozillateam": "https://www.firefox.com/en-US/",
};

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
    const supportedCount = visibleRepos.filter((repo) => {
      const list = repo.supports?.[distroKey];
      return Array.isArray(list) && list.includes(r.codename);
    }).length;
    const opt = document.createElement("option");
    opt.value = r.codename;
    const versionLabel = r.version ? ` ${r.version}` : "";
    const lts = r.isLTS ? " LTS" : "";
    const supportNote = supportedCount > 0 ? "" : " (no listed repo support)";
    opt.textContent = `${r.codename}${versionLabel} — ${r.status}${lts}${supportNote}`;
    releaseSelect.appendChild(opt);
  }
  releaseSelect.disabled = false;
  releaseSelect.value = "";
}

function renderList() {
  const q = search.value.trim().toLowerCase();
  const distro = distroSelect.value;
  const codename = releaseSelect.value;
  if (!q) {
    openCategories = new Set(
      $$("#tp-list details.repo-section[open]")
        .map((el) => el.dataset.category || "")
        .filter(Boolean)
    );
  }

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
    const section = document.createElement("details");
    section.className = "repo-section";
    section.dataset.category = cat;
    section.open = q ? true : openCategories.has(cat);

    const summary = document.createElement("summary");
    summary.className = "repo-section-summary";
    summary.append(
      el("span", { className: "repo-section-icon", "aria-hidden": "true" }, categoryIcon(cat)),
      el("span", { className: "repo-section-title" }, cat),
      el("span", { className: "repo-section-count" }, `${members.length} repo${members.length === 1 ? "" : "s"}`),
    );
    section.appendChild(summary);

    const grid = document.createElement("div");
    grid.className = "card-grid";
    for (const r of members) {
      anyVisible = true;
      const card = document.createElement("article");
      card.className = "repo-card";
      const supported = distro && codename ? isSupported(r, distro, codename) : true;
      if (!supported) selectedRepoState.delete(r.id);
      const unavailable = unavailableLabel(distro, codename);
      const checkboxId = `tp-${r.id}`;
      const suiteValues = suitePills(r, distro, codename);
      const archValues = Array.isArray(r.architectures) && r.architectures.length
        ? r.architectures
        : ["all"];
      const selected = supported && selectedRepoState.has(r.id);
      const sourceHref = safeHttpsUrl(sourceUrl(r));

      const header = el("header", {},
        el("div", { className: "repo-title" }, el("h3", {}, r.name)),
      );
      if (sourceHref) {
        header.appendChild(el("a", {
          className: "repo-source", href: sourceHref, rel: "noopener", target: "_blank",
        }, "source"));
      }

      const checkbox = el("input", {
        type: "checkbox", id: checkboxId, value: r.id,
        disabled: !supported, checked: selected,
      });

      card.append(
        header,
        el("p", { className: "repo-summary" }, oneSentence(r.description || "")),
        repoField("Suite", el("div", { className: "repo-pill-row" }, ...renderPills(suiteValues))),
        repoField("Arch", el("div", { className: "repo-pill-row" }, ...renderPills(archValues))),
        repoField("Fingerprint", el("pre", { className: "repo-fingerprint" }, prettyFp(r.gpg.fingerprint))),
        el("label", { className: "check" },
          checkbox,
          el("span", {}, supported ? "Include repository" : `Unavailable for ${unavailable}`),
        ),
      );
      grid.appendChild(card);
    }
    section.appendChild(grid);
    list.appendChild(section);
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
function resolveTemplate(value, distro, codename) {
  return String(value || "")
    .replace(/\{distro\}/g, distro || "{distro}")
    .replace(/\{codename\}/g, codename || "{codename}");
}
function categoryIcon(category) {
  return CATEGORY_ICONS[category] || CATEGORY_ICONS.Other;
}
function sourceUrl(repo) {
  return SOURCE_URL_OVERRIDES[repo.id] || repo.homepage;
}
function oneSentence(text) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return "Repository packages for this app.";
  const match = compact.match(/^(.+?[.!?])(?:\s|$)/);
  return match ? match[1] : compact;
}
function suitePills(repo, distro, codename) {
  const badges = REPO_BADGES[repo.id];
  if (Array.isArray(badges) && badges.length > 0) {
    return badges;
  }
  const suite = resolveTemplate(repo.suite, distro, codename).trim();
  return suite.split(/\s+/).filter(Boolean);
}
function renderPills(values) {
  const pills = Array.isArray(values) ? values.filter(Boolean) : [];
  if (pills.length === 0) return [el("span", { className: "repo-pill" }, "—")];
  return pills.map((value) => el("span", { className: "repo-pill" }, value));
}
function repoField(label, valueNode) {
  return el("div", { className: "repo-field" },
    el("span", { className: "repo-field-label" }, label),
    valueNode,
  );
}

// Build an element without parsing HTML. Strings become text nodes, so data
// from repos.json or form controls can never be interpreted as markup.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key in node && !key.includes("-")) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}
// Only allow absolute https links; anything else (javascript:, data:, ...) is dropped.
function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function unavailableLabel(distro, codename) {
  if (distro && codename) return `${distro} ${codename}`;
  if (distro) return distro;
  return "this release";
}

// --- state helpers -----------------------------------------------------

function selectedRepoIds() {
  const distro = distroSelect.value;
  const codename = releaseSelect.value;
  return Array.from(selectedRepoState).filter((id) => {
    const repo = visibleRepos.find((r) => r.id === id);
    return !!repo && (!distro || !codename || isSupported(repo, distro, codename));
  });
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
    if (e.target.checked) selectedRepoState.add(e.target.value);
    else selectedRepoState.delete(e.target.value);
    updateGenerateEnabled();
  }
});
list.addEventListener("toggle", (e) => {
  if (!e.target || !e.target.matches || !e.target.matches("details.repo-section")) return;
  const category = e.target.dataset.category;
  if (!category) return;
  if (e.target.open) openCategories.add(category);
  else openCategories.delete(category);
}, true);

resetBtn.addEventListener("click", () => {
  distroSelect.value = "";
  releaseSelect.disabled = true;
  releaseSelect.innerHTML = '<option value="" disabled selected hidden>—</option>';
  search.value = "";
  selectedRepoState.clear();
  openCategories.clear();
  clearError();
  renderList();
  sourcesEl.textContent = "Pick a distribution and release, select one or more repos, then click Generate.";
  sourcesEl.classList.add("empty");
  keysEl.textContent = "Shell commands to install the signing keys will appear here.";
  keysEl.classList.add("empty");
  installEl = renderInstructionContent(installEl, "", INSTALL_PLACEHOLDER);
  outputFilename.textContent = "third-party.sources";
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
    installEl = renderInstructionContent(installEl, out.install, INSTALL_PLACEHOLDER);
    outputPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showError(err.message || String(err));
  }
});

// --- boot --------------------------------------------------------------

initUi();
installEl = renderInstructionContent(installEl, "", INSTALL_PLACEHOLDER);
makePreCopyable(sourcesEl);
makePreCopyable(keysEl);
loadData()
  .then(() => renderList())
  .catch((err) => {
    list.innerHTML = "";
    showError(err.message || String(err));
  });
