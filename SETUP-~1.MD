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
                                       VerifyPassword, GetMods, AddMod, DeleteMod,
                                       SetAvailability, CheckInOut, GetCheckIns
```

You'll create **one Excel workbook** with **three tabs**, then **seven Power Automate
flows** (one per action above), then paste each flow's URL into `config.js`.

Data model, in short: each mod is one row with a time range (or blank) in each day-of-week
column — so a mod has at most **one shift per day**. There's no separate "schedule" table;
the calendar you see is just a visual view of those same rows.

---

## Part 1 — Create the Excel workbook

1. In OneDrive (or a Team's SharePoint site), create a new Excel file — e.g. `ModScheduler.xlsx`.
2. Create **three sheets**, and on each sheet select the data range and **Insert > Table**
   (this is important — Power Automate's Excel actions work on Tables, not raw ranges). Name
   each table via the Table Design tab (top left "Table Name" box) to match the names below.

**Sheet 1: `Mods`** — table name `Mods`
| Name | Email | Sun | Mon | Tue | Wed | Thu | Fri | Sat |
|---|---|---|---|---|---|---|---|---|

- `Email` is what a mod types on the check-in page — keep it consistent.
- Each day column holds a time range in 24-hour `HH:MM-HH:MM` (Pacific Time), e.g. `09:00-21:00`,
  or stays blank if that mod isn't scheduled that day.

**Sheet 2: `CheckIns`** — table name `CheckIns`
| Email | Action | TimestampUtc |
|---|---|---|

- You never type into this tab — it fills up automatically as mods check in/out.
- `Action` is `in` or `out`. `TimestampUtc` is recorded in UTC; the app converts it to
  Pacific Time for display.

**Sheet 3: `Password`** — table name `Password`
| Password |
|---|
| *(the edit password goes in the one row below the header)* |

- Whatever value is in this cell is the password mods-schedulers type to enter Edit Mode.
  Change it any time — no code changes or redeploy needed.

Keep this file open in the browser (Excel Online) the first few times you test — it's the
easiest way to watch rows appear live.

---

## Part 2 — Build the Power Automate flows

You'll repeat a similar pattern seven times. Go to [make.powerautomate.com](https://make.powerautomate.com) → **My flows** → **New flow** → **Instant cloud flow** → trigger **"When an HTTP request is received."**

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
  `[{ "name": "Alex", "email": "alex@centific.com", "sun": "", "mon": "09:00-17:00", "tue": "", "wed": "", "thu": "", "fri": "", "sat": "" }, ...]`.
  Use a **Select** action to map Excel's `Name/Email/Sun/Mon/.../Sat` columns to the
  lowercase keys `name/email/sun/mon/.../sat` the app expects.

### Flow 3 — `AddMod` (write — add the editKey condition)
- Trigger body: `{ "name": "Alex", "email": "alex@centific.com", "editKey": "..." }`
- Action: **Add a row into a table** → `Mods` → `Name` = `json(triggerBody())?['name']`,
  `Email` = `json(triggerBody())?['email']`, all seven day columns left blank.
- Response: `{ "ok": true }`.

### Flow 4 — `DeleteMod` (write)
- Trigger body: `{ "name": "Alex", "editKey": "..." }`
- Action: **List rows present in a table** (`Mods`), filter query
  `Name eq '@{json(triggerBody())?['name']}'`.
- Action: **Apply to each** row found → **Delete a row**. (Deleting the row removes their
  availability automatically, since it's all one row.)
- Response: `{ "ok": true }`.

### Flow 5 — `SetAvailability` (write)
- Trigger body: `{ "name": "Alex", "day": "mon", "start": "09:00", "end": "17:00", "editKey": "..." }`
  (an empty `start`/`end` means "clear this day.")
- Action: **List rows present in a table** (`Mods`), filter
  `Name eq '@{json(triggerBody())?['name']}'`.
- Action: **Update a row**, keyed to that row, setting the column matching `day` (map
  `sun/mon/tue/wed/thu/fri/sat` to the `Sun/Mon/Tue/Wed/Thu/Fri/Sat` columns — a Switch
  action on `json(triggerBody())?['day']` is the simplest way) to
  `@{if(equals(json(triggerBody())?['start'], ''), '', concat(json(triggerBody())?['start'], '-', json(triggerBody())?['end']))}`.
- Response: `{ "ok": true }`.

### Flow 6 — `CheckInOut`
- No editKey condition needed — every mod needs to use this, not just schedulers.
- Trigger body: `{ "email": "name@centific.com", "action": "in", "timestampUtc": "2026-09-09T16:03:00.000Z" }`
- Action: **Add a row into a table** → `CheckIns` → map `Email` = `json(triggerBody())?['email']`,
  `Action` = `json(triggerBody())?['action']`, `TimestampUtc` = `json(triggerBody())?['timestampUtc']`.
- Response: `{ "ok": true }`.

### Flow 7 — `GetCheckIns`
- Trigger body (optional): `{ "email": "name@centific.com" }`
- Action: **List rows present in a table** → `CheckIns`. If `email` was provided, add a
  filter query `Email eq '@{json(triggerBody())?['email']}'`; otherwise return all rows.
- Response: array shaped like `[{ "email": "...", "action": "in", "timestampUtc": "..." }, ...]`.

---

## Part 3 — Wire it up

1. Open `config.js`.
2. Paste each flow's HTTP POST URL into the matching `flows.*` field, including `verifyPassword`.
3. That's it for passwords — there's nothing else to configure in code. Set (or change) the
   real password any time by editing the one cell in the Excel `Password` tab.
4. Reload the site — the yellow "demo mode" banner disappears once a feature is connected.

---

## Part 4 — Host it on GitHub Pages

1. Create a new GitHub repository (can be private if your org allows private Pages, or
   public — there's no sensitive data in the code itself, only in your Excel file/flows).
2. Upload every file (`index.html`, `checkin.html`, `style.css`, `config.js`, `data.js`,
   `scheduler.js`, `checkin.js`) straight into the **root** of the repo — there are no
   subfolders to worry about.
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

## Notes and known limits

- **Security model**: the real edit password lives only in the Excel `Password` table and is
  checked server-side by the `VerifyPassword` flow — the website's code never contains a
  password. The value the browser sends back on writes (the `editKey` field in the request
  body) is checked against that same Excel cell on every write call, so changing the
  password in Excel instantly invalidates anyone still using the old one.
- **Why the body instead of a header**: see the callout at the top of Part 2 — it's to avoid
  a CORS preflight issue some Power Automate URLs currently have.
- **One shift per mod per day**: if someone needs a split shift (e.g. 9–12 and 2–6 the same
  day), the current single-cell-per-day model can't represent that — let me know if this is
  a real need and we'll adjust the data model.
- **Weekly template, not dated weeks**: the schedule is a repeating Sunday–Saturday weekly
  template (no specific calendar dates). If you'd rather schedule specific week-of dates
  (e.g. "week of Sept 14"), let me know and we'll adjust the data model and Excel columns.
- **Overlapping shifts**: if two different mods are scheduled at the same time, their blocks
  sit side-by-side on the calendar rather than overlapping — with many concurrent mods,
  blocks will get narrow.
- All calendar times and check-in timestamps are displayed in **Pacific Time** and
  auto-adjust for daylight saving.

Ping me at any step in Part 2 or 3 if a Power Automate screen doesn't match what's described
here — connector UIs shift slightly over time and I'll adjust the instructions to match what
you're seeing.
