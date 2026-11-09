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

  function revealEntity(id, focus) {
    const target = document.getElementById(id);
    if (!target || (!target.hasAttribute("data-occupation-target") && !target.hasAttribute("data-section-target"))) return;
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
      const name = target.querySelector?.(".occupation-name") ?? target;
      name.scrollIntoView({ block: "center", inline: "start", behavior: "auto" });
      // At large reading sizes the stacked titles can extend below the centre
      // of the screen. Keep the destination's name below its sticky ancestors.
      if (typeof window.getComputedStyle === "function" && typeof window.scrollBy === "function") {
        let ancestor = target.parentElement, bottom = 0;
        while (ancestor) {
          const heading = ancestor.tagName === "DETAILS" ? ancestor.querySelector(":scope > summary")
            : ancestor.tagName === "SECTION" ? ancestor.querySelector(":scope > h2") : null;
          if (heading && window.getComputedStyle(heading).position === "sticky") bottom = Math.max(bottom, heading.getBoundingClientRect().bottom);
          ancestor = ancestor.parentElement;
        }
        const adjustment = name.getBoundingClientRect().top - bottom - 12;
        if (adjustment < 0) window.scrollBy({ top: adjustment, behavior: "auto" });
      }
    };
    // Allow disclosure measurements to settle before locating the destination.
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(() => window.requestAnimationFrame(position));
    else position();
  }

  function followEntityLink(event) {
    const anchor = event.target.closest("a");
    if (!anchor || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const href = anchor.getAttribute("href");
    if (!href?.startsWith("#entity-")) return;
    event.preventDefault();
    const index = anchor.closest?.(".page-navigation");
    if (index) index.open = false;
    window.history.replaceState(null, "", href);
    revealEntity(href.slice(1), true);
  }

  function initEntityNavigation() {
    const indexes = [...document.querySelectorAll(".page-navigation")];
    if (!indexes.length && !document.querySelector("[data-occupation-target], [data-section-target]")) return;
    for (const index of indexes) index.addEventListener("click", followEntityLink);
    const fromHash = () => {
      let id;
      try { id = decodeURIComponent(window.location?.hash?.slice(1) ?? ""); } catch { return; }
      if (id.startsWith("entity-")) revealEntity(id, false);
    };
    window.addEventListener("hashchange", fromHash);
    // Native fragment/history restoration can happen after deferred scripts run.
    window.addEventListener("pageshow", fromHash);
    fromHash();
  }

  function initOccupationSearch() {
    const normalize = text => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    for (const search of document.querySelectorAll(".occupation-search")) {
      const input = search.querySelector(".occupation-search-input");
      const results = search.querySelector(".occupation-search-results");
      const status = search.querySelector(".occupation-search-status");
      const filter = search.querySelector(".occupation-search-filter");
      const clear = search.querySelector(".occupation-search-clear");
      const index = search.querySelector(".occupation-search-index");
      if (!input || !results || !status || !index) continue;
      const global = search.dataset.searchGlobal === "true";
      const entries = [...index.content.querySelectorAll("li")].map(row => ({
        row, text: normalize([row.querySelector("a").textContent, row.querySelector(".search-context").textContent, row.querySelector(".search-locations")?.textContent ?? "", row.dataset.searchAliases ?? ""].join(" ")),
        recorded: row.dataset.recorded === "true", contest: row.dataset.contest,
      }));
      const update = () => {
        const tokens = normalize(input.value.trim()).split(/\s+/).filter(Boolean);
        const group = filter?.value ?? "all";
        const active = tokens.length > 0 || group !== "all";
        const matches = [];
        for (const { row, text, recorded, contest } of entries) {
          const inGroup = group === "all" || (global ? contest === group : group === "recorded" ? recorded : !recorded);
          row.hidden = !active || !inGroup || !tokens.every(token => text.includes(token));
          if (!row.hidden) matches.push(row);
        }
        // The catalogue stays inert until needed; retain only matching rows in the live DOM.
        results.replaceChildren(...matches);
        results.hidden = !matches.length;
        if (clear) clear.hidden = !active;
        status.textContent = !active ? global ? "Digite parte do nome ou escolha um concurso para iniciar a busca." : "Digite parte do nome ou escolha um grupo de registros para localizar o cargo."
          : matches.length ? `${matches.length} ${global ? matches.length === 1 ? "resultado encontrado" : "resultados encontrados" : matches.length === 1 ? "cargo/especialidade encontrado" : "cargos/especialidades encontrados"}. Selecione para ${global ? "abrir o acompanhamento" : "abrir o grupo correspondente"}.`
          : `${global ? "Nenhum resultado encontrado" : "Nenhum cargo ou especialidade encontrado"}${group === "all" ? ". Tente parte do nome, sem restringir os termos." : " no filtro selecionado. Limpe a busca e os filtros para tentar novamente."}`;
      };
      input.addEventListener("input", update);
      filter?.addEventListener("change", update);
      clear?.addEventListener("click", () => {
        input.value = "";
        if (filter) filter.value = "all";
        update();
        input.focus();
      });
      results.addEventListener("click", followEntityLink);
      search.hidden = false;
      update();
      window.addEventListener("pageshow", () => {
        if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(update);
        else update();
      });
    }
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

  // The shared site's contribution is offered only on the home page.
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
  initEntityNavigation();
  initChecklists();
  initPix();
})();
