import React from "react";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LandingSlide({ onStart }) {
  return (
    <motion.section
      key="slide-landing"
      aria-label="Payload Pets Introduction"
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -36, transition: { duration: 0.22, ease: "easeOut" } }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none fixed inset-0 z-20 flex items-center"
    >
      <div className="pointer-events-auto flex w-full max-w-[560px] flex-col justify-between gap-8 px-8 py-12 sm:px-14 md:py-16">
        <div className="space-y-6">
          {/* Slide 1 top steel accent bar (placeholder header mark) */}
          <div className="flex items-center gap-3 rounded-xl bg-[#D1D4DB] px-5 py-3.5 text-[#0B1320] shadow-lg">
            <span className="font-display text-sm tracking-wider uppercase sm:text-base">
              Payload Pets
            </span>
            <span className="ml-auto font-mono text-[11px] font-medium uppercase tracking-widest text-[#202938]">
              Slide 01 · Slot
            </span>
          </div>

          <div className="space-y-3 pt-2">
            <h1 className="font-display text-2xl tracking-wide text-[#D1D4DB] sm:text-3xl">
              Lunar Landing Selector
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-[#9AA4B4] sm:text-base">
              Choose your lunar drop coordinates before deploying your CLPS
              payload pet. Solar illumination, extreme temperatures, terrain
              slope, and direct-to-Earth comms are sampled straight from NASA
              LRO and JPL Horizons telemetry.
            </p>
          </div>
        </div>

        <div className="pt-4">
          <Button
            type="button"
            size="lg"
            onClick={onStart}
            className="group h-16 w-full max-w-[360px] cursor-pointer rounded-2xl border border-[#64748B]/50 bg-[#202938] font-display text-sm tracking-widest text-[#D1D4DB] shadow-[0_12px_40px_rgba(0,0,0,0.65)] transition-all hover:border-[#F97216] hover:bg-[#202938] hover:shadow-[0_12px_40px_rgba(249,114,22,0.22)] active:scale-[0.985]"
          >
            <span>Start</span>
            <ArrowRight className="ml-2.5 size-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </div>
    </motion.section>
  );
}
