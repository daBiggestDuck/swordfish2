(() => {
  const TABS = [
    { id: "map", label: "Map / Sites", kind: "iframe", src: "./web/map.html", health: "static" },
    {
      id: "navigator",
      label: "Navigator",
      kind: "iframe",
      src: "./web/navigator.html",
      health: "static",
    },
    {
      id: "story",
      label: "Story / Passport",
      kind: "iframe",
      src: "http://localhost:8081/",
      health: "http://localhost:8081/api/missions",
      need: "./run-story.sh",
      port: 8081,
    },
    {
      id: "engine",
      label: "Engine / Care",
      kind: "iframe",
      src: "http://localhost:8082/",
      health: "http://localhost:8082/api/engine/facts",
      need: "./run-engine.sh",
      port: 8082,
      fallback: "./demos/js-engine/index.html",
    },
    {
      id: "pets",
      label: "Pets",
      kind: "iframe",
      src: "./demos/js-pets/index.html",
      health: "static",
    },
    { id: "data", label: "Data / Missions", kind: "data" },
    { id: "about", label: "About", kind: "about" },
  ];

  const $ = (sel, el = document) => el.querySelector(sel);
  const tabsEl = $("#tabs");
  const stageEl = $("#stage");
  const bannerEl = $("#shell-banner");
  const status = Object.fromEntries(TABS.map((t) => [t.id, t.health === "static" ? "static" : "unknown"]));

  function hashTab() {
    const h = (location.hash || "#map").slice(1).toLowerCase();
    return TABS.some((t) => t.id === h) ? h : "map";
  }

  function setDot(id, state) {
    status[id] = state;
    const btn = tabsEl.querySelector(`[data-tab="${id}"]`);
    if (!btn) return;
    const dot = btn.querySelector(".dot");
    if (!dot) return;
    dot.className = "dot " + (state === "ok" || state === "static" ? (state === "static" ? "static" : "ok") : "warn");
    dot.title =
      state === "ok"
        ? "Backend reachable"
        : state === "static"
          ? "Static panel"
          : "Backend not running";
  }

  async function probe(tab) {
    if (tab.health === "static" || !tab.health) {
      setDot(tab.id, "static");
      return true;
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1200);
      const res = await fetch(tab.health, { signal: ctrl.signal, mode: "cors" });
      clearTimeout(timer);
      const ok = res.ok;
      setDot(tab.id, ok ? "ok" : "warn");
      return ok;
    } catch {
      setDot(tab.id, "warn");
      return false;
    }
  }

  function updateBanner() {
    const down = TABS.filter((t) => t.need && status[t.id] === "warn");
    if (!down.length) {
      bannerEl.dataset.show = "0";
      bannerEl.textContent = "";
      return;
    }
    bannerEl.dataset.show = "1";
    bannerEl.innerHTML =
      "Story / Engine tabs need their Java servers. In other terminals: " +
      down
        .map((t) => `<code>${t.need}</code> → localhost:${t.port}`)
        .join(" · ") +
      ". Map, Navigator, Pets, Data, and About work from this shell alone.";
  }

  function ensurePanel(tab) {
    let panel = stageEl.querySelector(`[data-panel="${tab.id}"]`);
    if (panel) return panel;

    panel = document.createElement("section");
    panel.className = "panel";
    panel.dataset.panel = tab.id;
    panel.setAttribute("role", "tabpanel");
    panel.id = `panel-${tab.id}`;
    panel.setAttribute("aria-labelledby", `tab-${tab.id}`);

    if (tab.kind === "iframe") {
      const note = document.createElement("p");
      note.className = "panel-note";
      note.dataset.note = tab.id;
      panel.appendChild(note);

      const iframe = document.createElement("iframe");
      iframe.title = tab.label;
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer";
      iframe.dataset.src = tab.src;
      if (tab.fallback) iframe.dataset.fallback = tab.fallback;
      panel.appendChild(iframe);
    } else if (tab.kind === "data") {
      panel.innerHTML = `
        <div class="local-panel">
          <div class="kicker">CLPS CATALOG</div>
          <h1>Data / Missions</h1>
          <p class="lede">Baked CLPS catalog from the Data tip — missions, sites, payloads, and pets (including Triddy &amp; Nodey). Loaded from <code>data/catalog.json</code>.</p>
          <div class="stats" id="data-stats"></div>
          <div class="toolbar">
            <label class="search-wrap" style="flex:1 1 200px">Search
              <input id="data-q" type="search" placeholder="Filter by name, id, site, status…" aria-label="Filter missions">
            </label>
            <label>Status
              <select id="data-status" aria-label="Status filter">
                <option value="">All statuses</option>
                <option value="completed">completed</option>
                <option value="planned">planned</option>
                <option value="failed">failed</option>
                <option value="cancelled">cancelled</option>
              </select>
            </label>
            <label>View
              <select id="data-view" aria-label="View">
                <option value="missions">Missions</option>
                <option value="sites">Sites</option>
                <option value="pets">Pets</option>
              </select>
            </label>
          </div>
          <div class="grid" id="data-grid"></div>
          <p id="data-error" class="error" hidden></p>
        </div>`;
    } else if (tab.kind === "about") {
      panel.innerHTML = `
        <div class="local-panel">
          <div class="kicker">SHOWCASE</div>
          <h1>About · Payload Pets</h1>
          <p class="lede">Challenge brief for this <code>v0</code> showcase — one product with shared data contracts across map, story, engine, and pets.</p>

          <div class="about-block">
            <div class="kicker">BRIEF</div>
            <h2>One-liner</h2>
            <p>Adopt a real NASA CLPS instrument as a pet, pick a real lunar landing site, and keep it alive through one lunar day — with meters driven by real ephemeris and terrain data.</p>
          </div>

          <div class="about-block">
            <h2>Ship one product, four surfaces</h2>
            <table>
              <tbody>
                <tr><th>Payload Pets</th><td>Hero / emotional hook — Creativity, Presentation, Inspirational</td></tr>
                <tr><th>Moon Map</th><td>Home screen, site picker, comparison — planning tool + Best Use of Data</td></tr>
                <tr><th>Archive</th><td>Mission drawer and real outcomes — storytelling depth</td></tr>
                <tr><th>Manifest</th><td>Engineering constraints on the site card — not a second game</td></tr>
              </tbody>
            </table>
            <p>Night is a phase of the pet loop, not a separate page. The differentiator is that Power / Warmth / Signal are driven by <strong style="color:var(--text)">JPL Horizons + LOLA terrain</strong>, and the UI shows the math.</p>
          </div>

          <div class="about-block">
            <h2>This showcase shell</h2>
            <ul>
              <li><strong style="color:var(--text)">Map / Sites</strong> — interactive lunar explorer (<code>web/map.html</code>)</li>
              <li><strong style="color:var(--text)">Navigator</strong> — south-pole site/date compare: Sun→power, Earth→DTE vs LOLA horizon (<code>web/navigator.html</code>)</li>
              <li><strong style="color:var(--text)">Story / Passport</strong> — mission pop-ups, Pet Passport, Sun/Earth view (Java on :8081)</li>
              <li><strong style="color:var(--text)">Engine / Care</strong> — care meters &amp; lunar-day loop (Java on :8082)</li>
              <li><strong style="color:var(--text)">Pets</strong> — Triddy, Nodey, and friends art/mood demo</li>
              <li><strong style="color:var(--text)">Data / Missions</strong> — catalog browser over baked JSON</li>
            </ul>
            <p>Full plan: <a href="./PLAN.md">PLAN.md</a> · CLPS: <a href="https://www.nasa.gov/commercial-lunar-payload-services/" target="_blank" rel="noopener">nasa.gov/commercial-lunar-payload-services</a></p>
            <div class="pets-links">
              <a href="./STORY.md">STORY.md</a>
              <a href="./data/README.md">data/README.md</a>
              <a href="./src/engine/README.md">engine README</a>
              <a href="./demos/js-ui/index.html" target="_blank" rel="noopener">js-ui demo</a>
            </div>
          </div>
        </div>`;
    }

    stageEl.appendChild(panel);
    return panel;
  }

  function styleIframeEmbed(iframe) {
    const apply = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc?.documentElement) return;
        doc.documentElement.classList.add("in-shell");
        if (!doc.getElementById("shell-embed-css")) {
          const link = doc.createElement("link");
          link.id = "shell-embed-css";
          link.rel = "stylesheet";
          // Resolve from shell root so map + demos both find it
          link.href = new URL("./web/shell-embed.css", location.href).href;
          doc.head.appendChild(link);
        }
      } catch {
        /* cross-origin Story/Engine backends — CSS files restyled at source */
      }
    };
    iframe.addEventListener("load", apply);
    if (iframe.contentDocument?.readyState === "complete") apply();
  }

  async function activateIframe(tab, panel, ok) {
    const iframe = panel.querySelector("iframe");
    const note = panel.querySelector(".panel-note");
    if (!iframe) return;

    let src = tab.src;
    if (!ok && tab.fallback) {
      src = tab.fallback;
      note.dataset.show = "1";
      note.innerHTML = `${tab.label} server is not on <code>localhost:${tab.port}</code>. Showing the static demo fallback. Start <code>${tab.need}</code> for the full Java surface.`;
    } else if (!ok && tab.need) {
      note.dataset.show = "1";
      note.innerHTML = `${tab.label} needs <code>${tab.need}</code> (port ${tab.port}). Start it in another terminal, then click this tab again.`;
      // Still point iframe at the backend URL so a refresh after start works via reload below
    } else {
      note.dataset.show = "0";
      note.textContent = "";
    }

    styleIframeEmbed(iframe);

    if (iframe.getAttribute("src") !== src) {
      iframe.src = src;
    } else if (ok && tab.need) {
      // Backend came up after a failed load — reload
      try {
        iframe.contentWindow?.location.reload();
      } catch {
        iframe.src = src;
      }
    }
  }

  let dataLoaded = false;
  let catalog = null;

  function renderData() {
    if (!catalog) return;
    const view = $("#data-view")?.value || "missions";
    const q = ($("#data-q")?.value || "").trim().toLowerCase();
    const statusFilter = $("#data-status")?.value || "";
    const grid = $("#data-grid");
    const stats = $("#data-stats");

    stats.innerHTML = `
      <div class="stat"><b>${catalog.missions?.length ?? 0}</b><span>Missions</span></div>
      <div class="stat"><b>${catalog.sites?.length ?? 0}</b><span>Sites</span></div>
      <div class="stat"><b>${catalog.pets?.length ?? 0}</b><span>Pets</span></div>
      <div class="stat"><b>${catalog.payloads?.length ?? 0}</b><span>Payloads</span></div>
      <div class="stat"><b>${catalog.asOf || "—"}</b><span>Catalog as-of</span></div>`;

    let rows = [];
    if (view === "missions") {
      rows = (catalog.missions || [])
        .filter((m) => !statusFilter || m.status === statusFilter)
        .filter((m) => {
          if (!q) return true;
          const hay = [m.id, m.name, m.title, m.provider, m.lander, m.siteId, m.status, m.taskOrder]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
        .map((m) => {
          const site = (catalog.sites || []).find((s) => s.id === m.siteId);
          return `<article class="card">
            <h3>${escapeHtml(m.name || m.title || m.id)}</h3>
            <p class="meta">${escapeHtml(m.provider || "")}${m.lander ? " · " + escapeHtml(m.lander) : ""}${
              site ? " · " + escapeHtml(site.name || site.id) : m.siteId ? " · " + escapeHtml(m.siteId) : ""
            }${m.launchDate ? " · launch " + escapeHtml(m.launchDate) : ""}</p>
            <div class="tags">
              <span class="tag status-${escapeHtml(m.status || "")}">${escapeHtml(m.status || "unknown")}</span>
              <span class="tag">${escapeHtml(m.id)}</span>
              ${m.outcome ? `<span class="tag">${escapeHtml(m.outcome)}</span>` : ""}
            </div>
          </article>`;
        });
    } else if (view === "sites") {
      rows = (catalog.sites || [])
        .filter((s) => {
          if (!q) return true;
          const hay = [s.id, s.name, s.region, s.terrain, s.illumination]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
        .map((s) => `<article class="card">
          <h3>${escapeHtml(s.name || s.id)}</h3>
          <p class="meta">${escapeHtml(s.region || "")}${s.terrain ? " · " + escapeHtml(s.terrain) : ""}</p>
          <p class="meta">${escapeHtml(s.illumination || s.waterIce || "")}</p>
          <div class="tags"><span class="tag">${escapeHtml(s.id)}</span></div>
        </article>`);
    } else {
      rows = (catalog.pets || [])
        .filter((p) => {
          if (!q) return true;
          const hay = [p.id, p.name, p.vibe, p.passport, ...(p.payloadIds || [])]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
        .map((p) => `<article class="card">
          <h3>${escapeHtml(p.name || p.id)}</h3>
          <p class="meta">${escapeHtml(p.vibe || p.passport || "")}</p>
          <div class="tags">
            <span class="tag">${escapeHtml(p.id)}</span>
            ${p.rarity ? `<span class="tag">${escapeHtml(p.rarity)}</span>` : ""}
            ${p.homeMissionId ? `<span class="tag">${escapeHtml(p.homeMissionId)}</span>` : ""}
            ${p.homeSiteId ? `<span class="tag">${escapeHtml(p.homeSiteId)}</span>` : ""}
          </div>
        </article>`);
    }

    grid.innerHTML = rows.join("") || `<p class="meta">No matches.</p>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadDataPanel() {
    if (dataLoaded) {
      renderData();
      return;
    }
    const err = $("#data-error");
    try {
      const res = await fetch("./data/catalog.json");
      if (!res.ok) throw new Error(`catalog.json ${res.status}`);
      catalog = await res.json();
      dataLoaded = true;
      err.hidden = true;
      $("#data-q")?.addEventListener("input", renderData);
      $("#data-status")?.addEventListener("change", renderData);
      $("#data-view")?.addEventListener("change", renderData);
      renderData();
    } catch (e) {
      err.hidden = false;
      err.textContent = `Could not load data/catalog.json — serve the repo root (./run-v0.sh). ${e.message || e}`;
    }
  }

  async function show(id) {
    const tab = TABS.find((t) => t.id === id) || TABS[0];
    if (location.hash.slice(1) !== tab.id) {
      history.replaceState(null, "", `#${tab.id}`);
    }

    for (const t of TABS) {
      const btn = tabsEl.querySelector(`[data-tab="${t.id}"]`);
      const selected = t.id === tab.id;
      btn?.setAttribute("aria-selected", selected ? "true" : "false");
      btn?.setAttribute("tabindex", selected ? "0" : "-1");
    }

    const panel = ensurePanel(tab);
    for (const p of stageEl.querySelectorAll(".panel")) {
      p.classList.toggle("active", p === panel);
    }

    if (tab.kind === "iframe") {
      const ok = await probe(tab);
      updateBanner();
      await activateIframe(tab, panel, ok);
    } else if (tab.kind === "data") {
      await loadDataPanel();
    }
  }

  function buildTabs() {
    tabsEl.innerHTML = TABS.map(
      (t) => `<button type="button" class="tab" role="tab" id="tab-${t.id}"
        data-tab="${t.id}" aria-controls="panel-${t.id}" aria-selected="false" tabindex="-1">
        <span class="dot" aria-hidden="true"></span>${t.label}
      </button>`
    ).join("");

    tabsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tab]");
      if (btn) show(btn.dataset.tab);
    });

    tabsEl.addEventListener("keydown", (e) => {
      const buttons = [...tabsEl.querySelectorAll("[data-tab]")];
      const i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const next = e.key === "ArrowRight" ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
        buttons[next].focus();
        show(buttons[next].dataset.tab);
      }
    });
  }

  async function boot() {
    buildTabs();
    await Promise.all(TABS.map(probe));
    updateBanner();
    await show(hashTab());
    window.addEventListener("hashchange", () => show(hashTab()));
    // Re-probe backends periodically so Story/Engine light up without a full reload
    setInterval(async () => {
      await Promise.all(TABS.filter((t) => t.need).map(probe));
      updateBanner();
    }, 8000);
  }

  boot();
})();
