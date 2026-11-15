import { useEffect } from "react";
import { ArrowLeft, BatteryCharging, Check, MapPin, PackageCheck, Snowflake } from "lucide-react";
import type { Catalog } from "@/engine/types";
import { useMoon } from "@/components/game/MoonStage";
import { PetModel } from "@/components/game/PetVisuals";
import { MagicCard } from "@/components/ui/magic-card";
import { BlurFade } from "@/components/ui/blur-fade";
import { PET_UI } from "@/lib/pets";
import { cn } from "@/lib/utils";

/** Canva slide 3: four slate tiles on a light panel over the lunar horizon — choose the payload pet. */
export function PetScreen({
  catalog,
  landingId,
  petId,
  name,
  tipped,
  dropBadge,
  onPet,
  onName,
  onTipped,
  onBack,
  onConfirm,
  busy,
}: {
  catalog: Catalog;
  landingId: string;
  petId: string;
  name: string;
  tipped: boolean;
  dropBadge?: { label: string; coords: string } | null;
  onPet: (id: string) => void;
  onName: (v: string) => void;
  onTipped: (v: boolean) => void;
  onBack: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const moon = useMoon();
  const landing = catalog.sites.find((s) => s.id === landingId);
  useEffect(() => {
    moon?.setMode("surface");
    moon?.setFocus(null);
    moon?.setRoute(null, null);
  }, [moon]);

  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center overflow-y-auto p-3 pt-20 sm:items-center sm:p-6">
      <BlurFade duration={0.4} className="w-full max-w-[1080px]">
        <section aria-labelledby="pet-title" className="rounded-[28px] border border-white/60 bg-mist/95 p-4 text-night shadow-[0_30px_80px_rgba(0,0,0,0.55)] sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-bold tracking-[0.18em] text-ink-2 uppercase">Step 2 · Choose your payload pet</p>
                {dropBadge && (
                  <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-night px-2.5 py-0.5 font-mono text-[11px] text-orange-ui">
                    <MapPin className="size-3 shrink-0" />
                    <span className="truncate">{dropBadge.coords} · {dropBadge.label}</span>
                  </span>
                )}
              </div>
              <h2 id="pet-title" className="mt-1 font-title text-2xl sm:text-3xl">Who rides the rover from {landing?.name ?? "the lander"}?</h2>
            </div>
            <p className="max-w-[40ch] text-xs text-ink-2">Each pet is an instrument that really flew to the Moon. Safe temperatures and power needs come from the engine.</p>
          </div>

          <div role="radiogroup" aria-label="Payload pets" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {catalog.pets.map((p) => {
              const ui = PET_UI[p.id];
              const selected = p.id === petId;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onPet(p.id)}
                  className={cn("group rounded-[22px] text-left outline-none focus-visible:ring-4 focus-visible:ring-orange-ui/60", selected && "ring-4 ring-orange-ui")}
                >
                  <MagicCard
                    gradientColor="#94a3b8"
                    gradientOpacity={0.35}
                    gradientFrom="#f97316"
                    gradientTo="#fbbf24"
                    className="rounded-[22px] bg-slate-ui text-white"
                  >
                    <div className="relative p-3">
                      <PetModel petId={p.id} mood="happy" className="aspect-square w-full rounded-2xl bg-night" />
                      {selected && (
                        <span className="absolute top-5 right-5 grid size-7 place-items-center rounded-full bg-orange-ui text-night shadow">
                          <Check className="size-4" />
                        </span>
                      )}
                      <p className="mt-3 font-title text-xl leading-none">{ui?.nickname ?? p.name}</p>
                      <p className="mt-1 text-xs font-semibold text-white/90">{ui?.role}</p>
                      <p className="mt-1 line-clamp-2 text-[11px] text-white/80">{p.fullName}</p>
                      <div className="mt-2.5 flex flex-wrap gap-1 text-[10.5px] font-semibold">
                        <span className="rounded-full bg-night/45 px-2 py-0.5">Flew on {p.flewOn}</span>
                        <span className="flex items-center gap-1 rounded-full bg-night/45 px-2 py-0.5">
                          {p.passive ? <Snowflake className="size-3" /> : <BatteryCharging className="size-3" />}
                          {p.passive ? "No power needed" : `${p.drawPerHour}/h power`}
                        </span>
                        <span className="rounded-full bg-night/45 px-2 py-0.5">{p.passive ? "Any temperature" : `${p.minSafeK}–${p.maxSafeK} K`}</span>
                      </div>
                    </div>
                  </MagicCard>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold">
              Name
              <input
                value={name}
                maxLength={24}
                onChange={(e) => onName(e.target.value)}
                className="w-40 rounded-xl border border-night/20 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-orange-ui"
                aria-label="Pet name"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={tipped} onChange={(e) => onTipped(e.target.checked)} className="size-4 accent-[#f97316]" />
              Tipped landing, like IM-2 (¼ solar)
            </label>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={onBack} className="flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-night/10">
                <ArrowLeft className="size-4" /> Back
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="flex items-center gap-2 rounded-xl bg-night px-5 py-2.5 text-sm font-bold text-mist shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                <PackageCheck className="size-4 text-orange-ui" /> Load onto the rover
              </button>
            </div>
          </div>
        </section>
      </BlurFade>
    </div>
  );
}
