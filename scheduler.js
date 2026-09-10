/* ============================================================
   CENTIFIC MOD SCHEDULER — calendar logic
   ============================================================
   Data model: each mod has at most ONE shift per day (their
   Excel row's day column). "Shifts" shown on the calendar are
   derived from that — there's no separate schedule table.
   ============================================================ */

(function () {
  const cfg = window.APP_CONFIG;
  const DAY_KEYS = DataAPI.DAY_KEYS; // ["sun","mon","tue","wed","thu","fri","sat"]
  const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const SLOT_MIN = cfg.slotMinutes || 30;
  const SLOT_PX = 24;
  const SLOTS_PER_HOUR = 60 / SLOT_MIN;
  const HOUR_PX = SLOTS_PER_HOUR * SLOT_PX;
  const TOTAL_SLOTS = (24 * 60) / SLOT_MIN;
  const BODY_HEIGHT = TOTAL_SLOTS * SLOT_PX;
  const MIN_DURATION = SLOT_MIN;
  const OPEN_HOUR = (cfg.openHour != null) ? cfg.openHour : 9;   // 9 AM
  const CLOSE_HOUR = (cfg.closeHour != null) ? cfg.closeHour : 21; // 9 PM

  let state = { mods: [], shifts: [], editMode: false, focusedMod: null };
  let dayColEls = [];

  // ---------------- utils ----------------

  function pad2(n) { return String(n).padStart(2, "0"); }
  function minutesToHHMM(m) {
    m = Math.max(0, Math.min(24 * 60, Math.round(m)));
    return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  }
  function hhmmToMinutes(s) {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  }
  function displayTime(m) {
    let h = Math.floor(m / 60), min = m % 60;
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${pad2(min)} ${ampm}`;
  }
  function snap(m) { return Math.round(m / SLOT_MIN) * SLOT_MIN; }
  function colorForName(name) {
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return cfg.modColors[sum % cfg.modColors.length];
  }
  function nowInPT() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: cfg.timeZone, weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(new Date());
    const map = {};
    parts.forEach(p => map[p.type] = p.value);
    const shortNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayIdx = shortNames.indexOf(map.weekday);
    let hour = parseInt(map.hour, 10);
    if (hour === 24) hour = 0;
    const minute = parseInt(map.minute, 10);
    return { dayIdx, minutes: hour * 60 + minute };
  }
  function hasShift(mod, day) {
    return state.shifts.some(s => s.mod === mod && s.day === day);
  }
  function confirmOverwrite(mod, day) {
    if (!hasShift(mod, day)) return true;
    return confirm(`${mod} already has a shift on ${DAY_LABELS[DAY_KEYS.indexOf(day)]}. Replace it?`);
  }

  // ---------------- data load ----------------

  async function loadAll() {
    try {
      const mods = await DataAPI.getMods();
      state.mods = mods || [];
      state.shifts = DataAPI.deriveShifts(state.mods);
    } catch (err) {
      console.error(err);
      showTransientError("Couldn't load data from Power Automate. Check the flow URLs in config.js. Falling back to what's cached locally.");
    }
    document.getElementById("demoBanner").style.display = DataAPI.anyDemoMode() ? "flex" : "none";
    // If the focused mod was renamed or removed, drop the stale filter.
    if (state.focusedMod && !state.mods.some(m => m.name === state.focusedMod)) {
      state.focusedMod = null;
    }
    renderSidebar();
    renderShifts();
    renderFocusBanner();
  }

  function showTransientError(msg) {
    const el = document.getElementById("demoBanner");
    el.textContent = "⚠️ " + msg;
    el.className = "banner banner-error";
    el.style.display = "flex";
  }

  // ---------------- sidebar ----------------

  function renderSidebar() {
    const list = document.getElementById("modList");
    list.innerHTML = "";
    if (state.mods.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-state";
      li.style.padding = "10px 2px";
      li.textContent = state.editMode ? "Add your first mod above." : "No mods yet.";
      list.appendChild(li);
    }
    state.mods.forEach(mod => {
      const li = document.createElement("li");
      li.className = "mod-chip" + (state.editMode ? " editable-chip" : "") + (state.focusedMod === mod.name ? " focused" : "");
      li.draggable = false;
      if (mod.email) li.title = mod.email;
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = colorForName(mod.name);
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = mod.name;
      li.appendChild(swatch);
      li.appendChild(name);

      const actions = document.createElement("span");
      actions.className = "chip-actions";

      if (state.editMode) {
        const edit = document.createElement("button");
        edit.className = "icon-btn edit-btn";
        edit.innerHTML = "&#9998;"; // pencil
        edit.title = "Edit name / email";
        edit.type = "button";
        edit.addEventListener("click", (e) => {
          e.stopPropagation();
          openModEditPopover(mod);
        });
        actions.appendChild(edit);

        const rm = document.createElement("button");
        rm.className = "icon-btn remove-btn";
        rm.innerHTML = "&times;";
        rm.title = "Remove mod";
        rm.type = "button";
        rm.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!confirm(`Remove ${mod.name}? Their shifts will also be removed.`)) return;
          await DataAPI.deleteMod(mod.name);
          await loadAll();
        });
        actions.appendChild(rm);

        li.addEventListener("mousedown", (e) => {
          if (e.target === edit || e.target === rm) return;
          startCreateDrag(e, mod.name);
        });
      }
      li.appendChild(actions);

      // Clicking the chip (not the pencil/remove buttons) filters the
      // calendar down to just this mod — works in both Edit and Display
      // mode. Click the same mod again (or "Show everyone") to clear it.
      li.addEventListener("click", () => {
        state.focusedMod = (state.focusedMod === mod.name) ? null : mod.name;
        renderSidebar();
        renderShifts();
        renderFocusBanner();
      });

      list.appendChild(li);
    });
  }

  // ---------------- focus filter banner ----------------

  function renderFocusBanner() {
    const banner = document.getElementById("focusBanner");
    if (!state.focusedMod) {
      banner.style.display = "none";
      return;
    }
    document.getElementById("focusBannerText").textContent = `Showing ${state.focusedMod}'s schedule only`;
    banner.style.display = "flex";
  }

  document.getElementById("clearFocusBtn").addEventListener("click", () => {
    state.focusedMod = null;
    renderSidebar();
    renderShifts();
    renderFocusBanner();
  });

  // ---------------- calendar skeleton (built once) ----------------

  function renderGridSkeleton() {
    const grid = document.getElementById("calendarGrid");
    grid.style.setProperty("--slot-height", SLOT_PX + "px");
    grid.style.gridTemplateRows = "auto 1fr";
    grid.innerHTML = "";

    // corner
    const corner = document.createElement("div");
    corner.className = "cal-header-cell corner";
    corner.style.gridRow = "1";
    corner.style.gridColumn = "1";
    grid.appendChild(corner);

    // day headers
    DAY_KEYS.forEach((d, i) => {
      const h = document.createElement("div");
      h.className = "cal-header-cell";
      h.style.gridRow = "1";
      h.style.gridColumn = String(i + 2);
      h.innerHTML = `${DAY_LABELS[i]}<span class="day-sub">Pacific Time</span>`;
      grid.appendChild(h);
    });

    // time column
    const timeCol = document.createElement("div");
    timeCol.className = "cal-time-col";
    timeCol.style.gridRow = "2";
    timeCol.style.gridColumn = "1";
    timeCol.style.height = BODY_HEIGHT + "px";
    for (let h = 0; h < 24; h++) {
      const lbl = document.createElement("div");
      lbl.className = "cal-time-label" + ((h < OPEN_HOUR || h >= CLOSE_HOUR) ? " closed" : "");
      lbl.style.top = (h * HOUR_PX) + "px";
      lbl.textContent = displayTime(h * 60).replace(":00", "");
      timeCol.appendChild(lbl);
    }
    grid.appendChild(timeCol);

    // day columns
    dayColEls = [];
    DAY_KEYS.forEach((d, i) => {
      const col = document.createElement("div");
      col.className = "cal-day-col";
      col.style.gridRow = "2";
      col.style.gridColumn = String(i + 2);
      col.style.height = BODY_HEIGHT + "px";
      col.dataset.dayIndex = String(i);

      // Grey out closed hours (before OPEN_HOUR and from CLOSE_HOUR on).
      // Purely visual — doesn't block scheduling in these hours.
      const before = document.createElement("div");
      before.className = "closed-hours-overlay";
      before.style.top = "0px";
      before.style.height = (OPEN_HOUR * HOUR_PX) + "px";
      col.appendChild(before);

      const after = document.createElement("div");
      after.className = "closed-hours-overlay";
      after.style.top = (CLOSE_HOUR * HOUR_PX) + "px";
      after.style.height = ((24 - CLOSE_HOUR) * HOUR_PX) + "px";
      col.appendChild(after);

      grid.appendChild(col);
      dayColEls.push(col);
    });

    renderNowLine();
    setInterval(renderNowLine, 60 * 1000);
  }

  function renderNowLine() {
    dayColEls.forEach(col => {
      const existing = col.querySelector(".now-line");
      if (existing) existing.remove();
    });
    const { dayIdx, minutes } = nowInPT();
    const col = dayColEls[dayIdx];
    if (!col) return;
    const line = document.createElement("div");
    line.className = "now-line";
    line.style.top = ((minutes / 60) * HOUR_PX) + "px";
    col.appendChild(line);
  }

  // ---------------- shift rendering (with simple lane layout) ----------------

  function computeLanes(shiftsForDay) {
    const sorted = [...shiftsForDay].sort((a, b) => hhmmToMinutes(a.start) - hhmmToMinutes(b.start));
    const laneEnds = [];
    const laneOf = new Map();
    sorted.forEach(s => {
      const start = hhmmToMinutes(s.start), end = hhmmToMinutes(s.end);
      let placed = false;
      for (let i = 0; i < laneEnds.length; i++) {
        if (laneEnds[i] <= start) { laneEnds[i] = end; laneOf.set(s, i); placed = true; break; }
      }
      if (!placed) { laneEnds.push(end); laneOf.set(s, laneEnds.length - 1); }
    });
    const totalLanes = Math.max(1, laneEnds.length);
    return { laneOf, totalLanes };
  }

  function renderShifts() {
    dayColEls.forEach(col => {
      col.querySelectorAll(".shift-block").forEach(el => el.remove());
    });

    DAY_KEYS.forEach((d, dayIdx) => {
      const col = dayColEls[dayIdx];
      let dayShifts = state.shifts.filter(s => s.day === d);
      if (state.focusedMod) dayShifts = dayShifts.filter(s => s.mod === state.focusedMod);
      const { laneOf, totalLanes } = computeLanes(dayShifts);

      dayShifts.forEach(shift => {
        const start = hhmmToMinutes(shift.start), end = hhmmToMinutes(shift.end);
        const lane = laneOf.get(shift) || 0;
        const widthPct = 100 / totalLanes;

        const block = document.createElement("div");
        const laneClass = totalLanes >= 4 ? " lanes-4plus" : (totalLanes === 3 ? " lanes-3" : "");
        block.className = "shift-block" + (state.editMode ? " editable" : "") + laneClass;
        block.style.top = ((start / 60) * HOUR_PX) + "px";
        block.style.height = Math.max(16, ((end - start) / 60) * HOUR_PX) + "px";
        block.style.left = `calc(${lane * widthPct}% + 3px)`;
        block.style.width = `calc(${widthPct}% - 6px)`;
        block.style.background = colorForName(shift.mod);
        block.title = `${shift.mod} — ${DAY_LABELS[dayIdx]} ${displayTime(start)} – ${displayTime(end)} (Pacific Time)`;
        block.innerHTML = `<span class="shift-name">${escapeHtml(shift.mod)}</span><span class="shift-time">${displayTime(start)} – ${displayTime(end)}</span>`;
        block.dataset.mod = shift.mod;
        block.dataset.day = shift.day;

        if (state.editMode) {
          const top = document.createElement("div");
          top.className = "resize-handle top";
          const bottom = document.createElement("div");
          bottom.className = "resize-handle bottom";
          block.appendChild(top);
          block.appendChild(bottom);
          top.addEventListener("mousedown", (e) => startResize(e, shift, "top"));
          bottom.addEventListener("mousedown", (e) => startResize(e, shift, "bottom"));
          block.addEventListener("mousedown", (e) => {
            if (e.target === top || e.target === bottom) return;
            startMove(e, shift);
          });
        } else {
          block.addEventListener("click", () => {
            alert(`${shift.mod}\n${DAY_LABELS[dayIdx]}\n${displayTime(start)} – ${displayTime(end)} (Pacific Time)`);
          });
        }
        col.appendChild(block);
      });
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------------- create by dragging a mod chip onto the grid ----------------

  function startCreateDrag(mouseDownEvent, modName) {
    mouseDownEvent.preventDefault();
    // Tracks whichever day column the cursor is CURRENTLY over — not
    // whichever one it first entered. Locking to the first column broke
    // dragging past Sunday, since the sidebar sits to the left of the
    // grid and Sunday is always the first column the cursor crosses.
    let currentDayIndex = null;
    let currentColEl = null;
    let startMin = null;
    let currentMin = null;
    let started = false;

    const ghost = document.createElement("div");
    ghost.className = "ghost-block";
    ghost.style.display = "none";

    function onMove(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const col = el && el.closest ? el.closest(".cal-day-col") : null;
      if (!col) return; // cursor is over the sidebar or elsewhere — ignore

      const rect = col.getBoundingClientRect();
      const minutesHere = snap(((e.clientY - rect.top) / HOUR_PX) * 60);
      currentDayIndex = parseInt(col.dataset.dayIndex, 10);

      if (col !== currentColEl) {
        currentColEl = col;
        col.appendChild(ghost); // move the preview block to the new day
        ghost.style.display = "block";
      }

      if (e.shiftKey) {
        // Hold Shift to snap hard to the current whole hour + day, wherever
        // the cursor is right now — discards the drag-start anchor so you
        // don't have to land on an exact pixel. Release Shift to go back to
        // fine-grained dragging.
        const hourStart = Math.floor(minutesHere / 60) * 60;
        startMin = hourStart;
        currentMin = Math.min(hourStart + 60, 24 * 60);
        started = true;
        ghost.classList.add("snap-hour");
      } else {
        if (!started) {
          started = true;
          startMin = minutesHere; // anchor point, set once on first entry
        }
        currentMin = minutesHere;
        ghost.classList.remove("snap-hour");
      }

      const lo = Math.min(startMin, currentMin);
      const hi = Math.max(startMin, currentMin);
      const dur = Math.max(hi - lo, MIN_DURATION);
      ghost.style.top = ((lo / 60) * HOUR_PX) + "px";
      ghost.style.height = ((dur / 60) * HOUR_PX) + "px";
    }

    async function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      ghost.remove();
      if (currentDayIndex === null) return;
      let lo = Math.min(startMin, currentMin);
      let hi = Math.max(startMin, currentMin);
      if (hi - lo < MIN_DURATION) hi = lo + 60; // simple click -> default 1hr
      hi = Math.min(hi, 24 * 60);
      const day = DAY_KEYS[currentDayIndex];
      if (!confirmOverwrite(modName, day)) return;
      await DataAPI.setAvailability(modName, day, minutesToHHMM(lo), minutesToHHMM(hi));
      await loadAll();
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ---------------- move existing shift ----------------

  function startMove(mouseDownEvent, shift) {
    mouseDownEvent.preventDefault();
    const startClientY = mouseDownEvent.clientY;
    const startClientX = mouseDownEvent.clientX;
    const origStart = hhmmToMinutes(shift.start);
    const origEnd = hhmmToMinutes(shift.end);
    const duration = origEnd - origStart;
    const origDayIndex = DAY_KEYS.indexOf(shift.day);
    let moved = false;
    let newDayIndex = origDayIndex;
    let newStart = origStart;

    function onMove(e) {
      if (Math.abs(e.clientY - startClientY) > 4 || Math.abs(e.clientX - startClientX) > 4) moved = true;
      if (!moved) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const col = el && el.closest ? el.closest(".cal-day-col") : null;
      if (col) newDayIndex = parseInt(col.dataset.dayIndex, 10);
      if (e.shiftKey && col) {
        // Snap to the whole hour under the cursor, keeping the shift's length.
        const rect = col.getBoundingClientRect();
        const minutesHere = snap(((e.clientY - rect.top) / HOUR_PX) * 60);
        const hourStart = Math.floor(minutesHere / 60) * 60;
        newStart = Math.max(0, Math.min(24 * 60 - duration, hourStart));
      } else {
        const deltaMin = snap(((e.clientY - startClientY) / HOUR_PX) * 60);
        newStart = Math.max(0, Math.min(24 * 60 - duration, origStart + deltaMin));
      }
    }

    async function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (!moved) {
        openShiftPopover(shift);
        return;
      }
      const newDay = DAY_KEYS[newDayIndex];
      const newEnd = newStart + duration;
      if (newDay !== shift.day) {
        if (!confirmOverwrite(shift.mod, newDay)) { await loadAll(); return; }
        await DataAPI.setAvailability(shift.mod, shift.day, "", "");
        await DataAPI.setAvailability(shift.mod, newDay, minutesToHHMM(newStart), minutesToHHMM(newEnd));
      } else {
        await DataAPI.setAvailability(shift.mod, shift.day, minutesToHHMM(newStart), minutesToHHMM(newEnd));
      }
      await loadAll();
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ---------------- resize existing shift ----------------

  function startResize(mouseDownEvent, shift, edge) {
    mouseDownEvent.preventDefault();
    mouseDownEvent.stopPropagation();
    const startClientY = mouseDownEvent.clientY;
    const origStart = hhmmToMinutes(shift.start);
    const origEnd = hhmmToMinutes(shift.end);
    let newStart = origStart, newEnd = origEnd;

    function onMove(e) {
      const deltaMin = snap(((e.clientY - startClientY) / HOUR_PX) * 60);
      if (edge === "top") {
        newStart = Math.max(0, Math.min(origEnd - MIN_DURATION, origStart + deltaMin));
        newEnd = origEnd;
      } else {
        newEnd = Math.min(24 * 60, Math.max(origStart + MIN_DURATION, origEnd + deltaMin));
        newStart = origStart;
      }
    }

    async function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      await DataAPI.setAvailability(shift.mod, shift.day, minutesToHHMM(newStart), minutesToHHMM(newEnd));
      await loadAll();
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ---------------- shift edit popover ----------------

  let popoverShift = null;

  function openShiftPopover(shift) {
    popoverShift = shift;
    document.getElementById("shiftPopoverTitle").textContent = `Edit ${shift.mod}'s shift`;
    document.getElementById("shiftModName").value = shift.mod;
    const daySelect = document.getElementById("shiftDay");
    daySelect.innerHTML = DAY_LABELS.map((d, i) => `<option value="${DAY_KEYS[i]}">${d}</option>`).join("");
    daySelect.value = shift.day;
    document.getElementById("shiftStart").value = shift.start;
    document.getElementById("shiftEnd").value = shift.end;
    document.getElementById("shiftError").style.display = "none";
    document.getElementById("shiftScrim").style.display = "flex";
  }

  function closeShiftPopover() {
    popoverShift = null;
    document.getElementById("shiftScrim").style.display = "none";
  }

  document.getElementById("cancelShiftBtn").addEventListener("click", closeShiftPopover);
  document.getElementById("shiftScrim").addEventListener("click", (e) => {
    if (e.target.id === "shiftScrim") closeShiftPopover();
  });

  document.getElementById("saveShiftBtn").addEventListener("click", async () => {
    const day = document.getElementById("shiftDay").value;
    const start = document.getElementById("shiftStart").value;
    const end = document.getElementById("shiftEnd").value;
    const errEl = document.getElementById("shiftError");
    if (!start || !end) { errEl.textContent = "Please set both a start and end time."; errEl.style.display = "block"; return; }
    if (hhmmToMinutes(end) <= hhmmToMinutes(start)) {
      errEl.textContent = "End time must be after start time.";
      errEl.style.display = "block";
      return;
    }
    if (day !== popoverShift.day) {
      if (!confirmOverwrite(popoverShift.mod, day)) return;
      await DataAPI.setAvailability(popoverShift.mod, popoverShift.day, "", "");
      await DataAPI.setAvailability(popoverShift.mod, day, start, end);
    } else {
      await DataAPI.setAvailability(popoverShift.mod, day, start, end);
    }
    closeShiftPopover();
    await loadAll();
  });

  document.getElementById("deleteShiftBtn").addEventListener("click", async () => {
    if (!confirm("Delete this shift?")) return;
    await DataAPI.setAvailability(popoverShift.mod, popoverShift.day, "", "");
    closeShiftPopover();
    await loadAll();
  });

  // ---------------- add mod ----------------

  document.getElementById("addModBtn").addEventListener("click", addModHandler);
  document.getElementById("newModInput").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("newModEmailInput").focus(); });
  document.getElementById("newModEmailInput").addEventListener("keydown", (e) => { if (e.key === "Enter") addModHandler(); });

  async function addModHandler() {
    const nameInput = document.getElementById("newModInput");
    const emailInput = document.getElementById("newModEmailInput");
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const errEl = document.getElementById("addModError");
    if (!name || !email) {
      errEl.textContent = "Please enter both a name and an email.";
      errEl.style.display = "block";
      return;
    }
    errEl.style.display = "none";
    nameInput.value = "";
    emailInput.value = "";
    await DataAPI.addMod(name, email);
    await loadAll();
  }

  // ---------------- mod edit popover (rename / update email) ----------------

  let editingModOriginalName = null;

  function openModEditPopover(mod) {
    editingModOriginalName = mod.name;
    document.getElementById("editModNameInput").value = mod.name;
    document.getElementById("editModEmailInput").value = mod.email || "";
    document.getElementById("editModError").style.display = "none";
    document.getElementById("modEditScrim").style.display = "flex";
  }

  function closeModEditPopover() {
    editingModOriginalName = null;
    document.getElementById("modEditScrim").style.display = "none";
  }

  document.getElementById("cancelModEditBtn").addEventListener("click", closeModEditPopover);
  document.getElementById("modEditScrim").addEventListener("click", (e) => {
    if (e.target.id === "modEditScrim") closeModEditPopover();
  });

  document.getElementById("saveModEditBtn").addEventListener("click", async () => {
    const name = document.getElementById("editModNameInput").value.trim();
    const email = document.getElementById("editModEmailInput").value.trim();
    const errEl = document.getElementById("editModError");
    if (!name || !email) {
      errEl.textContent = "Please enter both a name and an email.";
      errEl.style.display = "block";
      return;
    }
    const dup = state.mods.some(m => m.name !== editingModOriginalName && m.name.toLowerCase() === name.toLowerCase());
    if (dup) {
      errEl.textContent = "A mod with that name already exists.";
      errEl.style.display = "block";
      return;
    }
    errEl.style.display = "none";
    await DataAPI.updateMod(editingModOriginalName, name, email);
    if (state.focusedMod === editingModOriginalName) state.focusedMod = name;
    closeModEditPopover();
    await loadAll();
  });

  document.getElementById("deleteModEditBtn").addEventListener("click", async () => {
    if (!confirm(`Remove ${editingModOriginalName}? Their shifts will also be removed.`)) return;
    await DataAPI.deleteMod(editingModOriginalName);
    if (state.focusedMod === editingModOriginalName) state.focusedMod = null;
    closeModEditPopover();
    await loadAll();
  });

  // ---------------- theme toggle ----------------

  function updateThemeBtn() {
    const btn = document.getElementById("themeToggleBtn");
    if (btn && window.ThemeToggle) {
      btn.textContent = window.ThemeToggle.current() === "dark" ? "☀️" : "🌙";
    }
  }
  const themeBtn = document.getElementById("themeToggleBtn");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      window.ThemeToggle.toggle();
      updateThemeBtn();
    });
    updateThemeBtn();
  }

  // ---------------- edit mode / password ----------------

  function setEditMode(on) {
    state.editMode = on;
    document.getElementById("modePill").className = "mode-pill " + (on ? "edit" : "display");
    document.getElementById("modePill").innerHTML = `<span class="dot"></span>${on ? "Edit Mode" : "Display Mode"}`;
    document.getElementById("toggleModeBtn").textContent = on ? "Exit Edit Mode" : "Enter Edit Mode";
    document.getElementById("addModRow").style.display = on ? "block" : "none";
    document.getElementById("sidebarHelp").style.display = on ? "block" : "none";
    renderSidebar();
    renderShifts();
  }

  document.getElementById("toggleModeBtn").addEventListener("click", () => {
    if (state.editMode) {
      DataAPI.exitEditMode();
      setEditMode(false);
    } else {
      document.getElementById("editPasswordInput").value = "";
      document.getElementById("passwordError").style.display = "none";
      document.getElementById("passwordScrim").style.display = "flex";
      document.getElementById("editPasswordInput").focus();
    }
  });

  document.getElementById("cancelPasswordBtn").addEventListener("click", () => {
    document.getElementById("passwordScrim").style.display = "none";
  });

  async function submitPassword() {
    const pw = document.getElementById("editPasswordInput").value;
    const submitBtn = document.getElementById("submitPasswordBtn");
    const errEl = document.getElementById("passwordError");
    submitBtn.disabled = true;
    try {
      const ok = await DataAPI.verifyPassword(pw);
      if (ok) {
        document.getElementById("passwordScrim").style.display = "none";
        setEditMode(true);
      } else {
        errEl.textContent = "Incorrect password.";
        errEl.style.display = "block";
      }
    } catch (err) {
      console.error(err);
      errEl.textContent = "Couldn't reach Power Automate to check the password. Check the verifyPassword flow URL in config.js.";
      errEl.style.display = "block";
    } finally {
      submitBtn.disabled = false;
    }
  }
  document.getElementById("submitPasswordBtn").addEventListener("click", submitPassword);
  document.getElementById("editPasswordInput").addEventListener("keydown", (e) => { if (e.key === "Enter") submitPassword(); });

  // ---------------- clock ----------------

  function tickClock() {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: cfg.timeZone, weekday: "short", hour: "numeric", minute: "2-digit",
    });
    document.getElementById("ptClock").textContent = fmt.format(new Date()) + " PT";
  }
  tickClock();
  setInterval(tickClock, 15000);

  // ---------------- init ----------------

  renderGridSkeleton();
  setEditMode(false);
  loadAll();
})();
