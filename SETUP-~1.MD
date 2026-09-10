# Centific Mod Scheduler — Setup Guide

This app works out of the box in **demo mode** (each browser stores its own data locally,
nothing is shared). To make it a real team tool — one shared schedule, one shared mod
roster, centralized check-in/out hours, and an edit password that only a few people know —
you connect it to **Power Automate**, which reads and writes an **Excel file**. GitHub Pages
hosts the static site; Power Automate + Excel is the "backend," and the password itself
lives only in that Excel file — never in the website's code.

Do this in order. You don't have to do all of it at once — for example, you can wire up
check-in/out first and leave the schedule in demo mode a while longer.

---

## Part 0 — Overview of the pieces

```
 GitHub Pages (this site)  --HTTP-->  Power Automate Flows  <-->  Excel file (OneDrive/SharePoint)
   index.html / checkin.html                 |
   (calls the URLs in config.js)     each flow = one "endpoint":
                                       VerifyPassword, GetMods, AddMod, DeleteMod, UpdateMod,
                                       GetAvailability, SetAvailability, CheckInOut, GetCheckIns
```

You'll create **one Excel workbook** with **four tabs**, then **nine Power Automate
flows** (one per action above), then paste each flow's URL into `config.js`.

Data model, in short — this app schedules **4 distinct weeks** (e.g. a 4-week project), not
one repeating template:

- **`Mods` (roster)** — one row per person: just their Name and Email. This never changes
  based on scheduling — renaming someone or fixing a typo'd email happens here, once, and
  never touches their shifts.
- **`Availability` (schedule)** — up to **4 rows per mod**, one per week (Week 1–4), each with
  a time range (or blank) in each day-of-week column. So a mod has at most **one shift per
  day, per week**. Rows are matched to a mod by **Email**, not name — that's what lets you
  rename a mod in the roster without ever disturbing their schedule.

Splitting these into two tables (instead of one combined table with day columns) is what
makes 4 independent weeks possible without Power Automate ever needing to loop over a mod's
rows — every read or write still touches at most one row at a time.

---

## Part 1 — Create the Excel workbook

