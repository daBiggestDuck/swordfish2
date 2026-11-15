// Story client: the one thing other branches need to use the story.
//
// Used by the standalone story page (story.js) and meant for the engine/ui game loop. The engine
// branch is a Java server (EngineServer, port 8082 on v0) whose /api/engine/tick returns
// { events, state }; pass those straight in:
//
//   import { createStoryClient } from './story-client.js';
//   const story = createStoryClient({ base: 'http://localhost:8081' });   // story server (v0)
//   story.setContext(state.site.id, petId);             // when the player picks a site and pet
//   // after every engine tick or action:
//   for (const m of await story.due(state.dayProgress)) showPopup(m);
//   for (const e of events) if (story.handleEngineEvent(e).ended) showPassport();
//   const passport = await story.passport(state.dayProgress, petName, { earthDays: state.earthDays });
//
// Pop-up objects look like { id, mission, title, text, dayStart, sourceUrl }.

// Engine milestone ids (src/engine/Rules.java MILESTONES) -> Passport lines.
const MILESTONES = {
  'im-2': 'Outlasted IM-2 (Athena): more than 1 day on the Moon',
  'im-1': 'Outlasted IM-1 (Odysseus): more than 7 days on the Moon',
  sunset: 'Survived the whole lunar day',
  'blue-ghost-1': 'Beat Blue Ghost Mission 1: still working 5 hours into the night',
};

export function createStoryClient({ base = '' } = {}) {
  const seen = new Set();
  const extraScience = [];
  let tally = { deepest: null, pings: 0, sends: 0 };
  let ctx = { site: '', pet: '' };

  async function api(path) {
    const res = await fetch(base + path);
    if (!res.ok) throw new Error(`${path} failed (${res.status})`);
    return res.json();
  }

  const enc = encodeURIComponent;

  return {
    api,

    /** Choose the landing site and pet. Starts a fresh story (nothing counts as seen). */
    setContext(site, pet) {
      ctx = { site, pet };
      this.reset();
    },

    reset() {
      seen.clear();
      extraScience.length = 0;
      tally = { deepest: null, pings: 0, sends: 0 };
    },

    /** Pop-ups that became due at this point in the lunar day. Each is returned only once. */
    async due(dayProgress) {
      const p = Math.max(0, Math.min(1, dayProgress));
      const list = await api(`/api/moments?site=${enc(ctx.site)}&pet=${enc(ctx.pet)}&progress=${p}`);
      const fresh = list.filter((m) => !seen.has(m.id));
      fresh.forEach((m) => seen.add(m.id));
      return fresh;
    },

    /**
     * React to an event from the engine branch. Engine events look like { type, detail, hour }
     * (see src/engine/Event.java). Returns { ended } so the caller knows when to show the Passport.
     *  - fainted / won: the story ends (won = survived the whole game)
     *  - milestone: beating a real mission's record becomes a Passport science line
     *  - drilled / ping / dataSent: counted into one science line each
     * Older event names (petFainted, missionComplete) still work.
     */
    handleEngineEvent(event) {
      if (!event || !event.type) return { ended: false };
      const t = event.type;
      if (t === 'milestone' && event.detail) {
        const line = MILESTONES[event.detail] || `Reached the ${event.detail} milestone`;
        if (!extraScience.includes(line)) extraScience.push(line);
      } else if (t === 'drilled') {
        tally.deepest = event.detail || tally.deepest;
      } else if (t === 'ping') {
        tally.pings += 1;
      } else if (t === 'dataSent') {
        tally.sends += 1;
      } else if (t === 'missionComplete' && event.missionId) {
        extraScience.push(`Finished the ${String(event.missionId).replace(/-/g, ' ')} mission`);
      }
      return { ended: t === 'fainted' || t === 'won' || t === 'petFainted' };
    },

    /**
     * The Pet Passport for how far the pet got. Pass { earthDays } from the engine's state so the
     * days survived include the night (the engine's lunar day is 346 hours).
     */
    passport(dayProgress, petName = '', { earthDays } = {}) {
      const p = Math.max(0, Math.min(1, dayProgress));
      const q = new URLSearchParams({ site: ctx.site, pet: ctx.pet, name: petName, progress: String(p) });
      if (Number.isFinite(earthDays)) q.set('days', String(earthDays));
      const science = [...extraScience];
      if (tally.deepest) science.push(`Drilled down to ${tally.deepest}`);
      if (tally.pings) science.push(`Caught ${tally.pings} laser ping${tally.pings === 1 ? '' : 's'} from Earth's orbiter`);
      if (tally.sends) science.push(`Sent data home to Earth ${tally.sends} time${tally.sends === 1 ? '' : 's'}`);
      if (science.length) q.set('science', science.slice(0, 4).join('|'));
      return api(`/api/passport?${q}`);
    },

    missions: () => api('/api/missions'),
    pets: () => api('/api/pets'),
    sites: () => api('/api/sites'),

    /** Sun and Earth heights for a site over a month starting on date (YYYY-MM-DD). */
    sky(site, date) {
      return api(`/api/sky?site=${enc(site)}&date=${enc(date)}`);
    },
  };
}
