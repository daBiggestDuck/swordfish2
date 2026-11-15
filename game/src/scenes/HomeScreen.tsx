import { useEffect } from "react";
import { ArrowRight, Cpu, Gauge, Sunrise, MapPinned } from "lucide-react";
import type { Catalog } from "@/engine/types";
import type { EngineKind } from "@/engine/client";
import { useMoon } from "@/components/game/MoonStage";
import { TextAnimate } from "@/components/ui/text-animate";
import { BlurFade } from "@/components/ui/blur-fade";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";

/** Canva slide 1: title bar, heading, paragraph and Start on the left; the Moon on the right. */
export function HomeScreen({
  catalog,
  engineKind,
  engineLabel,
  engineNote,
  onStart,
}: {
  catalog: Catalog;
  engineKind: EngineKind;
  engineLabel: string;
  engineNote: string | null;
  onStart: () => void;
}) {
  const moon = useMoon();
  useEffect(() => {
    moon?.setMode("home");
    moon?.setFocus(null);
    moon?.setRoute(null, null);
  }, [moon]);

  const polar = catalog.sites.filter((s) => s.lat < -60).length;

  return (
    <div className="absolute inset-0 z-20 flex items-end p-5 pb-8 sm:items-center sm:p-10 lg:p-16">
      <div className="w-full max-w-[600px] rounded-3xl bg-night/40 p-1 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none">
        <BlurFade delay={0.05} direction="down">
          <div className="inline-flex items-center gap-2 rounded-xl bg-mist px-3.5 py-2 text-night shadow-lg">
            <AnimatedShinyText className="mx-0 max-w-none text-xs font-bold tracking-[0.16em] text-night/70 uppercase">
              NASA Space Apps 2026 · Payload Pets
            </AnimatedShinyText>
          </div>
        </BlurFade>

        <TextAnimate as="h1" animation="blurInUp" by="character" once className="mt-6 font-title text-5xl leading-none text-white sm:text-7xl">
          Rover Run
        </TextAnimate>
        <BlurFade delay={0.35}>
          <p className="mt-3 text-lg font-semibold text-mist">Drive a real NASA instrument across the Moon.</p>
        </BlurFade>
        <BlurFade delay={0.5}>
          <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-white/80">
            Pick where your lander touches down, adopt one of four instruments that really flew on CLPS missions, then point the rover at a
            destination. While it drives, the Payload Pets engine runs the Moon around your pet: sunlight, battery, temperature, dust and data,
            hour by hour. Keep it alive from sunrise through the lunar night, and see how far you get.
          </p>
        </BlurFade>

        <BlurFade delay={0.65}>
          <ul className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-white/90">
            <li className="flex items-center gap-1.5 rounded-full border border-white/15 bg-panel/80 px-3 py-1.5">
              <MapPinned className="size-3.5 text-orange-ui" /> {catalog.sites.length} real sites · {polar} at the south pole
            </li>
            <li className="flex items-center gap-1.5 rounded-full border border-white/15 bg-panel/80 px-3 py-1.5">
              <Gauge className="size-3.5 text-orange-ui" /> Rover pace {catalog.rules.roverKmh.toFixed(1)} km/h (Apollo 17)
            </li>
            <li className="flex items-center gap-1.5 rounded-full border border-white/15 bg-panel/80 px-3 py-1.5">
              <Sunrise className="size-3.5 text-orange-ui" /> One lunar day = {catalog.rules.dayHours} h of sunlight
            </li>
          </ul>
        </BlurFade>

        <BlurFade delay={0.8}>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <ShimmerButton
              onClick={onStart}
              background="linear-gradient(135deg,#0b1320,#1f2937)"
              shimmerColor="#f97316"
              shimmerSize="0.09em"
              borderRadius="16px"
              className="h-14 min-w-[220px] px-8 text-lg font-bold text-white"
            >
              <span className="flex items-center gap-2">
                Start <ArrowRight className="size-5" />
              </span>
            </ShimmerButton>
            <p className="flex max-w-[34ch] items-start gap-1.5 text-xs text-white/70" role="status">
              <Cpu className={engineKind === "java" ? "mt-0.5 size-3.5 shrink-0 text-good-bright" : "mt-0.5 size-3.5 shrink-0 text-orange-ui"} />
              <span>{engineKind === "java" ? `Connected to the ${engineLabel}.` : engineNote ?? "Using the in-browser engine."}</span>
            </p>
          </div>
        </BlurFade>
      </div>
    </div>
  );
}
