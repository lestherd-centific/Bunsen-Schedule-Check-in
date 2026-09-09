/* ============================================================
   CENTIFIC MOD SCHEDULER — CONFIG
   ============================================================
   This is the ONLY file you should need to edit to connect the
   app to Power Automate + Excel.

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
    // Roster + weekly availability — one row per mod in Excel, with a
    // time range (or blank) in each day-of-week column.
    getMods:         "https://default9b415834803a4da0afdcfe6b1d52d6.49.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/06/workflows/c9a10af6d141423f9104150509e7b0e5/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=qpYkROwJd5DPd_9rARWyLQEvRbTqlHeO4BiGf4QhOPg",   // GET/POST -> [{ name, email, sun, mon, tue, wed, thu, fri, sat }, ...]
                            //   each day value is "" (off) or "HH:MM-HH:MM" (24hr, Pacific Time)
    addMod:          "",   // POST { name, email }
    deleteMod:       "",   // POST { name }
    setAvailability: "https://default9b415834803a4da0afdcfe6b1d52d6.49.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/05/workflows/c61e403d17c34ce5acd4cf8957633c67/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=VfYShrTm9txQ0R5NlMdhDFLzb9K6CnNHUh6ujQg9lr8",   // POST { name, day, start, end }  (day = "sun".."sat"; start/end "" clears that day)

    // Check-in / check-out log
    checkInOut:      "",   // POST { email, action: "in" | "out" }
    getCheckIns:     "",   // GET/POST -> [{ email, action, timestampUtc }, ...]

    // Edit-mode password (checked against the single value in the
    // Excel "Password" table — see SETUP-GUIDE.md)
    verifyPassword:  "https://default9b415834803a4da0afdcfe6b1d52d6.49.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/30/workflows/6a40663ceadc44a889e35db3218238f0/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=aRKBlIe7NSE-xGnLNvNPKKJ-F-KsCj4r2X-TeOruyHE",   // POST { password } -> { ok: true } or { ok: false }
  },

  // ----------------------------------------------------------
  // 2) EDIT MODE PASSWORD (demo mode only)
  // ----------------------------------------------------------
  // The real password lives in Excel (the "Password" table), not here —
  // see SETUP-GUIDE.md. The value below is ONLY used before you've
  // connected the verifyPassword flow above (i.e. while it's still ""),
  // so you can try Edit Mode locally before Power Automate is wired up.
  // It stops being used the moment verifyPassword is configured.
  demoPassword: "centific123",

  // ----------------------------------------------------------
  // 3) DISPLAY OPTIONS
  // ----------------------------------------------------------
  timeZone: "America/Los_Angeles",   // Pacific Time (auto handles PST/PDT)
  slotMinutes: 30,                    // calendar snapping granularity
  weekStartsOn: "Sun",                // fixed: Sun -> Sat, 24 hours

  // Hours outside this range are shown greyed-out on the calendar as
  // closed hours (still fully scheduleable — this is visual only).
  // 24-hour, e.g. 9 = 9 AM, 21 = 9 PM.
  openHour: 9,
  closeHour: 21,

  // Color palette cycled through for mod chips / shift blocks
  modColors: ["#5B2A8C", "#EC1E79", "#2563EB", "#0EA5A4", "#D97706", "#7C3AED", "#DB2777", "#059669"],
};
