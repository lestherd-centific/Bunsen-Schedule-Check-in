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

  // Tracks how many real (non-demo) flow calls are currently in flight, so
  // the loading overlay only hides once every concurrent/queued call has
  // actually finished — a plain boolean would hide it too early if two
  // calls overlap (e.g. a write immediately followed by a refresh read).
  let loadingCount = 0;
  function beginLoading(text) {
    loadingCount++;
    if (window.AppLoading) window.AppLoading.show(text);
  }
  function endLoading() {
    loadingCount = Math.max(0, loadingCount - 1);
    if (loadingCount === 0 && window.AppLoading) window.AppLoading.hide();
  }

  async function callFlow(url, payload, loadingText) {
    // Deliberately sent as text/plain with NO custom headers, instead of
    // Content-Type: application/json + an X-Edit-Key header. Either of
    // those forces the browser to send an invisible CORS "preflight"
    // check before the real request — and some Power Automate HTTP
    // trigger URLs (the newer environment.api.powerplatform.com ones)
    // don't answer that preflight correctly yet, silently blocking every
    // call. text/plain + no extra headers keeps this a CORS "simple
    // request," which skips preflight entirely. The body is still valid
    // JSON text underneath — flows read it with json(triggerBody()).
    // The edit key travels inside the body (editKey) rather than a
    // header, for the same reason.
    const body = Object.assign({}, payload || {}, { editKey: getEditKey() });
    beginLoading(loadingText);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Power Automate flow returned ${res.status}`);
      }
      const text = await res.text();
      if (!text) return null;
      try { return JSON.parse(text); } catch (e) { return text; }
    } finally {
      endLoading();
    }
  }

  // ---------------- EDIT MODE PASSWORD ----------------

  async function verifyPassword(password) {
    if (isConfigured(cfg.flows.verifyPassword)) {
      const result = await callFlow(cfg.flows.verifyPassword, { password }, "Checking password…");
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
      return await callFlow(cfg.flows.getMods, {}, "Loading schedule…");
    }
    return loadDemo().mods;
  }

  async function addMod(name, email) {
    if (isConfigured(cfg.flows.addMod)) {
      return await callFlow(cfg.flows.addMod, { name, email }, "Adding mod…");
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
      return await callFlow(cfg.flows.deleteMod, { name }, "Removing mod…");
    }
    const store = loadDemo();
    store.mods = store.mods.filter(m => m.name !== name);
    saveDemo(store);
    return store.mods;
  }

  // Renames a mod and/or updates their email. oldName identifies the
  // Excel row (Key Column); name/email are the new values.
  async function updateMod(oldName, name, email) {
    if (isConfigured(cfg.flows.updateMod)) {
      return await callFlow(cfg.flows.updateMod, { oldName, name, email }, "Saving mod…");
    }
    const store = loadDemo();
    const mod = store.mods.find(m => m.name === oldName);
    if (mod) {
      mod.name = name;
      mod.email = email;
      saveDemo(store);
    }
    return mod;
  }

  // day: "sun".."sat". start/end: "" (both) clears that day.
  async function setAvailability(name, day, start, end) {
    if (isConfigured(cfg.flows.setAvailability)) {
      const clearing = !start && !end;
      return await callFlow(cfg.flows.setAvailability, { name, day, start, end }, clearing ? "Deleting shift…" : "Saving shift…");
    }
    const store = loadDemo();
    const mod = store.mods.find(m => m.name === name);
    if (mod) {
      mod[day] = (start && end) ? `${start}-${end}` : "";
      saveDemo(store);
    }
    return mod;
  }

  // Cleans up a time fragment pulled out of the Excel cell into the exact
  // "HH:MM" (zero-padded, no stray whitespace) shape a native
  // <input type="time"> will accept. Excel cells are sometimes edited by
  // hand (e.g. "13:00 - 15:30" with a space around the dash, or "9:00"
  // without a leading zero) — the calendar math (hhmmToMinutes) is loose
  // enough to tolerate that, but the time-picker inputs are not: they
  // silently reject anything that isn't an exact match and just render
  // blank, which is why a shift can look right on the calendar block but
  // show an empty Start/End field once you click it.
  function normalizeTimeFragment(s) {
    if (!s) return "";
    const parts = s.trim().split(":");
    if (parts.length !== 2) return s.trim();
    const h = parts[0].trim().padStart(2, "0");
    const m = parts[1].trim().padStart(2, "0");
    return `${h}:${m}`;
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
          shifts.push({
            mod: mod.name,
            email: mod.email,
            day,
            start: normalizeTimeFragment(start),
            end: normalizeTimeFragment(end),
          });
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
      return await callFlow(cfg.flows.checkInOut, entry, action === "in" ? "Checking in…" : "Checking out…");
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
      all = await callFlow(cfg.flows.getCheckIns, email ? { email } : {}, "Loading activity…");
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
    getMods, addMod, deleteMod, updateMod, setAvailability, deriveShifts,
    checkInOut, getCheckIns,
    verifyPassword, exitEditMode,
    isDemoMode, anyDemoMode,
  };
})();
