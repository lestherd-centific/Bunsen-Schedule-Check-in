/* ============================================================
   CENTIFIC MOD SCHEDULER — light/dark theme toggle
   ============================================================
   Loaded first (before style.css finishes painting) so the
   correct data-theme attribute is set before first render —
   avoids a flash of the wrong theme.

   Remembers the user's explicit choice in localStorage. Until
   they choose, the app follows the browser/OS setting
   (prefers-color-scheme), same as before this feature existed.
   ============================================================ */

(function () {
  const KEY = "centific_theme"; // "light" | "dark" | (absent = follow system)

  function getStored() {
    try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }
  function setStored(theme) {
    try {
      if (theme) localStorage.setItem(KEY, theme);
      else localStorage.removeItem(KEY);
    } catch (e) { /* ignore */ }
  }
  function apply(theme) {
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  // Apply immediately, before the rest of the page renders.
  apply(getStored());

  window.ThemeToggle = {
    // Returns the theme actually in effect right now ("light" or "dark"),
    // resolving "follow system" down to a concrete value.
    current: function () {
      const stored = getStored();
      if (stored === "light" || stored === "dark") return stored;
      const systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      return systemDark ? "dark" : "light";
    },
    toggle: function () {
      const next = this.current() === "dark" ? "light" : "dark";
      apply(next);
      setStored(next);
      return next;
    },
  };
})();
