(() => {
  "use strict";
  const root = document.documentElement;
  function initTheme() {
    const themeButton = document.getElementById("page-theme");
    if (!themeButton) return;
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
  }

  function initTop() {
    const topButton = document.getElementById("page-top");
    if (!topButton) return () => {};
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
    window.addEventListener("scroll", updateTop, { passive: true });
    window.addEventListener("resize", updateTop);
    window.addEventListener("pageshow", updateTop);
    document.addEventListener("toggle", updateTop, true);
    updateTop();
    return updateTop;
  }

  function initFontSize(updateTop) {
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
  }

  function initReadingNavigation(updateTop) {
    const fontSlider = document.getElementById("page-font-size");
    // Measure the actual headings so wrapped text and the font slider cannot make
    // the sticky section and disclosure titles overlap.
    for (const section of document.querySelectorAll(".reading-sections > section")) {
      const heading = section.querySelector(":scope > h2");
      if (!heading) continue;
      const disclosures = [...section.querySelectorAll("details")].map(details => ({
        details, summary: details.querySelector(":scope > summary"),
      })).filter(item => item.summary);
      const measured = new Map();
      const written = new WeakMap();
      const setStyle = (element, key, value) => {
        const previous = written.get(element) ?? {};
        if (previous[key] === value) return;
        element.style.setProperty(key, value);
        previous[key] = value;
        written.set(element, previous);
      };
      const measure = () => {
        const headingHeight = Math.ceil(heading.getBoundingClientRect().height);
        // Read all sizes before writing styles, avoiding a layout per disclosure.
        const sizes = disclosures.map(({ summary }) => Math.ceil(summary.getBoundingClientRect().height));
        setStyle(section, "--section-header-height", `${headingHeight}px`);
        setStyle(section, "--nested-disclosure-position", "sticky");
        for (const [index, { details }] of disclosures.entries()) {
          const parent = measured.get(details.parentElement?.closest("details"));
          const top = parent ? parent.top + parent.height : headingHeight;
          const depth = parent ? parent.depth + 1 : 0;
          const height = sizes[index];
          measured.set(details, { top, depth, height });
          setStyle(details, "--disclosure-header-height", `${height}px`);
          setStyle(details, "--disclosure-top", `${top}px`);
          setStyle(details, "--disclosure-layer", String(Math.max(1, 5 - depth)));
        }
        updateTop();
      };
      let pending = false;
      const schedule = () => {
        if (pending) return;
        if (typeof window.requestAnimationFrame !== "function") return measure();
        pending = true;
        window.requestAnimationFrame(() => { pending = false; measure(); });
      };
      if (typeof window.ResizeObserver === "function") {
        const observer = new window.ResizeObserver(schedule);
        observer.observe(heading);
        for (const { summary } of disclosures) observer.observe(summary);
      }
      window.addEventListener("resize", schedule);
      if (fontSlider) fontSlider.addEventListener("input", schedule);
      for (const { details, summary } of disclosures) {
        let restorePosition = false;
        summary.addEventListener("click", () => {
          const bounds = summary.getBoundingClientRect();
          restorePosition = details.open && bounds.top <= measured.get(details).top + 1 && bounds.bottom > 0;
        });
        details.addEventListener("toggle", () => {
          schedule();
          if (!details.open && restorePosition) {
            summary.scrollIntoView({ block: "start", behavior: "auto" });
            summary.focus({ preventScroll: true });
          }
          restorePosition = false;
        });
      }
      measure();
    }
  }

  function initOccupationSearch() {
    const searches = [...document.querySelectorAll(".occupation-search")];
    if (!searches.length) return;
    const normalize = text => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    const reveal = (id, focus) => {
      const target = document.getElementById(id);
      if (!target?.hasAttribute("data-occupation-target")) return;
      let parent = target.parentElement;
      while (parent) {
        if (parent.tagName === "DETAILS") parent.open = true;
        parent = parent.parentElement;
      }
      const position = () => {
        if (focus) {
          target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
          target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
        }
        target.scrollIntoView({ block: "center", inline: "start", behavior: "auto" });
      };
      if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(position);
      else position();
    };
    const fromHash = () => {
      let id;
      try { id = decodeURIComponent(window.location?.hash.slice(1) ?? ""); } catch { return; }
      if (id.startsWith("entity-")) reveal(id, false);
    };
    for (const search of searches) {
      const input = search.querySelector(".occupation-search-input");
      const results = search.querySelector(".occupation-search-results");
      const status = search.querySelector(".occupation-search-status");
      if (!input || !results || !status) continue;
      const entries = [...results.querySelectorAll("li")].map(row => ({ row, text: normalize(row.dataset.searchText) }));
      input.addEventListener("input", () => {
        const tokens = normalize(input.value.trim()).split(/\s+/).filter(Boolean);
        let count = 0;
        for (const { row, text } of entries) {
          row.hidden = !tokens.length || !tokens.every(token => text.includes(token));
          if (!row.hidden) count++;
        }
        results.hidden = !count;
        status.textContent = !tokens.length ? "Digite parte do nome para localizar o cargo nos grupos abaixo."
          : count ? `${count} ${count === 1 ? "cargo/especialidade encontrado" : "cargos/especialidades encontrados"}. Selecione para abrir o grupo correspondente.`
          : "Nenhum cargo ou especialidade encontrado.";
      });
      results.addEventListener("click", event => {
        const anchor = event.target.closest("a");
        if (!anchor || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const href = anchor.getAttribute("href");
        if (!href?.startsWith("#entity-")) return;
        event.preventDefault();
        window.history.replaceState(null, "", href);
        reveal(href.slice(1), true);
      });
      search.hidden = false;
    }
    window.addEventListener("hashchange", fromHash);
    fromHash();
  }

  function initChecklists() {
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
  }

  // A contribution belongs to its case, never to the home page.
  function initPix() {
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
  }

  initTheme();
  const updateTop = initTop();
  initFontSize(updateTop);
  initReadingNavigation(updateTop);
  initOccupationSearch();
  initChecklists();
  initPix();
})();
