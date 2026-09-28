// js/api.js
//
// Apps Script API client.
// Keeps the existing public methods while adding reliable timeouts, a true
// lightweight health check, and efficient batch uploads.

const api = (() => {
  const TIMEOUTS = {
    health: 6000,
    weekly: 15000,
    read: 20000,
    write: 8000,
    confirm: 6000
  };

  const CONFIRMATION = {
    initialDelay: 900,
    retryDelays: [900, 1600]
  };

  function base() {
    return String(CONFIG.APPS_SCRIPT_BASE || "")
      .trim()
      .replace(/\/+$/, "");
  }

  function qjoin(queryString) {
    return base().includes("?")
      ? `&${queryString}`
      : `?${queryString}`;
  }

  function retryableHttpStatus(status) {
    return (
      status === 408 ||
      status === 425 ||
      status === 429 ||
      status >= 500
    );
  }

  function errorResult(
    error,
    errorType,
    retryable,
    extra = {}
  ) {
    return {
      ok: false,
      error,
      error_type: errorType,
      retryable,
      ...extra
    };
  }

  async function fetchJson(url, options = {}) {
    if (!base()) {
      return errorResult(
        "Apps Script URL is not configured.",
        "configuration",
        false
      );
    }

    const {
      timeoutMs = TIMEOUTS.read,
      signal: externalSignal,
      ...fetchOptions
    } = options;

    const controller =
      typeof AbortController !== "undefined"
        ? new AbortController()
        : null;

    let timedOut = false;
    let timeoutId = null;
    let removeExternalAbortListener = null;

    if (controller && externalSignal) {
      const forwardAbort = () => controller.abort();

      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener(
          "abort",
          forwardAbort,
          { once: true }
        );

        removeExternalAbortListener = () => {
          externalSignal.removeEventListener(
            "abort",
            forwardAbort
          );
        };
      }
    }

    if (
      controller &&
      Number.isFinite(timeoutMs) &&
      timeoutMs > 0
    ) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    }

    try {
      const response = await fetch(url, {
        // No custom headers: requests stay "simple" and avoid CORS preflight.
        cache: "no-store",
        redirect: "follow",
        mode: "cors",
        credentials: "omit",
        ...fetchOptions,
        signal: controller
          ? controller.signal
          : externalSignal
      });

      let data;

      try {
        data = await response.json();
      } catch {
        return errorResult(
          `The server returned an unreadable response (HTTP ${response.status}).`,
          "response",
          retryableHttpStatus(response.status),
          { status: response.status }
        );
      }

      if (
        !data ||
        typeof data !== "object"
      ) {
        return errorResult(
          "The server returned an invalid response.",
          "response",
          retryableHttpStatus(response.status),
          { status: response.status }
        );
      }

      if (!response.ok) {
        return {
          ...data,
          ok: false,
          error:
            data.error ||
            `HTTP ${response.status}`,
          error_type:
            data.error_type || "http",
          retryable:
            typeof data.retryable === "boolean"
              ? data.retryable
              : retryableHttpStatus(
                  response.status
                ),
          status: response.status
        };
      }

      if (data.ok === false) {
        return {
          ...data,
          error_type:
            data.error_type || "server",
          retryable:
            typeof data.retryable === "boolean"
              ? data.retryable
              : false,
          status: response.status
        };
      }

      return {
        ...data,
        status: response.status
      };
    } catch (error) {
      if (timedOut) {
        return errorResult(
          "The server is taking too long to respond.",
          "timeout",
          true
        );
      }

      if (
        (externalSignal &&
          externalSignal.aborted) ||
        (error &&
          error.name === "AbortError")
      ) {
        return errorResult(
          "The request was cancelled.",
          "cancelled",
          true
        );
      }

      return errorResult(
        "The server could not be reached.",
        "network",
        true,
        {
          detail: String(
            error || "network error"
          )
        }
      );
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      if (removeExternalAbortListener) {
        removeExternalAbortListener();
      }
    }
  }

  function withKey(params) {
    const searchParams =
      new URLSearchParams(params || {});

    if (CONFIG.API_KEY) {
      searchParams.set(
        "key",
        CONFIG.API_KEY
      );
    }

    searchParams.set(
      "_",
      String(Date.now())
    );

    return searchParams.toString();
  }

  function makeGetUrl(
    operation,
    params = {}
  ) {
    const query = withKey({
      op: operation,
      ...params
    });

    return base() + qjoin(query);
  }

  async function getSummary(options = {}) {
    const {
      fresh = false,
      ...fetchOptions
    } = options;

    return fetchJson(
      makeGetUrl(
        "summary",
        fresh ? { fresh: "1" } : {}
      ),
      {
        method: "GET",
        timeoutMs: TIMEOUTS.read,
        ...fetchOptions
      }
    );
  }

  async function getWeekly(
    start,
    end,
    options = {}
  ) {
    if (!start || !end) {
      return errorResult(
        "A start and end time are required.",
        "validation",
        false
      );
    }

    return fetchJson(
      makeGetUrl("weekly", {
        start: String(start),
        end: String(end)
      }),
      {
        method: "GET",
        timeoutMs: TIMEOUTS.weekly,
        ...options
      }
    );
  }

  async function getMeta(options = {}) {
    return fetchJson(
      makeGetUrl("meta"),
      {
        method: "GET",
        timeoutMs: TIMEOUTS.read,
        ...options
      }
    );
  }

  async function ping(options = {}) {
    return fetchJson(
      makeGetUrl("health"),
      {
        method: "GET",
        timeoutMs: TIMEOUTS.health,
        ...options
      }
    );
  }

  function addApiKeyAndCacheBust(form) {
    if (CONFIG.API_KEY) {
      form.append(
        "key",
        CONFIG.API_KEY
      );
    }

    form.append(
      "_",
      String(Date.now())
    );
  }

  function eventIdsFrom(events) {
    return Array.from(
      new Set(
        events
          .map(event => {
            return event && event.event_id != null
              ? String(event.event_id).trim()
              : "";
          })
          .filter(Boolean)
      )
    );
  }

  function delay(ms) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  async function confirmVisits(
    eventIds,
    options = {}
  ) {
    const ids = Array.from(
      new Set(
        (Array.isArray(eventIds) ? eventIds : [eventIds])
          .map(value => String(value || "").trim())
          .filter(Boolean)
      )
    );

    if (!ids.length) {
      return errorResult(
        "There are no event IDs to confirm.",
        "validation",
        false
      );
    }

    return fetchJson(
      makeGetUrl("confirm", {
        event_ids: JSON.stringify(ids)
      }),
      {
        method: "GET",
        timeoutMs: TIMEOUTS.confirm,
        ...options
      }
    );
  }

  async function confirmWithRetries(
    eventIds,
    shouldStop = () => false
  ) {
    await delay(CONFIRMATION.initialDelay);

    if (shouldStop()) {
      return null;
    }

    let result = null;
    const waits = [0, ...CONFIRMATION.retryDelays];

    for (const waitMs of waits) {
      if (waitMs > 0) {
        await delay(waitMs);
      }

      if (shouldStop()) {
        return null;
      }

      result = await confirmVisits(eventIds);

      if (
        result &&
        result.ok === true &&
        result.all_confirmed === true
      ) {
        return result;
      }

      if (
        result &&
        result.ok === false &&
        result.retryable === false &&
        result.error_type !== "server"
      ) {
        return result;
      }
    }

    return result;
  }

  function confirmedResult(confirmation) {
    return {
      ...confirmation,
      ok: true,
      retryable: false,
      confirmation_source: "event_id_lookup",
      inserted: 0,
      skipped: 0,
      received: confirmation.requested
    };
  }

  async function sendWithConfirmation(
    events,
    form,
    options
  ) {
    const ids = eventIdsFrom(events);

    let confirmationNoLongerNeeded = false;

    const uploadPromise = fetchJson(base(), {
        method: "POST",
        body: form,
        timeoutMs: TIMEOUTS.write,
        ...options
      })
      .then(result => {
        if (
          result &&
          (
            result.ok === true ||
            result.retryable === false
          )
        ) {
          confirmationNoLongerNeeded = true;
        }

        return result;
      });

    // Very old queue entries without event_id still use the normal upload
    // response, but cannot be checked independently.
    if (!ids.length) {
      return uploadPromise;
    }

    const confirmationPromise =
      confirmWithRetries(
        ids,
        () => confirmationNoLongerNeeded
      );

    const first = await Promise.race([
      uploadPromise.then(result => ({
        source: "upload",
        result
      })),
      confirmationPromise.then(result => ({
        source: "confirmation",
        result
      }))
    ]);

    if (
      first.source === "confirmation" &&
      first.result &&
      first.result.ok === true &&
      first.result.all_confirmed === true
    ) {
      return confirmedResult(first.result);
    }

    if (
      first.source === "upload" &&
      first.result &&
      first.result.ok === true
    ) {
      return first.result;
    }

    if (
      first.source === "upload" &&
      first.result &&
      first.result.retryable === false
    ) {
      return first.result;
    }

    const second = first.source === "upload"
      ? await confirmationPromise
      : await uploadPromise;

    if (
      second &&
      second.ok === true &&
      second.all_confirmed === true
    ) {
      return confirmedResult(second);
    }

    if (
      first.source === "confirmation" &&
      second &&
      second.ok === true
    ) {
      return second;
    }

    const uploadFailure = first.source === "upload"
      ? first.result
      : second;

    return {
      ...(uploadFailure || errorResult(
        "The upload could not yet be confirmed.",
        "confirmation",
        true
      )),
      ok: false,
      retryable: true,
      confirmation_checked: true,
      confirmed_event_ids:
        first.source === "confirmation" && first.result
          ? first.result.confirmed_event_ids || []
          : second && second.confirmed_event_ids
            ? second.confirmed_event_ids
            : []
    };
  }

  async function postVisit(
    event,
    options = {}
  ) {
    if (
      !event ||
      typeof event !== "object" ||
      Array.isArray(event)
    ) {
      return errorResult(
        "The visit data is invalid.",
        "validation",
        false
      );
    }

    const form = new URLSearchParams();

    for (
      const [key, value] of
      Object.entries(event)
    ) {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        form.append(
          key,
          String(value)
        );
      }
    }

    addApiKeyAndCacheBust(form);

    return sendWithConfirmation(
      [event],
      form,
      options
    );
  }

  async function postVisits(
    events,
    options = {}
  ) {
    if (
      !Array.isArray(events) ||
      !events.length
    ) {
      return errorResult(
        "There are no visits to upload.",
        "validation",
        false
      );
    }

    const form = new URLSearchParams();

    form.append(
      "events_json",
      JSON.stringify(events)
    );

    addApiKeyAndCacheBust(form);

    return sendWithConfirmation(
      events,
      form,
      options
    );
  }

  return {
    getSummary,
    getWeekly,
    getMeta,
    postVisit,
    postVisits,
    postVisitBatch: postVisits,
    confirmVisits,
    ping
  };
})();
