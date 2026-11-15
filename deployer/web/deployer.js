// Shared helpers for the deployer pages. Talks only to this local deployer.
const $ = (s) => document.querySelector(s);

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `${path} failed (${res.status})`);
  return body;
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) e.append(c);
  return e;
}

function timeAgo(ms) {
  if (!ms) return 'never';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} days ago`;
}

const STATUS_TEXT = {
  RUNNING: 'Running', PARTLY_RUNNING: 'Partly running', BUILDING: 'Building…', QUEUED: 'Waiting',
  NO_SITE: 'Code only', FAILED: 'Failed',
};

function pill(status) {
  return el('span', { class: `pill ${status}`, text: STATUS_TEXT[status] || status });
}

function branchUrl(name) { return `/branch?b=${encodeURIComponent(name)}`; }
function codeUrl(branch, path) { return `/code?b=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}`; }

function commitBox(c) {
  if (!c) return el('div', { class: 'commit muted', text: 'No commits yet' });
  return el('div', { class: 'commit' },
    el('b', { text: c.subject }),
    el('div', { class: 'small muted' }, `${c.author} · ${timeAgo(c.time * 1000)} · `, el('span', { class: 'sha mono', text: c.shortSha })));
}

function fetchBanner(status) {
  const f = status.fetch;
  if (f.offline) return el('div', { class: 'banner', text: 'Offline mode: showing branches already downloaded. Restart without --offline to follow GitHub.' });
  if (!f.ok) {
    return el('div', { class: 'banner bad' },
      el('b', { text: 'Can’t reach GitHub. ' }),
      'Showing the last downloaded code. Sign in once with VS Code’s Sync, or run git fetch in a terminal.',
      el('pre', { text: f.error || '' }));
  }
  return el('div', { class: 'banner' },
    `Checks GitHub every ${status.intervalSeconds}s · last check ${timeAgo(f.at)} · ${status.activity}`);
}
