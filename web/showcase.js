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
          <header class="data-head">
            <div class="data-head-copy">
              <h1>Data / Missions</h1>
              <p class="judge-tip"><strong style="color:var(--text)">What to do here.</strong> This is the offline NASA CLPS spine — missions, south-pole sites, and instrument pets. Switch View to <em>Sites</em> (polar / Malapert / Mons Mouton) or <em>Pets</em> (the real instruments: LISTER, TRIDENT, EDS, LN-1, LRA/NGLR), then return to Navigator / Map with the ids verified.</p>
              <p class="lede">Baked facts from <code>data/catalog.json</code> (as-of stamped). Every pet maps to a flown or planned instrument — use this tab to prove provenance before the demo. Hover a mission card for its delivery summary and sources.</p>
            </div>
            <figure class="data-moon" id="data-moon" aria-label="Moon map of CLPS mission target regions"></figure>
          </header>
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
          <p class="meta-foot">Catalog rules: <a href="./data/README.md">data/README.md</a> · map / Horizons bake notes: <a href="./data/maps/NOTICE.md">data/maps/NOTICE.md</a> · Moon image: “Moon nearside LRO color mosaic” by <a href="https://commons.wikimedia.org/wiki/File:Moon_nearside_LRO_color_mosaic_(bright).png" target="_blank" rel="noopener">NASA/GSFC/Arizona State University</a>, public domain, via Wikimedia Commons</p>
        </div>`;
    } else if (tab.kind === "about") {
      panel.innerHTML = `
        <div class="local-panel">
          <div class="kicker">NASA SPACE APPS 2026</div>
          <h1>About · Payload Pets</h1>
          <p class="hero-prop">Compare lunar <strong style="color:var(--text)">south-pole</strong> landing sites for solar power and Earth communications — then feel those constraints by keeping a real CLPS instrument pet alive through one lunar day.</p>
          <p class="lede">Challenge: <a href="https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/" target="_blank" rel="noopener">Lunar Landing Site Navigator</a>. Judges: <strong style="color:var(--text)">Navigator</strong> (site/date compare) → <strong style="color:var(--text)">Map</strong> (terrain context) → <strong style="color:var(--text)">Pets</strong> (Power / Signal moods) → <strong style="color:var(--text)">Data</strong> (provenance).</p>

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
                  <td><strong style="color:var(--text)">Engine</strong> Power / Warmth · <strong style="color:var(--text)">Pets</strong> full sun → night moods (Triddy / LISTER need power)</td>
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
              <li><strong style="color:var(--text)">Power</strong> — Active instruments (Triddy / TRIDENT, LISTER, EDS) get cold or stop when the Sun drops; passive retroreflectors sleep through night because the real hardware needs no power.</li>
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
            <p>Attribution detail: <a href="./data/maps/NOTICE.md">data/maps/NOTICE.md</a> · catalog honesty rules: <a href="./data/README.md">data/README.md</a></p>
          </div>

          <div class="about-block">
            <div class="kicker">DEMO</div>
            <h2>90-second path</h2>
            <ol>
              <li><strong style="color:var(--text)">Navigator</strong> — compare two south-pole sites / dates; call out Sun→power and Earth→DTE.</li>
              <li><strong style="color:var(--text)">Map / Sites</strong> — show terrain / PSR context for the same sites.</li>
              <li><strong style="color:var(--text)">Pets</strong> — scrub full sun → night; Power (Triddy) vs Signal (Nodey).</li>
              <li><strong style="color:var(--text)">Data</strong> — flash as-of + NASA naming · optional Engine with <code>./run-engine.sh</code>.</li>
            </ol>
            <p>Plan &amp; awards: <a href="./PLAN.md">PLAN.md</a> · Story: <a href="./STORY.md">STORY.md</a></p>
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
    } else if (tab.id === "pets") {
      note.dataset.show = "1";
      note.innerHTML =
        "<strong>Judge tip.</strong> Pets translate the challenge physics: scrub <em>full sun → sunset → night</em>. Active instruments (Triddy / LISTER) need Power; Nodey (LN-1 beacon) teaches Signal / Earth contact; passive retroreflectors sleep through night because real hardware draws none.";
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
      <p class="stats-line"><span class="stat-pair"><b>${catalog.missions?.length ?? 0}</b> missions</span><span class="stat-pair"><b>${catalog.sites?.length ?? 0}</b> sites</span><span class="stat-pair"><b>${catalog.pets?.length ?? 0}</b> pets</span><span class="stat-pair"><b>${catalog.payloads?.length ?? 0}</b> payloads</span><span class="stat-pair stats-asof">catalog as-of ${escapeHtml(catalog.asOf || "—")}</span></p>`;

    renderDataMoon(catalog);

    let rows = [];
    const sourceById = new Map((catalog.sources || []).map((s) => [s.id, s]));
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
          const sources = (m.sourceIds || [])
            .map((id) => sourceById.get(id))
            .filter(Boolean);
          const detailBits = [
            m.region,
            site ? site.name || site.id : m.siteId,
            m.nasaPayloadCount != null
              ? `${m.nasaPayloadCount} NASA payload${m.nasaPayloadCount === 1 ? "" : "s"}`
              : "",
          ].filter(Boolean).map(escapeHtml).join(" · ");
          const regionCls = { polar: "polar", "near-side": "near", "far-side": "far" }[m.region];
          const regionLabel = { polar: "lunar south pole", "near-side": "near side", "far-side": "far side" }[m.region];
          const glyph = regionCls
            ? `<span class="moon-glyph" data-region="${regionCls}" title="Aims for the ${regionLabel}"><img src="web/assets/moon-nearside-lro.jpg" alt="" decoding="async"><i></i></span>`
            : "";
          return `<article class="card card--reveal" tabindex="0">
            <div class="card-face">
              ${glyph}
              <h3>${escapeHtml(m.name || m.title || m.id)}</h3>
              <p class="meta">${escapeHtml(m.provider || "")}${m.lander ? " · " + escapeHtml(m.lander) : ""}${
                site ? " · " + escapeHtml(site.name || site.id) : m.siteId ? " · " + escapeHtml(m.siteId) : ""
              }${m.launchDate ? " · launch " + escapeHtml(m.launchDate) : ""}</p>
              <div class="tags">
                <span class="tag status-${escapeHtml(m.status || "")}">${escapeHtml(m.status || "unknown")}</span>
                <span class="tag">${escapeHtml(m.id)}</span>
                ${m.outcome ? `<span class="tag">${escapeHtml(m.outcome)}</span>` : ""}
              </div>
            </div>
            <div class="card-detail">
              <div class="detail-head">
                <span class="tag status-${escapeHtml(m.status || "")}">${escapeHtml(m.status || "unknown")}</span>
                ${m.taskOrder ? `<span class="detail-order">${escapeHtml(m.taskOrder)}</span>` : ""}
              </div>
              ${m.summary ? `<p class="detail-summary">${escapeHtml(m.summary)}</p>` : ""}
              ${detailBits ? `<p class="detail-meta">${detailBits}</p>` : ""}
              ${m.payloadNote ? `<p class="detail-note">${escapeHtml(m.payloadNote)}</p>` : ""}
              ${sources.length
                ? `<div class="detail-sources">${sources
                    .map((s) => `<a class="source-chip" href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.publisher || s.title || s.id)}</a>`)
                    .join("")}</div>`
                : ""}
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
      const missionById = new Map((catalog.missions || []).map((m) => [m.id, m]));
      const siteById = new Map((catalog.sites || []).map((s) => [s.id, s]));
      const payloadById = new Map((catalog.payloads || []).map((p) => [p.id, p]));
      rows = (catalog.pets || [])
        .filter((p) => {
          if (!q) return true;
          const hay = [
            p.id, p.name, p.instrument, p.summary, p.vibe, p.passport,
            ...(p.care || []),
            ...(p.payloadIds || []),
            ...(p.payloadIds || []).map((id) => payloadById.get(id)?.name),
            p.homeMissionId ? missionById.get(p.homeMissionId)?.name : "",
            p.homeSiteId ? siteById.get(p.homeSiteId)?.name : "",
          ].filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
        .map((p) => {
          const mission = p.homeMissionId ? missionById.get(p.homeMissionId) : null;
          const site = p.homeSiteId ? siteById.get(p.homeSiteId) : null;
          const payloadNames = (p.payloadIds || []).map((id) => payloadById.get(id)?.name).filter(Boolean);
          const passive = p.passive || p.nightBehavior === "passive";
          const night = passive ? "Night: sleeps, needs no power" : "Night: needs lander power";
          const careChips = (p.care || [])
            .map((c) => `<span class="care-chip care-${escapeHtml(c.toLowerCase())}">${escapeHtml(c)}</span>`)
            .join("");
          const sources = (p.sourceIds || [])
            .map((id) => sourceById.get(id))
            .filter(Boolean)
            .map((s) => `<a class="source-chip" href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.publisher || s.title || s.id)}</a>`)
            .join("");
          return `<article class="card pet-card">
            <div class="pet-head">
              <h3>${escapeHtml(p.name || p.id)}</h3>
              <span class="pet-model" title="Model of the real ${escapeHtml(p.instrument || p.name || p.id)} instrument">${petModelSvg(p.id)}</span>
            </div>
            ${p.instrument ? `<p class="pet-instr">${escapeHtml(p.instrument)}${payloadNames.length ? " · " + escapeHtml(payloadNames.join(" · ")) : ""}</p>` : payloadNames.length ? `<p class="pet-instr">${escapeHtml(payloadNames.join(" · "))}</p>` : ""}
            ${p.summary ? `<p class="meta">${escapeHtml(p.summary)}</p>` : ""}
            ${mission || site ? `<p class="meta">Home: ${mission ? escapeHtml(mission.name || mission.id) : ""}${mission && site ? " · " : ""}${site ? escapeHtml(site.name || site.id) : ""}</p>` : ""}
            <div class="tags">
              ${careChips}
              <span class="tag">${escapeHtml(night)}</span>
              ${passive ? `<span class="tag">passive</span>` : ""}
            </div>
            ${sources ? `<div class="detail-sources">${sources}</div>` : ""}
          </article>`;
        });
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

  /**
   * Flat pet "model" per real instrument, drawn in the pets branch's
   * lander-mascot style (Moon Pals: blue lander body, white eyes with ink
   * pupils, pink cheeks). The instrument's own part gives each pet its
   * silhouette: LISTER's drill, the retroreflector's corner-cube plate,
   * EDS's dust shield, TRIDENT's twin drills, LN-1's navigation mast.
   */
  function petModelSvg(id) {
    const face = `
      <ellipse cx="26" cy="19" rx="4.5" ry="5.5" fill="#eef4fb"/>
      <ellipse cx="38" cy="19" rx="4.5" ry="5.5" fill="#eef4fb"/>
      <ellipse cx="27.5" cy="20" rx="1.8" ry="2.6" fill="#1f2f46"/>
      <ellipse cx="39.5" cy="20" rx="1.8" ry="2.6" fill="#1f2f46"/>
      <ellipse cx="20" cy="26" rx="3.5" ry="2" fill="#ffbeba"/>
      <ellipse cx="44" cy="26" rx="3.5" ry="2" fill="#ffbeba"/>`;
    const parts = {
      "heat-flow-drill": `
        <rect x="16" y="8" width="32" height="22" rx="6" fill="#3d5a80"/>
        ${face}
        <rect x="30" y="30" width="4" height="9" fill="#8c9bbd"/>
        <path d="M28 39 L36 39 L32 46 Z" fill="#44e2ff"/>`,
      retroreflector: `
        <rect x="13" y="7" width="38" height="27" rx="3" fill="#3d5a80"/>
        <g fill="#44e2ff" opacity="0.85">
          <rect x="18" y="10" width="6" height="5"/><rect x="29" y="10" width="6" height="5"/><rect x="40" y="10" width="6" height="5"/>
          <rect x="18" y="17" width="6" height="5"/><rect x="40" y="17" width="6" height="5"/>
        </g>
        <rect x="19" y="40" width="5" height="4" fill="#8c9bbd"/>
        <rect x="40" y="40" width="5" height="4" fill="#8c9bbd"/>
        ${face}`,
      "dust-shield": `
        <path d="M12 14 Q32 0 52 14 L52 18 Q32 6 12 18 Z" fill="#44e2ff" opacity="0.55"/>
        <rect x="16" y="16" width="32" height="20" rx="6" fill="#3d5a80"/>
        ${face}`,
      trident: `
        <rect x="18" y="6" width="28" height="22" rx="6" fill="#3d5a80"/>
        ${face}
        <path d="M49 4 L57 4 L53 12 Z" fill="#8c9bbd"/>
        <rect x="23" y="28" width="3" height="11" fill="#8c9bbd"/>
        <rect x="38" y="28" width="3" height="11" fill="#8c9bbd"/>
        <path d="M21 39 L27 39 L24 46 Z" fill="#44e2ff"/>
        <path d="M37 39 L43 39 L40 46 Z" fill="#44e2ff"/>`,
      "ln-1": `
        <rect x="16" y="12" width="32" height="20" rx="6" fill="#3d5a80"/>
        ${face}
        <rect x="30" y="2" width="3" height="10" fill="#8c9bbd"/>
        <circle cx="31.5" cy="4" r="3.5" fill="#44e2ff"/>
        <path d="M24 4 Q31.5 -2 39 4" stroke="#44e2ff" stroke-width="1.5" fill="none" opacity="0.7"/>
        <rect x="20" y="32" width="24" height="4" rx="2" fill="#8c9bbd"/>`,
    };
    return `<svg viewBox="0 0 64 48" role="img" aria-label="Model of the pet's real instrument">${parts[id] || parts["heat-flow-drill"]}</svg>`;
  }

  /**
   * Moon theme, from the catalog and real imagery: an LRO nearside mosaic
   * (NASA/GSFC/ASU, public domain) as the face, with a dot for each target
   * region of a real mission in data/catalog.json. Position encodes region
   * (bottom = south pole, left = near side, right = far side); the caption
   * states the counts so the picture never claims more than the data.
   */
  function renderDataMoon(catalog) {
    const moonEl = $("#data-moon");
    if (!moonEl) return;
    const counts = { polar: 0, "near-side": 0, "far-side": 0 };
    for (const m of catalog.missions || []) if (counts[m.region] != null) counts[m.region]++;
    const total = (catalog.missions || []).length;
    const dot = (x, y, n, label) =>
      n
        ? `<span class="moon-dot" style="left:${x}%;top:${y}%" title="${n} mission${n === 1 ? "" : "s"} — ${label}"></span>`
        : "";
    moonEl.innerHTML = `
      <span class="moon-photo" aria-hidden="true">
        <img src="web/assets/moon-nearside-lro.jpg" alt="NASA LRO nearside mosaic of the Moon" width="118" height="118" decoding="async">
        ${dot(50, 92, counts.polar, "lunar south pole")}
        ${dot(8, 50, counts["near-side"], "near side")}
        ${dot(92, 50, counts["far-side"], "far side, beyond this limb")}
      </span>
      <figcaption>${counts.polar} of ${total} missions aim for the south pole${counts["far-side"] ? ` · ${counts["far-side"]} for the far side` : ""}</figcaption>`;
  }

  /**
   * Touch/click support for the mission-card hover detail (bound once).
   * Desktop uses :hover / :focus-within; here a tap pins the detail open
   * (one pinned card at a time), Escape unpins, source links still work.
   */
  function bindCardDetail(grid) {
    if (!grid || grid.dataset.detailBound) return;
    grid.dataset.detailBound = "1";
    grid.addEventListener("click", (e) => {
      const link = e.target.closest("a");
      if (link) return; // let provenance links work
      const card = e.target.closest(".card--reveal");
      if (!card) return;
      const wasPinned = card.classList.contains("card--pinned");
      for (const c of grid.querySelectorAll(".card--pinned")) c.classList.remove("card--pinned");
      if (!wasPinned) card.classList.add("card--pinned");
    });
    grid.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const card = e.target.closest?.(".card--reveal");
      if (card) card.classList.remove("card--pinned");
    });
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
      bindCardDetail($("#data-grid"));
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