1. In OneDrive (or a Team's SharePoint site), create a new Excel file — e.g. `ModScheduler.xlsx`.
2. Create **four sheets**, and on each sheet select the data range and **Insert > Table**
   (this is important — Power Automate's Excel actions work on Tables, not raw ranges). Name
   each table via the Table Design tab (top left "Table Name" box) to match the names below.

**Sheet 1: `Mods`** — table name `Mods`
| Name | Email |
|---|---|

- The roster only. `Email` is what a mod types on the check-in page, and what links a mod to
  their rows in the `Availability` sheet — keep it consistent, and treat it as the "real" ID
  for a mod even though the app displays names.

**Sheet 2: `Availability`** — table name `Availability`
| Email | Week | Sun | Mon | Tue | Wed | Thu | Fri | Sat |
|---|---|---|---|---|---|---|---|---|

- `Email` must match a row in the `Mods` sheet exactly (case doesn't matter — the app
  lower-cases both sides when matching).
- `Week` is a plain number, `1` through `4`.
- Each day column holds a time range in 24-hour `HH:MM-HH:MM` (Pacific Time), e.g. `09:00-21:00`,
  or stays blank if that mod isn't scheduled that day, that week.
- A mod only needs a row here for a week they actually have a shift in — the app creates the
  row automatically (via `SetAvailability`, see Flow 6) the first time someone drags a shift
  onto a week that mod doesn't have a row for yet, and only ever touches that one row after
  that.

**Sheet 3: `CheckIns`** — table name `CheckIns`
| Email | Action | TimestampUtc |
|---|---|---|

- You never type into this tab — it fills up automatically as mods check in/out.
- `Action` is `in` or `out`. `TimestampUtc` is recorded in UTC; the app converts it to
  Pacific Time for display.

**Sheet 4: `Password`** — table name `Password`
| Password |
|---|
| *(the edit password goes in the one row below the header)* |

- Whatever value is in this cell is the password mods-schedulers type to enter Edit Mode.
  Change it any time — no code changes or redeploy needed.

Keep this file open in the browser (Excel Online) the first few times you test — it's the
easiest way to watch rows appear live.

> **Already have the old single-table version set up?** See the **Migrating from the
> single-week version** section near the end of this guide.

---

## Part 2 — Build the Power Automate flows

You'll repeat a similar pattern nine times. Go to [make.powerautomate.com](https://make.powerautomate.com) → **My flows** → **New flow** → **Instant cloud flow** → trigger **"When an HTTP request is received."**

> **Note on the HTTP trigger:** "When an HTTP request is received" is a Premium trigger in
> some Power Automate plans. Most Microsoft 365 E3/E5 and Power Automate per-user plans
> include it. If your tenant doesn't have it, tell me and we'll switch the design to a
> trigger type your license supports, but the HTTP trigger is by far the simplest option
> if it's available to you.

### General pattern for every flow

> **Important — how the site sends data:** the website deliberately sends its request body as
> `Content-Type: text/plain` with no custom headers, instead of the more typical
> `application/json` + a custom header. Either of those forces the browser to send an
> invisible CORS "preflight" check first, and some Power Automate HTTP trigger URLs (the
> newer `environment.api.powerplatform.com` ones) don't answer that preflight correctly,
> which silently blocks every call before it even reaches your flow. Because of `text/plain`,
> Power Automate does **not** auto-parse the body into `triggerBody()` as an object — every
> expression below wraps it as `json(triggerBody())?['fieldName']` instead of the more usual
> `triggerBody()?['fieldName']`. Don't mix the two up. For the same CORS reason, the edit
> password token also travels as a field **inside the body** (`editKey`) rather than as a
> header.

1. **Trigger**: "When an HTTP request is received."
   - Leave "Request Body JSON Schema" blank at first — save the flow once, run it once with
     sample data (or use "Use sample payload to generate schema") to auto-fill it.
2. **(Write flows only) Add a security condition** right after the trigger:
   - Add an action: **List rows present in a table** → `Password` (no filter needed, it's
     one row) — this fetches the current password straight from Excel.
   - Add a **Condition**: click the left box → **Expression** tab → type
     `json(triggerBody())?['editKey']` — **is equal to** — right box → **Dynamic content** →
     pick `Password` from the "List rows" step.
   - If **No** → add a **Response** action: Status Code `401`, Body `{"error":"unauthorized"}`.
     Put the rest of the flow's actions in the **Yes** branch.
   - Because it's looked up from Excel on every call, changing the password in the
     `Password` tab instantly invalidates anyone still using the old one.
3. Add the Excel Online (Business) action(s) described per-flow below.
4. Add a final **Response** action that returns JSON (Status Code `200`, Content-Type
   `application/json`, Body = the data described below).
5. Save. Power Automate shows an **HTTP POST URL** on the trigger card — copy it into the
   matching slot in `config.js`.

### Flow 1 — `VerifyPassword` (no editKey condition — this IS the login check)
- Trigger body: `{ "password": "whatever the user typed", "editKey": "" }`
- Action: **List rows present in a table** → `Password`.
- Condition: left box, **Expression** → `json(triggerBody())?['password']` — is equal to —
  right box, **Dynamic content** → `Password` (from the List rows step).
  - **Yes**: Response `200` → `{ "ok": true }`
  - **No**: Response `200` → `{ "ok": false }`
- The website remembers a correct password only for the current browser tab, and sends it
  back as the `editKey` field in the body on every write afterward — which is what the
  condition in every write flow below checks.

### Flow 2 — `GetMods`
- Trigger: HTTP request (no security condition needed — read-only).
- Action: **List rows present in a table** → `Mods`.
- Response body: an array shaped like
  `[{ "name": "Alex", "email": "alex@centific.com" }, ...]`.
  Use a **Select** action to map Excel's `Name/Email` columns to the lowercase keys
  `name/email` the app expects. That's it — no day columns here anymore; those live in
  `Availability` now (Flow 5).

### Flow 3 — `AddMod` (write — add the editKey condition)
- Trigger body: `{ "name": "Alex", "email": "alex@centific.com", "editKey": "..." }`
- Action: **Add a row into a table** → `Mods` → `Name` = `json(triggerBody())?['name']`,
  `Email` = `json(triggerBody())?['email']`.
- Response: `{ "ok": true }`.
- Nothing needs to happen in `Availability` here — a new mod simply has no rows there yet
  until someone schedules them for a specific week, at which point `SetAvailability` (Flow 6)
  creates the row automatically.

### Flow 4 — `DeleteMod` (write)
- Trigger body: `{ "name": "Alex", "editKey": "..." }`
- Action: **List rows present in a table** (`Mods`), filter query
  `Name eq '@{json(triggerBody())?['name']}'`.
- Action: **Apply to each** row found → **Delete a row**.
- Response: `{ "ok": true }`.
- **This intentionally does not touch `Availability`.** Deleting a mod could leave behind up
  to 4 orphaned rows (one per week) in `Availability` under their old email — cleaning those
  up would mean looping over a variable number of rows for every delete, which this app's
  design deliberately avoids everywhere. In practice this is harmless: an orphaned
  `Availability` row for a deleted mod's email just never renders (the app only shows rows
  for emails still in the `Mods` roster). If you ever re-add the exact same email, their old
  schedule reappears — usually a convenient side effect, but worth knowing. If you want those
  rows gone for good, delete them by hand in Excel using Ctrl+F on the email.

### Flow 5 — `GetAvailability`
- Trigger: HTTP request (no security condition needed — read-only).
- Action: **List rows present in a table** → `Availability`.
- Response body: an array shaped like
  `[{ "email": "alex@centific.com", "week": 1, "sun": "", "mon": "09:00-17:00", "tue": "", "wed": "", "thu": "", "fri": "", "sat": "" }, ...]`.
  Use a **Select** action to map Excel's `Email/Week/Sun/Mon/.../Sat` columns to the
  lowercase keys `email/week/sun/mon/.../sat` the app expects. This returns **every** week for
  **every** mod in one call — the app fetches it once and switches between the Week 1–4 tabs
  entirely client-side, with no extra network calls.

### Flow 6 — `SetAvailability` (write)
- Trigger body: `{ "email": "alex@centific.com", "week": 2, "day": "mon", "start": "09:00", "end": "17:00", "editKey": "..." }`
  (an empty `start`/`end` means "clear this day.")
- Action: **List rows present in a table** (`Availability`), filter query
  `Email eq '@{json(triggerBody())?['email']}' and Week eq @{json(triggerBody())?['week']}`.
- Action: **Condition** — left box, **Expression** → `length(body('List_rows_present_in_a_table')?['value'])` —
  is greater than — right box → `0` (i.e., does a row already exist for this mod+week?).
  - **Yes branch — Update a row**: keyed to
    `first(body('List_rows_present_in_a_table')?['value'])?['ItemInternalId']` (pull this via
    the **Expression** editor, not Dynamic Content, to avoid Power Automate auto-wrapping the
    action in an "Apply to each"). Set the column matching `day` (map `sun/mon/tue/wed/thu/
    fri/sat` to the `Sun/Mon/Tue/Wed/Thu/Fri/Sat` columns — a **Switch** action on
    `json(triggerBody())?['day']` is the simplest way) to:
    `if(and(equals(json(triggerBody())?['start'], ''), equals(json(triggerBody())?['end'], '')), ' ', concat(json(triggerBody())?['start'], '-', json(triggerBody())?['end']))`
    (entered via the **Expression** editor, not typed as plain text — see the callout above).
    - **Important**: the "clear" branch returns a single **space** `' '`, not an empty string
      `''`. Power Automate's Excel "Update a row" action silently treats a field that
      evaluates to a true empty string as "left blank → don't change this column," so
      clearing a shift would otherwise appear to succeed (the flow runs fine) while Excel
      keeps the old value. A lone space is a real, non-empty value, so the update actually
      applies — and the app already treats any day value that doesn't contain a `-` (a lone
      space included) as "not scheduled," so nothing else needs to change for this to display
      as cleared.
  - **No branch — Add a row into a table** → `Availability` → `Email` =
    `json(triggerBody())?['email']`, `Week` = `json(triggerBody())?['week']`, the column
    matching `day` set the same way as above (a brand-new row's other 6 day columns are simply
    left blank — there's nothing to accidentally overwrite yet), and every other day column
    left blank.
- Response: `{ "ok": true }` (in both branches).
- This is the one flow that changed shape the most from the single-week version: it's now
  keyed by **Email + Week** against the `Availability` table instead of by Name against
  `Mods`, and it needs the Yes/No upsert branch above since a mod may not have a row for a
  given week yet.

### Flow 7 — `CheckInOut`
- No editKey condition needed — every mod needs to use this, not just schedulers.
- Trigger body: `{ "email": "name@centific.com", "action": "in", "timestampUtc": "2026-09-09T16:03:00.000Z" }`
- Action: **Add a row into a table** → `CheckIns` → map `Email` = `json(triggerBody())?['email']`,
  `Action` = `json(triggerBody())?['action']`, `TimestampUtc` = `json(triggerBody())?['timestampUtc']`.
- Response: `{ "ok": true }`.

### Flow 8 — `GetCheckIns`
- Trigger body (optional): `{ "email": "name@centific.com" }`
- Action: **List rows present in a table** → `CheckIns`. If `email` was provided, add a
  filter query `Email eq '@{json(triggerBody())?['email']}'`; otherwise return all rows.
- Response: array shaped like `[{ "email": "...", "action": "in", "timestampUtc": "..." }, ...]`.

### Flow 9 — `UpdateMod` (write — renames a mod and/or updates their email)
- Trigger body: `{ "oldName": "Alex", "name": "Alexandra", "email": "alexandra@centific.com", "editKey": "..." }`
- Action: **List rows present in a table** (`Mods`), filter query
  `Name eq '@{json(triggerBody())?['oldName']}'`.
- Action: **Update a row**, keyed to that row (use the Expression pattern from Flow 6 if you
  hit the "Apply to each" auto-wrap issue — pull the row via
  `first(body('List_rows_present_in_a_table')?['value'])?['ItemInternalId']` or similar, not
  Dynamic Content), setting `Name` = `json(triggerBody())?['name']` and `Email` =
  `json(triggerBody())?['email']`.
- Response: `{ "ok": true }`.
- This is the flow behind the sidebar's pencil icon (click a mod's name to view just their
  schedule; in Edit Mode, click the pencil next to it to rename them or fix their email).
  Until you build this flow, renames made through the pencil icon only save locally in that
  browser (same demo-mode fallback as the other unwired flows).
