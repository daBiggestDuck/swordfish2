// In-browser port of src/engine/Game.java (same rules, same order of operations, same JSON).
// Used only when the Java engine is unreachable, or to carry on seamlessly if it drops mid-run.
// Keep in lock-step with Game.java; tests/parity.mjs compares both step by step.

import {
  ACTIONS,
  MILESTONES,
  Rules,
  distanceKm,
  siteById,
  type ActionRule,
  type Pet,
  type Site,
} from "./data.ts";
import type {
  ActionJson,
  ActionResult,
  EngineEvent,
  EngineState,
  Mood,
  PetJson,
  SiteJson,
  TripJson,
} from "./types.ts";

/**
 * Java's String.format("%.Nf") rounds HALF_UP on the shortest decimal form of the double
 * (6.085 → "6.09"), while JS toFixed rounds the exact binary value (6.0849999… → "6.08").
 * Reproduce Java so every number and message matches the Java engine to the digit.
 */
export function javaFixed(x: number, digits: number): string {
  if (!Number.isFinite(x)) return String(x);
  const neg = x < 0;
  const s = Math.abs(x).toString();
  if (s.includes("e")) return (neg ? "-" : "") + Math.abs(x).toFixed(digits);
  const [int, frac = ""] = s.split(".");
  if (frac.length <= digits) return (neg ? "-" : "") + int + (digits ? "." + frac.padEnd(digits, "0") : "");
  let n = BigInt(int + frac.slice(0, digits));
  if (frac.charCodeAt(digits) >= 53 /* '5' */) n += 1n;
  const raw = n.toString().padStart(digits + 1, "0");
  const out = digits ? `${raw.slice(0, raw.length - digits)}.${raw.slice(raw.length - digits)}` : raw;
  return (neg ? "-" : "") + out;
}

const n2 = (v: number) => Number(javaFixed(v, 2));
const n4 = (v: number) => Number(javaFixed(v, 4));
const f2 = (v: number) => javaFixed(v, 2);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const ev = (type: string, detail: string | null, hour: number): EngineEvent => ({ type, detail, hour: n2(hour) });

export function siteJson(s: Site): SiteJson {
  return {
    id: s.id, name: s.name, region: s.region, lat: n4(s.lat), lon: n4(s.lon),
    dayMaxK: n2(s.dayMaxK), nightMinK: n2(s.nightMinK), sunlight: n2(s.sunlight),
    note: s.note, coordSourceId: s.coordSourceId, sourceIds: [...s.sourceIds],
  };
}

export function petJson(p: Pet): PetJson {
  return {
    id: p.id, name: p.name, fullName: p.fullName, flewOn: p.flewOn, passive: p.passive,
    minSafeK: n2(p.minSafeK), maxSafeK: n2(p.maxSafeK), drawPerHour: n2(p.drawPerHour),
    workLabel: p.workLabel, sourceId: p.sourceId,
  };
}

class Trip {
  readonly from: Site;
  readonly to: Site;
  readonly distanceKm: number;
  readonly totalHours: number;
  doneHours = 0;

  constructor(from: Site, to: Site) {
    this.from = from;
    this.to = to;
    this.distanceKm = distanceKm(from, to);
    this.totalHours = this.distanceKm / Rules.ROVER_KMH;
  }

  hoursLeft() {
    return Math.max(0, this.totalHours - this.doneHours);
  }

  progress() {
    return this.totalHours <= 0 ? 1 : Math.min(1, this.doneHours / this.totalHours);
  }

  toJson(): TripJson {
    return {
      from: this.from.id, to: this.to.id, distanceKm: n2(this.distanceKm), totalHours: n2(this.totalHours),
      doneHours: n2(this.doneHours), hoursLeft: n2(this.hoursLeft()), progress: n4(this.progress()),
    };
  }
}

export class Game {
  readonly pet: Pet;
  readonly petName: string;
  readonly tipped: boolean;

  private site: Site;
  private trip: Trip | null = null;
  private kmDriven = 0;
  private legs = 0;

  private hour = 0;
  private health = 100;
  private power: number = Rules.BATTERY_MAX;
  private dust: number = Rules.LANDING_DUST;
  private petTempK: number = Rules.START_TEMP_K;
  private dataBuffer = 0;
  private dataSent = 0;
  private drillStops = 0;
  private pings = 0;
  private heaterOn = false;
  private shadeOn = false;
  private alive = true;
  private won = false;
  private readonly cooldowns = new Map<string, number>();
  private readonly milestones = new Set<string>();

