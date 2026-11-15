import { Drill, Flame, Radar, Satellite, ShieldCheck, Umbrella, Wind } from "lucide-react";
import type { ActionJson, EngineState } from "@/engine/types";
import { Dock, DockIcon } from "@/components/ui/dock";
import { cn } from "@/lib/utils";

function iconFor(a: ActionJson, petId: string) {
  switch (a.id) {
    case "heater": return Flame;
    case "shade": return Umbrella;
    case "clean": return Wind;
    case "send": return Satellite;
    case "work": return petId === "LISTER" ? Drill : petId === "EDS" ? ShieldCheck : Radar;
    default: return Radar;
  }
}

/**
 * Care actions as a Magic UI Dock. Labels, power costs and "why not" reasons are the engine's own
 * (state.actions); pressing one calls the engine and the HUD shows the result on the next frame.
 */
export function ActionDock({
  state,
  busy,
  onAct,
  className,
}: {
  state: EngineState;
  busy: boolean;
  onAct: (id: string) => void;
  className?: string;
}) {
  return (
    <Dock
      iconSize={44}
      iconMagnification={58}
      iconDistance={120}
      direction="middle"
      className={cn("mt-0 h-[64px] gap-2.5 border-white/15 bg-night/75 px-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)]", className)}
      aria-label="Care actions"
    >
      {state.actions.map((a) => {
        const Icon = iconFor(a, state.pet.id);
        const on = (a.id === "heater" && state.heaterOn) || (a.id === "shade" && state.shadeOn);
        const blocked = Boolean(a.blockedBy) || busy;
        const label = a.id === "work" ? state.pet.workLabel : a.label;
        const tip = `${label}${a.powerCost > 0 ? ` · −${Math.round(a.powerCost)} power` : ""}${a.blockedBy ? ` — ${a.blockedBy}` : ""}`;
        return (
          <DockIcon key={a.id} className={cn("relative rounded-2xl border transition-colors", on ? "border-good bg-good/20" : "border-white/15 bg-panel", a.blockedBy && "opacity-45")}>
            <button
              type="button"
              disabled={blocked}
              onClick={() => onAct(a.id)}
              aria-pressed={a.id === "heater" || a.id === "shade" ? on : undefined}
              aria-label={tip}
              title={tip}
              className="absolute inset-0 grid place-items-center rounded-2xl text-white outline-none focus-visible:ring-2 focus-visible:ring-orange-ui disabled:cursor-not-allowed"
            >
              <Icon className={cn("size-[55%]", on ? "text-good-bright" : a.id === "work" ? "text-orange-ui" : "text-mist")} />
              {a.powerCost > 0 && !a.blockedBy && (
                <span className="absolute -top-1.5 -right-1.5 rounded-full bg-orange-ui px-1 text-[9px] leading-4 font-bold text-night">−{Math.round(a.powerCost)}</span>
              )}
            </button>
          </DockIcon>
        );
      })}
    </Dock>
  );
}
