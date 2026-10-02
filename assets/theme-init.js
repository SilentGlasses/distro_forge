// Apply the saved theme before first paint to avoid a flash.
// Loaded as a classic, render-blocking <script> in <head> on purpose: it must
// run before the body is drawn. Kept in its own file so the CSP can forbid
// inline scripts.
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
})();
