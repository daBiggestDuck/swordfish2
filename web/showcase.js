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
      fallback: "./web/story/index.html",
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
    { id: "readme", label: "User Guide", kind: "readme", health: "static" },
  ];

  const $ = (sel, el = document) => el.querySelector(sel);
  const tabsEl = $("#tabs");
  const stageEl = $("#stage");
  const bannerEl = $("#shell-banner");
  const status = Object.fromEntries(TABS.map((t) => [t.id, t.health === "static" ? "static" : "unknown"]));

  function parseHash() {
    const raw = (location.hash || "#map").slice(1);
    if (!raw) return { id: "map", doc: null };
    const colonIdx = raw.indexOf(":");
    const rawId = (colonIdx >= 0 ? raw.slice(0, colonIdx) : raw).toLowerCase();
    let rawDoc = null;
    if (colonIdx >= 0) {
      try {
        rawDoc = decodeURIComponent(raw.slice(colonIdx + 1));
      } catch {
        rawDoc = raw.slice(colonIdx + 1);
      }
    }
    const id = TABS.some((t) => t.id === rawId) ? rawId : "map";
    return { id, doc: id === "readme" && rawDoc ? rawDoc : null };
  }

  function hashTab() {
    return parseHash().id;
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
    const needBackend = down.filter((t) => !t.fallback);
    if (!needBackend.length) {
      bannerEl.dataset.show = "1";
      bannerEl.innerHTML =
        "Running in static Live Server mode (built-in JS fallbacks active for " +
        down.map((t) => t.label).join(" &amp; ") +
        "). Optional Java servers: " +
        down.map((t) => `<code>${t.need}</code> (:${t.port})`).join(" · ") +
        ".";
      return;
    }
    bannerEl.dataset.show = "1";
    bannerEl.innerHTML =
      "Story / Engine tabs need their Java servers. In other terminals: " +
      needBackend
        .map((t) => `<code>${t.need}</code> → localhost:${t.port}`)
        .join(" · ") +
      ". Map, Navigator, Pets, Data, About, and README work from this shell alone.";
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
          <div class="kicker">CLPS CATALOG · JUDGE PATH</div>
          <h1>Data / Missions</h1>
          <details class="local-more">
            <summary>What to do here · provenance tip</summary>
            <p class="judge-tip"><strong style="color:var(--text)">Judge path.</strong> Offline NASA CLPS spine — missions, south-pole sites, instrument pets. Switch View to <em>Sites</em> or <em>Pets</em>, then return to Navigator / Map with the ids verified.</p>
            <p class="lede">Baked facts from <code>data/catalog.json</code> (as-of stamped). Every pet maps to a flown or planned instrument.</p>
          </details>
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
          <p class="meta-foot">NASA map &amp; Horizons provenance: <a href="./data/maps/NOTICE.md">NASA Data &amp; Credits</a></p>
        </div>`;
    } else if (tab.kind === "about") {
      panel.innerHTML = `
        <div class="local-panel">
          <div class="kicker">NASA SPACE APPS 2026</div>
          <h1>About · Payload Pets</h1>
          <p class="hero-prop">Compare lunar <strong style="color:var(--text)">south-pole</strong> landing sites for solar power and Earth communications — then feel those constraints by keeping a real CLPS instrument pet alive through one lunar day.</p>
          <p class="lede">Challenge: <a href="https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/" target="_blank" rel="noopener">Lunar Landing Site Navigator</a>. Judges: <strong style="color:var(--text)">Navigator</strong> (site/date compare) → <strong style="color:var(--text)">Map</strong> (terrain context) → <strong style="color:var(--text)">Pets</strong> (Power / Signal moods) → <strong style="color:var(--text)">Data</strong> (provenance).</p>
          <div class="about-actions">
            <button type="button" class="btn-preview-readme" data-open-readme="README.md">Open User Guide</button>
            <a class="about-btn-link" href="#readme:data/maps/NOTICE.md" data-open-readme="data/maps/NOTICE.md">NASA Data &amp; Credits</a>
            <a class="about-btn-link" href="./readme.html" target="_blank" rel="noopener">Open Guide Page ↗</a>
          </div>

          <div class="about-block callout-pole">
            <div class="kicker">SOUTH POLE</div>
            <h2>Why the pole, not a tourist Moon</h2>
            <p>Artemis / CLPS polar landings sit where the Sun skims the horizon and ridges decide power. We emphasize Malapert A, Mons Mouton / Shackleton Ridge, and other polar CLPS sites — illumination, PSR proximity, and Earth line-of-sight — not a generic full-globe brochure.</p>
          </div>

          <div class="about-block">
            <div class="kicker">REQUIREMENT MAP</div>
            <h2>Challenge ask → product tab</h2>
            <table class="req-map">
              <thead>
                <tr><th>Challenge asks</th><th>Where it lives</th></tr>
              </thead>
              <tbody>
                <tr>
                  <th>Compare south-pole sites &amp; dates</th>
                  <td><strong style="color:var(--text)">Navigator</strong> (primary compare) · <strong style="color:var(--text)">Map / Sites</strong> · <strong style="color:var(--text)">Data</strong> filters</td>
                </tr>
                <tr>
                  <th>Sun &amp; Earth vs the horizon</th>
                  <td><strong style="color:var(--text)">Navigator</strong> + <strong style="color:var(--text)">Map</strong> (LOLA horizon context) · Story Sun/Earth view · Engine day–night loop</td>
                </tr>
                <tr>
                  <th>Solar-power potential</th>
                  <td><strong style="color:var(--text)">Engine</strong> Power / Warmth · <strong style="color:var(--text)">Pets</strong> full sun → night moods (LISTER / EDS need power)</td>
                </tr>
                <tr>
                  <th>Direct-to-Earth comm windows</th>
                  <td><strong style="color:var(--text)">Engine</strong> Signal · <strong style="color:var(--text)">Pets</strong> Nodey (LN-1) prefers waiting on Signal · site Earth-visibility notes</td>
                </tr>
                <tr>
                  <th>Intuitive for planners &amp; public</th>
                  <td>Pets teach the physics; Navigator / Map stay the serious planning surfaces</td>
                </tr>
                <tr>
                  <th>NASA open data (Horizons, LOLA, Moon Trek)</th>
                  <td>Baked into <code>data/</code> — provenance below + <a href="./data/maps/NOTICE.md">NOTICE.md</a></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="about-block">
            <div class="kicker">PETS HOOK</div>
            <h2>How pets teach power &amp; comms</h2>
            <ul>
              <li><strong style="color:var(--text)">Power</strong> — Active instruments (LISTER, EDS) get cold or stop when the Sun drops; passive Retro (LRA) sleeps through night because the real hardware needs no power.</li>
              <li><strong style="color:var(--text)">Signal</strong> — Nodey (Lunar Node-1) is a ranging beacon: “prefer wait on Signal” mirrors needing Earth (or a relay) in view before you transmit.</li>
              <li><strong style="color:var(--text)">Same physics</strong> — Polar ridges and farside geometry change the meters Navigator / Engine show with Horizons + LOLA. The pet is the tutorial layer, not a separate toy universe.</li>
            </ul>
            <div class="pets-links">
              <a href="#navigator">Navigator</a>
              <a href="#map">Map / Sites</a>
              <a href="#pets">Pets</a>
              <a href="#engine">Engine / Care</a>
              <a href="#data">Data</a>
            </div>
          </div>

          <div class="about-block">
            <div class="kicker">PROVENANCE</div>
            <h2>NASA data links</h2>
            <ul class="provenance-list">
              <li><a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noopener">JPL Horizons</a> — Sun / Earth geometry; baked offline for the demo</li>
              <li><a href="https://trek.nasa.gov/moon/" target="_blank" rel="noopener">NASA Moon Trek</a> — CLPS site coords, south-pole PSR / illumination, LOLA DEM services</li>
              <li><a href="https://svs.gsfc.nasa.gov/4720" target="_blank" rel="noopener">NASA SVS CGI Moon Kit</a> — LROC WAC + LOLA global basemaps</li>
              <li><a href="https://www.nasa.gov/commercial-lunar-payload-services/" target="_blank" rel="noopener">NASA CLPS</a> · <a href="https://science.nasa.gov/lunar-discovery/deliveries/" target="_blank" rel="noopener">delivery pages</a> — missions &amp; payloads in the catalog</li>
              <li><a href="https://pds-geosciences.wustl.edu/missions/clps/index.htm" target="_blank" rel="noopener">PDS Geosciences CLPS node</a> — science-data trail for flown payloads</li>
            </ul>
            <p>Attribution detail: <a href="./data/maps/NOTICE.md">NASA Data &amp; Credits</a></p>
          </div>

          <div class="about-block">
            <div class="kicker">DEMO</div>
            <h2>90-second path</h2>
            <ol>
              <li><strong style="color:var(--text)">Navigator</strong> — compare two south-pole sites / dates; call out Sun→power and Earth→DTE.</li>
              <li><strong style="color:var(--text)">Map / Sites</strong> — pick a pet, drop it on a south-pole site, scrub the sun clock to watch 3D moods (power glow / night / signal stress).</li>
              <li><strong style="color:var(--text)">Pets</strong> — same live drop mirrors here; scrub full sun → night for Power vs Signal vs passive Retro.</li>
              <li><strong style="color:var(--text)">Data</strong> — browse verified NASA CLPS missions, landing sites, and payload instruments.</li>
            </ol>
            <p>Full guide: <a href="./README.md">User Guide</a></p>
          </div>
        </div>`;
    } else if (tab.kind === "readme") {
      panel.innerHTML = `
        <div class="local-panel md-panel-wrap">
          <div class="kicker">USER GUIDE &amp; NASA CREDITS</div>
          <h1>Payload Pets User Guide</h1>
          <p class="lede">Learn how to explore lunar landing sites, compare solar power and Earth communications, and view official NASA data attribution.</p>
          <div id="readme-viewer-mount"></div>
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
    if (!iframe.dataset.shellEmbedBound) {
      iframe.dataset.shellEmbedBound = "1";
      iframe.addEventListener("load", apply);
    }
    if (iframe.getAttribute("src") && iframe.contentDocument?.readyState === "complete") apply();
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
    } else if (tab.id === "map") {
      note.dataset.show = "1";
      note.className = "panel-note shell-tip";
      note.innerHTML =
        "<details><summary>Demo tip</summary><p><strong>Judge tip.</strong> Pick a payload pet (LISTER / Retro / EDS / Nodey) → click a south-pole site → <em>Drop Pet on Moon</em>. Scrub the sun clock for power glow, night huddle, and Nodey signal stress when Earth is blocked.</p></details>";
    } else if (tab.id === "pets") {
      note.dataset.show = "1";
      note.className = "panel-note shell-tip";
      note.innerHTML =
        "<details><summary>Demo tip</summary><p><strong>Judge tip.</strong> After a Map drop, this tab mirrors the live site mood on the same <em>3D</em> instruments. Scrub <em>full sun → sunset → night</em> — Power pets huddle in night; Nodey teaches Signal; Retro sleeps.</p></details>";
    } else {
      note.dataset.show = "0";
      note.className = "panel-note";
      note.textContent = "";
    }

    styleIframeEmbed(iframe);

    const parked = iframe.dataset.parkedSrc;
    if (parked) {
      delete iframe.dataset.parkedSrc;
      iframe.src = src || parked;
      return;
    }

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

  let readmeViewer = null;

  function ensureReadmeViewer(panel, initialDoc) {
    const mount = panel.querySelector("#readme-viewer-mount");
    if (!mount) return;
    const api = window.MarkdownPreview;
    if (!api) {
      mount.innerHTML = `<p class="error">Markdown preview helper (<code>web/md_preview.js</code>) is unavailable. Open <a href="./README.md">README.md</a> directly.</p>`;
      return;
    }
    if (!readmeViewer) {
      readmeViewer = api.mountMarkdownViewer(mount, {
        rootPrefix: "./",
        initialDoc: initialDoc || "README.md",
        onDocChange: (nextDoc) => {
          if (hashTab() === "readme") {
            const targetHash = nextDoc && nextDoc !== "README.md" ? `#readme:${nextDoc}` : "#readme";
            if (location.hash !== targetHash) {
              history.replaceState(null, "", targetHash);
            }
          }
        },
      });
    } else if (initialDoc) {
      readmeViewer.loadDoc(initialDoc);
    }
  }

  /** Map + Pets each hold WebGL; park inactive ones so contexts free up. */
  const WEBGL_TABS = new Set(["map", "pets"]);

  function parkWebGlIframes(exceptId) {
    for (const t of TABS) {
      if (!WEBGL_TABS.has(t.id) || t.id === exceptId) continue;
      const p = stageEl.querySelector(`[data-panel="${t.id}"]`);
      const iframe = p?.querySelector("iframe");
      if (!iframe) continue;
      const src = iframe.getAttribute("src");
      if (src && src !== "about:blank") {
        iframe.dataset.parkedSrc = src;
        iframe.src = "about:blank";
      }
    }
  }

  async function show(id, docPath = null) {
    const tab = TABS.find((t) => t.id === id) || TABS[0];
    const activeDoc = tab.id === "readme" ? (docPath || readmeViewer?.getCurrentDoc?.() || "README.md") : null;
    const nextHash =
      tab.id === "readme" && activeDoc && activeDoc !== "README.md" ? `#readme:${activeDoc}` : `#${tab.id}`;
    if (location.hash !== nextHash) {
      history.replaceState(null, "", nextHash);
    }

    for (const t of TABS) {
      const btn = tabsEl.querySelector(`[data-tab="${t.id}"]`);
      const selected = t.id === tab.id;
      btn?.setAttribute("aria-selected", selected ? "true" : "false");
      btn?.setAttribute("tabindex", selected ? "0" : "-1");
    }

    parkWebGlIframes(WEBGL_TABS.has(tab.id) ? tab.id : null);

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
    } else if (tab.kind === "readme") {
      ensureReadmeViewer(panel, docPath);
    }
  }

  function bindMarkdownLinks() {
    document.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const openBtn = e.target.closest("[data-open-readme]");
      if (openBtn) {
        e.preventDefault();
        show("readme", openBtn.dataset.openReadme || "README.md");
        return;
      }

      const anchor = e.target.closest("a[href]");
      if (!anchor || anchor.closest(".md-viewer")) return;
      if (anchor.target === "_blank") return;

      const href = anchor.getAttribute("href") || "";
      const api = window.MarkdownPreview;
      const normalized = api?.normalizeDocPath?.(href, "README.md");
      const allowed = api?.PROJECT_DOCS?.some((d) => d.path === normalized);
      if (normalized && allowed) {
        e.preventDefault();
        show("readme", normalized);
      }
    });
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
    bindMarkdownLinks();
    await Promise.all(TABS.map(probe));
    updateBanner();
    const initial = parseHash();
    await show(initial.id, initial.doc);
    window.addEventListener("hashchange", () => {
      const parsed = parseHash();
      show(parsed.id, parsed.doc);
    });
    // Re-probe backends periodically so Story/Engine light up without a full reload
    setInterval(async () => {
      await Promise.all(TABS.filter((t) => t.need).map(probe));
      updateBanner();
    }, 8000);
  }

  boot();
})();