- **Renaming the `Name` is completely safe** — `Availability` rows are keyed by `Email`, not
  name, so a mod's schedule follows them automatically. **Changing the `Email`, though, is
  not** — their existing `Availability` rows still reference the old email and will stop
  matching, effectively disappearing from the calendar (for the same "no loops" reason
  described on Flow 4). If a mod's email genuinely needs to change, either update it here and
  then manually find/replace their old email with the new one across their rows in the
  `Availability` sheet, or treat it as removing the old mod and adding a new one.

---

## Part 3 — Wire it up

1. Open `config.js`.
2. Paste each flow's HTTP POST URL into the matching `flows.*` field, including
   `verifyPassword` and the new `getAvailability`.
3. That's it for passwords — there's nothing else to configure in code. Set (or change) the
   real password any time by editing the one cell in the Excel `Password` tab.
4. Reload the site — the yellow "demo mode" banner disappears once a feature is connected.

---

## Part 4 — Host it on GitHub Pages

1. Create a new GitHub repository (can be private if your org allows private Pages, or
   public — there's no sensitive data in the code itself, only in your Excel file/flows).
2. Upload every file (`index.html`, `checkin.html`, `style.css`, `theme.js`, `loading.js`,
   `config.js`, `data.js`, `scheduler.js`, `checkin.js`) straight into the **root** of the
   repo — there are no subfolders to worry about.
3. In the repo, go to **Settings → Pages** → under "Build and deployment," set **Source** to
   "Deploy from a branch," pick your branch (e.g. `main`) and folder `/root`, then **Save**.
4. GitHub gives you a URL like `https://your-org.github.io/your-repo/` — share that with
   your team. This is the one live app/URL for the whole thing — the scheduler and
   check-in/out pages are just two pages inside it (linked via the nav bar at the top).
5. Whenever you edit `config.js` or any file, commit and push — GitHub Pages redeploys
   automatically within a minute or two.

### GitHub Pages 404 checklist

If the live URL 404s, work through these in order:

1. **Pages isn't enabled yet, or the wrong branch/folder is selected** — check
   **Settings → Pages** shows "Your site is live at ..." with a green checkmark, and that
   the branch/folder there matches where `index.html` actually is.
2. **Give it a minute** — first-time Pages builds can take 1–2 minutes. Check the repo's
   **Actions** tab for a "pages build and deployment" run; if it failed, the error there
   tells you exactly what's wrong.
3. **Case sensitivity** — GitHub Pages is case-sensitive. The file must be named exactly
   `index.html` (lowercase).
4. **File got renamed on the way in** — on Windows, a very long/deeply-nested local folder
   path can cause files to silently get saved or uploaded under a shortened name (you'd see
   something like `INDEX~1.HTM` in the repo instead of `index.html`). If you see any `~1`
   style names in your repo's file list, delete them and re-upload from a short local path
   (Desktop, or `C:\ModScheduler`) instead.
5. Still stuck? Send me the exact URL you're visiting and a screenshot of your repo's file
   list and Settings → Pages screen, and I'll pinpoint it.

---

## Migrating from the single-week version

If you already built the original single-table version (one `Mods` sheet with Sun–Sat columns
baked in, and a `SetAvailability` flow keyed by Name), here's the shortest path to the
multi-week version:

1. In Excel, add the new **`Availability`** sheet/table described in Part 1 (Email, Week,
   Sun..Sat). You can optionally copy your existing week's shift data into it as `Week = 1`
   rows, then delete the day columns from the old `Mods` sheet (keep just Name/Email).
2. **`GetMods`** (Flow 2): simplify its Select action to map only `name`/`email` — remove the
   day columns from the mapping. The app already ignores any extra fields this flow returns,
   so this step is a cleanup, not a blocker.
3. **`SetAvailability`** (Flow 6): rebuild its lookup and upsert logic per the new spec above —
   it now filters `Availability` by Email **and** Week instead of `Mods` by Name, and needs
   the Yes/No (Update vs. Add a row) branch since a mod may not have a row for every week.
   Until this migration is done, dragging or editing shifts in the app won't save.
4. Build the new **`GetAvailability`** flow (Flow 5 above) and paste its URL into
   `config.js`'s `flows.getAvailability`.
5. Everything else (`VerifyPassword`, `AddMod`, `DeleteMod`, `UpdateMod`, `CheckInOut`,
   `GetCheckIns`) is unchanged.

---

## Notes and known limits

- **Security model**: the real edit password lives only in the Excel `Password` table and is
  checked server-side by the `VerifyPassword` flow — the website's code never contains a
  password. The value the browser sends back on writes (the `editKey` field in the request
  body) is checked against that same Excel cell on every write call, so changing the
  password in Excel instantly invalidates anyone still using the old one.
- **Why the body instead of a header**: see the callout at the top of Part 2 — it's to avoid
  a CORS preflight issue some Power Automate URLs currently have.
- **One shift per mod per day, per week**: if someone needs a split shift (e.g. 9–12 and 2–6
  the same day), the current single-cell-per-day model can't represent that — let me know if
  this is a real need and we'll adjust the data model.
- **Four independent weeks**: the app shows a Week 1/2/3/4 tab switcher above the calendar.
  Each week's schedule is completely independent — a mod's Monday shift in Week 1 has no
  effect on their Monday in Week 2, and switching tabs never re-fetches from Excel (the app
  loads every week's data once, then filters locally). This is meant for a project with a
  fixed 4-week span; if you need more or fewer weeks, `config.js`'s `totalWeeks` can be raised
  or lowered — but you're on your own for updating the `Availability` sheet and Flow 6/5's
  expectations to match, since nothing in Excel enforces the range.
- **Roster edits don't touch the schedule, with one exception**: renaming a mod (or removing
  them) never disturbs `Availability` rows, since those are matched by email — see the
  caveats under Flow 4 (`DeleteMod`) and Flow 9 (`UpdateMod`) above. The one exception is
  changing a mod's *email*, which does orphan their existing schedule.
- **Overlapping shifts**: if multiple mods are scheduled at the same time, their blocks sit
  side-by-side ("lanes") on the calendar rather than overlapping. Comfortably supports up to
  4 mods stacked in the same hour (text shrinks a bit at 3+, and the time subtext hides at 4+
  to keep it legible) — hover any block to see the full name and time in a tooltip.
- **Quick view / edit a mod**: click a mod's name in the sidebar (in either Edit or Display
  Mode) to filter the calendar down to just their shifts — click "Show everyone" (or the same
  name again) to clear it. In Edit Mode, the pencil icon next to a name opens a small popover
  to rename them or update their email (see Flow 9, `UpdateMod`, above).
- **Light / dark mode**: the sun/moon button in the header toggles the theme and remembers
  your choice per browser. Until you click it, the app follows your OS/browser's light or
  dark setting automatically.
- **Dragging shifts**: drag a mod's name from the sidebar onto the calendar and drag down to
  set the shift length. Hold **Shift** while dragging to snap the shift to the current whole
  hour and day instead of a precise range. A brief loading overlay shows while a shift is
  being saved or deleted, in case Excel/Power Automate takes a moment to respond.
- All calendar times and check-in timestamps are displayed in **Pacific Time** and
  auto-adjust for daylight saving.

Ping me at any step in Part 2 or 3 if a Power Automate screen doesn't match what's described
here — connector UIs shift slightly over time and I'll adjust the instructions to match what
you're seeing.
