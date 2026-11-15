import { AnimatedList } from "@/components/ui/animated-list";
import type { FeedItem } from "@/lib/events";
import { cn } from "@/lib/utils";

const TONE: Record<FeedItem["tone"], string> = {
  good: "border-l-good",
  warn: "border-l-warn",
  bad: "border-l-bad",
  info: "border-l-slate-ui",
  big: "border-l-orange-ui",
};

/** Live engine events (Magic UI Animated List, live mode): newest on top, last few kept. */
export function EventFeed({ items, className }: { items: FeedItem[]; className?: string }) {
  const shown = items.slice(0, 5);
  return (
    <div className={cn("w-[min(300px,calc(100vw-2rem))]", className)} aria-live="polite" aria-label="Engine events">
      <AnimatedList live className="items-stretch gap-1.5">
        {shown.map((it, i) => (
          <div
            key={it.key}
            className={cn(
              "flex items-start gap-2 rounded-xl border border-white/10 border-l-4 bg-night/80 px-3 py-2 text-[12.5px] leading-snug text-white/90 shadow-lg backdrop-blur",
              TONE[it.tone],
              i > 2 && "opacity-70",
            )}
          >
            <span className="mt-px shrink-0 rounded bg-white/10 px-1 font-mono text-[10px] text-white/70 tabular-nums">h{Math.floor(it.hour)}</span>
            <span className={cn(it.tone === "big" && "font-semibold text-white")}>{it.text}</span>
          </div>
        ))}
      </AnimatedList>
    </div>
  );
}
