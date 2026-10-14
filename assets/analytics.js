// Cloudflare beacon is loaded exclusively on the published HTTPS hostname.
(() => {
  "use strict";
  const { protocol, hostname, pathname } = window.location;
  const production = protocol === "https:" && hostname === "eav.arguskepheus.com.br";
  const preview = (protocol === "http:" || protocol === "https:") &&
    ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  if (!production && !preview) return;
  if (production) {
    const beacon = document.createElement("script");
    beacon.type = "module";
    beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
    beacon.setAttribute("data-cf-beacon", '{"token":"7b4a641694a9414c8621199ae8fbdf1e"}');
    document.head.appendChild(beacon);
  }

  // Public, unauthenticated endpoint for aggregate visits; no secret credentials.
  const counterEndpoint = "https://eav-visits.sergio-cordero-calvimontes.workers.dev/api/visits";
  if (!counterEndpoint || typeof window.fetch !== "function") return;
  const slot = document.querySelector("[data-eav-visits]");
  if (!slot) return;
  // Local previews and 404 pages only read the real total; never increment it.
  const countVisit = production && (pathname === "/" || pathname === "/concursos/emgepron/01-2026/");
  void window.fetch(counterEndpoint, {
    method: countVisit ? "POST" : "GET",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    redirect: "error",
  }).then(response => response.ok ? response.json() : null)
    .then(result => {
      if (!result || !Number.isSafeInteger(result.visits) || result.visits < 0) return;
      slot.textContent = " · Visitas: " + result.visits.toLocaleString("pt-BR");
      slot.hidden = false;
    })
    .catch(() => { /* Missing API never prevents the page from rendering. */ });
})();
