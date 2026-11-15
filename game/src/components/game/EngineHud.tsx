import { Cpu, HardDrive, Sun, Moon, Thermometer, Wind, Zap, HeartPulse } from "lucide-react";
import type { EngineState, RulesJson } from "@/engine/types";
import type { EngineKind } from "@/engine/client";
import { BorderBeam } from "@/components/ui/border-beam";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import { MOOD_UI, PET_UI } from "@/lib/pets";
import { kToC } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Top-right engine panel (Canva slides 4–5). Every number is the engine's own state, refreshed on each
 * tick: health, power, pet temperature vs its safe range, dust, data, sunlight and the lunar clock.
 */
export function EngineHud({
  state,
  rules,
  engineKind,
  engineLabel,
  petSprite,
  className,
}: {
  state: EngineState;
  rules: RulesJson;
  engineKind: EngineKind;
  engineLabel: string;
  petSprite?: string | null;
  className?: string;
}) {
  const s = state;
  const mood = MOOD_UI[s.mood];
  const ui = PET_UI[s.pet.id];
  const dayHours = rules.dayHours;
  const cycle = Math.min(1, s.hour / rules.gameHours);
  const dayShare = dayHours / rules.gameHours;
  const tempLo = s.pet.passive ? 0 : s.pet.minSafeK;
  const tempHi = s.pet.passive ? 420 : s.pet.maxSafeK;
  // temperature track spans 0..420 K so the safe band and the pet's position are both visible
  const track = (k: number) => `${Math.max(0, Math.min(100, (k / 420) * 100))}%`;
  const healthColor = s.health < 25 ? "var(--rr-bad)" : s.health < 50 ? "var(--rr-warn)" : "var(--rr-good)";
  const powerColor = s.power < rules.powerCritical ? "var(--rr-bad)" : s.power < rules.powerLow ? "var(--rr-warn)" : "var(--rr-orange)";

  return (
    <section
      aria-label="Engine data"
      className={cn(
        "relative w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/60 bg-mist/95 p-3.5 text-night shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur",
        className,
      )}
    >
      <BorderBeam size={120} duration={7} colorFrom="#f97316" colorTo="#fbbf24" borderWidth={2} />

      {/* who + mood + engine */}
      <header className="flex items-center gap-2.5">
        <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-night ring-2" style={{ ["--tw-ring-color" as string]: ui?.accent ?? "#f97316" }}>
          {petSprite ? <img src={petSprite} alt="" className="size-11 object-contain" /> : <span className="text-lg">{mood.emoji}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-tight font-bold">
            {s.petName} <span className="font-medium text-ink-2">· {s.pet.name}</span>
          </p>
          <p className={cn("truncate text-xs font-semibold", mood.tone === "bad" ? "text-bad" : mood.tone === "warn" ? "text-warn" : "text-ink-2")} aria-live="polite">
            {mood.emoji} {mood.text}
          </p>
        </div>
        <span
          title={engineLabel}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
            engineKind === "java" ? "bg-night text-mist" : "bg-orange-ui/20 text-night",
          )}
        >
          <Cpu className="size-3" />
          {engineKind === "java" ? "Java engine" : "Browser engine"}
        </span>
      </header>

      {/* lunar clock */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] font-semibold text-ink-2">
          <span className="flex items-center gap-1">
            {s.isDay ? <Sun className="size-3.5 text-warn" /> : <Moon className="size-3.5 text-cold" />}
            {s.isDay ? `Lunar day · ${(s.hour / 24).toFixed(1)} of ${(dayHours / 24).toFixed(1)} Earth days` : `Lunar night · ${Math.floor(s.hour - dayHours)} h after sunset`}
          </span>
          <span className="tabular-nums">h {Math.floor(s.hour)}/{rules.gameHours}</span>
        </div>
        <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-[#334155]" aria-hidden="true">
          <div className="absolute inset-y-0 left-0 bg-amber-300/80" style={{ width: `${dayShare * 100}%` }} />
          <div className="absolute inset-y-0 bg-[#475569]" style={{ left: `${dayShare * 100}%`, right: 0 }} />
          <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-night bg-white transition-[left] duration-300" style={{ left: `${cycle * 100}%` }} />
        </div>
      </div>

      {/* health + power gauges */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Gauge label="Health" icon={<HeartPulse className="size-3.5" />} value={s.health} color={healthColor} />
        {s.pet.passive ? (
          <div className="flex flex-col items-center justify-center rounded-xl bg-white/55 p-2 text-center">
            <Zap className="size-5 text-ink-2" />
            <p className="mt-1 text-xs font-bold">No battery</p>
            <p className="text-[10px] font-medium text-ink-2">Passive instrument</p>
          </div>
        ) : (
          <Gauge label="Power" icon={<Zap className="size-3.5" />} value={s.power} color={powerColor} sub={`${s.solarPerHour >= 0 ? "+" : ""}${s.solarPerHour.toFixed(1)}/h solar`} />
        )}
      </div>

      {/* pet temperature vs safe band */}
      <div className="mt-3 rounded-xl bg-white/55 p-2.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-ink-2">
          <span className="flex items-center gap-1">
            <Thermometer className="size-3.5" /> {s.petName}'s temperature
          </span>
          <span className={cn("font-bold", s.tempStatus === "ok" ? "text-good" : s.tempStatus === "cold" ? "text-cold" : "text-bad")}>
            {s.tempStatus === "ok" ? "Safe" : s.tempStatus === "cold" ? "▼ Too cold" : "▲ Too hot"}
          </span>
        </div>
        <p className="mt-0.5 font-title text-xl leading-tight tabular-nums">
          {Math.round(s.petTempK)} K
          <span className="ml-1.5 font-sans text-xs font-semibold text-ink-2">({kToC(s.petTempK)} °C)</span>
        </p>
        <div className="relative mt-1.5 h-2 rounded-full bg-[#cbd5e1]" aria-hidden="true">
          <div className="absolute inset-y-0 rounded-full bg-good/35" style={{ left: track(tempLo), right: `calc(100% - ${track(tempHi)})` }} />
          <div className="absolute top-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-night transition-[left] duration-300" style={{ left: track(s.petTempK) }} />
          <div className="absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-ink-2/60" style={{ left: track(s.surfaceTempK) }} title="Ground" />
        </div>
        <div className="mt-1 flex justify-between text-[10px] font-medium text-ink-2">
          <span>Safe {s.pet.passive ? "at any temperature" : `${s.pet.minSafeK}–${s.pet.maxSafeK} K`}</span>
          <span>Ground {Math.round(s.surfaceTempK)} K</span>
        </div>
      </div>

      {/* dust + data */}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Bar label="Dust" icon={<Wind className="size-3.5" />} value={s.dust} danger={s.dust >= rules.dustyAt} />
        <Bar label="Data stored" icon={<HardDrive className="size-3.5" />} value={s.dataBuffer} danger={s.dataBuffer >= 100} accent />
      </div>

      <footer className="mt-2.5 flex items-center justify-between text-[10px] font-semibold text-ink-2">
        <span>Sunlight here {Math.round(s.sunlightHere * 100)}%</span>
        <span>Sent home {Math.round(s.dataSent)}</span>
        <span>{s.legs} {s.legs === 1 ? "stop" : "stops"} · {Math.round(s.kmDriven)} km</span>
      </footer>
    </section>
  );
}

function Gauge({ label, icon, value, color, sub }: { label: string; icon: React.ReactNode; value: number; color: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-white/55 p-2" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <AnimatedCircularProgressBar
        value={Math.max(0, Math.min(100, value))}
        gaugePrimaryColor={color}
        gaugeSecondaryColor="rgba(11,19,32,0.12)"
        className="size-14 text-sm font-bold text-night"
      />
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-[11px] font-semibold text-ink-2">
          {icon}
          {label}
        </p>
        {sub && <p className="text-[10px] font-semibold text-ink-2 tabular-nums">{sub}</p>}
      </div>
    </div>
  );
}

function Bar({ label, icon, value, danger, accent }: { label: string; icon: React.ReactNode; value: number; danger?: boolean; accent?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="rounded-xl bg-white/55 p-2" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
      <div className="flex items-center justify-between text-[11px] font-semibold text-ink-2">
        <span className="flex items-center gap-1">
          {icon}
          {label}
        </span>
        <span className={cn("tabular-nums", danger && "text-bad")}>{Math.round(v)}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#cbd5e1]">
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", danger ? "bg-bad" : accent ? "bg-orange-ui" : "bg-[#a16207]")}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}