  constructor(pet: Pet, site: Site, petName: string | null = null, tipped = false) {
    this.pet = pet;
    this.site = site;
    this.petName = petName == null || petName.trim() === "" ? "Pip" : petName.trim();
    this.tipped = tipped;
  }

  // ---------------------------------------------------------------- environment

  private env(atSite: number, atDestination: number) {
    if (this.trip == null) return atSite;
    return atSite + (atDestination - atSite) * this.trip.progress();
  }

  sunlightHere() {
    return this.trip == null ? this.site.sunlight : this.env(this.trip.from.sunlight, this.trip.to.sunlight);
  }

  dayMaxKHere() {
    return this.trip == null ? this.site.dayMaxK : this.env(this.trip.from.dayMaxK, this.trip.to.dayMaxK);
  }

  nightMinKHere() {
    return this.trip == null ? this.site.nightMinK : this.env(this.trip.from.nightMinK, this.trip.to.nightMinK);
  }

  surfaceTempK(atHour: number) {
    if (atHour >= Rules.DAY_HOURS) return this.nightMinKHere();
    const sun = Game.sunElevation(atHour);
    return this.nightMinKHere() + (this.dayMaxKHere() - this.nightMinKHere()) * Math.pow(sun, Rules.TEMP_CURVE);
  }

  static sunElevation(atHour: number) {
    if (atHour < 0 || atHour >= Rules.DAY_HOURS) return 0;
    return Math.sin((Math.PI * atHour) / Rules.DAY_HOURS);
  }

  isDay() {
    return this.hour < Rules.DAY_HOURS;
  }

  dayProgress() {
    return Math.min(1, this.hour / Rules.DAY_HOURS);
  }

  solarPerHour() {
    let charge = Rules.SOLAR_PER_HOUR * this.sunlightHere() * Game.sunElevation(this.hour) * (1 - this.dust / 100);
    if (this.shadeOn) charge *= Rules.SHADE_SOLAR;
    if (this.tipped) charge *= Rules.TIPPED_SOLAR;
    return charge;
  }

  targetTempK() {
    let t = this.surfaceTempK(this.hour);
    if (this.heaterOn) t += Rules.HEATER_BOOST_K;
    if (this.shadeOn && this.isDay()) t -= Rules.SHADE_DROP_K;
    return Math.max(0, t);
  }

  // ---------------------------------------------------------------- status

  tempStatus(): "ok" | "cold" | "hot" {
    if (this.petTempK < this.pet.minSafeK) return "cold";
    if (this.petTempK > this.pet.maxSafeK) return "hot";
    return "ok";
  }

  private hasPower() {
    return this.pet.passive || this.power > 0;
  }

  mood(): Mood {
    if (!this.alive) return "fainted";
    if (this.won) return "proud";
    if (this.tempStatus() === "hot") return "overheating";
    if (this.tempStatus() === "cold") return "freezing";
    if (!this.pet.passive && this.power < Rules.POWER_CRITICAL) return "sleepy";
    if (this.dust >= Rules.DUSTY) return "dusty";
    if (!this.isDay()) return "night";
    return "happy";
  }

  // ---------------------------------------------------------------- rover

  drive(siteId: string): ActionResult {
    if (!this.alive) return fail(`${this.petName} has fainted`);
    if (this.won) return fail("The game is over: you won!");
    if (this.trip != null) return fail(`Already driving to ${this.trip.to.name}`);
    const to = siteById(siteId ?? "");
    if (!to) return fail(`Unknown site: ${siteId}`);
    if (to.id === this.site.id) return fail(`Already at ${to.name}`);
    this.trip = new Trip(this.site, to);
    return { ok: true, error: null, events: [ev("departed", to.id, this.hour)] };
  }

  // ---------------------------------------------------------------- time

