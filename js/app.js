/* global api, queueDB, charts, CONFIG */
(function () {
  // ============================================================
  // DOM references
  // ============================================================
  const form = document.getElementById("visitForm");
  const statusEl = document.getElementById("status");
  const lastLogEl = document.getElementById("lastLog");

  const todayEl = document.getElementById("todayTotal");
  const queueEl = document.getElementById("queueCount");

  const staffList = document.getElementById("staffList");

  const guestsEl = document.getElementById("guests");
  const useNow = document.getElementById("useNow");
  const useNowLabel = document.getElementById("useNowLabel");
  const dateEl = document.getElementById("date");
  const timeEl = document.getElementById("time");

  const datetimeWrap = document.getElementById("datetimeWrap");
  const timeHelpEl = document.getElementById("timeHelp");

  const saveBtn = document.getElementById("saveBtn");
  const liveClock = document.getElementById("liveClock");

  const machineModeBtn =
    document.getElementById("machineModeBtn");

  const visitModeBtn =
    document.getElementById("visitModeBtn");

  const categoryTrigger =
    document.getElementById("categoryTrigger");

  const categoryTriggerMain =
    document.getElementById("categoryTriggerMain");

  const categoryTriggerSub =
    document.getElementById("categoryTriggerSub");

  const categoryMenu =
    document.getElementById("categoryMenu");

  const categoryListEl =
    document.getElementById("categoryList");

  const logoEl =
    document.querySelector(".logo");

  const cursorSpinnerEl =
    document.getElementById("cursorSpinner");

  const staffEl =
    document.getElementById("staff");

  // ============================================================
  // Static category definitions
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

  const MACHINE_REASON_SET =
    new Set(
      MACHINE_OPTIONS.map(
        option => option.value
      )
    );

  // ============================================================
  // Local state
  // ============================================================
  let isSaving = false;
  let isFlushing = false;
  let lastSubmitAt = 0;
  let currentRefreshAbort = null;
  let pendingCount = 0;

  // null = checking
  // true = backend confirmed
  // false = backend unavailable
  //
  // This state is deliberately independent of chart loading.
  let backendOnline = null;
  let pingFails = 0;

  const PING_FAILS_TO_OFFLINE = 3;
  const PING_INTERVAL_MS = 30000;

  let currentReasonType = "";
  let selectedCategory = null;

  // ============================================================
  // Small UI helpers
  // ============================================================
  function setNow() {
    const now = new Date();

    dateEl.value =
      now.toISOString().slice(0, 10);

    const hours =
      String(now.getHours())
        .padStart(2, "0");

    const minutes =
      String(now.getMinutes())
        .padStart(2, "0");

    timeEl.value =
      `${hours}:${minutes}`;
  }

  function disableForm(disabled) {
    for (
      const element of
      form.querySelectorAll(
        "input, select, textarea, button"
      )
    ) {
      element.disabled =
        Boolean(disabled);
    }
  }

  function setStatus(
    message,
    timeout = 3000
  ) {
    statusEl.textContent = message;

    if (timeout > 0) {
      setTimeout(() => {
        if (
          statusEl.textContent ===
          message
        ) {
          statusEl.textContent = "";
        }
      }, timeout);
    }
  }

  function showLastLog(
    text,
    timeout = 5000
  ) {
    if (!lastLogEl) {
      return;
    }

    lastLogEl.textContent = text;
    lastLogEl.classList.add("show");

    if (timeout > 0) {
      setTimeout(() => {
        if (
          lastLogEl.textContent ===
          text
        ) {
          lastLogEl.classList.remove(
            "show"
          );

          setTimeout(() => {
            lastLogEl.textContent = "";
          }, 250);
        }
      }, timeout);
    }
  }

  let loadingLoopTimer = null;

  function startButtonLoadingBar_() {
    if (!saveBtn) {
      return;
    }

    saveBtn.classList.add(
      "is-loading"
    );

    if (logoEl) {
      logoEl.classList.add(
        "is-spinning"
      );
    }

    enableFakeCursor_();

    const restart = () => {
      if (!isSaving) {
        return;
      }

      saveBtn.classList.remove(
        "is-loading"
      );

      void saveBtn.offsetWidth;

      saveBtn.classList.add(
        "is-loading"
      );

      loadingLoopTimer =
        setTimeout(
          restart,
          10000
        );
    };

    loadingLoopTimer =
      setTimeout(
        restart,
        10000
      );
  }

  function stopButtonLoadingBar_() {
    if (!saveBtn) {
      return;
    }

    saveBtn.classList.remove(
      "is-loading"
    );

    if (logoEl) {
      logoEl.classList.remove(
        "is-spinning"
      );
    }

    disableFakeCursor_();

    if (loadingLoopTimer) {
      clearTimeout(
        loadingLoopTimer
      );

      loadingLoopTimer = null;
    }
  }

  function successPop() {
    if (!saveBtn) {
      return;
    }

    saveBtn.classList.remove(
      "success-pop"
    );

    void saveBtn.offsetWidth;

    saveBtn.classList.add(
      "success-pop"
    );
  }

  function updateFakeCursor_(
    x,
    y
  ) {
    if (!cursorSpinnerEl) {
      return;
    }

    cursorSpinnerEl.style.left =
      `${x}px`;

    cursorSpinnerEl.style.top =
      `${y}px`;
  }

  function enableFakeCursor_() {
    document.documentElement
      .classList.add(
        "saving-cursor"
      );

    if (cursorSpinnerEl) {
      cursorSpinnerEl.hidden = false;
    }
  }

  function disableFakeCursor_() {
    document.documentElement
      .classList.remove(
        "saving-cursor"
      );

    if (cursorSpinnerEl) {
      cursorSpinnerEl.hidden = true;
    }
  }

  function focusStaffSoon_(
    delay = 30
  ) {
    if (!staffEl) {
      return;
    }

    setTimeout(() => {
      try {
        staffEl.focus();
      } catch (_) {
        // Focus failure is harmless.
      }
    }, delay);
  }

  // ============================================================
  // Celebration
  // ============================================================
  function milestoneStorageKey_() {
    return (
      `fablab_last_milestone_` +
      new Date().getFullYear()
    );
  }

  function isMilestone_(number) {
    const value = Number(number);

    return (
      Number.isFinite(value) &&
      value > 0 &&
      value % 1000 === 0
    );
  }

  function maybeCelebrateYearMilestone_(
    yearTotal
  ) {
    const number =
      Number(yearTotal || 0);

    if (!isMilestone_(number)) {
      return;
    }

    const key =
      milestoneStorageKey_();

    const last =
      Number(
        localStorage.getItem(key) ||
        "0"
      );

    if (last === number) {
      return;
    }

    localStorage.setItem(
      key,
      String(number)
    );

    celebrate_(number);
  }

  function celebrate_(yearTotal) {
    const overlay =
      document.createElement("div");

    overlay.className =
      "celebration-overlay";

    overlay.innerHTML = `
      <div
        class="celebration-box"
        role="dialog"
        aria-live="polite"
      >
        🎉 Congratulations!<br>
        You are visitor
        <b>#${yearTotal}</b>
        of ${new Date().getFullYear()}!

        <div class="celebration-sub">
          Fab Lab Reykjavík
        </div>

        <div class="celebration-hint">
          Tap anywhere to close
        </div>
      </div>
    `;

    document.body.appendChild(
      overlay
    );

    if (
      typeof confetti === "function"
    ) {
      confetti({
        particleCount: 220,
        spread: 120,
        origin: { y: 0.65 }
      });

      setTimeout(() => {
        confetti({
          particleCount: 140,
          spread: 90,
          origin: { y: 0.6 }
        });
      }, 250);

      setTimeout(() => {
        confetti({
          particleCount: 110,
          spread: 70,
          origin: { y: 0.55 }
        });
      }, 520);
    }

    const close = () => {
      overlay.remove();
    };

    overlay.addEventListener(
      "click",
      close
    );

    setTimeout(close, 5500);
  }

  // ============================================================
  // Time mode UX
  // ============================================================
  function updateTimeMode() {
    const custom =
      !useNow.checked;

    if (useNow.checked) {
      setNow();

      if (useNowLabel) {
        useNowLabel.textContent =
          "Use current time";
      }
    } else if (useNowLabel) {
      useNowLabel.textContent =
        "Use custom time";
    }

    dateEl.disabled =
      timeEl.disabled =
        useNow.checked;

    if (timeHelpEl) {
      timeHelpEl.hidden = !custom;
    }

    if (datetimeWrap) {
      datetimeWrap.classList.toggle(
        "custom-time",
        custom
      );
    }
  }

  // ============================================================
  // Category UI
  // ============================================================
  function setButtonState_(
    button,
    active
  ) {
    if (!button) {
      return;
    }

    button.classList.toggle(
      "active",
      Boolean(active)
    );

    button.setAttribute(
      "aria-pressed",
      active ? "true" : "false"
    );
  }

  function getCurrentOptions_() {
    if (
      currentReasonType === "visit"
    ) {
      return VISIT_OPTIONS;
    }

    if (
      currentReasonType === "machine"
    ) {
      return MACHINE_OPTIONS;
    }

    return [];
  }

  function closeCategoryMenu_() {
    if (
      !categoryMenu ||
      !categoryTrigger
    ) {
      return;
    }

    categoryMenu.hidden = true;

    categoryTrigger.setAttribute(
      "aria-expanded",
      "false"
    );
  }

  function openCategoryMenu_() {
    if (
      !categoryMenu ||
      !categoryTrigger ||
      categoryTrigger.disabled
    ) {
      return;
    }

    renderCategoryOptions_();

    categoryMenu.hidden = false;

    categoryTrigger.setAttribute(
      "aria-expanded",
      "true"
    );
  }

  function toggleCategoryMenu_() {
    if (categoryMenu.hidden) {
      openCategoryMenu_();
    } else {
      closeCategoryMenu_();
    }
  }

  function updateCategoryTrigger_() {
    if (!categoryTrigger) {
      return;
    }

    if (!currentReasonType) {
      categoryTrigger.disabled = true;

      categoryTriggerMain.textContent =
        "Pick a category";

      categoryTriggerSub.textContent =
        "Choose Equipment or Visiting first";

      return;
    }

    categoryTrigger.disabled = false;

    if (selectedCategory) {
      categoryTriggerMain.textContent =
        selectedCategory.title;

      categoryTriggerSub.textContent =
        selectedCategory.description;
    } else {
      categoryTriggerMain.textContent =
        "Pick a category";

      categoryTriggerSub.textContent =
        currentReasonType === "visit"
          ? "Choose a visit reason"
          : "Choose a machine or area";
    }
  }

  function renderCategoryOptions_() {
    if (!categoryListEl) {
      return;
    }

    const options =
      getCurrentOptions_();

    categoryListEl.innerHTML =
      options.map(option => {
        const selected =
          selectedCategory &&
          selectedCategory.value ===
            option.value;

        return `
          <button
            type="button"
            class="category-option${
              selected
                ? " is-selected"
                : ""
            }"
            data-value="${
              escapeHtml_(option.value)
            }"
            role="option"
            aria-selected="${
              selected
                ? "true"
                : "false"
            }"
          >
            <span class="category-option-title">
              ${escapeHtml_(option.title)}
            </span>

            <span class="category-option-desc">
              ${escapeHtml_(
                option.description
              )}
            </span>
          </button>
        `;
      }).join("");
  }

  function setReasonType_(
    nextType
  ) {
    const normalized =
      nextType === "machine" ||
      nextType === "visit"
        ? nextType
        : "";

    if (
      currentReasonType ===
      normalized
    ) {
      return;
    }

    currentReasonType = normalized;
    selectedCategory = null;

    setButtonState_(
      machineModeBtn,
      currentReasonType === "machine"
    );

    setButtonState_(
      visitModeBtn,
      currentReasonType === "visit"
    );

    closeCategoryMenu_();
    updateCategoryTrigger_();
  }

  function resetCategoryMode_() {
    currentReasonType = "";
    selectedCategory = null;

    setButtonState_(
      machineModeBtn,
      false
    );

    setButtonState_(
      visitModeBtn,
      false
    );

    closeCategoryMenu_();
    updateCategoryTrigger_();
  }

  function findOptionByValue_(
    value,
    type
  ) {
    const options =
      type === "visit"
        ? VISIT_OPTIONS
        : type === "machine"
          ? MACHINE_OPTIONS
          : [];

    return (
      options.find(
        option =>
          option.value === value
      ) || null
    );
  }

  function isValidCategoryForCurrentMode_(
    value
  ) {
    return Boolean(
      findOptionByValue_(
        value,
        currentReasonType
      )
    );
  }

  function getReasonLabelForLastLog_() {
    if (!selectedCategory) {
      return "—";
    }

    return selectedCategory.title;
  }

  function escapeHtml_(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  // ============================================================
  // Clock and connectivity
  // ============================================================
  function formatClockLine(date) {
    const weekday =
      date.toLocaleDateString(
        undefined,
        { weekday: "long" }
      );

    const month =
      date.toLocaleDateString(
        undefined,
        { month: "long" }
      );

    const day =
      date.getDate();

    const year =
      date.getFullYear();

    const time =
      date.toLocaleTimeString(
        undefined,
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        }
      );

    return (
      `${weekday}, ${day}. ` +
      `${month}, ${year} - ${time}`
    );
  }

  function renderClock() {
    if (!liveClock) {
      return;
    }

    if (
      navigator.onLine === false
    ) {
      liveClock.textContent =
        pendingCount > 0
          ? `NO INTERNET • ${pendingCount} saved locally • Will sync automatically`
          : "NO INTERNET • New visits will be saved locally";

      liveClock.classList.add(
        "offline"
      );

      return;
    }

    if (
      backendOnline === false
    ) {
      const clock =
        formatClockLine(new Date());

      if (pendingCount > 0) {
        liveClock.textContent =
          `${clock} • ${pendingCount} saved locally • Waiting to sync`;

        liveClock.classList.add(
          "offline"
        );
      } else {
        // A failed health check does not mean logging is broken. If nothing is
        // pending, keep the banner calm and let the next check recover silently.
        liveClock.textContent =
          `${clock} • Logging ready`;

        liveClock.classList.remove(
          "offline"
        );
      }

      return;
    }

    const clock =
      formatClockLine(new Date());

    if (
      isFlushing &&
      pendingCount > 0
    ) {
      liveClock.textContent =
        `${clock} • Syncing ` +
        `${pendingCount} saved locally`;
    } else if (
      pendingCount > 0
    ) {
      liveClock.textContent =
        `${clock} • ${pendingCount} ` +
        "saved locally • Waiting to sync";
    } else if (
      backendOnline === null
    ) {
      liveClock.textContent =
        `${clock} • Checking connection…`;
    } else {
      liveClock.textContent =
        `${clock} • All visits confirmed`;
    }

    liveClock.classList.remove(
      "offline"
    );
  }

  async function backendPingOnce() {
    try {
      const result =
        await api.ping();

      if (
        result &&
        result.ok
      ) {
        const recovered =
          backendOnline === false;

        pingFails = 0;
        backendOnline = true;

        renderClock();

        if (
          (
            recovered ||
            pendingCount > 0
          ) &&
          !isFlushing
        ) {
          flushQueue({
            announce: recovered
          });
        }

        return true;
      }

      pingFails++;
    } catch {
      pingFails++;
    }

    if (
      pingFails >=
      PING_FAILS_TO_OFFLINE
    ) {
      backendOnline = false;
    }

    renderClock();

    return false;
  }

  function startBackendMonitor() {
    backendPingOnce().then(
      renderClock
    );

    setInterval(() => {
      if (
        document.visibilityState !==
        "visible"
      ) {
        return;
      }

      backendPingOnce().then(
        renderClock
      );
    }, PING_INTERVAL_MS);

    document.addEventListener(
      "visibilitychange",
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          backendPingOnce().then(
            renderClock
          );
        }
      }
    );

    window.addEventListener(
      "offline",
      () => {
        backendOnline = false;
        renderClock();
      }
    );

    window.addEventListener(
      "online",
      () => {
        backendOnline = null;
        renderClock();
        backendPingOnce();
      }
    );
  }

  // ============================================================
  // Backend-driven schools
  // ============================================================
  function loadMetaIntoUI_(meta) {
    if (
      !meta ||
      !meta.ok
    ) {
      return;
    }

    const schools =
      Array.isArray(meta.schools)
        ? meta.schools
        : [];

    const schoolList =
      document.getElementById(
        "schoolList"
      );

    if (schoolList) {
      schoolList.innerHTML =
        schools.map(school => {
          return (
            `<option value="` +
            `${escapeHtml_(school)}">`
          );
        }).join("");
    }
  }

  api.getMeta()
    .then(loadMetaIntoUI_)
    .catch(() => {
      // Metadata failure does not stop logging.
    });

  // ============================================================
  // Queue helpers
  // ============================================================
  async function refreshQueueCount() {
    try {
      pendingCount =
        await queueDB.count();

      if (queueEl) {
        queueEl.textContent =
          String(pendingCount);
      }

      renderClock();

      return pendingCount;
    } catch (error) {
      console.error(
        "Could not read the local visit queue",
        error
      );

      setStatus(
        "⚠️ Local storage could not be read. Please tell a staff member.",
        0
      );

      return pendingCount;
    }
  }

  async function flushQueue({
    announce = false
  } = {}) {
    if (
      isFlushing ||
      navigator.onLine === false
    ) {
      return pendingCount;
    }

    const before =
      await refreshQueueCount();

    if (!before) {
      return 0;
    }

    isFlushing = true;
    renderClock();

    if (announce) {
      setStatus(
        `Uploading ${before} pending ` +
        `visit${
          before === 1
            ? ""
            : "s"
        }…`,
        0
      );
    }

    let lastFailure = null;

    try {
      const remaining =
        await queueDB.flushBatch(
          async batch => {
            const result =
              await api.postVisits(
                batch
              );

            if (
              !result ||
              !result.ok
            ) {
              lastFailure =
                result || {
                  error:
                    "No server response",
                  retryable: true
                };
            }

            return result;
          },
          {
            batchSize: 100,

            onProgress({
              attempted,
              total,
              confirmed
            }) {
              if (
                announce ||
                total > 1
              ) {
                setStatus(
                  "Uploading visits… " +
                  `${confirmed}/${total} ` +
                  "confirmed",
                  0
                );
              }
            }
          }
        );

      pendingCount = remaining;

      if (queueEl) {
        queueEl.textContent =
          String(pendingCount);
      }

      if (remaining === 0) {
        backendOnline = true;
        pingFails = 0;

        successPop();

        setStatus(
          `✅ Confirmed in Google Sheets: ${before} ` +
          `visit${
            before === 1
              ? ""
              : "s"
          }`,
          4500
        );

        // Refresh the visible statistics after the server confirms the upload.
        // This same response also performs the milestone check, avoiding a
        // second summary request.
        setTimeout(
          () => refreshSummary({
            fresh: true
          }),
          0
        );
      } else if (
        lastFailure &&
        lastFailure.retryable === false
      ) {
        backendOnline = true;

        setStatus(
          "⚠️ Upload needs attention: " +
          `${
            lastFailure.error ||
            "server rejected the upload"
          }. ${remaining} safely pending.`,
          0
        );
      } else {
        // A delayed or uncertain upload is not proof that the backend is
        // offline. Keep the records locally and let the health monitor decide.
        backendOnline = null;

        setStatus(
          `💾 ${remaining} ` +
          `visit${
            remaining === 1
              ? ""
              : "s"
          } saved locally • Waiting to sync automatically`,
          6000
        );
      }

      return remaining;
    } catch (error) {
      backendOnline = null;

      await refreshQueueCount();

      setStatus(
        `💾 ${pendingCount} ` +
        `visit${
          pendingCount === 1
            ? ""
            : "s"
        } saved locally • Waiting to sync automatically`,
        6000
      );

      console.error(
        "Background visit upload failed",
        error
      );

      return pendingCount;
    } finally {
      isFlushing = false;
      renderClock();
    }
  }

  // ============================================================
  // Chart helpers
  // ============================================================
  function getWeekStartLocal(
    date = new Date()
  ) {
    const day =
      date.getDay();

    const differenceFromMonday =
      day === 0
        ? -6
        : 1 - day;

    const monday =
      new Date(date);

    monday.setHours(
      0,
      0,
      0,
      0
    );

    monday.setDate(
      date.getDate() +
      differenceFromMonday
    );

    return monday;
  }

  function monToFriLocal(monday) {
    return Array.from(
      { length: 5 },
      (_, index) => {
        const date =
          new Date(monday);

        date.setDate(
          monday.getDate() +
          index
        );

        date.setHours(
          0,
          0,
          0,
          0
        );

        return date;
      }
    );
  }

  function ymdLocal(date) {
    const year =
      date.getFullYear();

    const month =
      String(
        date.getMonth() + 1
      ).padStart(2, "0");

    const day =
      String(
        date.getDate()
      ).padStart(2, "0");

    return (
      `${year}-${month}-${day}`
    );
  }

  function labelDowMonDay(date) {
    return date.toLocaleDateString(
      undefined,
      {
        weekday: "short",
        month: "short",
        day: "numeric"
      }
    );
  }

  function toArray(object) {
    const entries =
      Object.entries(object || {})
        .sort(
          (a, b) =>
            a[0].localeCompare(b[0])
        );

    return [
      entries.map(
        entry => entry[0]
      ),
      entries.map(
        entry => entry[1]
      )
    ];
  }

  // ============================================================
  // Summary and retained charts
  // ============================================================
  async function refreshSummary({
    fresh = false
  } = {}) {
    if (currentRefreshAbort) {
      currentRefreshAbort.abort();
    }

    const abortController =
      new AbortController();

    currentRefreshAbort =
      abortController;

    const result =
      await api.getSummary({
        fresh,
        signal:
          abortController.signal
      });

    if (!result.ok) {
      if (
        currentRefreshAbort ===
        abortController
      ) {
        currentRefreshAbort = null;
      }

      return;
    }

    todayEl.textContent =
      String(
        result.today_total ?? 0
      );

    // Reuse this summary response for the milestone check. The older version
    // issued a second identical summary request after each upload.
    maybeCelebrateYearMilestone_(
      result.year_total
    );

    // Visitors this week
    (function renderWeek() {
      const monday =
        getWeekStartLocal(
          new Date()
        );

      const days =
        monToFriLocal(monday);

      const labels =
        days.map(
          labelDowMonDay
        );

      const keys =
        days.map(
          ymdLocal
        );

      const counts =
        keys.map(key => {
          return Number(
            (
              result.week_buckets ||
              {}
            )[key] || 0
          );
        });

      charts.bar(
        "chartWeek",
        labels,
        counts,
        "Visitors this week"
      );
    })();

    // Visitors by reason
    const [
      reasonLabels,
      reasonValues
    ] = toArray(
      result.by_reason
    );

    charts.bar(
      "chartReason",
      reasonLabels,
      reasonValues,
      "Visitors by Reason"
    );

    // Most popular machines
    const machines = {};

    for (
      const [reason, count] of
      Object.entries(
        result.by_reason || {}
      )
    ) {
      if (
        MACHINE_REASON_SET.has(
          reason
        )
      ) {
        machines[reason] = count;
      }
    }

    const machinesSorted =
      Object.entries(machines)
        .sort(
          (a, b) =>
            b[1] - a[1]
        );

    charts.pie(
      "chartMachines",
      machinesSorted.map(
        ([key]) => key
      ),
      machinesSorted.map(
        ([, value]) => value
      ),
      "Most Popular Machines"
    );

    if (
      currentRefreshAbort ===
      abortController
    ) {
      currentRefreshAbort = null;
    }
  }

  // ============================================================
  // Form submission
  // ============================================================
  saveBtn.addEventListener(
    "mousedown",
    event => {
      if (isSaving) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  );

  form.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      const nowMilliseconds =
        Date.now();

      if (
        nowMilliseconds -
          lastSubmitAt <
        1500
      ) {
        return;
      }

      lastSubmitAt =
        nowMilliseconds;

      if (isSaving) {
        return;
      }

      isSaving = true;

      const originalButtonText =
        saveBtn.textContent;

      disableForm(true);

      saveBtn.textContent =
        "Saving…";

      startButtonLoadingBar_();

      try {
        const staff =
          staffEl
            ? staffEl.value.trim()
            : "";

        const guests =
          Math.max(
            1,
            parseInt(
              guestsEl?.value || "1",
              10
            )
          );

        const reason =
          selectedCategory
            ? selectedCategory.value
            : "";

        const reasonType =
          currentReasonType;

        const school =
          document
            .getElementById("school")
            .value
            .trim();

        let notes =
          document
            .getElementById("notes")
            .value
            .trim();

        if (
          reason &&
          !reasonType
        ) {
          setStatus(
            "Choose Equipment or Visiting first.",
            3500
          );

          return;
        }

        if (
          reason &&
          !isValidCategoryForCurrentMode_(
            reason
          )
        ) {
          setStatus(
            "Please choose a category from the selected list.",
            3500
          );

          return;
        }

        if (
          !staff &&
          !reason &&
          !school &&
          !notes
        ) {
          notes = "Button Press";
        }

        let capturedAt;

        if (useNow.checked) {
          capturedAt =
            new Date();
        } else {
          const date =
            dateEl.value;

          const time =
            timeEl.value ||
            "00:00";

          capturedAt =
            new Date(
              `${date}T${time}:00`
            );
        }

        if (
          !capturedAt ||
          isNaN(
            capturedAt.getTime()
          )
        ) {
          setStatus(
            "Please choose a valid date and time.",
            3500
          );

          return;
        }

        // Capture the real visit time now. If the internet is unavailable for
        // hours, the sheet will still show when the visit happened rather than
        // when the pending record eventually uploaded.
        const timestamp =
          capturedAt.toISOString();

        const batchId =
          crypto.randomUUID();

        const basePayload = {
          ts: timestamp,
          staff_id: staff,
          reason,
          reason_type: reasonType,
          notes,
          school
        };

        const events =
          Array.from(
            { length: guests },
            (_, index) => ({
              ...basePayload,
              event_id:
                crypto.randomUUID(),
              seq:
                `${batchId}:${index}`
            })
          );

        // The form waits only for the local IndexedDB write. Every guest is
        // stored atomically before any network request begins.
        try {
          pendingCount =
            await queueDB.enqueueMany(
              events
            );
        } catch (error) {
          console.error(
            "Could not save visits locally",
            error
          );

          setStatus(
            "⚠️ The visit was NOT saved. Local storage is unavailable; please try again or tell a staff member.",
            0
          );

          return;
        }

        if (queueEl) {
          queueEl.textContent =
            String(pendingCount);
        }

        renderClock();

        if (navigator.onLine === false) {
          setStatus(
            `💾 ${guests} ` +
            `guest${guests === 1 ? "" : "s"} ` +
            "saved locally • Will sync when internet returns",
            6000
          );
        } else {
          setStatus(
            `💾 ${guests} ` +
            `guest${guests === 1 ? "" : "s"} ` +
            "saved locally • Syncing…",
            0
          );
        }

        showLastLog(
          `Last log: ${guests} ` +
          "guest(s) • " +
          `${getReasonLabelForLastLog_()} • ` +
          `${staff || "—"}`
        );

        if (guestsEl) {
          guestsEl.value = "1";
        }

        document
          .getElementById("notes")
          .value = "";

        document
          .getElementById("school")
          .value = "";

        resetCategoryMode_();

        if (useNow.checked) {
          setNow();
        }

        // Upload only after the form has been cleared and released. Logging
        // therefore remains fast even if Google or Apps Script is slow.
        setTimeout(() => {
          flushQueue({
            announce: true
          });
        }, 0);
      } finally {
        stopButtonLoadingBar_();

        saveBtn.textContent =
          originalButtonText;

        disableForm(false);
        updateCategoryTrigger_();

        isSaving = false;

        if (saveBtn) {
          saveBtn.blur();
        }

        focusStaffSoon_(30);
      }
    }
  );

  // ============================================================
  // Keyboard UX
  // ============================================================
  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Escape"
      ) {
        const notesElement =
          document.getElementById(
            "notes"
          );

        if (
          notesElement &&
          document.activeElement ===
            notesElement
        ) {
          notesElement.value = "";

          event.preventDefault();

          return;
        }

        closeCategoryMenu_();
      }
    }
  );

  // ============================================================
  // Boot
  // ============================================================
  if (guestsEl) {
    guestsEl.addEventListener(
      "focus",
      () => guestsEl.select()
    );

    guestsEl.addEventListener(
      "click",
      () => guestsEl.select()
    );
  }

  if (machineModeBtn) {
    machineModeBtn.addEventListener(
      "click",
      () => {
        setReasonType_("machine");
      }
    );
  }

  if (visitModeBtn) {
    visitModeBtn.addEventListener(
      "click",
      () => {
        setReasonType_("visit");
      }
    );
  }

  if (categoryTrigger) {
    categoryTrigger.addEventListener(
      "click",
      () => {
        if (!currentReasonType) {
          return;
        }

        toggleCategoryMenu_();
      }
    );
  }

  if (categoryListEl) {
    categoryListEl.addEventListener(
      "click",
      event => {
        const button =
          event.target.closest(
            ".category-option"
          );

        if (!button) {
          return;
        }

        const value =
          button.getAttribute(
            "data-value"
          );

        const option =
          findOptionByValue_(
            value,
            currentReasonType
          );

        if (!option) {
          return;
        }

        selectedCategory = option;

        updateCategoryTrigger_();
        closeCategoryMenu_();
      }
    );
  }

  document.addEventListener(
    "click",
    event => {
      const insidePicker =
        event.target.closest(
          ".category-picker-wrap"
        );

      const insideToggle =
        event.target.closest(
          ".category-toggle"
        );

      if (
        !insidePicker &&
        !insideToggle
      ) {
        closeCategoryMenu_();
      }
    }
  );

  document.addEventListener(
    "mousemove",
    event => {
      updateFakeCursor_(
        event.clientX,
        event.clientY
      );
    }
  );

  document.addEventListener(
    "mousedown",
    event => {
      updateFakeCursor_(
        event.clientX,
        event.clientY
      );
    }
  );

  setNow();
  updateTimeMode();

  useNow.addEventListener(
    "change",
    updateTimeMode
  );

  resetCategoryMode_();

  setInterval(() => {
    if (
      useNow.checked &&
      !isSaving
    ) {
      setNow();
    }
  }, 1000);

  renderClock();

  setInterval(
    renderClock,
    1000
  );

  // Read the durable local queue before checking the backend. This ensures old
  // pending visits are discovered and uploaded immediately after startup.
  refreshQueueCount()
    .finally(() => {
      startBackendMonitor();
    });

  refreshSummary();

  setInterval(() => {
    if (!currentRefreshAbort) {
      refreshSummary();
    }
  }, CONFIG.REFRESH_MS);

  setInterval(
    flushQueue,
    CONFIG.FLUSH_MS
  );

  window.addEventListener(
    "online",
    () => {
      flushQueue({
        announce: true
      });
    }
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        refreshSummary({
          fresh: true
        });
      }
    }
  );

  if (
    "serviceWorker" in navigator
  ) {
    navigator.serviceWorker
      .register(
        "./service-worker.js"
      )
      .catch(() => {
        // Service-worker failure does not stop logging.
      });
  }

  // Focus the staff field on load.
  focusStaffSoon_(80);

  // ============================================================
  // Theme toggle
  // ============================================================
  (function themeToggle() {
    const KEY =
      "fablab_theme";

    const root =
      document.documentElement;

    const button =
      document.getElementById(
        "themeToggle"
      );

    if (!button) {
      return;
    }

    const iconElement =
      button.querySelector(
        ".icon"
      );

    function initialTheme() {
      const saved =
        localStorage.getItem(KEY);

      if (
        saved === "light" ||
        saved === "dark"
      ) {
        return saved;
      }

      return "dark";
    }

    function applyTheme(mode) {
      root.setAttribute(
        "data-theme",
        mode
      );

      if (iconElement) {
        iconElement.textContent =
          mode === "light"
            ? "🌙"
            : "☀️";
      }

      button.setAttribute(
        "aria-label",
        `Switch to ${
          mode === "light"
            ? "dark"
            : "light"
        } theme`
      );

      button.setAttribute(
        "aria-pressed",
        mode === "dark"
          ? "true"
          : "false"
      );
    }

    applyTheme(
      initialTheme()
    );

    button.addEventListener(
      "click",
      event => {
        event.preventDefault();

        const current =
          root.getAttribute(
            "data-theme"
          ) || initialTheme();

        const next =
          current === "light"
            ? "dark"
            : "light";

        localStorage.setItem(
          KEY,
          next
        );

        applyTheme(next);
      }
    );
  })();
})();
