import type { Mood } from "@/engine/types";

/** UI-only details for the four adoptable pets. Numbers and names come from the engine. */
export const PET_UI: Record<string, { model: string; role: string; nickname: string; accent: string }> = {
  LISTER: { model: "lister", role: "Heat-flow drill", nickname: "LISTER", accent: "#f97316" },
  LRA: { model: "retro", role: "Laser retroreflector", nickname: "Retro", accent: "#fbbf24" },
  EDS: { model: "eds", role: "Electrodynamic dust shield", nickname: "EDS", accent: "#38bdf8" },
  "LN-1": { model: "ln-1", role: "Navigation beacon", nickname: "Nodey", accent: "#a3e635" },
};

/** Engine mood → the shared pet models' mood set (happy, shivering, sleeping, cold). */
export function modelMood(mood: Mood | undefined, passive: boolean): string {
  switch (mood) {
    case "happy":
    case "proud":
      return "happy";
    case "night":
      return passive ? "sleeping" : "cold";
    case "freezing":
      return "cold";
    case "sleepy":
    case "fainted":
      return "sleeping";
    case "dusty":
    case "overheating":
      return "shivering";
    default:
      return "happy";
  }
}

export const MOOD_UI: Record<Mood, { emoji: string; text: string; tone: "good" | "warn" | "bad" | "calm" }> = {
  happy: { emoji: "😄", text: "Happy in the sunshine", tone: "good" },
  night: { emoji: "🌙", text: "Riding out the lunar night", tone: "calm" },
  dusty: { emoji: "😣", text: "Dusty: shake it off", tone: "warn" },
  sleepy: { emoji: "😴", text: "Battery nearly empty", tone: "warn" },
  freezing: { emoji: "🥶", text: "Too cold: heater on", tone: "bad" },
  overheating: { emoji: "🥵", text: "Too hot: sunshade up", tone: "bad" },
  fainted: { emoji: "😵", text: "Fainted", tone: "bad" },
  proud: { emoji: "🏆", text: "Survived a whole lunar day and night", tone: "good" },
};
