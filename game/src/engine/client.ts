// Engine client for Rover Run.
//
// Prefers the real Java engine (src/engine, ./run-engine.sh → :8082). Falls back to the in-browser
// port (./game.ts, parity-tested against Java) when Java is not running, is an older build without
// Rover Run, or drops mid-game — in which case the run carries on from the last Java state.

import { Game, petJson, siteJson } from "./game.ts";
import { FACTS, MILESTONES, PETS, Rules, SITES, SOURCES, distanceKm, petById, siteById } from "./data.ts";
import type {
  ActionResult,
  Catalog,
  EngineEvent,
  EngineState,
  RouteJson,
  RulesJson,
} from "./types.ts";

export class EngineDown extends Error {}
export class GameLost extends Error {}

export type EngineKind = "java" | "local";

export interface NewGameOptions {
  site: string;
  pet: string;
  name: string;
  tipped?: boolean;
}

export interface EngineBackend {
  readonly kind: EngineKind;
  readonly label: string;
  catalog(): Promise<Catalog>;
  create(opts: NewGameOptions): Promise<{ id: string; state: EngineState }>;
  tick(id: string, hours: number): Promise<{ events: EngineEvent[]; state: EngineState }>;
  act(id: string, action: string): Promise<{ result: ActionResult; state: EngineState }>;
  drive(id: string, to: string): Promise<{ result: ActionResult; state: EngineState }>;
}

const REQUEST_TIMEOUT_MS = 5000;
const PROBE_TIMEOUT_MS = 1500;

// ------------------------------------------------------------------ Java (HTTP)

class JavaBackend implements EngineBackend {
  readonly kind = "java" as const;
  readonly label: string;
  private readonly base: string;

  /** @param base "" = same origin (page served by the engine itself), else e.g. http://localhost:8082 */
  constructor(base: string) {
    this.base = base.replace(/\/$/, "");
    let host = location.host;
    try {
      if (base) host = new URL(base).host;
    } catch {
      /* keep page host */
    }
    this.label = `Java engine · ${host}`;
  }

  private async get<T>(path: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(this.base + path, { signal: ctrl.signal, cache: "no-store" });
    } catch (e) {
      throw new EngineDown((e as Error).name === "AbortError" ? "The engine took too long to answer." : "Cannot reach the engine server.");
    } finally {
      clearTimeout(timer);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new EngineDown(`Engine answered ${res.status} without JSON.`);
    }
    const err = (body as { error?: string } | null)?.error;
    if (res.status === 404 && /No game/i.test(err ?? "")) throw new GameLost(err);
    if (!res.ok) throw new Error(err || `${path} failed (${res.status})`);
    return body as T;
  }

  async catalog(): Promise<Catalog> {
    const [sites, pets, facts, routes] = await Promise.all([
      this.get<Catalog["sites"]>("/api/engine/sites"),
      this.get<Catalog["pets"]>("/api/engine/pets"),
      this.get<{ facts: Catalog["facts"]; sources: Catalog["sources"]; milestones: Catalog["milestones"]; rules: RulesJson }>("/api/engine/facts"),
      this.get<RouteJson[]>("/api/engine/routes"),
    ]);
    return { sites, pets, facts: facts.facts, sources: facts.sources, milestones: facts.milestones, rules: facts.rules, routes };
  }

  create(o: NewGameOptions) {
    const q = new URLSearchParams({ site: o.site, pet: o.pet, name: o.name, tipped: String(Boolean(o.tipped)) });
    return this.get<{ id: string; state: EngineState }>(`/api/engine/new?${q}`);
  }

  tick(id: string, hours: number) {
    return this.get<{ events: EngineEvent[]; state: EngineState }>(`/api/engine/tick?id=${encodeURIComponent(id)}&hours=${hours}`);
  }

  act(id: string, action: string) {
    return this.get<{ result: ActionResult; state: EngineState }>(`/api/engine/act?id=${encodeURIComponent(id)}&action=${encodeURIComponent(action)}`);
  }

  drive(id: string, to: string) {
    return this.get<{ result: ActionResult; state: EngineState }>(`/api/engine/drive?id=${encodeURIComponent(id)}&to=${encodeURIComponent(to)}`);
  }

  /** Reachable AND new enough for Rover Run (sites carry coordinates, /routes exists). */
  async supportsRoverRun(): Promise<boolean> {
    try {
      await this.get("/api/engine/health", PROBE_TIMEOUT_MS);
      const [sites, routes] = await Promise.all([
        this.get<Array<{ lat?: number }>>("/api/engine/sites", PROBE_TIMEOUT_MS),
        this.get<unknown[]>("/api/engine/routes", PROBE_TIMEOUT_MS),
      ]);
      return Array.isArray(routes) && routes.length > 0 && Array.isArray(sites) && sites.every((s) => typeof s.lat === "number");
    } catch {
      return false;
    }
  }
}