  tick(hours: number): EngineEvent[] {
    const events: EngineEvent[] = [];
    if (!this.alive || this.won || !(hours > 0)) return events;
    const moodBefore = this.mood();
    let left = this.trip == null ? hours : Math.min(hours, this.trip.hoursLeft());
    while (left > 1e-9 && this.alive && !this.won) {
      const dt = Math.min(left, Rules.STEP_HOURS);
      this.step(dt, events);
      left -= dt;
    }
    if (this.trip != null && this.alive && !this.won && this.trip.hoursLeft() <= 1e-9) {
      this.site = this.trip.to;
      this.trip = null;
      this.legs++;
      events.push(ev("arrived", this.site.id, this.hour));
    }
    this.addMoodChange(moodBefore, events);
    return events;
  }

  private step(dt: number, events: EngineEvent[]) {
    const wasDay = this.isDay();
    const tempBefore = this.tempStatus();
    const powerBefore = this.power;
    const dustBefore = this.dust;

    if (!this.pet.passive) {
      const drain = this.pet.drawPerHour + (this.heaterOn ? Rules.HEATER_PER_HOUR : 0);
      this.power = clamp(this.power + (this.solarPerHour() - drain) * dt, 0, Rules.BATTERY_MAX);
      if (this.power <= 0 && this.heaterOn) {
        this.heaterOn = false;
        events.push(ev("heaterOff", "out of power", this.hour + dt));
      }
    }

    const dustRate = Rules.DUST_PER_HOUR + (this.trip != null ? Rules.DRIVE_DUST_PER_HOUR : 0);
    this.dust = clamp(this.dust + dustRate * dt, 0, 100);

    this.petTempK += (this.targetTempK() - this.petTempK) * (1 - Math.exp(-Rules.THERMAL_RATE * dt));

    const outside = Math.max(this.pet.minSafeK - this.petTempK, this.petTempK - this.pet.maxSafeK);
    if (outside > 0) {
      this.health -= Math.min(Rules.MAX_DAMAGE_PER_HOUR, outside * Rules.DAMAGE_PER_K) * dt;
    } else if (this.hasPower()) {
      this.health += Rules.REGEN_PER_HOUR * dt;
    }
    this.health = clamp(this.health, 0, 100);

    for (const [k, v] of this.cooldowns) this.cooldowns.set(k, v - dt);
    for (const [k, v] of [...this.cooldowns]) if (v <= 1e-9) this.cooldowns.delete(k);

    if (this.trip != null) {
      this.trip.doneHours = Math.min(this.trip.totalHours, this.trip.doneHours + dt);
      this.kmDriven += Rules.ROVER_KMH * dt;
    }

    this.hour += dt;

    if (!this.pet.passive) this.powerEvents(powerBefore, this.power, events);
    const tempAfter = this.tempStatus();
    if (tempAfter !== tempBefore) {
      const type = tempAfter === "cold" ? "tooCold" : tempAfter === "hot" ? "tooHot" : "comfortable";
      events.push(ev(type, `${f2(this.petTempK)} K`, this.hour));
    }
    if (dustBefore < Rules.DUSTY && this.dust >= Rules.DUSTY) events.push(ev("dusty", null, this.hour));
    if (wasDay && !this.isDay()) events.push(ev("sunset", null, this.hour));
    for (const m of MILESTONES) {
      if (this.hour >= m.hours && !this.milestones.has(m.id)) {
        this.milestones.add(m.id);
        events.push(ev("milestone", m.id, this.hour));
      }
    }

    if (this.health <= 0) {
      this.alive = false;
      this.heaterOn = false;
      events.push(ev("fainted", null, this.hour));
    } else if (this.hour >= Rules.GAME_HOURS) {
      this.won = true;
      events.push(ev("won", null, this.hour));
    }
  }

  private powerEvents(before: number, after: number, events: EngineEvent[]) {
    const a = powerLevel(before);
    const b = powerLevel(after);
    if (a === b) return;
    if (b === "critical") events.push(ev("powerCritical", null, this.hour));
    else if (b === "low" && a === "ok") events.push(ev("powerLow", null, this.hour));
    else if (b === "ok") events.push(ev("powerRecovered", null, this.hour));
  }

  // ---------------------------------------------------------------- actions

  actionIds(): string[] {
    return this.pet.passive ? ["work", "clean"] : ["work", "send", "clean", "heater", "shade"];
  }

  rule(actionId: string): ActionRule | null {
    switch (actionId) {
      case "heater": return ACTIONS.HEATER;
      case "shade": return ACTIONS.SHADE;
      case "clean": return ACTIONS.CLEAN;
      case "send": return ACTIONS.SEND;
      case "work":
        switch (this.pet.id) {
          case "LISTER": return ACTIONS.DRILL;
          case "LRA": return ACTIONS.PING;
          case "LN-1": return ACTIONS.PING;
          default: return ACTIONS.DUST_TEST;
        }
      default: return null;
    }
  }

