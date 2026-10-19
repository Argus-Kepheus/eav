(() => {
  "use strict";
  const root = document.documentElement;
  const themeButton = document.getElementById("page-theme");
  const topButton = document.getElementById("page-top");
  if (!themeButton || !topButton) return;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const storageKey = "eav-theme";
  const validTheme = value => value === "dark" || value === "light";
  let preference = null;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (validTheme(stored)) preference = stored;
  } catch { /* Theme switching still works when storage is unavailable. */ }
  const applyTheme = theme => {
    root.dataset.theme = theme;
    const label = theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro";
    themeButton.setAttribute("aria-label", label);
    themeButton.title = label;
  };
  const systemTheme = () => media.matches ? "dark" : "light";
  applyTheme(preference ?? systemTheme());
  themeButton.hidden = false;
  themeButton.addEventListener("click", () => {
    preference = root.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(preference);
    try { window.localStorage.setItem(storageKey, preference); } catch { /* Optional persistence. */ }
  });
  media.addEventListener("change", () => { if (!preference) applyTheme(systemTheme()); });
  window.addEventListener("storage", event => {
    if (event.key !== storageKey && event.key !== null) return;
    preference = validTheme(event.newValue) ? event.newValue : null;
    applyTheme(preference ?? systemTheme());
  });
  const updateTop = () => {
    topButton.hidden = !(window.scrollY > 0 && root.scrollHeight > window.innerHeight);
  };
  topButton.addEventListener("click", () => {
    const main = document.querySelector("main");
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
      main.addEventListener("blur", () => main.removeAttribute("tabindex"), { once: true });
    }
    window.scrollTo({ top: 0, behavior: "auto" });
    updateTop();
  });
  const fontSlider = document.getElementById("page-font-size");
  const fontControl = document.getElementById("font-size-control");
  const fontValue = document.getElementById("font-size-value");
  const readingArea = document.querySelector("main");
  if (fontSlider && fontControl && fontValue && readingArea) {
    const fontKey = "eav-font-size";
    const normalizeSize = value => {
      const number = Number(value);
      return value === null || value === "" || !Number.isFinite(number)
        ? 100 : Math.min(200, Math.max(25, Math.round(number)));
    };
    const applySize = value => {
      const size = normalizeSize(value);
      readingArea.style.setProperty("--reading-scale", String(size / 100));
      fontSlider.value = String(size);
      fontSlider.setAttribute("aria-valuetext", `${size}%`);
      fontValue.textContent = `${size}%`;
      updateTop();
      return size;
    };
    let initialSize = 100;
    try { initialSize = normalizeSize(window.localStorage.getItem(fontKey)); } catch { /* Optional preference. */ }
    applySize(initialSize);
    fontControl.hidden = false;
    fontSlider.addEventListener("input", () => {
      const size = applySize(fontSlider.value);
      try { window.localStorage.setItem(fontKey, String(size)); } catch { /* Still adjustable. */ }
    });
  }
  window.addEventListener("scroll", updateTop, { passive: true });
  window.addEventListener("resize", updateTop);
  window.addEventListener("pageshow", updateTop);
  document.addEventListener("toggle", updateTop, true);
  updateTop();

  // Measure the actual headings so wrapped text and the font slider cannot make
  // the sticky section and disclosure titles overlap.
  for (const section of document.querySelectorAll(".reading-sections > section")) {
    const heading = section.querySelector(":scope > h2");
    if (!heading) continue;
    const disclosures = [...section.querySelectorAll("details")].map(details => ({
      details, summary: details.querySelector(":scope > summary"),
    })).filter(item => item.summary);
    const measure = () => {
      section.style.setProperty("--section-header-height", `${Math.ceil(heading.getBoundingClientRect().height)}px`);
      for (const { details, summary } of disclosures) {
        details.style.setProperty("--disclosure-header-height", `${Math.ceil(summary.getBoundingClientRect().height)}px`);
      }
    };
    if (typeof window.ResizeObserver === "function") {
      const observer = new window.ResizeObserver(measure);
      observer.observe(heading);
      for (const { summary } of disclosures) observer.observe(summary);
    }
    window.addEventListener("resize", measure);
    if (fontSlider) fontSlider.addEventListener("input", measure);
    for (const { details, summary } of disclosures) {
      let restorePosition = false;
      summary.addEventListener("click", () => {
        const bounds = summary.getBoundingClientRect();
        restorePosition = details.open && bounds.top <= heading.getBoundingClientRect().height + 1 && bounds.bottom > 0;
      });
      details.addEventListener("toggle", () => {
        measure();
        if (!details.open && restorePosition) {
          summary.scrollIntoView({ block: "start", behavior: "auto" });
          summary.focus({ preventScroll: true });
        }
        restorePosition = false;
      });
    }
    measure();
  }

  // Document checklists: ticks stay on this device (localStorage, when available)
  // and the list can be saved as a plain-text file. Item text is read with
  // textContent and written only to that file, never back into the page.
  for (const checklist of document.querySelectorAll("[data-checklist]")) {
    const boxes = [...checklist.querySelectorAll("input[type=checkbox][data-item]")];
    const actions = checklist.querySelector(".checklist-actions");
    const count = checklist.querySelector(".checklist-count");
    const download = checklist.querySelector(".checklist-download");
    if (!boxes.length || !actions || !count || !download) continue;
    const listKey = `eav-checklist-${checklist.dataset.checklist}`;
    let saved = [];
    let persistent = true;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(listKey) ?? "[]");
      if (Array.isArray(parsed)) saved = parsed;
    } catch { persistent = false; }
    const ticked = () => boxes.filter(box => box.checked);
    const updateCount = () => {
      count.textContent = `${ticked().length} de ${boxes.length} marcados${persistent ? " · salvo neste aparelho" : ""}`;
    };
    for (const box of boxes) {
      box.checked = saved.includes(box.dataset.item);
      box.addEventListener("change", () => {
        try { window.localStorage.setItem(listKey, JSON.stringify(ticked().map(item => item.dataset.item))); persistent = true; }
        catch { persistent = false; }
        updateCount();
      });
    }
    download.addEventListener("click", () => {
      const lines = boxes.map(box => `[${box.checked ? "x" : " "}] ${box.dataset.number}. ${box.parentElement.textContent.replace(/\s+/g, " ").trim()}`);
      const today = new Date().toLocaleDateString("pt-BR");
      const text = `${checklist.dataset.title}\n${ticked().length} de ${boxes.length} marcados em ${today}\n\n${lines.join("\n")}\n`;
      const url = window.URL.createObjectURL(new window.Blob([text], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${checklist.dataset.checklist}.txt`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    });
    updateCount();
    actions.hidden = false;
  }
})();

// A contribution belongs to its case, never to the home page.
for (const button of document.querySelectorAll(".pix-copy")) {
  const container = button.closest(".contribution");
  const status = container.querySelector(".pix-status");
  container.hidden = false;
  button.addEventListener("click", async () => {
    status.textContent = "";
    button.disabled = true;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(button.dataset.pixKey);
      status.textContent = "Chave Pix copiada";
    } catch {
      status.textContent = "Não foi possível copiar a chave Pix. Tente novamente.";
    } finally {
      button.disabled = false;
    }
  });
}
