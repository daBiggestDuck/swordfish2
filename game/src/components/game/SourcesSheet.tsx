import { useEffect, useRef } from "react";
import { ExternalLink, X } from "lucide-react";
import type { Catalog } from "@/engine/types";
import { BlurFade } from "@/components/ui/blur-fade";

/** Every fact the engine uses, grouped by topic, each linked to the page that says it. */
export function SourcesSheet({ catalog, open, onClose, engineLabel }: { catalog: Catalog; open: boolean; onClose: () => void; engineLabel: string }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const index = new Map(catalog.sources.map((s, i) => [s.id, i + 1]));
  const topics = new Map<string, typeof catalog.facts>();
  for (const f of catalog.facts) {
    if (!topics.has(f.topic)) topics.set(f.topic, []);
    topics.get(f.topic)!.push(f);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-night/60 backdrop-blur-sm" onClick={onClose}>
      <BlurFade direction="left" offset={24} duration={0.3} className="h-full w-[min(560px,100vw)]">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sources-title"
          onClick={(e) => e.stopPropagation()}
          className="flex h-full flex-col overflow-hidden bg-mist text-night shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-night/10 p-5">
            <div>
              <h2 id="sources-title" className="font-title text-xl">Real data in Rover Run</h2>
              <p className="mt-1 text-sm text-ink-2">
                Every number the engine uses, with the page it comes from. Running on: <b>{engineLabel}</b>. Distances are great circles
                on a {catalog.rules.moonRadiusKm.toLocaleString()} km Moon; the rover drives at Apollo 17's average pace ({catalog.rules.roverKmh.toFixed(1)} km/h).
              </p>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close sources" className="rounded-full p-2 hover:bg-night/10">
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {[...topics.entries()].map(([topic, facts]) => (
              <section key={topic} className="mb-4">
                <h3 className="mb-1 text-xs font-bold tracking-widest text-ink-2 uppercase">{topic}</h3>
                <ul className="space-y-1.5">
                  {facts.map((f) => (
                    <li key={f.text} className="text-sm leading-snug">
                      {f.text} <sup className="font-bold text-[#c2410c]">[{index.get(f.sourceId)}]</sup>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <h3 className="mt-6 mb-2 text-xs font-bold tracking-widest text-ink-2 uppercase">Sources</h3>
            <ol className="space-y-1.5">
              {catalog.sources.map((s, i) => (
                <li key={s.id} className="text-sm">
                  <span className="mr-1 font-bold text-ink-2">{i + 1}.</span>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[#9a3412] underline underline-offset-2 hover:text-night">
                    {s.title} <ExternalLink className="size-3" />
                  </a>
                </li>
              ))}
              <li className="text-sm">
                <span className="mr-1 font-bold text-ink-2">·</span>
                Moon imagery: NASA's Scientific Visualization Studio CGI Moon Kit (LROC WAC colour, LOLA elevation) and the LOLA 240 m south-pole DEM (NASA PDS).
              </li>
            </ol>
          </div>
        </div>
      </BlurFade>
    </div>
  );
}