  private powerCost(actionId: string) {
    return this.pet.passive ? 0 : (this.rule(actionId)?.powerCost ?? 0);
  }

  private cooldownFor(actionId: string) {
    if (this.pet.passive && actionId === "clean") return Rules.PASSIVE_CLEAN_COOLDOWN;
    return this.rule(actionId)?.cooldownHours ?? 0;
  }

  whyNot(actionId: string): string | null {
    if (!this.alive) return `${this.petName} has fainted`;
    if (this.won) return "The game is over: you won!";
    if (!this.actionIds().includes(actionId)) return `Unknown action for ${this.pet.name}: ${actionId}`;
    if (actionId === "work" && this.trip != null) return "Science needs the rover parked. Wait until you arrive.";
    const cd = this.cooldowns.get(actionId);
    if (cd !== undefined) return `Ready in ${f2(cd)} h`;
    const turningOff = (actionId === "heater" && this.heaterOn) || (actionId === "shade" && this.shadeOn);
    if (!turningOff && !this.hasPower()) return "No power. Wait for sunlight to recharge.";
    if (this.power < this.powerCost(actionId)) return `Needs ${f2(this.powerCost(actionId))} power`;
    if (actionId === "work" && this.pet.id === "LISTER" && this.drillStops >= Rules.LISTER_DEPTH_STOPS)
      return `Already drilled to ${Rules.LISTER_MAX_DEPTH_M.toFixed(1)} m`;
    if (actionId === "work" && !this.pet.passive && this.dataBuffer >= Rules.DATA_BUFFER_MAX)
      return "Data storage full. Send data to Earth first.";
    if (actionId === "send" && this.dataBuffer <= 0) return "No data to send yet";
    return null;
  }

  act(actionId: string): ActionResult {
    const error = this.whyNot(actionId);
    if (error != null) return fail(error);

    const moodBefore = this.mood();
    const events: EngineEvent[] = [];
    const powerBefore = this.power;
    this.power -= this.powerCost(actionId);

    switch (actionId) {
      case "heater":
        this.heaterOn = !this.heaterOn;
        events.push(ev(this.heaterOn ? "heaterOn" : "heaterOff", null, this.hour));
        break;
      case "shade":
        this.shadeOn = !this.shadeOn;
        events.push(ev(this.shadeOn ? "shadeOn" : "shadeOff", null, this.hour));
        break;
      case "clean":
        this.dust = Math.max(0, this.dust - Rules.CLEAN_AMOUNT);
        events.push(ev("cleaned", f2(this.dust), this.hour));
        break;
      case "send": {
        const amount = this.dataBuffer;
        this.dataSent += amount;
        this.dataBuffer = 0;
        events.push(ev("dataSent", f2(amount), this.hour));
        break;
      }
      case "work":
        this.doWork(events);
        break;
      default:
        throw new Error(actionId);
    }

    const cd = this.cooldownFor(actionId);
    if (cd > 0) this.cooldowns.set(actionId, cd);
    if (!this.pet.passive) this.powerEvents(powerBefore, this.power, events);
    this.addMoodChange(moodBefore, events);
    return { ok: true, error: null, events };
  }

  private doWork(events: EngineEvent[]) {
    switch (this.pet.id) {
      case "LISTER":
        this.drillStops++;
        this.addData(Rules.DRILL_DATA);
        events.push(ev("drilled", `${javaFixed(this.drillDepthM(), 3)} m`, this.hour));
        break;
      case "LRA":
      case "LN-1": {
        const got = Rules.PING_DATA * (1 - this.dust / 100);
        this.pings++;
        this.dataSent += got;
        events.push(ev("ping", f2(got), this.hour));
        break;
      }
      default:
        this.addData(Rules.DUST_TEST_DATA);
        this.dust = Math.max(0, this.dust - Rules.DUST_TEST_CLEAN);
        events.push(ev("dustTest", f2(this.dust), this.hour));
    }
  }

  private addData(amount: number) {
    this.dataBuffer = Math.min(Rules.DATA_BUFFER_MAX, this.dataBuffer + amount);
  }

