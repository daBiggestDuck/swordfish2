import { useEffect } from "react";
import confetti from "canvas-confetti";
import { RotateCcw, Trophy, Skull, Flag, CheckCircle2, Circle } from "lucide-react";
import type { Catalog, EngineState } from "@/engine/types";
import { useMoon } from "@/components/game/MoonStage";
import { BlurFade } from "@/components/ui/blur-fade";
import { NumberTicker } from "@/components/ui/number-ticker";
import { InlineToast } from "@/components/watermelon/inline-toast";
import { PET_UI } from "@/lib/pets";

export type Outcome = "won" | "fainted" | "ended";

/** Run summary: outcome, distance, stops, data and which real missions the pet matched. */
export function EndScreen({
  state,
  catalog,
  outcome,
  visited,
  onAgain,
}: {
  state: EngineState;
  catalog: Catalog;
  outcome: Outcome;
  visited: string[];
  onAgain: () => void;
}) {
  const moon = useMoon();
  const site = catalog.sites.find((s) => s.id === state.site.id);
  useEffect(() => {
    if (!moon || !site) return;
    moon.setMode("select");
    moon.setFocus(site);
    moon.setRoute(null, null);
  }, [moon, site]);

  useEffect(() => {
    if (outcome === "won" && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const end = Date.now() + 1200;
      const frame = () => {
        confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0 }, colors: ["#f97316", "#fbbf24", "#d1d5db"] });
        confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1 }, colors: ["#f97316", "#fbbf24", "#d1d5db"] });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    }
  }, [outcome]);

  const stops = visited.map((id) => catalog.sites.find((s) => s.id === id)?.name ?? id);
  const nick = PET_UI[state.pet.id]?.nickname ?? state.pet.name;
  const title = outcome === "won" ? `${state.petName} survived a whole lunar day and night!` : outcome === "fainted" ? `${state.petName} fainted at hour ${Math.floor(state.hour)}` : `Run ended at ${site?.name ?? "the rover"}`;
  const summary = [
    `Rover Run · ${state.petName} the ${nick} (${state.pet.fullName})`,
    `Outcome: ${outcome === "won" ? "survived the full lunar day + night" : outcome === "fainted" ? `fainted at hour ${Math.floor(state.hour)}` : `ended at hour ${Math.floor(state.hour)}`}`,
    `Route: ${stops.join(" → ")}`,
    `Driven: ${state.kmDriven.toFixed(1)} km over ${state.legs} leg(s) at ${catalog.rules.roverKmh.toFixed(1)} km/h (Apollo 17 pace)`,
    `Data sent to Earth: ${Math.round(state.dataSent)} · Milestones: ${state.milestones.length}/${catalog.milestones.length}`,
  ].join("\n");

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-night/40 p-3 pt-20 sm:p-6">
      <BlurFade duration={0.45} className="w-full max-w-[760px]">
        <section aria-labelledby="end-title" className="rounded-[28px] border border-white/60 bg-mist p-5 text-night shadow-[0_30px_90px_rgba(0,0,0,0.6)] sm:p-7">
          <div className="flex items-start gap-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-night text-orange-ui">
              {outcome === "won" ? <Trophy className="size-6" /> : outcome === "fainted" ? <Skull className="size-6" /> : <Flag className="size-6" />}
            </div>
            <div>
              <p className="text-[11px] font-bold tracking-[0.18em] text-ink-2 uppercase">Run complete</p>
              <h2 id="end-title" className="font-title text-2xl leading-tight sm:text-3xl">{title}</h2>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Big label="km driven" value={state.kmDriven} decimals={1} />
            <Big label="stops" value={state.legs} />
            <Big label="Earth days" value={state.hour / 24} decimals={1} />
            <Big label="data sent home" value={state.dataSent} />
          </dl>

          <div className="mt-4 rounded-2xl bg-white/60 p-3">
            <h3 className="text-[11px] font-bold tracking-wide text-ink-2 uppercase">Route</h3>
            <p className="mt-1 text-sm font-semibold">{stops.join("  →  ")}</p>
          </div>

          <div className="mt-3 rounded-2xl bg-white/60 p-3">
            <h3 className="text-[11px] font-bold tracking-wide text-ink-2 uppercase">Beat the real missions</h3>
            <ul className="mt-1.5 space-y-1">
              {catalog.milestones.map((m) => {
                const done = state.milestones.includes(m.id);
                return (
                  <li key={m.id} className="flex items-start gap-2 text-sm">
                    {done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" /> : <Circle className="mt-0.5 size-4 shrink-0 text-ink-2/50" />}
                    <span className={done ? "font-semibold" : "text-ink-2"}>
                      {m.mission}, {Math.round(m.hours)} h — {m.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <InlineToast code={summary} label="Copy your run summary" />
            <button
              type="button"
              onClick={onAgain}
              className="ml-auto flex items-center gap-2 rounded-xl bg-night px-5 py-3 text-sm font-bold text-mist shadow-lg transition-transform hover:-translate-y-0.5"
            >
              <RotateCcw className="size-4 text-orange-ui" /> Play again
            </button>
          </div>
        </section>
      </BlurFade>
    </div>
  );
}

function Big({ label, value, decimals = 0 }: { label: string; value: number; decimals?: number }) {
  return (
    <div className="rounded-2xl bg-night px-3 py-3 text-center text-mist">
      <dd className="font-title text-2xl tabular-nums">
        <NumberTicker value={Number(value.toFixed(decimals))} decimalPlaces={decimals} className="text-mist" />
      </dd>
      <dt className="mt-0.5 text-[11px] font-semibold text-mist/75">{label}</dt>
    </div>
  );
}
