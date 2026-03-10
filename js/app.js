/* global api, queueDB, charts, CONFIG */
(function () {
  // ============================================================
  // DOM references
  // ============================================================
  const form          = document.getElementById("visitForm");
  const statusEl      = document.getElementById("status");
  const lastLogEl     = document.getElementById("lastLog");

  const todayEl       = document.getElementById("todayTotal");
  const queueEl       = document.getElementById("queueCount");

  const staffList     = document.getElementById("staffList"); // reserved for future use

  const guestsEl      = document.getElementById("guests");
  const useNow        = document.getElementById("useNow");
  const useNowLabel   = document.getElementById("useNowLabel");
  const dateEl        = document.getElementById("date");
  const timeEl        = document.getElementById("time");

  const datetimeWrap  = document.getElementById("datetimeWrap");
  const timeHelpEl    = document.getElementById("timeHelp");

  const saveBtn       = document.getElementById("saveBtn");
  const liveClock     = document.getElementById("liveClock");

  const machineModeBtn = document.getElementById("machineModeBtn");
  const visitModeBtn   = document.getElementById("visitModeBtn");

  const categoryTrigger = document.getElementById("categoryTrigger");
  const categoryTriggerMain = document.getElementById("categoryTriggerMain");
  const categoryTriggerSub = document.getElementById("categoryTriggerSub");
  const categoryMenu = document.getElementById("categoryMenu");
  const categoryListEl = document.getElementById("categoryList");

  const logoEl = document.querySelector(".logo");
  const cursorSpinnerEl = document.getElementById("cursorSpinner");
  const staffEl = document.getElementById("staff");

  // ============================================================
  // Static category definitions (display + stored value)
  // ============================================================
  const VISIT_OPTIONS = [
    {
      value: "Group Walkthrough",
      title: "Örkynning / Group Walkthrough",
      description: "👋 Short 5 minute introduction"
    },
    {
      value: "Booked School Visit",
      title: "Bókaður hópur / Booked Visit",
      description: "🎓 Teacher-led group visit"
    },
    {
      value: "Introduction",
      title: "Kynning / Introduction",
      description: "🧭 Standard 1 hour introduction"
    },
    {
      value: "Just Visiting",
      title: "Kíkja / Just Visiting",
      description: "🚶 Informal drop-in visit"
    },
    {
      value: "Meeting",
      title: "Fundur / Meeting",
      description: "🗓️ Internal or external meeting"
    },
    {
      value: "3D Print Pickup",
      title: "Sækja 3D print / 3D print pickup",
      description: "📦 Picking up a finished 3D print"
    },
    {
      value: "Software Instructions",
      title: "Leiðbeiningar / Instructions (software)",
      description: "💻 Help with software or setup"
    },
    {
      value: "Prototyping Advice",
      title: "Ráðgjöf / Advice (prototyping)",
      description: "💡 Guidance on prototyping work"
    },
    {
      value: "Teacher Guidance",
      title: "Kennara Handleiðsla / Teachers Guidance",
      description: "🧑‍🏫 Support session for teachers"
    },
    {
      value: "Prototyping Session",
      title: "Þróun / Prototyping",
      description: "🧪 Project development and making"
    },
    {
      value: "Workshop",
      title: "Námskeið / Workshop",
      description: "🛠️ Scheduled workshop session"
    },
    {
      value: "Shopbot Safety",
      title: "Öryggisnámskeið / Shopbot Safety",
      description: "⚠️ Safety training for ShopBot use"
    }
  ];

  const MACHINE_OPTIONS = [
    {
      value: "Laser",
      title: "Laser",
      description: "🔥 Laser cutting and engraving"
    },
    {
      value: "3D Printer",
      title: "3D Printer",
      description: "🧱 FDM 3D printing"
    },
    {
      value: "Vinyl Cutter",
      title: "Vinyl Cutter",
      description: "✂️ Vinyl and heat transfer cutting"
    },
    {
      value: "Embroidery Machine",
      title: "Embroidery Machine",
      description: "🧵 Digital embroidery work"
    },
    {
      value: "3D Scanner",
      title: "3D Scan",
      description: "📡 3D scanning and digitizing"
    },
    {
      value: "Shopbot",
      title: "Shopbot",
      description: "🪚 Large CNC router"
    },
    {
      value: "Clay Printer",
      title: "Clay Printer",
      description: "🏺 Clay and ceramic printing"
    },
    {
      value: "Vacuum Former",
      title: "Vacuum Former",
      description: "♨️ Plastic thermoforming"
    },
    {
      value: "PCB CNC",
      title: "PCB CNC",
      description: "🔌 PCB milling"
    },
    {
      value: "CNC Area",
      title: "Verkstæði / Shopbot Area",
      description: "🏭 Main workshop and large machines"
    },
    {
      value: "Electronics Area",
      title: "Rafeindasvæði / Electronics Area",
      description: "🔧 Electronics and soldering area"
    },
    {
      value: "Textile Area",
      title: "Textílsvæði / Textile Area",
      description: "🪡 Textiles, sewing, and soft materials"
    }
  ];

  const MACHINE_REASON_SET = new Set(MACHINE_OPTIONS.map(o => o.value));

  // ============================================================
  // Local state
  // ============================================================
  let isSaving = false;
  let lastSubmitAt = 0;
  let currentRefreshAbort = null;
  let pendingCount = 0;

  let backendOnline = true;
  let pingFails = 0;
  const PING_FAILS_TO_OFFLINE = 2;
  const PING_TIMEOUT_MS = 8000;
  const PING_INTERVAL_MS = 10000;

  let currentReasonType = ""; // "", "visit", "machine"
  let selectedCategory = null; // { value, title, description } | null

  // ============================================================
  // Small UI helpers
  // ============================================================
  function setNow() {
    const now = new Date();
    dateEl.value = now.toISOString().slice(0, 10);
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    timeEl.value = `${hh}:${mm}`;
  }

  function disableForm(disabled) {
    for (const el of form.querySelectorAll("input, select, textarea, button")) {
      el.disabled = !!disabled;
    }
  }

  function setStatus(msg, timeout = 3000) {
    statusEl.textContent = msg;
    if (timeout > 0) {
      setTimeout(() => {
        if (statusEl.textContent === msg) statusEl.textContent = "";
      }, timeout);
    }
  }

  function showLastLog(text, timeout = 5000) {
    if (!lastLogEl) return;

    lastLogEl.textContent = text;
    lastLogEl.classList.add("show");

    if (timeout > 0) {
      setTimeout(() => {
        if (lastLogEl.textContent === text) {
          lastLogEl.classList.remove("show");
          setTimeout(() => { lastLogEl.textContent = ""; }, 250);
        }
      }, timeout);
    }
  }

  let loadingLoopTimer = null;

  function startButtonLoadingBar_() {
    if (!saveBtn) return;

    saveBtn.classList.add("is-loading");
    if (logoEl) logoEl.classList.add("is-spinning");
    enableFakeCursor_();

    const restart = () => {
      if (!isSaving) return;

      saveBtn.classList.remove("is-loading");
      void saveBtn.offsetWidth;
      saveBtn.classList.add("is-loading");

      loadingLoopTimer = setTimeout(restart, 10000);
    };

    loadingLoopTimer = setTimeout(restart, 10000);
  }

  function stopButtonLoadingBar_() {
    if (!saveBtn) return;

    saveBtn.classList.remove("is-loading");
    if (logoEl) logoEl.classList.remove("is-spinning");
    disableFakeCursor_();

    if (loadingLoopTimer) {
      clearTimeout(loadingLoopTimer);
      loadingLoopTimer = null;
    }
  }

  function successPop() {
    if (!saveBtn) return;
    saveBtn.classList.remove("success-pop");
    void saveBtn.offsetWidth;
    saveBtn.classList.add("success-pop");
  }

  function updateFakeCursor_(x, y) {
    if (!cursorSpinnerEl) return;
    cursorSpinnerEl.style.left = `${x}px`;
    cursorSpinnerEl.style.top = `${y}px`;
  }

  function enableFakeCursor_() {
    document.documentElement.classList.add("saving-cursor");
    if (cursorSpinnerEl) cursorSpinnerEl.hidden = false;
  }

  function disableFakeCursor_() {
    document.documentElement.classList.remove("saving-cursor");
    if (cursorSpinnerEl) cursorSpinnerEl.hidden = true;
  }

  function focusStaffSoon_(delay = 30) {
    if (!staffEl) return;
    setTimeout(() => {
      try {
        staffEl.focus();
      } catch (_) {}
    }, delay);
  }

  // ============================================================
  // Celebration
  // ============================================================
  function milestoneStorageKey_() {
    return `fablab_last_milestone_${new Date().getFullYear()}`;
  }

  function isMilestone_(n) {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 && v % 1000 === 0;
  }

  function maybeCelebrateYearMilestone_(yearTotal) {
    const n = Number(yearTotal || 0);
    if (!isMilestone_(n)) return;

    const key = milestoneStorageKey_();
    const last = Number(localStorage.getItem(key) || "0");
    if (last === n) return;

    localStorage.setItem(key, String(n));
    celebrate_(n);
  }

  function celebrate_(yearTotal) {
    const overlay = document.createElement("div");
    overlay.className = "celebration-overlay";
    overlay.innerHTML = `
      <div class="celebration-box" role="dialog" aria-live="polite">
        🎉 Congratulations!<br>
        You are visitor <b>#${yearTotal}</b> of ${new Date().getFullYear()}!
        <div class="celebration-sub">Fab Lab Reykjavík</div>
        <div class="celebration-hint">Tap anywhere to close</div>
      </div>
    `;
    document.body.appendChild(overlay);

    if (typeof confetti === "function") {
      confetti({ particleCount: 220, spread: 120, origin: { y: 0.65 } });
      setTimeout(() => confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 } }), 250);
      setTimeout(() => confetti({ particleCount: 110, spread: 70, origin: { y: 0.55 } }), 520);
    }

    const close = () => overlay.remove();
    overlay.addEventListener("click", close);
    setTimeout(close, 5500);
  }

  // ============================================================
  // Time mode UX
  // ============================================================
  function updateTimeMode() {
    const custom = !useNow.checked;

    if (useNow.checked) {
      setNow();
      if (useNowLabel) useNowLabel.textContent = "Use current time";
    } else {
      if (useNowLabel) useNowLabel.textContent = "Use custom time";
    }

    dateEl.disabled = timeEl.disabled = useNow.checked;

    if (timeHelpEl) timeHelpEl.hidden = !custom;
    if (datetimeWrap) datetimeWrap.classList.toggle("custom-time", custom);
  }

  // ============================================================
  // Category UI
  // ============================================================
  function setButtonState_(btn, active) {
    if (!btn) return;
    btn.classList.toggle("active", !!active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function getCurrentOptions_() {
    if (currentReasonType === "visit") return VISIT_OPTIONS;
    if (currentReasonType === "machine") return MACHINE_OPTIONS;
    return [];
  }

  function closeCategoryMenu_() {
    if (!categoryMenu || !categoryTrigger) return;
    categoryMenu.hidden = true;
    categoryTrigger.setAttribute("aria-expanded", "false");
  }

  function openCategoryMenu_() {
    if (!categoryMenu || !categoryTrigger || categoryTrigger.disabled) return;
    renderCategoryOptions_();
    categoryMenu.hidden = false;
    categoryTrigger.setAttribute("aria-expanded", "true");
  }

  function toggleCategoryMenu_() {
    if (categoryMenu.hidden) openCategoryMenu_();
    else closeCategoryMenu_();
  }

  function updateCategoryTrigger_() {
    if (!categoryTrigger) return;

    if (!currentReasonType) {
      categoryTrigger.disabled = true;
      categoryTriggerMain.textContent = "Pick a category";
      categoryTriggerSub.textContent = "Choose Equipment or Visiting first";
      return;
    }

    categoryTrigger.disabled = false;

    if (selectedCategory) {
      categoryTriggerMain.textContent = selectedCategory.title;
      categoryTriggerSub.textContent = selectedCategory.description;
    } else {
      categoryTriggerMain.textContent = "Pick a category";
      categoryTriggerSub.textContent = currentReasonType === "visit"
        ? "Choose a visit reason"
        : "Choose a machine or area";
    }
  }

  function renderCategoryOptions_() {
    if (!categoryListEl) return;

    const options = getCurrentOptions_();

    categoryListEl.innerHTML = options.map((opt) => {
      const selected = selectedCategory && selectedCategory.value === opt.value;
      return `
        <button
          type="button"
          class="category-option${selected ? " is-selected" : ""}"
          data-value="${escapeHtml_(opt.value)}"
          role="option"
          aria-selected="${selected ? "true" : "false"}"
        >
          <span class="category-option-title">${escapeHtml_(opt.title)}</span>
          <span class="category-option-desc">${escapeHtml_(opt.description)}</span>
        </button>
      `;
    }).join("");
  }

  function setReasonType_(nextType) {
    const normalized = (nextType === "machine" || nextType === "visit") ? nextType : "";
    if (currentReasonType === normalized) return;

    currentReasonType = normalized;
    selectedCategory = null;

    setButtonState_(machineModeBtn, currentReasonType === "machine");
    setButtonState_(visitModeBtn, currentReasonType === "visit");

    closeCategoryMenu_();
    updateCategoryTrigger_();
  }

  function resetCategoryMode_() {
    currentReasonType = "";
    selectedCategory = null;

    setButtonState_(machineModeBtn, false);
    setButtonState_(visitModeBtn, false);

    closeCategoryMenu_();
    updateCategoryTrigger_();
  }

  function findOptionByValue_(value, type) {
    const arr = type === "visit" ? VISIT_OPTIONS : type === "machine" ? MACHINE_OPTIONS : [];
    return arr.find((x) => x.value === value) || null;
  }

  function isValidCategoryForCurrentMode_(value) {
    return !!findOptionByValue_(value, currentReasonType);
  }

  function getReasonLabelForLastLog_() {
    if (!selectedCategory) return "—";
    return selectedCategory.title;
  }

  function escapeHtml_(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  // ============================================================
  // Clock + connectivity
  // ============================================================
  function formatClockLine(d) {
    const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
    const month   = d.toLocaleDateString(undefined, { month: "long" });
    const day     = d.getDate();
    const year    = d.getFullYear();
    const time    = d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    return `${weekday}, ${day}. ${month}, ${year} - ${time}`;
  }

  function renderClock() {
    if (!liveClock) return;

    if (!backendOnline) {
      liveClock.textContent = pendingCount > 0
        ? `OFFLINE • Pending: ${pendingCount}`
        : "OFFLINE";
      liveClock.classList.add("offline");
      return;
    }

    const base = formatClockLine(new Date());
    liveClock.textContent = pendingCount > 0
      ? `${base} • Pending: ${pendingCount}`
      : base;

    liveClock.classList.remove("offline");
  }

  async function backendPingOnce() {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);

    try {
      const res = await api.ping({ signal: ctrl.signal });
      if (res && res.ok) {
        pingFails = 0;
        backendOnline = true;
        return;
      }
      pingFails++;
    } catch {
      pingFails++;
    } finally {
      clearTimeout(t);
      if (pingFails >= PING_FAILS_TO_OFFLINE) backendOnline = false;
    }
  }

  function startBackendMonitor() {
    backendPingOnce().then(renderClock);

    setInterval(() => {
      if (document.visibilityState !== "visible") return;
      backendPingOnce().then(renderClock);
    }, PING_INTERVAL_MS);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        backendPingOnce().then(renderClock);
      }
    });

    window.addEventListener("offline", () => {
      backendOnline = false;
      renderClock();
    });

    window.addEventListener("online", () => {
      backendPingOnce().then(renderClock);
    });
  }

  // ============================================================
  // Backend-driven schools only
  // ============================================================
  function loadMetaIntoUI_(meta) {
    if (!meta || !meta.ok) return;
    const schools = Array.isArray(meta.schools) ? meta.schools : [];
    const schoolList = document.getElementById("schoolList");
    if (schoolList) {
      schoolList.innerHTML = schools.map(s => `<option value="${escapeHtml_(s)}">`).join("");
    }
  }

  api.getMeta().then(loadMetaIntoUI_).catch(() => {});

  // ============================================================
  // Queue helpers
  // ============================================================
  async function refreshQueueCount() {
    const items = await queueDB.readAll();
    pendingCount = items.length;
    queueEl.textContent = String(pendingCount);
    renderClock();
  }

  async function flushQueue() {
    const remaining = await queueDB.flush(api.postVisit);
    pendingCount = remaining;
    queueEl.textContent = String(pendingCount);
    renderClock();
  }

  // ============================================================
  // Chart helpers
  // ============================================================
  function getWeekStartLocal(d = new Date()) {
    const day = d.getDay();
    const diffFromMon = (day === 0 ? -6 : 1 - day);
    const mon = new Date(d);
    mon.setHours(0, 0, 0, 0);
    mon.setDate(d.getDate() + diffFromMon);
    return mon;
  }

  function monToFriLocal(mon) {
    return Array.from({ length: 5 }, (_, i) => {
      const dt = new Date(mon);
      dt.setDate(mon.getDate() + i);
      dt.setHours(0, 0, 0, 0);
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

  function toArray(obj) {
    const entries = Object.entries(obj || {}).sort((a, b) => a[0].localeCompare(b[0]));
    return [entries.map(e => e[0]), entries.map(e => e[1])];
  }

  // ============================================================
  // Summary + charts
  // ============================================================
  async function refreshSummary() {
    if (currentRefreshAbort) currentRefreshAbort.abort();
    const abortCtrl = new AbortController();
    currentRefreshAbort = abortCtrl;

    const res = await api.getSummary();
    if (!res.ok) return;

    backendOnline = true;
    pingFails = 0;
    renderClock();

    todayEl.textContent = String(res.today_total ?? 0);

    (function renderWeek() {
      const mon = getWeekStartLocal(new Date());
      const days = monToFriLocal(mon);
      const labels = days.map(labelDowMonDay);
      const keys = days.map(ymdLocal);
      const counts = keys.map(k => Number((res.week_buckets || {})[k] || 0));
      charts.bar("chartWeek", labels, counts, "Visitors this week");
    })();

    const [reasonLabels, reasonVals] = toArray(res.by_reason);
    charts.bar("chartReason", reasonLabels, reasonVals, "Visitors by Reason");

    const machines = {};
    for (const [reason, count] of Object.entries(res.by_reason || {})) {
      if (MACHINE_REASON_SET.has(reason)) machines[reason] = count;
    }
    const machinesSorted = Object.entries(machines).sort((a, b) => b[1] - a[1]);
    charts.pie(
      "chartMachines",
      machinesSorted.map(([k]) => k),
      machinesSorted.map(([, v]) => v),
      "Most Popular Machines"
    );

    (function renderWeekday() {
      const wdOrder = ["1", "2", "3", "4", "5", "6", "7"];
      const wdLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const wdVals = wdOrder.map(k => res.by_weekday?.[k] || 0);
      charts.bar("chartWeekday", wdLabels, wdVals, "Visitors by Weekday");
    })();

    (function renderMonth() {
      const [mKeys, mVals] = toArray(res.by_month);
      const mLabels = mKeys.map(k => {
        const d = new Date(k);
        return d.toLocaleString(undefined, { month: "long", year: "numeric" });
      });
      charts.bar("chartMonth", mLabels, mVals, "Visitors by Month");
    })();

    const [schoolLabels, schoolVals] = toArray(res.by_school);
    charts.bar("chartSchool", schoolLabels, schoolVals, "Visitors by School");

    (function renderHeatmapTotal() {
      const hm = res.by_hour_weekday || {};
      const hourLabels = Array.from({ length: 13 }, (_, i) => String(i + 9));
      const weekdayKeys = ["1", "2", "3", "4", "5"];
      const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri"];

      const z = [];
      for (let i = 0; i < weekdayKeys.length; i++) {
        const wdKey = weekdayKeys[i];
        const row = hm[wdKey] || {};
        for (let h = 9; h <= 21; h++) {
          z.push({ x: String(h), y: weekdayLabels[i], value: Number(row[h] || 0) });
        }
      }
      charts.heatmap("heatmap", z, hourLabels, weekdayLabels);
    })();

    (function renderHeatmapWalkins() {
      const hm = res.by_hour_weekday_walkin || {};
      const hourLabels = Array.from({ length: 13 }, (_, i) => String(i + 9));
      const weekdayKeys = ["1", "2", "3", "4", "5"];
      const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri"];

      const z = [];
      for (let i = 0; i < weekdayKeys.length; i++) {
        const wdKey = weekdayKeys[i];
        const row = hm[wdKey] || {};
        for (let h = 9; h <= 21; h++) {
          z.push({ x: String(h), y: weekdayLabels[i], value: Number(row[h] || 0) });
        }
      }
      charts.heatmap("heatmapWalkins", z, hourLabels, weekdayLabels);
    })();

    if (currentRefreshAbort === abortCtrl) currentRefreshAbort = null;
  }

  // ============================================================
  // Form submit
  // ============================================================
  saveBtn.addEventListener("mousedown", (e) => {
    if (isSaving) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nowMs = Date.now();
    if (nowMs - lastSubmitAt < 1500) return;
    lastSubmitAt = nowMs;

    if (isSaving) return;
    isSaving = true;

    const originalBtnText = saveBtn.textContent;
    disableForm(true);
    saveBtn.textContent = "Saving…";
    startButtonLoadingBar_();

    let finalStatusMsg = "";

    try {
      const staff  = staffEl ? staffEl.value.trim() : "";
      const guests = Math.max(1, parseInt(guestsEl?.value || "1", 10));
      const reason = selectedCategory ? selectedCategory.value : "";
      const reason_type = currentReasonType;
      const school = document.getElementById("school").value.trim();
      let notes    = document.getElementById("notes").value.trim();

      if (reason && !reason_type) {
        setStatus("Choose Equipment or Visiting first.", 3500);
        return;
      }

      if (reason && !isValidCategoryForCurrentMode_(reason)) {
        setStatus("Please choose a category from the selected list.", 3500);
        return;
      }

      if (!staff && !reason && !school && !notes) notes = "Button Press";

      let ts;
      if (!useNow.checked) {
        const d = dateEl.value;
        const t = timeEl.value || "00:00";
        const local = new Date(`${d}T${t}:00`);
        ts = new Date(local.getTime() - local.getTimezoneOffset() * 60000).toISOString();
      }

      const batchId = crypto.randomUUID();
      const basePayload = {
        ...(ts ? { ts } : {}),
        staff_id: staff,
        reason,
        reason_type,
        notes,
        school
      };

      let anyUploaded = false;

      for (let i = 0; i < guests; i++) {
        const ev = { ...basePayload, event_id: crypto.randomUUID(), seq: `${batchId}:${i}` };
        try {
          const res = await api.postVisit(ev);
          if (!res.ok) throw new Error(res.error || "post failed");
          anyUploaded = true;

          backendOnline = true;
          pingFails = 0;
          renderClock();
        } catch {
          await queueDB.enqueue(ev);
        }
      }

      finalStatusMsg = anyUploaded ? "✅ Uploaded" : "💾 Saved locally (offline)";

      showLastLog(`Last log: ${guests} guest(s) • ${getReasonLabelForLastLog_()} • ${staff || "—"}`);

      if (guestsEl) guestsEl.value = "1";
      document.getElementById("notes").value = "";
      document.getElementById("school").value = "";
      resetCategoryMode_();
      if (useNow.checked) setNow();

      refreshQueueCount();
      setTimeout(refreshSummary, 0);

      if (anyUploaded) {
        setTimeout(async () => {
          try {
            const s = await api.getSummary();
            if (s && s.ok) maybeCelebrateYearMilestone_(s.year_total);
          } catch (_) {}
        }, 0);
      }

      if (anyUploaded) successPop();

      setStatus(finalStatusMsg);
    } finally {
      stopButtonLoadingBar_();
      saveBtn.textContent = originalBtnText;
      disableForm(false);
      updateCategoryTrigger_();
      isSaving = false;

      if (saveBtn) saveBtn.blur();
      focusStaffSoon_(30);
    }
  });

  // ============================================================
  // Keyboard UX
  // ============================================================
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const notesEl = document.getElementById("notes");
      if (notesEl && document.activeElement === notesEl) {
        notesEl.value = "";
        e.preventDefault();
        return;
      }
      closeCategoryMenu_();
    }
  });

  // ============================================================
  // Boot
  // ============================================================
  if (guestsEl) {
    guestsEl.addEventListener("focus", () => guestsEl.select());
    guestsEl.addEventListener("click", () => guestsEl.select());
  }

  if (machineModeBtn) {
    machineModeBtn.addEventListener("click", () => {
      setReasonType_("machine");
    });
  }

  if (visitModeBtn) {
    visitModeBtn.addEventListener("click", () => {
      setReasonType_("visit");
    });
  }

  if (categoryTrigger) {
    categoryTrigger.addEventListener("click", () => {
      if (!currentReasonType) return;
      toggleCategoryMenu_();
    });
  }

  if (categoryListEl) {
    categoryListEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".category-option");
      if (!btn) return;

      const value = btn.getAttribute("data-value");
      const opt = findOptionByValue_(value, currentReasonType);
      if (!opt) return;

      selectedCategory = opt;
      updateCategoryTrigger_();
      closeCategoryMenu_();
    });
  }

  document.addEventListener("click", (e) => {
    const insidePicker = e.target.closest(".category-picker-wrap");
    const insideToggle = e.target.closest(".category-toggle");
    if (!insidePicker && !insideToggle) {
      closeCategoryMenu_();
    }
  });

  document.addEventListener("mousemove", (e) => {
    updateFakeCursor_(e.clientX, e.clientY);
  });

  document.addEventListener("mousedown", (e) => {
    updateFakeCursor_(e.clientX, e.clientY);
  });

  setNow();
  updateTimeMode();
  useNow.addEventListener("change", updateTimeMode);

  resetCategoryMode_();

  setInterval(() => {
    if (useNow.checked && !isSaving) setNow();
  }, 1000);

  renderClock();
  setInterval(renderClock, 1000);

  startBackendMonitor();

  refreshQueueCount();
  refreshSummary();

  setInterval(() => {
    if (!currentRefreshAbort) refreshSummary();
  }, CONFIG.REFRESH_MS);

  setInterval(flushQueue, CONFIG.FLUSH_MS);

  window.addEventListener("online", () => {
    flushQueue();
    refreshSummary();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshSummary();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }

  // Focus staff field on load so keyboard navigation works immediately
  focusStaffSoon_(80);

  // ============================================================
  // Theme toggle
  // ============================================================
  (function themeToggle() {
    const KEY  = "fablab_theme";
    const root = document.documentElement;
    const btn  = document.getElementById("themeToggle");
    if (!btn) return;

    const iconEl = btn.querySelector(".icon");

    function initialTheme() {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") return saved;
      return "dark";
    }

    function applyTheme(mode) {
      root.setAttribute("data-theme", mode);
      if (iconEl) iconEl.textContent = mode === "light" ? "🌙" : "☀️";
      btn.setAttribute("aria-label", `Switch to ${mode === "light" ? "dark" : "light"} theme`);
      btn.setAttribute("aria-pressed", mode === "dark" ? "true" : "false");
    }

    applyTheme(initialTheme());

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const current = root.getAttribute("data-theme") || initialTheme();
      const next = current === "light" ? "dark" : "light";
      localStorage.setItem(KEY, next);
      applyTheme(next);
    });
  })();
})();