  private addMoodChange(before: Mood, events: EngineEvent[]) {
    const after = this.mood();
    if (after !== before) events.push(ev("moodChanged", `${before}->${after}`, this.hour));
  }

  private drillDepthM() {
    return (this.drillStops * Rules.LISTER_MAX_DEPTH_M) / Rules.LISTER_DEPTH_STOPS;
  }

  private powerShown() {
    return this.pet.passive ? Rules.BATTERY_MAX : this.power;
  }

  // ---------------------------------------------------------------- failover

  /**
   * Rebuild a game from the last state the Java engine sent, so a run survives the server dropping.
   * State JSON is rounded to 2 decimals, so values agree with Java to within ±0.005.
   */
  static fromState(s: EngineState, pet: Pet, site: Site): Game {
    const g = new Game(pet, site, s.petName, s.tipped);
    g.hour = s.hour;
    g.health = s.health;
    if (!pet.passive) g.power = s.power;
    g.dust = s.dust;
    g.petTempK = s.petTempK;
    g.dataBuffer = s.dataBuffer;
    g.dataSent = s.dataSent;
    g.drillStops = Math.round((s.drillDepthM * Rules.LISTER_DEPTH_STOPS) / Rules.LISTER_MAX_DEPTH_M);
    g.pings = s.pings;
    g.heaterOn = s.heaterOn;
    g.shadeOn = s.shadeOn;
    g.alive = s.alive;
    g.won = s.won;
    g.kmDriven = s.kmDriven ?? 0;
    g.legs = s.legs ?? 0;
    for (const [k, v] of Object.entries(s.cooldowns ?? {})) if (v > 0) g.cooldowns.set(k, v);
    for (const m of s.milestones ?? []) g.milestones.add(m);
    if (s.trip) {
      const from = siteById(s.trip.from);
      const to = siteById(s.trip.to);
      if (from && to) {
        g.site = from;
        g.trip = new Trip(from, to);
        g.trip.doneHours = Math.min(g.trip.totalHours, s.trip.doneHours);
      }
    }
    return g;
  }

  // ---------------------------------------------------------------- JSON

  toJson(): EngineState {
    const actions: ActionJson[] = this.actionIds().map((id) => {
      const r = this.rule(id)!;
      const label = id === "heater" ? (this.heaterOn ? "Heater: ON" : "Heater: off")
        : id === "shade" ? (this.shadeOn ? "Sunshade: ON" : "Sunshade: off")
        : r.label;
      return { id, label, powerCost: n2(this.powerCost(id)), blockedBy: this.whyNot(id) };
    });
    const cooldowns: Record<string, number> = {};
    for (const [k, v] of this.cooldowns) cooldowns[k] = n2(v);
    return {
      petName: this.petName,
      pet: petJson(this.pet),
      site: siteJson(this.site),
      tipped: this.tipped,
      hour: n2(this.hour),
      earthDays: n2(this.hour / 24),
      dayProgress: n2(this.dayProgress()),
      isDay: this.isDay(),
      sunElevation: n2(Game.sunElevation(this.hour)),
      surfaceTempK: n2(this.surfaceTempK(this.hour)),
      petTempK: n2(this.petTempK),
      tempStatus: this.tempStatus(),
      health: n2(this.health),
      power: n2(this.powerShown()),
      solarPerHour: n2(this.solarPerHour()),
      sunlightHere: n2(this.sunlightHere()),
      dust: n2(this.dust),
      dataBuffer: n2(this.dataBuffer),
      dataSent: n2(this.dataSent),
      drillDepthM: n2(this.drillDepthM()),
      pings: this.pings,
      heaterOn: this.heaterOn,
      shadeOn: this.shadeOn,
      alive: this.alive,
      won: this.won,
      mood: this.mood(),
      milestones: [...this.milestones],
      actions,
      cooldowns,
      trip: this.trip ? this.trip.toJson() : null,
      kmDriven: n2(this.kmDriven),
      legs: this.legs,
      gameHours: n2(Rules.GAME_HOURS),
      dayHours: n2(Rules.DAY_HOURS),
    };
  }
}

function fail(error: string): ActionResult {
  return { ok: false, error, events: [] };
}

function powerLevel(p: number) {
  if (p < Rules.POWER_CRITICAL) return "critical";
  if (p < Rules.POWER_LOW) return "low";
  return "ok";
}
