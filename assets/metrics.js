// Cloudflare Web Analytics is independent of the estimated contest-visit counter.
(() => {
  "use strict";
  const settings = {"productionOrigin":"https://eav.arguskepheus.com.br","counterEndpoint":"https://eav-visits.sergio-cordero-calvimontes.workers.dev/api/v2/contest-visits","webAnalyticsToken":"7b4a641694a9414c8621199ae8fbdf1e","contests":[{"caseId":"concurso-emgepron-01-2026","id":"emgepron-01-2026","path":"/concursos/emgepron/01-2026/"}]};
  if (!settings) return;
  const { protocol, hostname, pathname } = window.location;
  const origin = window.location.origin || protocol + "//" + hostname;
  const production = origin === settings.productionOrigin;
  const preview = (protocol === "http:" || protocol === "https:") &&
    ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  if (!production && !preview) return;
  if (production) {
    const beacon = document.createElement("script");
    beacon.type = "module";
    beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
    beacon.setAttribute("data-cf-beacon", JSON.stringify({ token: settings.webAnalyticsToken }));
    document.head.appendChild(beacon);
  }

  // Deliberately explicit: public visitors cannot create contest identities.
  // config/metrics.json supplies both this routing table and the Worker's allowlist.
  const contest = settings.contests.find(item => item.path === pathname)?.id;
  if (!contest || typeof window.fetch !== "function") return;
  const slot = document.querySelector("[data-eav-visits]");
  if (!slot) return;
  const endpoint = settings.counterEndpoint;
  const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  // A hidden tab may count; a departed document must never send a late POST.
  let pageActive = true;
  window.addEventListener("pagehide", () => { pageActive = false; }, { once: true });

  async function readOrCreateToken() {
    if (!production || !pageActive) return null;
    const key = "eav:contest-visit-v2:" + contest;
    // This is a logical deadline, checked again even when background timers lag.
    const deadline = window.performance.now() + 3000;
    try {
      return await new Promise(resolve => {
        let settled = false, database = null, transaction = null, selected = null;
        let timer = null;
        const finish = value => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          window.removeEventListener("pagehide", cancel);
          if (value === null && transaction) {
            try { transaction.abort(); } catch { /* It may already be terminal. */ }
          }
          if (database) database.close();
          resolve(value);
        };
        const cancel = () => finish(null);
        const live = () => !settled && pageActive && window.performance.now() < deadline;
        window.addEventListener("pagehide", cancel, { once: true });
        timer = window.setTimeout(cancel, 3000);
        try {
          // localStorage remains a required compatibility surface, never the authority.
          const storage = window.localStorage;
          const legacy = storage.getItem(key);
          const opening = window.indexedDB.open("eav-contest-visits-v2", 1);
          opening.onerror = cancel;
          opening.onblocked = cancel;
          opening.onupgradeneeded = () => {
            database = opening.result;
            transaction = opening.transaction;
            if (!live()) {
              try { transaction.abort(); } catch { /* Late upgrade must not commit an empty schema. */ }
              database.close();
              return;
            }
            try {
              if (!database.objectStoreNames.contains("tokens")) database.createObjectStore("tokens");
            } catch { cancel(); }
          };
          opening.onsuccess = () => {
            const connection = opening.result;
            if (!live()) { connection.close(); cancel(); return; }
            database = connection;
            database.onversionchange = cancel;
            database.onclose = cancel;
            try {
              transaction = database.transaction("tokens", "readwrite");
              transaction.onabort = cancel;
              transaction.onerror = cancel;
              transaction.oncomplete = () => {
                transaction = null;
                if (!live() || !TOKEN_RE.test(selected || "")) { cancel(); return; }
                try {
                  // Mirror only after commit; a stale mirror cannot replace canonical IDB.
                  storage.setItem(key, selected);
                  if (storage.getItem(key) !== selected) { cancel(); return; }
                } catch { cancel(); return; }
                if (!live()) { cancel(); return; }
                finish(selected);
              };
              const store = transaction.objectStore("tokens");
              const reading = store.get(contest);
              reading.onerror = cancel;
              reading.onsuccess = () => {
                if (!live()) { cancel(); return; }
                const canonical = reading.result;
                if (canonical !== undefined) {
                  // Corrupt canonical identity refuses counting; do not silently rotate it.
                  if (typeof canonical !== "string" || !TOKEN_RE.test(canonical)) { cancel(); return; }
                  selected = canonical;
                  return;
                }
                selected = TOKEN_RE.test(legacy || "") ? legacy : window.crypto?.randomUUID?.();
                if (typeof selected !== "string" || !TOKEN_RE.test(selected)) { cancel(); return; }
                try { store.put(selected, contest).onerror = cancel; } catch { cancel(); }
              };
            } catch { cancel(); }
          };
        } catch { cancel(); }
      });
    } catch { return null; }
  }

  void (async () => {
    const token = await readOrCreateToken();
    if (!pageActive) return;
    // Without stable storage, count nothing: a GET is safe; never send a disposable token.
    const canCount = production && token !== null;
    const url = canCount ? endpoint : endpoint + "?contest=" + encodeURIComponent(contest);
    const options = {
      method: canCount ? "POST" : "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      redirect: "error",
    };
    if (canCount) {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify({ contest, token });
    }
    try {
      const response = await window.fetch(url, options);
      if (!response.ok) return;
      const result = await response.json();
      if (result?.contest !== contest || !Number.isSafeInteger(result.visits) || result.visits < 0) return;
      slot.textContent = " · Visitas estimadas: " + result.visits.toLocaleString("pt-BR");
      slot.hidden = false;
    } catch { /* Counter failure never affects the editorial page. */ }
  })();
})();
