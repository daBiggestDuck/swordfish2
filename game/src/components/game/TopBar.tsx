import { BookOpen, Flag, Maximize2, PawPrint, MapPin, Truck } from "lucide-react";
import { StepIndicator, type Step } from "@/components/watermelon/step-indicator";
import { cn } from "@/lib/utils";

export const FLOW_STEPS: Step[] = [
  { id: "land", label: "Landing site", icon: MapPin },
  { id: "pet", label: "Payload pet", icon: PawPrint },
  { id: "destination", label: "Destination", icon: Flag },
  { id: "drive", label: "Rover drive", icon: Truck },
];

export function TopBar({
  step,
  onStepChange,
  onSources,
  showSteps,
  className,
}: {
  step: number;
  onStepChange?: (i: number) => void;
  onSources: () => void;
  showSteps: boolean;
  className?: string;
}) {
  const embedded = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  return (
    <header className={cn("pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3 sm:p-4", className)}>
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-night/70 py-1.5 pr-3 pl-1.5 backdrop-blur">
        <span className="grid size-7 place-items-center rounded-full bg-orange-ui font-title text-xs text-night">PP</span>
        <span className="font-title text-sm tracking-wide text-white">
          Rover <span className="text-orange-ui">Run</span>
        </span>
      </div>

      {showSteps && (
        <div className="pointer-events-auto hidden rounded-full border border-white/10 bg-night/70 px-4 py-2.5 backdrop-blur md:block">
          <StepIndicator steps={FLOW_STEPS} current={step} completed={step} onStepChange={onStepChange} />
        </div>
      )}

      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onSources}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-night/70 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur hover:bg-night"
        >
          <BookOpen className="size-3.5 text-orange-ui" /> Sources
        </button>
        {embedded && (
          <a
            href={location.href}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-night/70 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur hover:bg-night"
            title="Open Rover Run on its own page"
          >
            <Maximize2 className="size-3.5" /> Full screen
          </a>
        )}
      </div>
    </header>
  );
}
