# Centific Mod Scheduler

A two-page internal tool:

- **`index.html`** — Weekly (Sun–Sat, 24hr, Pacific Time) drag-and-drop schedule for mods,
  with a password-gated Edit Mode and a read-only Display Mode. Each mod has at most one
  shift per day.
- **`checkin.html`** — Check-in / check-out by email, for tracking in-office hours.

## Quick start (try it now, no setup)

Just open `index.html` in a browser. It runs in **demo mode** — data is stored locally in
that browser only, so you can try the drag/resize/edit interactions immediately. Nothing is
shared with your team yet.

Default edit password in demo mode: `centific123` (edit `demoPassword` in `config.js` to
change it). This demo password stops applying the moment you connect the real password flow
below — from then on the password lives only in Excel.

## Making it a real team tool

See **`SETUP-GUIDE.md`** for the full step-by-step: the three Excel tabs (Mods, CheckIns,
Password), the Power Automate flows that connect the app to that Excel file, and hosting on
GitHub Pages.

## File map

Every file sits flat, side by side — no subfolders. Upload all of them straight into the
root of your GitHub repo.

```
index.html         Scheduler page
checkin.html        Check-in / out page
style.css           Centific theme (light + dark)
theme.js            Light/dark mode toggle (loaded first, on both pages)
config.js           <-- edit this: Power Automate flow URLs, demo password
data.js             Talks to Power Automate, falls back to local demo storage
scheduler.js        Calendar drag/resize/edit logic, mod quick-view/edit
checkin.js          Check-in/out page logic
SETUP-GUIDE.md       Power Automate + Excel + GitHub Pages walkthrough
```

## Troubleshooting

- **GitHub Pages shows a 404** — see the "GitHub Pages 404 checklist" near the end of
  `SETUP-GUIDE.md`.
- **Windows Explorer says "directory name not found" / files show weird `~1` names** — this
  happens when a folder path gets too long or deeply nested, not because of anything wrong
  with the files themselves. Copy these files to a short, simple location first — your
  Desktop, or `C:\ModScheduler` — before opening or uploading them.
