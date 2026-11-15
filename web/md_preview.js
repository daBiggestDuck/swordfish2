(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.MarkdownPreview = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const PROJECT_DOCS = [
    {
      path: "README.md",
      label: "User Guide",
      subtitle: "How to Explore & Play Payload Pets",
    },
    {
      path: "data/maps/NOTICE.md",
      label: "NASA Data & Credits",
      subtitle: "Official NASA Sources & Provenance",
    },
  ];

  // Offline / file:// fallback for README.md when fetch() is blocked by browser CORS policy.
  const README_FALLBACK = `# Payload Pets — User Guide

Explore real NASA lunar landing sites, compare solar power and Earth communications across the Moon's South Pole, and discover how real spaceflight instruments survive a lunar day.

Built for the **NASA Space Apps Challenge** ([Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/)), **Payload Pets** pairs an interactive 3D lunar planning map with four adoptable science instruments inspired by NASA's [Commercial Lunar Payload Services (CLPS)](https://www.nasa.gov/commercial-lunar-payload-services/) program.

---

## Inside the App (Navigation Tabs)

| Tab | What You Can Do |
|---|---|
| **Map / Sites** | Spin the 3D Moon Globe, switch to Flat Map or South Pole views, play or scrub the lunar Sun clock, inspect any spot on the Moon, and drop a payload pet onto the surface. |
| **Navigator** | Compare two South Pole landing sites side-by-side for any UTC date — track Sun elevation for solar power and Earth visibility for direct radio communications over real LOLA terrain ridges. |
| **Story / Passport** | Follow a guided lunar day with your adopted pet, encounter pop-up dispatches from real CLPS landers, and earn a shareable **Pet Passport** at sunset. |
| **Engine / Care** | Keep your instrument pet warm, powered, dust-free, and connected to Earth through changing sunlight and shadow. |
| **Pets** | Meet all four adoptable NASA CLPS payload pets and preview how each reacts across **Full Sun**, **Sunset**, and **Lunar Night**. |
| **Data / Missions** | Browse the verified catalog of NASA CLPS landers, landing sites, scheduled launch windows, and payload instruments. |
| **About** | See how every app screen maps to lunar mission-planning questions and NASA data sources. |

---

## Meet the Four NASA CLPS Payload Pets

Each pet represents a real hardware instrument flown or manifested on NASA CLPS landers:

| Pet | Real Instrument & Mission | What Teaches Power & Comms |
|---|---|---|
| **LISTER** | Lunar Instrumentation for Subsurface Thermal Exploration with Rapidity (*Blue Ghost 1*, Mare Crisium) | Active heat-flow drill that relies on solar power — thrives in sunlight and shivers when shadow falls. |
| **Retro** (\`LRA\`) | Laser Retroreflector Array (*IM-1 / IM-2 / Blue Ghost 1*) | Passive optical prism mirror — needs **zero** electrical power and calmly sleeps through lunar night. |
| **EDS** | Electrodynamic Dust Shield (*Blue Ghost 1*, Mare Crisium) | Clears sharp lunar regolith dust from solar panels and optics while powered by the Sun. |
| **Nodey** (\`LN-1\`) | Lunar Node-1 Navigation Demonstrator (*IM-1*, Malapert A) | Radio positioning beacon that teaches **Signal & Earth Line-of-Sight** — waits for a clear view of Earth (or a relay) before transmitting. |

---

## Exploring the Moon & Picking Landing Spots

Use **Map / Sites** to switch between three synchronized views while keeping your selected spot pinned:

- **3D Globe** — Drag to spin with smooth momentum, scroll to zoom, toggle the live Day & Night terminator, lunar grid lines, Polar Permanently Shadowed Regions (**Ice Craters**), and **Mission Links**.
- **Flat Map** — Full equirectangular projection (\`180°W\` to \`180°E\`) showing global daylight patterns and landing zones at once.
- **South Pole** — Top-down polar projection centered on \`90°S\`, highlighting permanently shadowed cold traps and nearby rim ridges.

Click any curated mission pin or **click anywhere on the Moon** to open a **Landing Spot Check**:

1. **NASA Mission Status** — Shows whether a spot is a planned or completed CLPS/Artemis landing site (plus launch window details) or a custom spot with the nearest official NASA landing site.
2. **Sunlight & Power** — Displays current Sun elevation above local terrain ridges and monthly sunlit coverage.
3. **Temperature** — Shows surface thermal conditions calibrated to NASA Diviner lunar temperature measurements.
4. **Ground Slope & Earth Signal** — Checks landing slope safety and whether Earth is directly visible or needs an orbital communications relay (essential on the lunar far side).

---

## Quick 90-Second Walkthrough

1. Open **Map / Sites**, choose a payload pet (like **LISTER** or **Nodey**), click a South Pole site such as **Shackleton Crater Rim** or **Malapert A**, and press **Select This Spot**.
2. Press **Play** on the Sun Clock (or drag the slider) to watch sunlight sweep across polar crater rims and see how your pet's Power and Signal respond.
3. Switch to **Navigator** to compare two South Pole sites across a 14-day window and check exact solar power and Earth communication windows.
4. Visit **Pets** and **Data / Missions** to explore moods and mission histories behind each instrument.

---

## NASA Open Data & Credits

All coordinates, ephemeris angles, lunar elevation profiles, and imagery are sourced from public NASA datasets (including JPL Horizons, NASA Moon Trek, LROC WAC, LOLA DEM, Diviner, and NASA CLPS mission records).

Read the full source citations and attribution notice in [\`data/maps/NOTICE.md\`](data/maps/NOTICE.md).
`;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function decodeHtmlEntities(str) {
    return String(str)
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');
  }

  function stripTags(html) {
    return decodeHtmlEntities(String(html).replace(/<[^>]+>/g, "")).trim();
  }

  function slugifyHeading(text, seenSlugs) {
    const base =
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-") || "section";
    const count = seenSlugs.get(base) || 0;
    seenSlugs.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  }

  function normalizeDocPath(rawHref, baseDoc = "README.md") {
    if (!rawHref) return null;
    const cleaned = decodeHtmlEntities(String(rawHref).trim());
    if (!cleaned || cleaned.startsWith("#")) return null;
    if (/^(?:https?:|mailto:|tel:|javascript:|data:|\/\/)/i.test(cleaned)) return null;

    const hashIdx = cleaned.indexOf("#");
    const pathPart = (hashIdx >= 0 ? cleaned.slice(0, hashIdx) : cleaned).split("?")[0];
    if (!pathPart || !/\.md$/i.test(pathPart)) return null;

    const baseParts = pathPart.startsWith("/")
      ? []
      : String(baseDoc || "README.md")
          .replace(/^\/+/, "")
          .split("/")
          .slice(0, -1);

    const out = [...baseParts];
    for (const seg of pathPart.replace(/^\/+/, "").split("/")) {
      if (!seg || seg === ".") continue;
      if (seg === "..") {
        if (out.length === 0) return null;
        out.pop();
      } else {
        out.push(seg);
      }
    }
    return out.join("/") || null;
  }

  function isSafeHref(rawHref) {
    const decoded = decodeHtmlEntities(String(rawHref || "").trim());
    if (!decoded) return false;
    if (/^(?:javascript|vbscript|data):/i.test(decoded)) return false;
    return true;
  }

  function renderInline(rawText, options = {}) {
    const baseDoc = options.currentDoc || "README.md";
    const cleaned = String(rawText || "").replace(/[\u0000\u0001]/g, "");
    const tokens = [];
    const stash = (html) => {
      const idx = tokens.length;
      tokens.push(html);
      return `\u0001MD_${idx}\u0001`;
    };

    // 1. Extract inline code spans first so markers/links inside backticks are preserved literally.
    let work = cleaned.replace(/(`+)([^`]+?)\1/g, (_, _ticks, code) => {
      return stash(`<code>${escapeHtml(code)}</code>`);
    });

    // 2. Escape remaining HTML characters before introducing tags.
    work = escapeHtml(work);

    // 3. Extract Markdown links [label](href "title").
    work = work.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (full, label, href, title) => {
      if (!isSafeHref(href)) return full;
      const docPath = normalizeDocPath(href, baseDoc);
      const formattedLabel = applyTextStyles(label);
      const titleAttr = title ? ` title="${title}"` : "";
      if (docPath) {
        return stash(
          `<a href="${href}" class="md-doc-link" data-md-doc="${escapeHtml(docPath)}"${titleAttr}>${formattedLabel}</a>`
        );
      }
      const isExternal = /^https?:\/\//i.test(decodeHtmlEntities(href));
      const targetAttr = isExternal ? ` target="_blank" rel="noopener"` : "";
      return stash(`<a href="${href}"${targetAttr}${titleAttr}>${formattedLabel}</a>`);
    });

    // 4. Autolink bare http(s) URLs not inside links/code spans.
    work = work.replace(/(^|[\s(>])(https?:\/\/[^\s<)]+)/g, (full, prefix, url) => {
      let cleanUrl = url;
      let trailing = "";
      while (/[.,;:!?)]$/.test(cleanUrl)) {
        trailing = cleanUrl.slice(-1) + trailing;
        cleanUrl = cleanUrl.slice(0, -1);
      }
      if (!cleanUrl) return full;
      return `${prefix}${stash(`<a href="${cleanUrl}" target="_blank" rel="noopener">${cleanUrl}</a>`)}${trailing}`;
    });

    // 5. Apply emphasis/strong/strikethrough.
    work = applyTextStyles(work);

    // 6. Restore stashed HTML tokens (including nested code spans inside links).
    for (let pass = 0; pass < 3 && work.includes("\u0001MD_"); pass++) {
      work = work.replace(/\u0001MD_(\d+)\u0001/g, (_, idx) => tokens[Number(idx)] ?? "");
    }
    return work;
  }

  function applyTextStyles(escapedText) {
    return escapedText
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
      .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  }

  function splitTableRow(line) {
    let trimmed = line.trim();
    if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
    if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
    const cells = [];
    let current = "";
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === "\\" && trimmed[i + 1] === "|") {
        current += "|";
        i++;
      } else if (ch === "|") {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  }

  function parseTableSeparator(line) {
    if (!line || !line.includes("|")) return null;
    const rawCells = splitTableRow(line);
    if (!rawCells.length) return null;
    const aligns = [];
    for (const cell of rawCells) {
      if (!/^:?-{2,}:?$/.test(cell)) return null;
      const left = cell.startsWith(":");
      const right = cell.endsWith(":");
      aligns.push(left && right ? "center" : right ? "right" : "left");
    }
    return aligns;
  }

  function isHr(line) {
    return /^\s{0,3}(?:([-*_])\s*\1\s*\1(?:\s*\1)*)\s*$/.test(line);
  }

  function renderMarkdown(markdown, options = {}) {
    const source = String(markdown || "").replace(/\r\n?/g, "\n");
    const lines = source.split("\n");
    const toc = [];
    const seenSlugs = new Map();
    const out = [];
    let i = 0;

    const isBlockStart = (idx) => {
      const l = lines[idx];
      if (l == null) return false;
      return (
        /^\s{0,3}```/.test(l) ||
        /^\s{0,3}(#{1,6})\s+/.test(l) ||
        /^\s{0,3}>\s?/.test(l) ||
        isHr(l) ||
        /^\s*[-*+]\s+/.test(l) ||
        /^\s*\d+\.\s+/.test(l) ||
        (l.includes("|") && parseTableSeparator(lines[idx + 1]) !== null)
      );
    };

    while (i < lines.length) {
      const line = lines[i];

      if (!line.trim()) {
        i++;
        continue;
      }

      // Fenced code blocks ```lang
      const fenceMatch = line.match(/^\s{0,3}```([^\s`]*)\s*$/);
      if (fenceMatch) {
        const lang = (fenceMatch[1] || "").trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !/^\s{0,3}```\s*$/.test(lines[i])) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++;
        const rawCode = codeLines.join("\n");
        const langBadge = lang ? `<span class="md-code-lang">${escapeHtml(lang)}</span>` : `<span class="md-code-lang">text</span>`;
        out.push(
          `<div class="md-code-block">` +
            `<div class="md-code-head">${langBadge}<button type="button" class="md-copy-btn">Copy</button></div>` +
            `<pre><code>${escapeHtml(rawCode)}</code></pre>` +
          `</div>`
        );
        continue;
      }

      // Headings # .. ######
      const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (headingMatch) {
        const level = Math.min(6, headingMatch[1].length);
        const inlineHtml = renderInline(headingMatch[2], options);
        const plainText = stripTags(inlineHtml);
        const id = slugifyHeading(plainText, seenSlugs);
        if (level <= 3) {
          toc.push({ level, text: plainText, id });
        }
        out.push(`<h${level} id="${id}" class="md-h${level}">${inlineHtml}</h${level}>`);
        i++;
        continue;
      }

      // Horizontal rules
      if (isHr(line)) {
        out.push(`<hr class="md-hr">`);
        i++;
        continue;
      }

      // GFM pipe tables
      const tableAligns = line.includes("|") ? parseTableSeparator(lines[i + 1]) : null;
      if (tableAligns) {
        const headers = splitTableRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
          rows.push(splitTableRow(lines[i]));
          i++;
        }
        const ths = headers
          .map((cell, col) => {
            const align = tableAligns[col] || "left";
            return `<th style="text-align:${align}">${renderInline(cell, options)}</th>`;
          })
          .join("");
        const trs = rows
          .map((cells) => {
            const tds = tableAligns
              .map((align, col) => `<td style="text-align:${align}">${renderInline(cells[col] ?? "", options)}</td>`)
              .join("");
            return `<tr>${tds}</tr>`;
          })
          .join("");
        out.push(
          `<div class="md-table-wrap"><table class="md-table">` +
            `<thead><tr>${ths}</tr></thead>` +
            `<tbody>${trs}</tbody>` +
          `</table></div>`
        );
        continue;
      }

      // Blockquotes
      if (/^\s{0,3}>\s?/.test(line)) {
        const quoteLines = [];
        while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i])) {
          quoteLines.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
          i++;
        }
        const inner = renderMarkdown(quoteLines.join("\n"), options);
        out.push(`<blockquote class="md-quote">${inner.html}</blockquote>`);
        continue;
      }

      // Lists (unordered & ordered with single-level sub-bullets)
      const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
      const olMatch = !ulMatch ? line.match(/^(\s*)\d+\.\s+(.*)$/) : null;
      if (ulMatch || olMatch) {
        const tag = ulMatch ? "ul" : "ol";
        const baseIndent = (ulMatch || olMatch)[1].length;
        const items = [];

        while (i < lines.length) {
          const cur = lines[i];
          const curUl = cur.match(/^(\s*)[-*+]\s+(.*)$/);
          const curOl = !curUl ? cur.match(/^(\s*)\d+\.\s+(.*)$/) : null;
          const match = curUl || curOl;
          if (!match) break;

          const indent = match[1].length;
          const isSameKind = (tag === "ul" && !!curUl) || (tag === "ol" && !!curOl);
          if (indent < baseIndent || (indent === baseIndent && !isSameKind)) break;

          if (indent > baseIndent && items.length > 0) {
            // Collect nested sublist items
            const subLines = [];
            while (i < lines.length) {
              const subCur = lines[i];
              const subMatch = subCur.match(/^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/);
              if (!subMatch || subMatch[1].length <= baseIndent) break;
              subLines.push(subCur.slice(Math.min(indent, subMatch[1].length)));
              i++;
            }
            const subRendered = renderMarkdown(subLines.join("\n"), options);
            items[items.length - 1].subHtml += subRendered.html;
            continue;
          }

          const itemParts = [match[2]];
          i++;
          while (
            i < lines.length &&
            lines[i].trim() &&
            !/^(\s*)(?:[-*+]|\d+\.)\s+/.test(lines[i]) &&
            !isBlockStart(i)
          ) {
            itemParts.push(lines[i].trim());
            i++;
          }
          items.push({ text: itemParts.join(" "), subHtml: "" });
        }

        const lis = items
          .map((item) => `<li>${renderInline(item.text, options)}${item.subHtml}</li>`)
          .join("");
        out.push(`<${tag} class="md-list">${lis}</${tag}>`);
        continue;
      }

      // Paragraphs
      const paraLines = [];
      while (i < lines.length && lines[i].trim() && !isBlockStart(i)) {
        paraLines.push(lines[i].trim());
        i++;
      }
      out.push(`<p>${renderInline(paraLines.join(" "), options)}</p>`);
    }

    return {
      html: out.join("\n"),
      toc,
    };
  }

  function mountMarkdownViewer(container, options = {}) {
    if (!container) return null;

    const rootPrefix = options.rootPrefix ?? "./";
    const docs = options.docs || PROJECT_DOCS;
    const allowedDocs = new Set(docs.map((d) => d.path));
    const fallbackDoc = docs[0]?.path || "README.md";
    const sanitizeDoc = (docPath) => {
      const normalized = normalizeDocPath(docPath, "README.md");
      return normalized && allowedDocs.has(normalized) ? normalized : fallbackDoc;
    };

    let currentDoc = sanitizeDoc(options.initialDoc || fallbackDoc);
    let currentMarkdown = "";
    const docCache = new Map();

    const resolveUrl = (docPath) => `${rootPrefix.replace(/\/?$/, "/")}${docPath.replace(/^\/+/, "")}`;

    container.innerHTML = `
      <div class="md-viewer">
        <div class="md-toolbar">
          <div class="md-doc-pills" role="tablist" aria-label="User guides and NASA credits">
            ${docs
              .map(
                (d) => `<button type="button" class="md-doc-pill" data-doc="${escapeHtml(d.path)}" aria-selected="false">
                  <span class="md-doc-name">${escapeHtml(d.label)}</span>
                  <span class="md-doc-sub">${escapeHtml(d.subtitle || "")}</span>
                </button>`
              )
              .join("")}
          </div>
        </div>
        <div class="md-status" data-el="status" hidden></div>
        <div class="md-layout">
          <aside class="md-toc" aria-label="On this page">
            <div class="kicker">ON THIS PAGE</div>
            <nav data-el="toc"></nav>
          </aside>
          <article class="md-body" data-el="body"></article>
        </div>
      </div>
    `;

    const bodyEl = container.querySelector('[data-el="body"]');
    const tocEl = container.querySelector('[data-el="toc"]');
    const statusEl = container.querySelector('[data-el="status"]');

    const syncButtons = () => {
      for (const btn of container.querySelectorAll(".md-doc-pill")) {
        const active = btn.dataset.doc === currentDoc;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
      }
    };

    const paint = () => {
      syncButtons();
      const rendered = renderMarkdown(currentMarkdown, { currentDoc });
      bodyEl.innerHTML = rendered.html || `<p class="meta">Empty guide.</p>`;
      if (rendered.toc.length) {
        tocEl.innerHTML = rendered.toc
          .map(
            (item) =>
              `<a href="#${escapeHtml(item.id)}" class="md-toc-link md-toc-l${item.level}" data-toc-id="${escapeHtml(item.id)}">${escapeHtml(item.text)}</a>`
          )
          .join("");
      } else {
        tocEl.innerHTML = `<p class="md-toc-empty">No section headings.</p>`;
      }
    };

    const loadDoc = async (docPath) => {
      const normalized = sanitizeDoc(docPath);
      currentDoc = normalized;
      syncButtons();
      if (typeof options.onDocChange === "function") {
        options.onDocChange(normalized);
      }

      if (docCache.has(normalized)) {
        const cached = docCache.get(normalized);
        currentMarkdown = cached.text;
        statusEl.hidden = !cached.notice;
        statusEl.textContent = cached.notice || "";
        paint();
        return;
      }

      statusEl.hidden = false;
      statusEl.textContent = `Loading guide…`;
      try {
        const res = await fetch(resolveUrl(normalized), { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        docCache.set(normalized, { text, notice: "" });
        currentMarkdown = text;
        statusEl.hidden = true;
        statusEl.textContent = "";
      } catch (err) {
        if (normalized === "README.md") {
          const notice = `Showing built-in offline User Guide (${err.message || "fetch unavailable"}).`;
          docCache.set(normalized, { text: README_FALLBACK, notice });
          currentMarkdown = README_FALLBACK;
          statusEl.hidden = false;
          statusEl.textContent = notice;
        } else {
          currentMarkdown = `# Could not load guide\n\nPlease launch the app server to view linked NASA attribution notes.`;
          statusEl.hidden = false;
          statusEl.textContent = `Could not fetch ${normalized}: ${err.message || err}`;
        }
      }
      paint();
    };

    container.addEventListener("click", (e) => {
      const docBtn = e.target.closest(".md-doc-pill");
      if (docBtn) {
        loadDoc(docBtn.dataset.doc);
        return;
      }
      const copyBtn = e.target.closest(".md-copy-btn");
      if (copyBtn) {
        const code = copyBtn.closest(".md-code-block")?.querySelector("pre code")?.textContent || "";
        navigator.clipboard?.writeText(code).catch(() => {});
        copyBtn.textContent = "Copied!";
        setTimeout(() => {
          if (copyBtn.isConnected) copyBtn.textContent = "Copy";
        }, 1200);
        return;
      }
      const docLink = e.target.closest("a[data-md-doc]");
      if (docLink) {
        e.preventDefault();
        loadDoc(docLink.dataset.mdDoc);
        return;
      }
      const tocLink = e.target.closest("a[data-toc-id]");
      if (tocLink) {
        e.preventDefault();
        const id = tocLink.dataset.tocId;
        const target = Array.from(bodyEl.querySelectorAll("[id]")).find((el) => el.id === id);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    loadDoc(currentDoc);

    return {
      loadDoc,
      getCurrentDoc: () => currentDoc,
    };
  }

  return {
    PROJECT_DOCS,
    README_FALLBACK,
    renderMarkdown,
    renderInline,
    normalizeDocPath,
    mountMarkdownViewer,
  };
});
