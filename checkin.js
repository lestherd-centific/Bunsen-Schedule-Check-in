/* ============================================================
   CENTIFIC MOD SCHEDULER — check in / out logic
   ============================================================ */

(function () {
  const cfg = window.APP_CONFIG;
  const REMEMBER_KEY = "centific_checkin_last_email";

  const emailInput = document.getElementById("emailInput");
  const statusDisplay = document.getElementById("statusDisplay");
  const statusDot = document.getElementById("statusDot");
  const statusHeadline = document.getElementById("statusHeadline");
  const statusSub = document.getElementById("statusSub");
  const checkInBtn = document.getElementById("checkInBtn");
  const checkOutBtn = document.getElementById("checkOutBtn");
  const checkinError = document.getElementById("checkinError");
  const checkinSuccess = document.getElementById("checkinSuccess");
  const logTable = document.getElementById("logTable");
  const logTableBody = document.getElementById("logTableBody");
  const logEmpty = document.getElementById("logEmpty");

  let debounceTimer = null;
  let currentEmail = "";

  function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  function fmtDatePT(iso) {
    return new Intl.DateTimeFormat("en-US", { timeZone: cfg.timeZone, month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
  }
  function fmtTimePT(iso) {
    return new Intl.DateTimeFormat("en-US", { timeZone: cfg.timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " PT";
  }
  function relativeSince(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.round(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hrs}h ${rem}m ago`;
  }

  function clearMessages() {
    checkinError.style.display = "none";
    checkinSuccess.style.display = "none";
  }

  async function refreshForEmail(email) {
    currentEmail = email;
    try {
      localStorage.setItem(REMEMBER_KEY, email);
    } catch (e) { /* ignore */ }

    document.getElementById("demoBanner").style.display = DataAPI.isDemoMode("checkInOut") ? "flex" : "none";

    let entries = [];
    try {
      entries = await DataAPI.getCheckIns(email);
    } catch (err) {
      console.error(err);
      checkinError.textContent = "Couldn't reach Power Automate. Check the flow URL in config.js.";
      checkinError.style.display = "block";
    }

    statusDisplay.style.display = "block";
    const latest = entries[0];
    const isIn = latest && latest.action === "in";

    statusDot.className = "status-dot-lg " + (isIn ? "in" : "out");
    if (!latest) {
      statusHeadline.textContent = "No activity yet";
      statusSub.textContent = "Check in whenever you arrive in office.";
    } else if (isIn) {
      statusHeadline.textContent = "Checked In";
      statusSub.textContent = `Since ${fmtTimePT(latest.timestampUtc)} · ${relativeSince(latest.timestampUtc)}`;
    } else {
      statusHeadline.textContent = "Checked Out";
      statusSub.textContent = `Last checked out ${fmtTimePT(latest.timestampUtc)} · ${relativeSince(latest.timestampUtc)}`;
    }
    checkInBtn.disabled = !!isIn;
    checkOutBtn.disabled = !isIn;

    renderLog(entries);
  }

  function renderLog(entries) {
    if (!entries || entries.length === 0) {
      logTable.style.display = "none";
      logEmpty.style.display = "block";
      logEmpty.textContent = "No check-ins recorded yet for this email.";
      return;
    }
    logTable.style.display = "table";
    logEmpty.style.display = "none";
    logTableBody.innerHTML = "";
    entries.slice(0, 20).forEach(e => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="pill-action ${e.action === 'in' ? 'in' : 'out'}">${e.action === 'in' ? 'Checked In' : 'Checked Out'}</span></td>
        <td>${fmtDatePT(e.timestampUtc)}</td>
        <td>${fmtTimePT(e.timestampUtc)}</td>
      `;
      logTableBody.appendChild(tr);
    });
  }

  emailInput.addEventListener("input", () => {
    clearMessages();
    clearTimeout(debounceTimer);
    const v = emailInput.value.trim();
    if (!isValidEmail(v)) {
      statusDisplay.style.display = "none";
      logTable.style.display = "none";
      logEmpty.style.display = "block";
      logEmpty.textContent = "Enter your email above to see your check-in history.";
      return;
    }
    debounceTimer = setTimeout(() => refreshForEmail(v), 400);
  });

  checkInBtn.addEventListener("click", () => doAction("in"));
  checkOutBtn.addEventListener("click", () => doAction("out"));

  async function doAction(action) {
    if (!isValidEmail(currentEmail)) return;
    clearMessages();
    checkInBtn.disabled = true;
    checkOutBtn.disabled = true;
    try {
      await DataAPI.checkInOut(currentEmail, action);
      checkinSuccess.textContent = action === "in" ? "You're checked in. Have a great day!" : "You're checked out. See you next time!";
      checkinSuccess.style.display = "block";
      await refreshForEmail(currentEmail);
    } catch (err) {
      console.error(err);
      checkinError.textContent = "Couldn't record that. Check the Power Automate flow URL in config.js and try again.";
      checkinError.style.display = "block";
      checkInBtn.disabled = false;
      checkOutBtn.disabled = false;
    }
  }

  function tickClock() {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: cfg.timeZone, weekday: "short", hour: "numeric", minute: "2-digit" });
    document.getElementById("ptClock").textContent = fmt.format(new Date()) + " PT";
  }
  tickClock();
  setInterval(tickClock, 15000);

  // restore last-used email for convenience
  try {
    const remembered = localStorage.getItem(REMEMBER_KEY);
    if (remembered) {
      emailInput.value = remembered;
      refreshForEmail(remembered);
    }
  } catch (e) { /* ignore */ }
})();
