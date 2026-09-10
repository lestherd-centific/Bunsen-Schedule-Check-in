/* ============================================================
   CENTIFIC MOD SCHEDULER — loading overlay
   ============================================================
   A small "Saving…" popup with an indeterminate progress bar,
   shown while a real Power Automate call is in flight (writes
   AND reads — anything that hits the network). data.js calls
   window.AppLoading.show()/.hide() around every real flow call;
   demo-mode (no flow configured) never touches this, since
   there's no network delay to explain.
   ============================================================ */

(function () {
  function overlayEl() { return document.getElementById("loadingOverlay"); }

  window.AppLoading = {
    show: function (text) {
      const overlay = overlayEl();
      if (!overlay) return;
      const label = overlay.querySelector(".loading-text");
      if (label) label.textContent = text || "Saving…";
      overlay.style.display = "flex";
    },
    hide: function () {
      const overlay = overlayEl();
      if (!overlay) return;
      overlay.style.display = "none";
    },
  };
})();
