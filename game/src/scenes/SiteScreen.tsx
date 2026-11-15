import { useEffect, useMemo, useRef } from "react";
import { AlertTriangle, ArrowLeft, Clock, ExternalLink, MapPin, Moon, Route, Sun, ThermometerSnowflake, ThermometerSun, Truck, Zap } from "lucide-react";
import type { Catalog, EngineState, SiteJson } from "@/engine/types";
import { forecastDrive } from "@/engine/client";
import { useMoon } from "@/components/game/MoonStage";
import { SitePins } from "@/components/game/MoonOverlays";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { BlurFade } from "@/components/ui/blur-fade";
import { coords, hours, km, temp } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Canva slide 2: pick a point on the Moon. The chosen site turns toward you and an animated beam
 * links its pin to the callout card. Used twice: choosing the landing site, then each destination.
 */
export function SiteScreen({
  mode,
  catalog,
  state,
  selectedId,
  onSelect,
  onConfirm,
  onBack,
  onEndRun,
  busy,
}: {
  mode: "land" | "destination";
  catalog: Catalog;
  state: EngineState | null;
  selectedId: string;
  onSelect: (id: string) => void;
  onConfirm: () => void;
  onBack?: () => void;
  onEndRun?: () => void;
  busy?: boolean;
}) {
  const moon = useMoon();
  const rootRef = useRef<HTMLDivElement>(null);
  const pinsRef = useRef<{ pinEl: (id: string) => HTMLElement | null }>(null);
  const fromRef = useRef<HTMLElement | null>(null);
  const toRef = useRef<HTMLDivElement>(null);

  const site = catalog.sites.find((s) => s.id === selectedId) ?? catalog.sites[0];
  const here = mode === "destination" && state ? catalog.sites.find((s) => s.id === state.site.id) ?? null : null;
  const route = here ? catalog.routes.find((r) => r.from === here.id && r.to === site.id) ?? null : null;
  const sameSite = here?.id === site.id;
  const forecast = useMemo(() => (state && here && !sameSite ? forecastDrive(state, site.id) : null), [state, here, site.id, sameSite]);
  const coordSource = catalog.sources.find((s) => s.id === site.coordSourceId);

  useEffect(() => {
    if (!moon) return;
    moon.setMode("select");
    moon.setFocus(site);
    if (here && !sameSite) moon.setRoute(here, site);
    else moon.setRoute(null, null);
    if (here) moon.parkAt(here, sameSite ? undefined : site);
  }, [moon, site, here, sameSite]);

  useEffect(() => {
    fromRef.current = pinsRef.current?.pinEl(site.id)?.firstElementChild as HTMLElement | null;
  });

  const dayLeft = state ? Math.max(0, catalog.rules.dayHours - state.hour) : catalog.rules.dayHours;
  const arrivesAtNight = Boolean(state && route && state.hour + route.hours >= catalog.rules.dayHours);

  return (
    <div ref={rootRef} className="absolute inset-0 z-20">
      <SitePins
        ref={pinsRef}
        sites={catalog.sites}
        selectedId={site.id}
        roverSiteId={here?.id ?? null}
        onSelect={onSelect}
        label={(s) => (here && s.id !== here.id ? `${s.name} · ${km(catalog.routes.find((r) => r.from === here.id && r.to === s.id)?.distanceKm ?? 0)}` : s.name)}
      />
      <AnimatedBeam
        containerRef={rootRef}
        fromRef={fromRef}
        toRef={toRef}
        follow
        curvature={-40}
        pathColor="#d1d5db"
        pathOpacity={0.25}
        pathWidth={2}
        gradientStartColor="#f97316"
        gradientStopColor="#fbbf24"
        duration={3}
        className="z-[15] hidden md:block"
      />

      <div className="absolute inset-x-3 bottom-3 z-20 md:inset-x-auto md:top-1/2 md:right-[4vw] md:bottom-auto md:w-[420px] md:-translate-y-1/2">
        <div ref={toRef} className="absolute top-12 -left-1 size-2" aria-hidden="true" />
        <BlurFade key={`${mode}-${site.id}`} duration={0.35} offset={10}>
          <section aria-labelledby="site-title" className="max-h-[70vh] overflow-y-auto rounded-3xl border border-white/60 bg-mist p-5 text-night shadow-[0_24px_60px_rgba(0,0,0,0.5)] md:max-h-[82vh]">
            <p className="text-[11px] font-bold tracking-[0.18em] text-ink-2 uppercase">
              {mode === "land" ? "Step 1 · Where does the lander touch down?" : `Step 3 · Where should the rover take ${state?.petName ?? "your pet"}?`}
            </p>
            <div className="mt-3 rounded-2xl bg-night px-4 py-3 text-mist">
              <h2 id="site-title" className="font-title text-2xl leading-tight">{site.name}</h2>
              <p className="mt-0.5 text-xs font-semibold text-mist/75">{site.region}</p>
            </div>

            <p className="mt-3 text-sm leading-snug">{site.note}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-ink-2">
              <MapPin className="size-3.5" /> {coords(site.lat, site.lon)}
              {coordSource && (
                <a href={coordSource.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-[#9a3412] underline underline-offset-2">
                  source <ExternalLink className="size-3" />
                </a>
              )}
            </p>

            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat icon={<ThermometerSun className="size-4" />} label="Noon" value={`${site.dayMaxK} K`} />
              <Stat icon={<ThermometerSnowflake className="size-4" />} label="Night" value={`${site.nightMinK} K`} />
              <Stat icon={<Zap className="size-4" />} label="Panel sunlight" value={`${Math.round(site.sunlight * 100)}%`} />
            </dl>

            {mode === "destination" && here && (
              <div className="mt-3 rounded-2xl bg-white/60 p-3">
                {sameSite ? (
                  <p className="text-sm font-semibold">The rover is parked here. Pick another site.</p>
                ) : route ? (
                  <>
                    <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-ink-2 uppercase">
                      <Route className="size-3.5" /> {here.name} → {site.name}
                    </p>
                    <div className="mt-1.5 grid grid-cols-2 gap-2 text-sm">
                      <p>
                        <span className="block text-[11px] font-semibold text-ink-2">Distance</span>
                        <b className="font-title text-lg">{km(route.distanceKm)}</b>
                      </p>
                      <p>
                        <span className="block text-[11px] font-semibold text-ink-2">Drive time @ {catalog.rules.roverKmh.toFixed(1)} km/h</span>
                        <b className="font-title text-lg">{hours(route.hours)}</b>
                      </p>
                    </div>
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-2">
                      <Clock className="size-3.5" /> Arrives at hour {Math.round((state?.hour ?? 0) + route.hours)} ·{" "}
                      {arrivesAtNight ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-night">
                          <Moon className="size-3.5" /> after sunset
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Sun className="size-3.5" /> {hours(dayLeft - route.hours)} of daylight left
                        </span>
                      )}
                    </p>
                    {forecast && (
                      <div className={cn("mt-2 rounded-xl p-2.5 text-xs", forecast.fainted ? "bg-bad/15" : "bg-night/5")}>
                        <p className="font-bold">
                          {forecast.fainted ? (
                            <span className="flex items-center gap-1 text-bad">
                              <AlertTriangle className="size-3.5" /> If you just drive, {state?.petName} faints on the road.
                            </span>
                          ) : (
                            "If you just drive (no buttons):"
                          )}
                        </p>
                        {!forecast.fainted && (
                          <p className="mt-0.5 text-ink-2">
                            Health {Math.round(forecast.health)} · {state?.pet.passive ? "no battery needed" : `power ${Math.round(forecast.power)}`} · temperature {temp(forecast.petTempK)} · dust {Math.round(forecast.dust)}
                          </p>
                        )}
                        <p className="mt-0.5 text-[10px] text-ink-2">Forecast from the engine's own rules. Heater, sunshade and dust care change it.</p>
                      </div>
                    )}
                    {route.distanceKm > 1000 && (
                      <p className="mt-2 text-[11px] text-ink-2">
                        Real Apollo rovers never drove more than 20.1 km in one go. This is a long-haul game drive.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            )}

            <fieldset className="mt-3">
              <legend className="mb-1 text-[11px] font-bold tracking-wide text-ink-2 uppercase">All sites</legend>
              <div className="flex flex-wrap gap-1.5">
                {catalog.sites.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelect(s.id)}
                    aria-pressed={s.id === site.id}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                      s.id === site.id ? "border-night bg-night text-mist" : "border-night/20 bg-white/60 hover:border-night/50",
                    )}
                  >
                    {s.name}
                    {here?.id === s.id ? " · rover" : ""}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-4 flex items-center gap-2">
              {onBack && (
                <button type="button" onClick={onBack} className="flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-night/10">
                  <ArrowLeft className="size-4" /> Back
                </button>
              )}
              {mode === "destination" && onEndRun && (
                <button type="button" onClick={onEndRun} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-2 hover:bg-night/10">
                  End run
                </button>
              )}
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy || sameSite}
                className="ml-auto flex items-center gap-2 rounded-xl bg-night px-5 py-2.5 text-sm font-bold text-mist shadow-lg transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
              >
                {mode === "land" ? (
                  <>
                    <MapPin className="size-4 text-orange-ui" /> Land here
                  </>
                ) : (
                  <>
                    <Truck className="size-4 text-orange-ui" /> Drive here
                  </>
                )}
              </button>
            </div>
          </section>
        </BlurFade>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/60 px-2 py-2">
      <dt className="flex items-center justify-center gap-1 text-[10px] font-bold tracking-wide text-ink-2 uppercase">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 font-title text-base">{value}</dd>
    </div>
  );
}

export type { SiteJson };