// ------------------------------------------------------------------ in-browser port

export class LocalBackend implements EngineBackend {
  readonly kind = "local" as const;
  readonly label: string;
  private readonly games = new Map<string, Game>();
  private seq = 0;

  constructor(label = "In-browser engine") {
    this.label = label;
  }

  async catalog(): Promise<Catalog> {
    return localCatalog();
  }

  async create(o: NewGameOptions) {
    const pet = petById(o.pet) ?? PETS[0];
    const site = siteById(o.site) ?? SITES[0];
    const name = (o.name ?? "").slice(0, 24);
    const g = new Game(pet, site, name, Boolean(o.tipped));
    const id = `local-${++this.seq}`;
    this.games.set(id, g);
    return { id, state: g.toJson() };
  }

  /** Continue a game from a state the Java engine sent (failover). */
  adopt(state: EngineState): string {
    const pet = petById(state.pet.id) ?? PETS[0];
    const site = siteById(state.site.id) ?? SITES[0];
    const id = `local-${++this.seq}`;
    this.games.set(id, Game.fromState(state, pet, site));
    return id;
  }

  private game(id: string): Game {
    const g = this.games.get(id);
    if (!g) throw new GameLost("No game with that id. Start a new one.");
    return g;
  }

  async tick(id: string, hours: number) {
    const g = this.game(id);
    const safe = Number.isFinite(hours) ? Math.max(0, Math.min(48, hours)) : 1;
    const events = g.tick(safe);
    return { events, state: g.toJson() };
  }

  async act(id: string, action: string) {
    const g = this.game(id);
    return { result: g.act(action), state: g.toJson() };
  }

  async drive(id: string, to: string) {
    const g = this.game(id);
    return { result: g.drive(to), state: g.toJson() };
  }
}

export function localCatalog(): Catalog {
  const routes: RouteJson[] = [];
  for (const a of SITES) {
    for (const b of SITES) {
      if (a === b) continue;
      const km = distanceKm(a, b);
      routes.push({ from: a.id, to: b.id, distanceKm: Number(km.toFixed(2)), hours: Number((km / Rules.ROVER_KMH).toFixed(2)) });
    }
  }
  return {
    sites: SITES.map(siteJson),
    pets: PETS.map(petJson),
    facts: FACTS,
    sources: SOURCES,
    milestones: MILESTONES,
    rules: {
      dayHours: Rules.DAY_HOURS,
      nightHours: Rules.NIGHT_HOURS,
      gameHours: Rules.GAME_HOURS,
      roverKmh: Number(Rules.ROVER_KMH.toFixed(4)),
      moonRadiusKm: Rules.MOON_RADIUS_KM,
      driveDustPerHour: Rules.DRIVE_DUST_PER_HOUR,
      dustyAt: Rules.DUSTY,
      powerLow: Rules.POWER_LOW,
      powerCritical: Rules.POWER_CRITICAL,
    },
    routes,
  };
}

/**
 * What would happen if the rover just drove there with no button presses?
 * Runs the engine rules (in-browser port, identical to Java) on a copy of the current state.
 */
export function forecastDrive(state: EngineState, to: string) {
  const pet = petById(state.pet.id);
  const site = siteById(state.site.id);
  if (!pet || !site) return null;
  const g = Game.fromState(state, pet, site);
  const r = g.drive(to);
  if (!r.ok) return null;
  let s = g.toJson();
  const sunsetBefore = s.isDay;
  for (let guard = 0; guard < 2000 && s.alive && !s.won && s.trip; guard++) {
    g.tick(2);
    s = g.toJson();
  }
  return {
    arrives: s.alive && !s.won && !s.trip,
    arriveHour: s.hour,
    health: s.health,
    power: s.power,
    petTempK: s.petTempK,
    dust: s.dust,
    fainted: !s.alive,
    nightfallOnRoad: sunsetBefore && !s.isDay,
    mood: s.mood,
  };
}

