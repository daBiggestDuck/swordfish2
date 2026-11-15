import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { BedDouble, Flag, Satellite, Sparkles } from "lucide-react";
import type { Catalog, EngineState } from "@/engine/types";
import { BlurFade } from "@/components/ui/blur-fade";
import { ShineBorder } from "@/components/ui/shine-border";
import { MOOD_UI } from "@/lib/pets";
import { hours, km, temp } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface LegInfo {
  from: string;
  to: string;
  distanceKm: number;
  hours: number;
  departHour: number;
}

/**
 * Canva slide 5: the big card over the rover when it reaches a destination. Shows the leg, the
 * conditions at the new site and the pet's state (all from the engine), and offers the next moves.
 */
export function ArrivalCard({
  state,
  catalog,
  leg,
  busy,
  onAct,
  onRest,
  onNext,
  onEndRun,
}: {
  state: EngineState;
  catalog: Catalog;
  leg: LegInfo | null;
  busy: boolean;
  onAct: (id: string) => void;
  onRest: (h: number) => void;
  onNext: () => void;
  onEndRun: () => void;
}) {
  const site = catalog.sites.find((s) => s.id === state.site.id)!;
  const from = leg ? catalog.sites.find((s) => s.id === leg.from) : null;
  const mood = MOOD_UI[state.mood];
  const work = state.actions.find((a) => a.id === "work");
  const send = state.actions.find((a) => a.id === "send");
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    nextRef.current?.focus();
    if (state.alive && state.health >= 50 && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      confetti({ particleCount: 90, spread: 70, startVelocity: 38, origin: { y: 0.55 }, colors: ["#f97316", "#fbbf24", "#d1d5db", "#64748b"] });
    }
    // fire once per arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-night/35 p-3 pt-20 sm:p-6">
      <BlurFade duration={0.45} offset={16} className="w-full max-w-[720px]">
        <section role="dialog" aria-modal="false" aria-labelledby="arrive-title" className="relative overflow-hidden rounded-[28px] border border-white/60 bg-mist p-5 text-night shadow-[0_30px_90px_rgba(0,0,0,0.6)] sm:p-7">
          <ShineBorder shineColor={["#f97316", "#fbbf24", "#d1d5db"]} borderWidth={2} duration={10} />
          <p className="text-[11px] font-bold tracking-[0.18em] text-ink-2 uppercase">
            Stop {state.legs} {from ? `· from ${from.name}` : ""}
          </p>
          <h2 id="arrive-title" className="mt-1 font-title text-3xl leading-tight sm:text-4xl">Arrived at {site.name}</h2>
          <p className="mt-1 text-sm text-ink-2">{site.region} · {site.note}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Panel title="The drive">
              <Row k="Distance" v={leg ? km(leg.distanceKm) : "—"} />
              <Row k="Drive time" v={leg ? hours(leg.hours) : "—"} />
              <Row k="Odometer" v={km(state.kmDriven)} />
            </Panel>
            <Panel title="Conditions here">
              <Row k="Noon / night" v={`${site.dayMaxK} / ${site.nightMinK} K`} />
              <Row k="Panel sunlight" v={`${Math.round(site.sunlight * 100)}%`} />
              <Row k="Now" v={state.isDay ? `Day, hour ${Math.floor(state.hour)}` : `Night, hour ${Math.floor(state.hour)}`} />
            </Panel>
            <Panel title={`${state.petName} now`}>
              <Row k="Mood" v={`${mood.emoji} ${state.mood}`} />
              <Row k="Health" v={`${Math.round(state.health)}%`} warn={state.health < 50} />
              <Row k={state.pet.passive ? "Battery" : "Power"} v={state.pet.passive ? "not needed" : `${Math.round(state.power)}%`} warn={!state.pet.passive && state.power < catalog.rules.powerLow} />
              <Row k="Temperature" v={temp(state.petTempK)} warn={state.tempStatus !== "ok"} />
            </Panel>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {work && (
              <button
                type="button"
                disabled={busy || Boolean(work.blockedBy)}
                onClick={() => onAct("work")}
                title={work.blockedBy ?? undefined}
                className="flex items-center gap-1.5 rounded-xl bg-orange-ui px-4 py-2.5 text-sm font-bold text-night shadow transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
              >
                <Sparkles className="size-4" /> {state.pet.workLabel}
                {work.powerCost > 0 && <span className="text-xs font-semibold">(−{Math.round(work.powerCost)})</span>}
              </button>
            )}
            {send && (
              <button
                type="button"
                disabled={busy || Boolean(send.blockedBy)}
                onClick={() => onAct("send")}
                title={send.blockedBy ?? undefined}
                className="flex items-center gap-1.5 rounded-xl border border-night/20 bg-white/70 px-4 py-2.5 text-sm font-bold disabled:opacity-50"
              >
                <Satellite className="size-4" /> Send {Math.round(state.dataBuffer)} data home
              </button>
            )}
            <button
              type="button"
              disabled={busy || !state.alive || state.won}
              onClick={() => onRest(6)}
              className="flex items-center gap-1.5 rounded-xl border border-night/20 bg-white/70 px-4 py-2.5 text-sm font-bold disabled:opacity-50"
              title="Let 6 hours pass here (solar charging, cooldowns)"
            >
              <BedDouble className="size-4" /> Wait 6 h here
            </button>
          </div>
          {(work?.blockedBy || send?.blockedBy) && (
            <p className="mt-1.5 text-xs text-ink-2">
              {work?.blockedBy ? `${state.pet.workLabel}: ${work.blockedBy}. ` : ""}
              {send?.blockedBy && state.dataBuffer > 0 ? `Send: ${send.blockedBy}.` : ""}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-night/10 pt-4">
            <button type="button" onClick={onEndRun} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-2 hover:bg-night/10">
              End run here
            </button>
            <button
              ref={nextRef}
              type="button"
              onClick={onNext}
              disabled={!state.alive || state.won}
              className="ml-auto flex items-center gap-2 rounded-xl bg-night px-5 py-3 text-sm font-bold text-mist shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              <Flag className="size-4 text-orange-ui" /> Choose the next destination
            </button>
          </div>
        </section>
      </BlurFade>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/60 p-3">
      <h3 className="text-[11px] font-bold tracking-wide text-ink-2 uppercase">{title}</h3>
      <dl className="mt-1.5 space-y-1">{children}</dl>
    </div>
  );
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <dt className="text-ink-2">{k}</dt>
      <dd className={cn("text-right font-semibold", warn && "text-bad")}>{v}</dd>
    </div>
  );
}
