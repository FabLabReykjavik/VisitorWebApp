// js/api.js
const api = (() => {
  function base() {
    return String(CONFIG.APPS_SCRIPT_BASE || "").replace(/\/$/, "");
  }

  function qjoin(s) {
    return base().includes("?") ? "&" + s : "?" + s;
  }

  async function fetchJson(url, opts = {}) {
    try {
      const res = await fetch(url, {
        // SIMPLE REQUEST: no custom headers => no preflight
        cache: "no-store",
        redirect: "follow",
        mode: "cors",
        credentials: "omit",
        ...opts,
      });

      let data;
      try {
        data = await res.json();
      } catch {
        data = { ok: false, error: `Non-JSON (HTTP ${res.status})` };
      }

      if (!res.ok && data.ok === undefined) {
        data = { ok: false, error: `HTTP ${res.status}` };
      }

      return data;
    } catch (err) {
      return { ok: false, error: String(err || "network error") };
    }
  }

  function withKey(params) {
    const sp = new URLSearchParams(params || {});
    if (CONFIG.API_KEY) sp.set("key", CONFIG.API_KEY);
    sp.set("_", String(Date.now())); // cache-bust
    return sp.toString();
  }

  async function getSummary() {
    const url = base() + qjoin(withKey({ op: "summary" }));
    return fetchJson(url, { method: "GET" });
  }

  async function getMeta() {
    const url = base() + qjoin(withKey({ op: "meta" }));
    return fetchJson(url, { method: "GET" });
  }

  async function ping(opts = {}) {
    // lightweight read to confirm Apps Script reachable
    const url = base() + qjoin(withKey({ op: "meta" }));
    return fetchJson(url, { method: "GET", ...opts });
  }

  async function postVisit(ev) {
    // key in BODY; urlencoded; no custom headers => no preflight
    const form = new URLSearchParams();

    for (const [k, v] of Object.entries(ev || {})) {
      if (v !== undefined && v !== null && v !== "") {
        form.append(k, String(v));
      }
    }

    if (CONFIG.API_KEY) form.append("key", CONFIG.API_KEY);
    form.append("_", String(Date.now()));

    return fetchJson(base(), {
      method: "POST",
      body: form
    });
  }

  return {
    getSummary,
    getMeta,
    postVisit,
    ping
  };
})();