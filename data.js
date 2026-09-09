/* ============================================================
   CENTIFIC MOD SCHEDULER — DATA LAYER
   ============================================================
   Every function below tries the configured Power Automate flow
   first. If a flow URL is blank (not set up yet), it silently
   falls back to a browser-local demo store, so the app is fully
   usable before Power Automate is connected.

   Once real flow URLs are set in config.js, data is shared with
   the whole team via Excel + Power Automate instead of being
   local to one browser.
   ============================================================ */

const DataAPI = (() => {
  const cfg = window.APP_CONFIG;
  const DEMO_KEY = "centific_mod_scheduler_demo_v1";

  function loadDemo() {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { mods: [], shifts: [], checkins: [] };
  }

  function saveDemo(store) {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }

  function uid() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function isConfigured(url) {
    return typeof url === "string" && url.trim().length > 0;
  }

  // The edit key is handed to us by the VerifyPassword flow after a
  // correct password (which lives in Excel, not in this code) is entered.
  // It's kept only for the current browser tab session — closing the tab
  // requires re-entering the password.
  const SESSION_KEY = "centific_edit_key";
  function getEditKey() {
    try { return sessionStorage.getItem(SESSION_KEY) || ""; } catch (e) { return ""; }
  }
  function setEditKey(key) {
    try {
      if (key) sessionStorage.setItem(SESSION_KEY, key);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
  }

  async function callFlow(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Edit-Key": getEditKey(),
      },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) {
      throw new Error(`Power Automate flow returned ${res.status}`);
    }
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return text; }
  }

  // ---------------- EDIT MODE PASSWORD ----------------

  async function verifyPassword(password) {
    if (isConfigured(cfg.flows.verifyPassword)) {
      const result = await callFlow(cfg.flows.verifyPassword, { password });
      if (result && result.ok && result.editKey) {
        setEditKey(result.editKey);
        return true;
      }
      setEditKey("");
      return false;
    }
    // Demo mode only (no Excel/Power Automate connected yet) — see config.js.
    if (password === cfg.demoPassword) {
      setEditKey("demo"); // harmless placeholder; demo writes never leave the browser
      return true;
    }
    setEditKey("");
    return false;
  }

  function exitEditMode() {
    setEditKey("");
  }

  // ---------------- MODS ----------------

  async function getMods() {
    if (isConfigured(cfg.flows.getMods)) {
      return await callFlow(cfg.flows.getMods, {});
    }
    return loadDemo().mods;
  }

  async function addMod(name) {
    if (isConfigured(cfg.flows.addMod)) {
      return await callFlow(cfg.flows.addMod, { name });
    }
    const store = loadDemo();
    if (!store.mods.some(m => m.name.toLowerCase() === name.toLowerCase())) {
      store.mods.push({ name });
      saveDemo(store);
    }
    return store.mods;
  }

  async function deleteMod(name) {
    if (isConfigured(cfg.flows.deleteMod)) {
      return await callFlow(cfg.flows.deleteMod, { name });
    }
    const store = loadDemo();
    store.mods = store.mods.filter(m => m.name !== name);
    store.shifts = store.shifts.filter(s => s.mod !== name);
    saveDemo(store);
    return store.mods;
  }

  // ---------------- SCHEDULE ----------------

  async function getSchedule() {
    if (isConfigured(cfg.flows.getSchedule)) {
      return await callFlow(cfg.flows.getSchedule, {});
    }
    return loadDemo().shifts;
  }

  async function saveShift(shift) {
    if (isConfigured(cfg.flows.saveShift)) {
      return await callFlow(cfg.flows.saveShift, shift);
    }
    const store = loadDemo();
    if (shift.id) {
      const idx = store.shifts.findIndex(s => s.id === shift.id);
      if (idx >= 0) store.shifts[idx] = shift;
      else store.shifts.push(shift);
    } else {
      shift.id = uid();
      store.shifts.push(shift);
    }
    saveDemo(store);
    return shift;
  }

  async function deleteShift(id) {
    if (isConfigured(cfg.flows.deleteShift)) {
      return await callFlow(cfg.flows.deleteShift, { id });
    }
    const store = loadDemo();
    store.shifts = store.shifts.filter(s => s.id !== id);
    saveDemo(store);
    return true;
  }

  // ---------------- CHECK IN / OUT ----------------

  async function checkInOut(email, action) {
    const entry = {
      email,
      action,
      timestampUtc: new Date().toISOString(),
    };
    if (isConfigured(cfg.flows.checkInOut)) {
      return await callFlow(cfg.flows.checkInOut, entry);
    }
    const store = loadDemo();
    store.checkins = store.checkins || [];
    store.checkins.push(entry);
    saveDemo(store);
    return entry;
  }

  async function getCheckIns(email) {
    let all;
    if (isConfigured(cfg.flows.getCheckIns)) {
      all = await callFlow(cfg.flows.getCheckIns, email ? { email } : {});
    } else {
      all = loadDemo().checkins || [];
    }
    if (email) {
      all = all.filter(c => (c.email || "").toLowerCase() === email.toLowerCase());
    }
    return all.sort((a, b) => new Date(b.timestampUtc) - new Date(a.timestampUtc));
  }

  // ---------------- MODE FLAGS ----------------

  function isDemoMode(flowKey) {
    return !isConfigured(cfg.flows[flowKey]);
  }

  function anyDemoMode() {
    return Object.values(cfg.flows).some(url => !isConfigured(url));
  }

  return {
    getMods, addMod, deleteMod,
    getSchedule, saveShift, deleteShift,
    checkInOut, getCheckIns,
    verifyPassword, exitEditMode,
    isDemoMode, anyDemoMode,
  };
})();
