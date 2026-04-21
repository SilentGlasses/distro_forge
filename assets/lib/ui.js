// Cross-page UI helpers: theme toggle + active-nav highlighting.
// Each page loads this module once and calls initUi().

const THEME_KEY = "theme";

function storedTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function effectiveTheme() {
  const saved = storedTheme();
  if (saved) return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.querySelector("#theme-toggle");
  if (!btn) return;
  const isDark = theme === "dark";
  btn.setAttribute("aria-pressed", String(isDark));
  const icon = btn.querySelector(".theme-toggle-icon");
  const label = btn.querySelector(".theme-toggle-label");
  if (icon) icon.textContent = isDark ? "\u2600" : "\u263D";
  if (label) label.textContent = isDark ? "Light" : "Dark";
}

export function initThemeToggle() {
  applyTheme(effectiveTheme());
  const btn = document.querySelector("#theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const next = effectiveTheme() === "dark" ? "light" : "dark";
      try { localStorage.setItem(THEME_KEY, next); } catch {}
      applyTheme(next);
    });
  }
  // React to OS theme changes when the user hasn't expressed a preference.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!storedTheme()) applyTheme(e.matches ? "dark" : "light");
  });
}

// Compare a link's pathname to the current page's pathname, tolerating
// trailing slashes and `/index.html`.
function normalisePath(p) {
  return p.replace(/\/index\.html$/, "/").replace(/\/+$/, "/") || "/";
}

export function initActiveNav() {
  const here = normalisePath(location.pathname);
  for (const link of document.querySelectorAll(".site-nav a[href]")) {
    const linkPath = normalisePath(new URL(link.href, location.origin).pathname);
    if (
      linkPath === here ||
      (linkPath !== "/" && here.startsWith(linkPath))
    ) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }
}

export function initUi() {
  initThemeToggle();
  initActiveNav();
}
