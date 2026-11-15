// JSON shapes served by the Java engine (src/engine/*.java → EngineServer) and mirrored by the
// in-browser port (./game.ts). Field names and meanings match Game.toJson() exactly.

export interface SiteJson {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  dayMaxK: number;
  nightMinK: number;
  sunlight: number;
  note: string;
  coordSourceId: string;
  sourceIds: string[];
}

export interface PetJson {
  id: string;
  name: string;
  fullName: string;
  flewOn: string;
  passive: boolean;
  minSafeK: number;
  maxSafeK: number;
  drawPerHour: number;
  workLabel: string;
  sourceId: string | null;
}

export interface ActionJson {
  id: string;
  label: string;
  powerCost: number;
  blockedBy: string | null;
}

export interface TripJson {
  from: string;
  to: string;
  distanceKm: number;
  totalHours: number;
  doneHours: number;
  hoursLeft: number;
  progress: number;
}

export interface EngineState {
  petName: string;
  pet: PetJson;
  site: SiteJson;
  tipped: boolean;
  hour: number;
  earthDays: number;
  dayProgress: number;
  isDay: boolean;
  sunElevation: number;
  surfaceTempK: number;
  petTempK: number;
  tempStatus: "ok" | "cold" | "hot";
  health: number;
  power: number;
  solarPerHour: number;
  sunlightHere: number;
  dust: number;
  dataBuffer: number;
  dataSent: number;
  drillDepthM: number;
  pings: number;
  heaterOn: boolean;
  shadeOn: boolean;
  alive: boolean;
  won: boolean;
  mood: Mood;
  milestones: string[];
  actions: ActionJson[];
  cooldowns: Record<string, number>;
  trip: TripJson | null;
  kmDriven: number;
  legs: number;
  gameHours: number;
  dayHours: number;
}

export type Mood =
  | "happy"
  | "night"
  | "dusty"
  | "sleepy"
  | "freezing"
  | "overheating"
  | "fainted"
  | "proud";

export interface EngineEvent {
  type: string;
  detail: string | null;
  hour: number;
}

export interface ActionResult {
  ok: boolean;
  error: string | null;
  events: EngineEvent[];
}

export interface SourceJson {
  id: string;
  title: string;
  url: string;
}

export interface FactJson {
  topic: string;
  text: string;
  sourceId: string;
}

export interface MilestoneJson {
  id: string;
  mission: string;
  hours: number;
  text: string;
  sourceId: string;
}

export interface RulesJson {
  dayHours: number;
  nightHours: number;
  gameHours: number;
  roverKmh: number;
  moonRadiusKm: number;
  driveDustPerHour: number;
  dustyAt: number;
  powerLow: number;
  powerCritical: number;
}

export interface RouteJson {
  from: string;
  to: string;
  distanceKm: number;
  hours: number;
}

/** Everything static the game needs, fetched once. */
export interface Catalog {
  sites: SiteJson[];
  pets: PetJson[];
  facts: FactJson[];
  sources: SourceJson[];
  milestones: MilestoneJson[];
  rules: RulesJson;
  routes: RouteJson[];
}
