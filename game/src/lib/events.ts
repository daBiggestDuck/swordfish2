import type { EngineEvent, MilestoneJson, SiteJson } from "@/engine/types";

export type Tone = "good" | "warn" | "bad" | "info" | "big";

export interface FeedItem {
  key: string;
  hour: number;
  text: string;
  tone: Tone;
}

/** Engine event → one line for the feed (same wording as the Engine tab where it overlaps). */
export function describeEvent(
  e: EngineEvent,
  ctx: { petId: string; milestones: MilestoneJson[]; sites: SiteJson[] },
): { text: string; tone: Tone } | null {
  const site = (id: string | null) => ctx.sites.find((s) => s.id === id)?.name ?? id ?? "";
  switch (e.type) {
    case "moodChanged":
      return null;
    case "departed":
      return { text: `Rover rolling out for ${site(e.detail)}.`, tone: "info" };
    case "arrived":
      return { text: `Arrived at ${site(e.detail)}.`, tone: "big" };
    case "drilled":
      return { text: `Drilled to ${e.detail}. Soil temperature logged.`, tone: "big" };
    case "ping":
      return { text: `${ctx.petId === "LN-1" ? "Beacon ranging ping answered" : "Laser ping bounced back from orbit"} (+${Number(e.detail).toFixed(1)} data).`, tone: "good" };
    case "dustTest":
      return { text: "Dust test done: the electric field cleared the surface.", tone: "good" };
    case "dataSent":
      return { text: `Sent ${Number(e.detail).toFixed(0)} data to Earth.`, tone: "big" };
    case "milestone": {
      const m = ctx.milestones.find((x) => x.id === e.detail);
      return { text: `⭐ ${m ? m.text : e.detail}`, tone: "big" };
    }
    case "powerLow":
      return { text: "Power is getting low.", tone: "warn" };
    case "powerCritical":
      return { text: "Power critical!", tone: "bad" };
    case "powerRecovered":
      return { text: "Power back to normal.", tone: "good" };
    case "tooHot":
      return { text: "Overheating! Raise the sunshade.", tone: "bad" };
    case "tooCold":
      return { text: "Freezing! Turn the heater on.", tone: "bad" };
    case "comfortable":
      return { text: "Temperature is safe again.", tone: "good" };
    case "dusty":
      return { text: "Dust is piling up on the panels.", tone: "warn" };
    case "heaterOn":
      return { text: "Heater on.", tone: "info" };
    case "heaterOff":
      return { text: e.detail === "out of power" ? "Heater shut off: battery empty." : "Heater off.", tone: e.detail ? "warn" : "info" };
    case "shadeOn":
      return { text: "Sunshade up.", tone: "info" };
    case "shadeOff":
      return { text: "Sunshade down.", tone: "info" };
    case "cleaned":
      return { text: "Shook off the dust.", tone: "good" };
    case "sunset":
      return { text: "🌅 Sunset. The lunar night begins and solar power stops.", tone: "big" };
    case "fainted":
      return { text: "😵 Your pet fainted.", tone: "bad" };
    case "won":
      return { text: "🏆 Sunrise again! A full lunar day and night survived.", tone: "big" };
    default:
      return { text: e.type, tone: "info" };
  }
}
