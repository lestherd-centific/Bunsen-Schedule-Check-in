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
    // Roster — one row per mod (Name, Email only). Stable no matter what
    // happens to their schedule across weeks.
    //
    // MIGRATION NOTE: this URL was previously wired to a flow that also
    // returned Sun..Sat day columns. Per SETUP-GUIDE.md Part 1/2, that data
    // has moved to its own Availability table + the new getAvailability
    // flow below — simplify this flow's Select mapping down to just
    // name/email. Until you do, the app will still treat its response as
    // the roster fine (name/email are still in there), it'll just ignore
    // the extra day columns.
    getMods:         "https://default9b415834803a4da0afdcfe6b1d52d6.49.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/06/workflows/c9a10af6d141423f9104150509e7b0e5/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=qpYkROwJd5DPd_9rARWyLQEvRbTqlHeO4BiGf4QhOPg",   // GET/POST -> [{ name, email }, ...]
    addMod:          "",   // POST { name, email }
    deleteMod:       "",   // POST { name }
    updateMod:       "",   // POST { oldName, name, email } -> renames a mod and/or updates their email

    // Availability — one row per (mod, week). NEW flow, see SETUP-GUIDE.md.
    getAvailability: "https://default9b415834803a4da0afdcfe6b1d52d6.49.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/09/workflows/b3545db3c5d940e0886bd74c320ae887/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=o-749CDBstC1pZ7FT-znJu_bTTLzBva5YW66LtRfY7k",   // GET/POST -> [{ email, week, sun, mon, tue, wed, thu, fri, sat }, ...]
                            //   week is 1-4. Each day value is "" (off) or "HH:MM-HH:MM" (24hr, Pacific Time)

    // MIGRATION NOTE: this URL was previously wired to a flow keyed by
    // Name (no week). Per SETUP-GUIDE.md Part 2, it now needs to be keyed
    // by Email + Week instead, against the new Availability table, and
    // needs an Add-a-row fallback for when a mod has no row yet for that
    // week. Until migrated, dragging/editing shifts won't save.
    setAvailability: "https://default9b415834803a4da0afdcfe6b1d52d6.49.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/05/workflows/c61e403d17c34ce5acd4cf8957633c67/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=VfYShrTm9txQ0R5NlMdhDFLzb9K6CnNHUh6ujQg9lr8",   // POST { email, week, day, start, end }  (week 1-4; day = "sun".."sat"; start/end "" clears that day)

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

  // This project runs across multiple calendar weeks, each with its own
  // independent schedule. The app shows a Week 1/2/3/4 switcher above the
  // calendar; this just sets which one is selected when the page loads.
  totalWeeks: 4,
  defaultWeek: 1,

  // Hours outside this range are shown greyed-out on the calendar as
  // closed hours (still fully scheduleable — this is visual only).
  // 24-hour, e.g. 9 = 9 AM, 21 = 9 PM.
  openHour: 9,
  closeHour: 21,

  // Color palette cycled through for mod chips / shift blocks
  modColors: ["#5B2A8C", "#EC1E79", "#2563EB", "#0EA5A4", "#D97706", "#7C3AED", "#DB2777", "#059669"],
};
