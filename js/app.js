/* global api, queueDB, charts, CONFIG */
(function () {
  // -------- DOM refs --------
  const form       = document.getElementById("visitForm");
  const statusEl   = document.getElementById("status");
  const todayEl    = document.getElementById("todayTotal");
  const queueEl    = document.getElementById("queueCount");
  const reasonList = document.getElementById("reasonList");
  const staffList  = document.getElementById("staffList"); // kept for future use
  const useNow     = document.getElementById("useNow");
  const dateEl     = document.getElementById("date");
  const timeEl     = document.getElementById("time");
  const saveBtn    = document.getElementById("saveBtn");

  // -------- State for de-duping clicks --------
  let isSaving = false;
  let lastSubmitAt = 0;

  // -------- Date helpers --------
  function setNow() {
    const now = new Date();
    dateEl.value = now.toISOString().slice(0, 10);
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    timeEl.value = `${hh}:${mm}`;
  }

  // Monday (local), then Mon..Fri local Date objects
  function getWeekStartLocal(d = new Date()) {
    const day = d.getDay(); // 0..6 (Sun..Sat)
    const diffFromMon = (day === 0 ? -6 : 1 - day);
    const mon = new Date(d);
    mon.setHours(0,0,0,0);
    mon.setDate(d.getDate() + diffFromMon);
    return mon;
  }
  function monToFriLocal(mon) {
    return Array.from({ length: 5 }, (_, i) => {
      const dt = new Date(mon);
      dt.setDate(mon.getDate() + i);
      dt.setHours(0,0,0,0);
      return dt;
    });
  }
  function ymdLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function labelDowMonDay(date) {
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  // -------- Init date/time controls --------
  setNow();
  useNow.addEventListener("change", () => {
    if (useNow.checked) setNow();
    dateEl.disabled = timeEl.disabled = useNow.checked;
  });

  // -------- Load meta (reasons) --------
  api.getMeta().then(({ ok, reasons }) => {
    if (!ok || !Array.isArray(reasons)) return;
    reasonList.innerHTML = reasons.map(r => `<option value="${r}">`).join("");
  });

  // -------- Helpers: disable / enable whole form --------
  function disableForm(disabled) {
    for (const el of form.querySelectorAll("input, select, textarea, button")) {
      el.disabled = !!disabled;
    }
  }

  // Block accidental double-clicks before submit fires
  saveBtn.addEventListener("mousedown", (e) => {
    if (isSaving) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // -------- Submit handler --------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Throttle: ignore if < 1500ms since last submit
    const nowMs = Date.now();
    if (nowMs - lastSubmitAt < 1500) return;
    lastSubmitAt = nowMs;

    if (isSaving) return;
    isSaving = true;

    const originalBtnText = saveBtn.textContent;
    disableForm(true);
    saveBtn.textContent = "Saving…";

    try {
      const staff  = document.getElementById("staff").value.trim();
      const guests = Math.max(1, parseInt(document.getElementById("guests").value || "1", 10));
      const reason = document.getElementById("reason").value.trim();
      const school = document.getElementById("school").value.trim();
      let notes    = document.getElementById("notes").value.trim();

      // If all optional fields are empty -> auto notes
      if (!staff && !reason && !school && !notes) notes = "Button Press";

      // Optional custom timestamp (local -> UTC ISO)
      let ts;
      if (!useNow.checked) {
        const d = dateEl.value;            // yyyy-mm-dd
        const t = timeEl.value || "00:00"; // HH:MM
        const local = new Date(`${d}T${t}:00`);
        ts = new Date(local.getTime() - local.getTimezoneOffset() * 60000).toISOString();
      }

      // Post N events (guests). Carry a batch id in seq to help de-dupe later if needed.
      const batchId = crypto.randomUUID();
      const basePayload = { ...(ts ? { ts } : {}), staff_id: staff, reason, notes, school };

      let anyUploaded = false;
      for (let i = 0; i < guests; i++) {
        const ev = { ...basePayload, event_id: crypto.randomUUID(), seq: `${batchId}:${i}` };
        try {
          const res = await api.postVisit(ev);
          if (!res.ok) throw new Error(res.error || "post failed");
          anyUploaded = true;
        } catch {
          await queueDB.enqueue(ev);
        }
      }

      statusEl.textContent = anyUploaded ? "✅ Uploaded" : "💾 Saved locally (offline)";

      // Reset light
      document.getElementById("guests").value = "1";
      document.getElementById("reason").value = "";
      document.getElementById("notes").value  = "";
      document.getElementById("school").value = "";
      if (useNow.checked) setNow();

      await refreshQueueCount();
      await refreshSummary(); // reflect immediately
    } finally {
      saveBtn.textContent = originalBtnText;
      disableForm(false);
      isSaving = false;
    }
  });

  // -------- Queue helpers --------
  async function refreshQueueCount() {
    const items = await queueDB.readAll();
    queueEl.textContent = String(items.length);
  }

  async function flushQueue() {
    const remaining = await queueDB.flush(api.postVisit);
    queueEl.textContent = String(remaining);
    if (remaining === 0) statusEl.textContent = "✅ Synced";
  }

  // -------- Util: object -> [labels, data] sorted by key --------
  function toArray(obj) {
    const entries = Object.entries(obj || {}).sort((a, b) => a[0].localeCompare(b[0]));
    return [entries.map(e => e[0]), entries.map(e => e[1])];
  }

  // Track and cancel overlapping refreshes
  let currentRefreshAbort = null;

  // -------- Summary + charts --------
  async function refreshSummary() {
    if (currentRefreshAbort) currentRefreshAbort.abort();
    const abortCtrl = new AbortController();
    currentRefreshAbort = abortCtrl;

    const res = await api.getSummary();
    if (!res.ok) return;

    // KPI
    todayEl.textContent = String(res.today_total ?? 0);

    // Week (Mon..Fri) — dynamic labels updated each week (LOCAL dates)
    (function renderWeek() {
      const mon   = getWeekStartLocal(new Date());
      const days  = monToFriLocal(mon);
      const labels = days.map(labelDowMonDay);
      const keys   = days.map(ymdLocal);
      const counts = keys.map(k => Number((res.week_buckets || {})[k] || 0));
      charts.bar("chartWeek", labels, counts, "Visitors this week");
    })();

    // Reason (bar)
    const [reasonLabels, reasonVals] = toArray(res.by_reason);
    charts.bar("chartReason", reasonLabels, reasonVals, "Visitors by Reason");

    // Most Popular Machines (pie)
    const MACHINE_SET = new Set([
      "Casting/Molding","Clay Printer","Embroidery Machine",
      "Laser","PCB","Sewing","Vacuum Former","Shopbot",
      "Vinyl Cutter","3D Printer"
    ]);
    const machines = {};
    for (const [reason, count] of Object.entries(res.by_reason || {})) {
      if (MACHINE_SET.has(reason)) machines[reason] = count;
    }
    const machinesSorted = Object.entries(machines).sort((a,b) => b[1] - a[1]);
    charts.pie(
      "chartMachines",
      machinesSorted.map(([k]) => k),
      machinesSorted.map(([,v]) => v),
      "Most Popular Machines"
    );

    // Weekday (Mon..Sun)
    (function renderWeekday() {
      const wdOrder  = ["1","2","3","4","5","6","7"];
      const wdLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
      const wdVals   = wdOrder.map(k => res.by_weekday?.[k] || 0);
      charts.bar("chartWeekday", wdLabels, wdVals, "Visitors by Weekday");
    })();

    // Month
    (function renderMonth() {
      const [mKeys, mVals] = toArray(res.by_month);
      const mLabels = mKeys.map(k => {
        const d = new Date(k);
        return d.toLocaleString(undefined, { month: "long", year: "numeric" });
      });
      charts.bar("chartMonth", mLabels, mVals, "Visitors by Month");
    })();

    // School
    const [schoolLabels, schoolVals] = toArray(res.by_school);
    charts.bar("chartSchool", schoolLabels, schoolVals, "Visitors by School");

    // Heatmap (TOTAL visitors): Hour × Weekday
    (function renderHeatmapTotal() {
      const hm = res.by_hour_weekday || {};
      const hourLabels    = Array.from({ length: 13 }, (_, i) => String(i + 9));  // "9".."21"
      const weekdayKeys   = ["1","2","3","4","5"];                                 // Mon..Fri
      const weekdayLabels = ["Mon","Tue","Wed","Thu","Fri"];

      const z = [];
      for (let i = 0; i < weekdayKeys.length; i++) {
        const wdKey = weekdayKeys[i];
        const row = hm[wdKey] || {};
        for (let h = 9; h <= 21; h++) {
          const v = Number(row[h] || 0);
          z.push({ x: String(h), y: weekdayLabels[i], value: v });
        }
      }
      charts.heatmap("heatmap", z, hourLabels, weekdayLabels);
    })();

    // Heatmap (WALK-INS only): Hour × Weekday
    (function renderHeatmapWalkins() {
      const hm = res.by_hour_weekday_walkin || {};
      const hourLabels    = Array.from({ length: 13 }, (_, i) => String(i + 9));  // "9".."21"
      const weekdayKeys   = ["1","2","3","4","5"];                                 // Mon..Fri
      const weekdayLabels = ["Mon","Tue","Wed","Thu","Fri"];

      const z = [];
      for (let i = 0; i < weekdayKeys.length; i++) {
        const wdKey = weekdayKeys[i];
        const row = hm[wdKey] || {};
        for (let h = 9; h <= 21; h++) {
          const v = Number(row[h] || 0);
          z.push({ x: String(h), y: weekdayLabels[i], value: v });
        }
      }
      charts.heatmap("heatmapWalkins", z, hourLabels, weekdayLabels);
    })();

    if (currentRefreshAbort === abortCtrl) currentRefreshAbort = null;
  }

  // -------- Boot --------
  refreshQueueCount();
  refreshSummary();

  // Avoid overlapping refreshes (use simple ticking lock via currentRefreshAbort)
  setInterval(() => { if (!currentRefreshAbort) refreshSummary(); }, CONFIG.REFRESH_MS);
  setInterval(flushQueue, CONFIG.FLUSH_MS);

  // Flush as soon as we’re back online, then refresh charts
  window.addEventListener("online", () => { flushQueue(); refreshSummary(); });

  // Refresh when tab becomes visible (cheap, responsive)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshSummary();
  });

  // PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }

  // -------- Theme toggle (robust) --------
  (function themeToggle() {
    const KEY  = "fablab_theme";
    const root = document.documentElement;
    const btn  = document.getElementById("themeToggle");
    if (!btn) return;

    const iconEl = btn.querySelector(".icon"); // may be null; we guard below

    function initialTheme() {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") return saved;
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      return prefersDark ? "dark" : "light";
    }

    function applyTheme(mode) {
      root.setAttribute("data-theme", mode);
      if (iconEl) iconEl.textContent = mode === "light" ? "🌙" : "☀️";
      btn.setAttribute("aria-label", `Switch to ${mode === "light" ? "dark" : "light"} theme`);
      btn.setAttribute("aria-pressed", mode === "dark" ? "true" : "false");
    }

    // Init
    let theme = initialTheme();
    applyTheme(theme);

    // Reflect OS changes only if user hasn't chosen manually
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = (e) => {
      if (!localStorage.getItem(KEY)) {
        theme = e.matches ? "dark" : "light";
        applyTheme(theme);
      }
    };
    if (mq.addEventListener) mq.addEventListener("change", onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);

    // Toggle on click
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const current = root.getAttribute("data-theme") || initialTheme();
      const next = current === "light" ? "dark" : "light";
      localStorage.setItem(KEY, next);
      applyTheme(next);
    });
  })();
})();
