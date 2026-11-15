import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from "react";
import type { SiteJson } from "@/engine/types";
import { cn } from "@/lib/utils";
import { useMoon } from "./MoonStage";

/**
 * Site pins pinned to the 3D Moon. Positions update every frame straight on the DOM (no React
 * re-render); hidden pins (far side / off-screen) fade out and stop taking clicks.
 */
export const SitePins = forwardRef<
  { pinEl: (id: string) => HTMLElement | null },
  {
    sites: SiteJson[];
    selectedId: string | null;
    roverSiteId?: string | null;
    disabledIds?: string[];
    onSelect: (id: string) => void;
    label?: (s: SiteJson) => ReactNode;
  }
>(function SitePins({ sites, selectedId, roverSiteId, disabledIds = [], onSelect, label }, ref) {
  const moon = useMoon();
  const els = useRef(new Map<string, HTMLButtonElement>());

  useImperativeHandle(ref, () => ({ pinEl: (id: string) => els.current.get(id) ?? null }), []);

  useEffect(() => {
    if (!moon) return;
    return moon.onFrame(() => {
      for (const s of sites) {
        const el = els.current.get(s.id);
        if (!el) continue;
        const p = moon.project(s.lat, s.lon);
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
        el.style.opacity = p.visible ? "1" : "0";
        el.style.pointerEvents = p.visible ? "auto" : "none";
        el.tabIndex = p.visible ? 0 : -1;
      }
    });
  }, [moon, sites]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {sites.map((s) => {
        const selected = s.id === selectedId;
        const isRover = s.id === roverSiteId;
        const disabled = disabledIds.includes(s.id);
        return (
          <button
            key={s.id}
            ref={(el) => {
              if (el) els.current.set(s.id, el);
              else els.current.delete(s.id);
            }}
            type="button"
            onClick={() => !disabled && onSelect(s.id)}
            aria-pressed={selected}
            aria-label={`${s.name}${isRover ? " (rover is here)" : ""}`}
            className="group absolute top-0 left-0 flex items-center gap-2 opacity-0 transition-opacity duration-300 focus-visible:outline-none"
          >
            <span
              className={cn(
                "relative grid size-5 place-items-center rounded-full border-2 shadow-[0_0_0_4px_rgba(11,19,32,0.45)] transition-transform group-hover:scale-125 group-focus-visible:scale-125",
                selected ? "size-6 border-white bg-orange-ui" : isRover ? "border-orange-ui bg-night" : "border-white bg-night/80",
                disabled && "opacity-50",
              )}
            >
              {selected && <span className="absolute inset-0 animate-ping rounded-full bg-orange-ui/60" />}
              {isRover && !selected && <span className="size-2 rounded-full bg-orange-ui" />}
            </span>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap shadow transition-colors",
                selected ? "bg-mist text-night" : "bg-night/75 text-white/90 group-hover:bg-night group-focus-visible:bg-night",
              )}
            >
              {label ? label(s) : s.name}
            </span>
          </button>
        );
      })}
    </div>
  );
});

/** Pins a child (the rover) to the rover's spot on the 3D surface every frame. */
export function OnRover({ children, className, offsetY = 0 }: { children: ReactNode; className?: string; offsetY?: number }) {
  const moon = useMoon();
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moon) return;
    return moon.onFrame(() => {
      const node = el.current;
      if (!node) return;
      const p = moon.roverScreen();
      node.style.transform = `translate(${p.x}px, ${p.y + offsetY}px) translate(-50%, -88%)`;
      node.style.opacity = p.visible ? "1" : "0";
    });
  }, [moon, offsetY]);
  return (
    <div ref={el} className={cn("pointer-events-none absolute top-0 left-0 z-10 opacity-0 transition-opacity duration-500", className)}>
      {children}
    </div>
  );
}