// ------------------------------------------------------------------ connect

export interface ConnectResult {
  backend: EngineBackend;
  note: string | null;
}

function candidates(): string[] {
  const out: string[] = [];
  const param = new URLSearchParams(location.search).get("engine");
  if (param && /^https?:\/\//.test(param)) return [param];
  if (location.protocol.startsWith("http")) out.push(""); // same origin (served by the Java engine itself)
  // ./run-engine.sh default port, then run-v0.sh's backup port (used when 8082 is held by a stale server)
  out.push("http://localhost:8082", "http://127.0.0.1:8082", "http://localhost:8083", "http://127.0.0.1:8083");
  return out;
}

export async function connectEngine(): Promise<ConnectResult> {
  const force = new URLSearchParams(location.search).get("engine");
  if (force === "local") return { backend: new LocalBackend("In-browser engine (forced)"), note: null };

  let sawOldJava = false;
  for (const base of candidates()) {
    const java = new JavaBackend(base);
    if (await java.supportsRoverRun()) return { backend: java, note: null };
    // Distinguish "nothing there" from "an engine without Rover Run" for an honest status line.
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
      const res = await fetch(`${base}/api/engine/health`, { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(t);
      if (res.ok || res.status === 404) {
        const facts = await fetch(`${base}/api/engine/facts`, { cache: "no-store" }).catch(() => null);
        if (facts?.ok) sawOldJava = true;
      }
    } catch {
      /* nothing listening */
    }
  }
  return {
    backend: new LocalBackend("In-browser engine"),
    note: sawOldJava
      ? "The Java engine that is running is an older build without Rover Run. Restart it with ./run-engine.sh. Using the in-browser copy of the same rules meanwhile."
      : "Java engine not running (./run-engine.sh). Using the in-browser copy of the same rules.",
  };
}

// ------------------------------------------------------------------ session (one run)

type Listener = (msg: string) => void;

/**
 * One Rover Run. Serialises requests (one in flight), keeps the latest state, and fails over from
 * Java to the in-browser engine without losing the run.
 */
export class EngineSession {
  backend: EngineBackend;
  id: string | null = null;
  state: EngineState | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private onFailover: Listener | null = null;

  constructor(backend: EngineBackend) {
    this.backend = backend;
  }

  setFailoverListener(fn: Listener) {
    this.onFailover = fn;
  }

  private queue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  async start(opts: NewGameOptions) {
    return this.queue(async () => {
      try {
        const r = await this.backend.create(opts);
        this.id = r.id;
        this.state = r.state;
        return r.state;
      } catch (e) {
        if (this.backend.kind === "java") {
          this.switchToLocal("The Java engine stopped answering, so this run uses the in-browser engine.");
          const r = await this.backend.create(opts);
          this.id = r.id;
          this.state = r.state;
          return r.state;
        }
        throw e;
      }
    });
  }

  tick(hours: number) {
    return this.call((b, id) => b.tick(id, hours));
  }

  act(action: string) {
    return this.call((b, id) => b.act(id, action));
  }

  drive(to: string) {
    return this.call((b, id) => b.drive(id, to));
  }

  private switchToLocal(msg: string) {
    const local = new LocalBackend("In-browser engine (took over)");
    if (this.state) this.id = local.adopt(this.state);
    this.backend = local;
    this.onFailover?.(msg);
  }

  private call<T extends { state: EngineState }>(fn: (b: EngineBackend, id: string) => Promise<T>): Promise<T> {
    return this.queue(async () => {
      if (!this.id) throw new Error("No game started");
      try {
        const r = await fn(this.backend, this.id);
        this.state = r.state;
        return r;
      } catch (e) {
        if (this.backend.kind === "java" && this.state && (e instanceof EngineDown || e instanceof GameLost)) {
          this.switchToLocal(
            e instanceof GameLost
              ? "The Java engine restarted. Your run continues on the in-browser engine from the last state."
              : "The Java engine stopped answering. Your run continues on the in-browser engine from the last state.",
          );
          const r = await fn(this.backend, this.id!);
          this.state = r.state;
          return r;
        }
        throw e;
      }
    });
  }
}
