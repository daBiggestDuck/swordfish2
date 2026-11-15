// Story client: the one thing other branches need to use the story.
//
// Used by the standalone story page (story.js) and meant for the ui branch to call from the
// engine's game loop:
//
//   import { createStoryClient } from '/story-assets/story-client.js';   // wherever it is served
//   const story = createStoryClient({ base: 'http://localhost:8081' });
//   story.setContext(site.id, pet.id);                    // when the player picks a site and pet
//   // every tick, with how far through the lunar day we are (0 = sunrise, 1 = end of day):
//   for (const m of await story.due(dayProgress)) showPopup(m);
//   // pass the engine's events straight through:
//   const { ended } = story.handleEngineEvent(event);     // petFainted => ended: true
//   const passport = await story.passport(dayProgress, petName);
//
// Pop-up objects look like { id, mission, title, text, dayStart, sourceUrl }.

export function createStoryClient({ base = '' } = {}) {
  const seen = new Set();
  const extraScience = [];
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
     * React to an event from the engine branch (src/engine). Returns { ended } so the caller
     * knows whether to show the Passport now.
     *  - missionComplete: remembered as science the pet "sent home"
     *  - petFainted: the story ends early
     */
    handleEngineEvent(event) {
      if (event && event.type === 'missionComplete' && event.missionId) {
        extraScience.push(`Finished the ${String(event.missionId).replace(/-/g, ' ')} mission`);
      }
      return { ended: !!(event && event.type === 'petFainted') };
    },

    /** The Pet Passport for how far the pet got. */
    passport(dayProgress, petName = '') {
      const p = Math.max(0, Math.min(1, dayProgress));
      const q = new URLSearchParams({ site: ctx.site, pet: ctx.pet, name: petName, progress: String(p) });
      if (extraScience.length) q.set('science', extraScience.join('|'));
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
