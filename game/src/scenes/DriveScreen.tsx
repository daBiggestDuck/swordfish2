import { useEffect, useMemo } from "react";
import { FastForward, Pause, Play } from "lucide-react";
import type { Catalog, EngineState } from "@/engine/types";
import type { EngineKind } from "@/engine/client";
import { useMoon } from "@/components/game/MoonStage";
import { OnRover } from "@/components/game/MoonOverlays";
import { Rover } from "@/components/game/Rover";
import { EngineHud } from "@/components/game/EngineHud";
import { EventFeed } from "@/components/game/EventFeed";
import { ActionDock } from "@/components/game/ActionDock";
import { LabeledProgressIndicator } from "@/components/watermelon/labeled-progress-indicator";
import { FluidTabs } from "@/components/watermelon/fluid-tabs";
import { RunWidget } from "@/components/watermelon/run-widget";
import { ArrivalCard, type LegInfo } from "./ArrivalCard";
import type { FeedItem } from "@/lib/events";
import { hours, km } from "@/lib/format";
import { cn } from "@/lib/utils";

export const WARPS = [
  { id: "2", label: "2 h/s", title: "2 game hours per second" },
  { id: "6", label: "6 h/s", title: "6 game hours per second" },
  { id: "12", label: "12 h/s", title: "12 game hours per second" },
  { id: "24", label: "24 h/s", title: "24 game hours per second" },
];

/**
 * Canva slides 4–5: the rover carries the pet along the real great-circle route while the engine runs.
 * Engine data stays in the top-right panel the whole time; events stream on the left; care actions
 * sit in the dock; the route bar shows the leg; on arrival the big card opens over the scene.
 */
export function DriveScreen({
  state,
  catalog,
  engineKind,
  engineLabel,
  feed,
  arrived,
  paused,
  warp,
  busy,
  petSprite,
  lastLeg,
  onTogglePause,
  onWarp,
  onAct,
  onRest,
  onNext,
  onEndRun,
}: {
  state: EngineState;
  catalog: Catalog;
  engineKind: EngineKind;
  engineLabel: string;
  feed: FeedItem[];
  arrived: boolean;
  paused: boolean;
  warp: string;
  busy: boolean;
  petSprite: string | null;
  lastLeg: LegInfo | null;
  onTogglePause: () => void;
  onWarp: (id: string) => void;
  onAct: (id: string) => void;
  onRest: (h: number) => void;
  onNext: () => void;
  onEndRun: () => void;
}) {
  const moon = useMoon();
  const trip = state.trip;
  const from = trip ? catalog.sites.find((s) => s.id === trip.from) : null;
  const to = trip ? catalog.sites.find((s) => s.id === trip.to) : null;
  const here = catalog.sites.find((s) => s.id === state.site.id)!;

  // keep the 3D scene on the rover
  useEffect(() => {
    if (!moon) return;
    moon.setMode("drive");
    moon.setFocus(null);
    if (from && to) moon.setRoute(from, to);
    else {
      moon.setRoute(null, null);
      const prev = lastLeg ? catalog.sites.find((s) => s.id === lastLeg.from) : undefined;
      moon.parkAt(here, prev ? { lat: 2 * here.lat - prev.lat, lon: 2 * here.lon - prev.lon } : undefined);
    }
    // route changes only when the trip changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moon, trip?.from, trip?.to, here.id]);

  useEffect(() => {
    if (!moon) return;
    moon.setProgress(trip ? trip.progress : 0);
    moon.setSun({ elevation01: state.sunElevation, dayProgress: state.dayProgress, isDay: state.isDay, sunlight: state.sunlightHere });
  }, [moon, trip, state.sunElevation, state.dayProgress, state.isDay, state.sunlightHere]);

  const legLabels = useMemo(() => {
    if (!trip || !from || !to) return [`Parked at ${here.name}`];
    const left = trip.distanceKm * (1 - trip.progress);
    return [
      `${from.name} → ${to.name}`,
      `${km(left)} to go · ETA ${hours(trip.hoursLeft)}`,
      `${catalog.rules.roverKmh.toFixed(1)} km/h · Apollo 17 rover pace`,
      `Arrives around hour ${Math.round(state.hour + trip.hoursLeft)}`,
    ];
  }, [trip, from, to, here.name, catalog.rules.roverKmh, state.hour]);

  const moving = Boolean(trip) && !paused && !arrived && state.alive && !state.won;

  return (
    <div className="absolute inset-0 z-20">
      <OnRover>
        <Rover moving={moving} night={!state.isDay || state.sunlightHere < 0.05} petSprite={petSprite} petLabel={state.petName} className="w-[min(250px,40vw)]" />
      </OnRover>

      {/* engine data, top right (Canva slides 4–5) */}
      <div className="absolute top-16 right-3 z-30 sm:top-[72px] sm:right-4">
        <EngineHud state={state} rules={catalog.rules} engineKind={engineKind} engineLabel={engineLabel} petSprite={petSprite} />
      </div>

      {/* live events */}
      <div className="absolute top-16 left-3 z-30 hidden sm:top-[72px] sm:left-4 md:block">
        <EventFeed items={feed} />
      </div>

      {/* odometer */}
      <div className="absolute bottom-4 left-4 z-30 hidden xl:block">
        <RunWidget km={state.kmDriven} kmh={catalog.rules.roverKmh} legs={state.legs} />
      </div>

      {/* bottom: dock + route bar */}
      {!arrived && (
        <div className="absolute inset-x-3 bottom-3 z-30 flex flex-col items-center gap-2.5 sm:bottom-4">
          <ActionDock state={state} busy={busy} onAct={onAct} />
          <div className="flex w-full max-w-[640px] items-center gap-3 rounded-2xl border border-white/60 bg-mist/95 p-3 text-night shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur">
            <button
              type="button"
              onClick={onTogglePause}
              disabled={!trip || !state.alive}
              aria-label={paused ? "Resume driving (Space)" : "Pause (Space)"}
              title={paused ? "Resume (Space)" : "Pause (Space)"}
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-night text-mist shadow transition-transform hover:-translate-y-0.5 disabled:opacity-40"
            >
              {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
            </button>
            <LabeledProgressIndicator labels={legLabels} progress={trip ? trip.progress : 1} paused={!moving} className="min-w-0 flex-1" />
            <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
              <span className="flex items-center gap-1 text-[10px] font-bold tracking-wide text-ink-2 uppercase">
                <FastForward className="size-3" /> Time warp
              </span>
              <FluidTabs tabs={WARPS} active={warp} onChange={onWarp} ariaLabel="Time warp" />
            </div>
          </div>
          <div className="sm:hidden">
            <FluidTabs tabs={WARPS} active={warp} onChange={onWarp} ariaLabel="Time warp" />
          </div>
        </div>
      )}

      {paused && trip && !arrived && (
        <div className={cn("pointer-events-none absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-night/80 px-4 py-2 text-sm font-semibold text-white backdrop-blur")}>
          Paused · press Space or ▶ to keep driving
        </div>
      )}

      {arrived && (
        <ArrivalCard
          state={state}
          catalog={catalog}
          leg={lastLeg}
          busy={busy}
          onAct={onAct}
          onRest={onRest}
          onNext={onNext}
          onEndRun={onEndRun}
        />
      )}
    </div>
  );
}
