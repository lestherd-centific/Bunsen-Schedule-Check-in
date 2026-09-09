/* ============================================================
   CENTIFIC MOD SCHEDULER — calendar logic
   ============================================================ */

(function () {
  const cfg = window.APP_CONFIG;
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const SLOT_MIN = cfg.slotMinutes || 30;
  const SLOT_PX = 24;
  const SLOTS_PER_HOUR = 60 / SLOT_MIN;
  const HOUR_PX = SLOTS_PER_HOUR * SLOT_PX;
  const TOTAL_SLOTS = (24 * 60) / SLOT_MIN;
  const BODY_HEIGHT = TOTAL_SLOTS * SLOT_PX;
  const MIN_DURATION = SLOT_MIN;

  let state = { mods: [], shifts: [], editMode: false };
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
    const dayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(map.weekday);
    let hour = parseInt(map.hour, 10);
    if (hour === 24) hour = 0;
    const minute = parseInt(map.minute, 10);
    return { dayIdx, minutes: hour * 60 + minute };
  }

  // ---------------- data load ----------------

  async function loadAll() {
    try {
      const [mods, shifts] = await Promise.all([DataAPI.getMods(), DataAPI.getSchedule()]);
      state.mods = mods || [];
      state.shifts = shifts || [];
    } catch (err) {
      console.error(err);
      showTransientError("Couldn't load data from Power Automate. Check the flow URLs in config.js. Falling back to what's cached locally.");
    }
    document.getElementById("demoBanner").style.display = DataAPI.anyDemoMode() ? "flex" : "none";
    renderSidebar();
    renderShifts();
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
      li.className = "mod-chip";
      li.draggable = false;
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = colorForName(mod.name);
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = mod.name;
      li.appendChild(swatch);
      li.appendChild(name);
      if (state.editMode) {
        const rm = document.createElement("button");
        rm.className = "remove-btn";
        rm.innerHTML = "&times;";
        rm.title = "Remove mod";
        rm.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!confirm(`Remove ${mod.name}? Their shifts will also be removed.`)) return;
          await DataAPI.deleteMod(mod.name);
          await loadAll();
        });
        li.appendChild(rm);
        li.addEventListener("mousedown", (e) => startCreateDrag(e, mod.name));
      }
      list.appendChild(li);
    });
  }

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
    DAYS.forEach((d, i) => {
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
      lbl.className = "cal-time-label";
      lbl.style.top = (h * HOUR_PX) + "px";
      lbl.textContent = displayTime(h * 60).replace(":00", "");
      timeCol.appendChild(lbl);
    }
    grid.appendChild(timeCol);

    // day columns
    dayColEls = [];
    DAYS.forEach((d, i) => {
      const col = document.createElement("div");
      col.className = "cal-day-col";
      col.style.gridRow = "2";
      col.style.gridColumn = String(i + 2);
      col.style.height = BODY_HEIGHT + "px";
      col.dataset.dayIndex = String(i);
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

    DAYS.forEach((d, dayIdx) => {
      const col = dayColEls[dayIdx];
      const dayShifts = state.shifts.filter(s => s.day === d);
      const { laneOf, totalLanes } = computeLanes(dayShifts);

      dayShifts.forEach(shift => {
        const start = hhmmToMinutes(shift.start), end = hhmmToMinutes(shift.end);
        const lane = laneOf.get(shift) || 0;
        const widthPct = 100 / totalLanes;

        const block = document.createElement("div");
        block.className = "shift-block" + (state.editMode ? " editable" : "");
        block.style.top = ((start / 60) * HOUR_PX) + "px";
        block.style.height = Math.max(16, ((end - start) / 60) * HOUR_PX) + "px";
        block.style.left = `calc(${lane * widthPct}% + 3px)`;
        block.style.width = `calc(${widthPct}% - 6px)`;
        block.style.background = colorForName(shift.mod);
        block.innerHTML = `<span class="shift-name">${escapeHtml(shift.mod)}</span><span class="shift-time">${displayTime(start)} – ${displayTime(end)}</span>`;
        block.dataset.id = shift.id;

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
    let lockedDayIndex = null;
    let lockedColEl = null;
    let startMin = null;
    let currentMin = null;

    const ghost = document.createElement("div");
    ghost.className = "ghost-block";
    ghost.style.display = "none";

    function onMove(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const col = el && el.closest ? el.closest(".cal-day-col") : null;
      if (col && lockedColEl === null) {
        lockedColEl = col;
        lockedDayIndex = parseInt(col.dataset.dayIndex, 10);
        col.appendChild(ghost);
        ghost.style.display = "block";
        const rect = col.getBoundingClientRect();
        startMin = snap(((e.clientY - rect.top) / HOUR_PX) * 60);
        currentMin = startMin;
      } else if (lockedColEl) {
        const rect = lockedColEl.getBoundingClientRect();
        currentMin = snap(((e.clientY - rect.top) / HOUR_PX) * 60);
      }
      if (lockedColEl) {
        const lo = Math.min(startMin, currentMin);
        const hi = Math.max(startMin, currentMin);
        const dur = Math.max(hi - lo, MIN_DURATION);
        ghost.style.top = ((lo / 60) * HOUR_PX) + "px";
        ghost.style.height = ((dur / 60) * HOUR_PX) + "px";
      }
    }

    async function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      ghost.remove();
      if (lockedDayIndex === null) return;
      let lo = Math.min(startMin, currentMin);
      let hi = Math.max(startMin, currentMin);
      if (hi - lo < MIN_DURATION) hi = lo + 60; // simple click -> default 1hr
      hi = Math.min(hi, 24 * 60);
      await DataAPI.saveShift({
        id: "", mod: modName, day: DAYS[lockedDayIndex],
        start: minutesToHHMM(lo), end: minutesToHHMM(hi), notes: "",
      });
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
    const origDayIndex = DAYS.indexOf(shift.day);
    let moved = false;
    let newDayIndex = origDayIndex;
    let newStart = origStart;

    function onMove(e) {
      if (Math.abs(e.clientY - startClientY) > 4 || Math.abs(e.clientX - startClientX) > 4) moved = true;
      if (!moved) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const col = el && el.closest ? el.closest(".cal-day-col") : null;
      if (col) newDayIndex = parseInt(col.dataset.dayIndex, 10);
      const deltaMin = snap(((e.clientY - startClientY) / HOUR_PX) * 60);
      newStart = Math.max(0, Math.min(24 * 60 - duration, origStart + deltaMin));
    }

    async function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (!moved) {
        openShiftPopover(shift);
        return;
      }
      await DataAPI.saveShift({
        id: shift.id, mod: shift.mod, day: DAYS[newDayIndex],
        start: minutesToHHMM(newStart), end: minutesToHHMM(newStart + duration), notes: shift.notes || "",
      });
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
      await DataAPI.saveShift({
        id: shift.id, mod: shift.mod, day: shift.day,
        start: minutesToHHMM(newStart), end: minutesToHHMM(newEnd), notes: shift.notes || "",
      });
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
    daySelect.innerHTML = DAY_LABELS.map((d, i) => `<option value="${DAYS[i]}">${d}</option>`).join("");
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
    await DataAPI.saveShift({ id: popoverShift.id, mod: popoverShift.mod, day, start, end, notes: popoverShift.notes || "" });
    closeShiftPopover();
    await loadAll();
  });

  document.getElementById("deleteShiftBtn").addEventListener("click", async () => {
    if (!confirm("Delete this shift?")) return;
    await DataAPI.deleteShift(popoverShift.id);
    closeShiftPopover();
    await loadAll();
  });

  // ---------------- add mod ----------------

  document.getElementById("addModBtn").addEventListener("click", addModHandler);
  document.getElementById("newModInput").addEventListener("keydown", (e) => { if (e.key === "Enter") addModHandler(); });

  async function addModHandler() {
    const input = document.getElementById("newModInput");
    const name = input.value.trim();
    if (!name) return;
    input.value = "";
    await DataAPI.addMod(name);
    await loadAll();
  }

  // ---------------- edit mode / password ----------------

  function setEditMode(on) {
    state.editMode = on;
    document.getElementById("modePill").className = "mode-pill " + (on ? "edit" : "display");
    document.getElementById("modePill").innerHTML = `<span class="dot"></span>${on ? "Edit Mode" : "Display Mode"}`;
    document.getElementById("toggleModeBtn").textContent = on ? "Exit Edit Mode" : "Enter Edit Mode";
    document.getElementById("addModRow").style.display = on ? "flex" : "none";
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
