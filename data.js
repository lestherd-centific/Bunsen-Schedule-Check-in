/* ============================================================
   CENTIFIC MOD SCHEDULER — DATA LAYER
   ============================================================
   Every function below tries the configured Power Automate flow
   first. If a flow URL is blank (not set up yet), it silently
   falls back to a browser-local demo store, so the app is fully
   usable before Power Automate is connected.

   Data model: each mod is one row (name, email, and one time
   range per day of the week — "" means not scheduled that day).
   A mod can have at most one shift per day.
   ============================================================ */

const DataAPI = (() => {
  const cfg = window.APP_CONFIG;
  const DEMO_KEY = "centific_mod_scheduler_demo_v2";
  const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  function blankMod(name, email) {
    const m = { name, email: email || "" };
    DAY_KEYS.forEach(d => m[d] = "");
    return m;
  }

  function loadDemo() {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { mods: [], checkins: [] };
  }

  function saveDemo(store) {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }

  function isConfigured(url) {
    return typeof url === "string" && url.trim().length > 0;
  }

  // The edit-mode session token. It's the password itself (checked
  // against the single Excel "Password" value on every write), kept
  // only for the current browser tab — closing the tab requires
  // re-entering the password.
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
      if (result && result.ok) {
        setEditKey(password); // the password itself authorizes subsequent writes
        return true;
      }
      setEditKey("");
      return false;
    }
    // Demo mode only (no Excel/Power Automate connected yet) — see config.js.
    if (password === cfg.demoPassword) {
      setEditKey(password);
      return true;
    }
    setEditKey("");
    return false;
  }

  function exitEditMode() {
    setEditKey("");
  }

  // ---------------- MODS + AVAILABILITY ----------------

  async function getMods() {
    if (isConfigured(cfg.flows.getMods)) {
      return await callFlow(cfg.flows.getMods, {});
    }
    return loadDemo().mods;
  }

  async function addMod(name, email) {
    if (isConfigured(cfg.flows.addMod)) {
      return await callFlow(cfg.flows.addMod, { name, email });
    }
    const store = loadDemo();
    if (!store.mods.some(m => m.name.toLowerCase() === name.toLowerCase())) {
      store.mods.push(blankMod(name, email));
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
    saveDemo(store);
    return store.mods;
  }

  // day: "sun".."sat". start/end: "" (both) clears that day.
  async function setAvailability(name, day, start, end) {
    if (isConfigured(cfg.flows.setAvailability)) {
      return await callFlow(cfg.flows.setAvailability, { name, day, start, end });
    }
    const store = loadDemo();
    const mod = store.mods.find(m => m.name === name);
    if (mod) {
      mod[day] = (start && end) ? `${start}-${end}` : "";
      saveDemo(store);
    }
    return mod;
  }

  // Flattens each mod's day columns into shift-like objects the
  // calendar can render: { mod, email, day, start, end }. Computed
  // client-side — there's no separate "schedule" table anymore.
  function deriveShifts(mods) {
    const shifts = [];
    (mods || []).forEach(mod => {
      DAY_KEYS.forEach(day => {
        const val = mod[day];
        if (val && val.includes("-")) {
          const [start, end] = val.split("-");
          shifts.push({ mod: mod.name, email: mod.email, day, start, end });
        }
      });
    });
    return shifts;
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
    DAY_KEYS,
    getMods, addMod, deleteMod, setAvailability, deriveShifts,
    checkInOut, getCheckIns,
    verifyPassword, exitEditMode,
    isDemoMode, anyDemoMode,
  };
})();
