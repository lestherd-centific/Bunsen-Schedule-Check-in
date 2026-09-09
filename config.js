/* ============================================================
   CENTIFIC MOD SCHEDULER — CONFIG
   ============================================================
   This is the ONLY file you should need to edit to connect the
   app to Power Automate + Excel, and to set your edit password.

   See SETUP-GUIDE.md for the full step-by-step walkthrough.
   ============================================================ */

window.APP_CONFIG = {

  // ----------------------------------------------------------
  // 1) POWER AUTOMATE FLOW URLS
  // ----------------------------------------------------------
  // Leave any of these as "" (empty string) and the app will
  // automatically fall back to DEMO MODE for that feature,
  // storing data in the browser only (not shared with the team).
  //
  // Paste the "HTTP POST URL" Power Automate gives you after you
  // save each flow. Instructions for building each flow are in
  // SETUP-GUIDE.md.
  flows: {
    getMods:        "",   // GET/POST -> returns [{ "name": "Alex" }, ...]
    addMod:         "",   // POST { name }
    deleteMod:      "",   // POST { name }

    getSchedule:    "",   // GET/POST -> returns [{ id, mod, day, start, end, notes }, ...]
    saveShift:      "",   // POST { id, mod, day, start, end, notes }  (id "" = new shift)
    deleteShift:    "",   // POST { id }

    checkInOut:     "",   // POST { email, action: "in" | "out" }
    getCheckIns:    "",   // GET/POST -> returns [{ email, action, timestampUtc }, ...]

    verifyPassword: "",   // POST { password } -> returns { ok: true, editKey: "..." } or { ok: false }
  },

  // ----------------------------------------------------------
  // 2) EDIT MODE PASSWORD
  // ----------------------------------------------------------
  // The real password now lives in Excel (a "Settings" table), not in this
  // file — see SETUP-GUIDE.md for the VerifyPassword flow. Only the people
  // you tell will know it, and you can change it any time by editing the
  // Excel cell, with no code changes needed.
  //
  // The value below is ONLY used before you've connected the verifyPassword
  // flow above (i.e. while flows.verifyPassword is still ""), so you can
  // try Edit Mode locally before Power Automate is wired up. It is NOT
  // secure and is never used once verifyPassword is configured.
  demoPassword: "centific123",

  // ----------------------------------------------------------
  // 4) DISPLAY OPTIONS
  // ----------------------------------------------------------
  timeZone: "America/Los_Angeles",   // Pacific Time (auto handles PST/PDT)
  slotMinutes: 30,                    // calendar snapping granularity
  weekStartsOn: "Sun",                // fixed: Sun -> Sat, 24 hours

  // Color palette cycled through for mod chips / shift blocks
  modColors: ["#5B2A8C", "#EC1E79", "#2563EB", "#0EA5A4", "#D97706", "#7C3AED", "#DB2777", "#059669"],
};
