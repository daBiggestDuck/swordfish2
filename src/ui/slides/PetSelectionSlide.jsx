import React from "react";
import { motion } from "motion/react";
import { ArrowLeft, MapPin, Mountain, Radio, Sun, Thermometer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  extractDropMetrics,
  formatCoordinates,
  formatDropDisplayTitle,
} from "@/lib/moon-bridge";

const PLACEHOLDER_PET_SLOTS = [
  { id: "slot-1", title: "Slot 01", subtitle: "Thermal / Drill" },
  { id: "slot-2", title: "Slot 02", subtitle: "Reflector" },
  { id: "slot-3", title: "Slot 03", subtitle: "Dust Shield" },
  { id: "slot-4", title: "Slot 04", subtitle: "Comms Beacon" },
];

export function PetSelectionSlide({ selectedDrop, onBackToMap }) {
  const coordText = selectedDrop
    ? formatCoordinates(selectedDrop.lat, selectedDrop.lon)
    : "No coordinates selected";
  const displayName = selectedDrop ? formatDropDisplayTitle(selectedDrop) : "";
  const metrics = selectedDrop
    ? selectedDrop.metrics || extractDropMetrics(selectedDrop)
    : null;

  return (
    <motion.section
      key="slide-pets"
      aria-label="Pet Selection Placeholder"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-30 flex flex-col justify-between overflow-hidden bg-[#0B1320] text-[#D1D4DB]"
    >
      {/* Curved cratered lunar horizon dome matching Slide 3 concept */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-28%] -bottom-[52vh] h-[106vh] rounded-[100%] border-t border-[#64748B]/40 bg-[#202938] shadow-[0_-24px_90px_rgba(255,255,255,0.08)]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 50% 0%, rgba(100,116,139,0.22), rgba(11,19,32,0.72) 55%, #0B1320 88%), url('./assets/moon-nearside-lro.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "50% 25%",
        }}
      />

      {/* Top return & coordinate handoff bar (proves live Slide 2 -> Slide 3 cord flow) */}
      <div className="relative z-10 flex flex-wrap items-start justify-between gap-4 p-6 sm:p-10">
        <Button
          type="button"
          variant="outline"
          onClick={onBackToMap}
          className="cursor-pointer rounded-full border-[#64748B]/45 bg-[#0B1320]/90 px-4 text-xs font-medium tracking-wide text-[#D1D4DB] backdrop-blur-md hover:border-[#F97216] hover:bg-[#202938]"
        >
          <ArrowLeft className="mr-2 size-3.5" />
          Back to Moon Map
        </Button>

        {selectedDrop && (
          <div className="flex max-w-[min(92vw,460px)] flex-col items-end gap-2 overflow-hidden rounded-2xl border border-[#64748B]/35 bg-[#0B1320]/90 px-4 py-3 text-right backdrop-blur-md">
            <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2">
              <Badge
                variant="secondary"
                className="max-w-full whitespace-normal break-words bg-[#202938] font-mono text-[11px] text-[#F97216]"
              >
                <MapPin className="mr-1 size-3 shrink-0 text-[#F97216]" />
                {coordText}
              </Badge>
              <span className="font-display min-w-0 break-words text-sm tracking-wide text-[#D1D4DB]">
                {displayName}
              </span>
            </div>
            {metrics && (
              <div className="flex flex-wrap justify-end gap-3 text-[11px] text-[#D1D4DB]/90">
                <span className="inline-flex items-center gap-1">
                  <Sun className="size-3 text-[#F97216]" />
                  {metrics.sunlight.value}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Thermometer className="size-3 text-[#F97216]" />
                  {metrics.temperature.value}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Mountain className="size-3 text-[#F97216]" />
                  {metrics.ground.value}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Radio className="size-3 text-[#F97216]" />
                  {metrics.earthSignal.value}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom 4-slot Pet Selection Dock Placeholder (Slide 3 layout) */}
      <div className="relative z-10 mx-auto mb-8 w-full max-w-5xl px-6 sm:mb-12">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-2 text-xs text-[#D1D4DB]/90">
          <span className="font-display tracking-wider uppercase text-[#D1D4DB]">
            Slide 03 · Pet Selection Slot
          </span>
          <span className="font-mono text-[11px] text-[#9AA4B4]">
            Ready for coordinates: {coordText}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 rounded-[34px] bg-[#D1D4DB] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.8)] sm:grid-cols-4 sm:gap-6 sm:p-7">
          {PLACEHOLDER_PET_SLOTS.map((slot) => (
            <div
              key={slot.id}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[26px] border border-[#64748B]/60 bg-[#202938] p-4 text-center text-[#D1D4DB] shadow-inner transition-all hover:-translate-y-0.5 hover:border-[#F97216] hover:bg-[#0B1320] hover:ring-2 hover:ring-[#F97216]"
            >
              <span className="font-display text-xs tracking-wider uppercase sm:text-sm">
                {slot.title}
              </span>
              <span className="text-[11px] text-[#D1D4DB]">
                {slot.subtitle}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
