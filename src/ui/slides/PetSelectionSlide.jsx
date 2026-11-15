import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCoordinates, formatDropDisplayTitle } from "@/lib/moon-bridge";

function readStoredDrop() {
  try {
    const raw = localStorage.getItem("payloadPets.selectedDrop");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function buildGameFrameUrl(drop) {
  const params = new URLSearchParams();
  params.set("from", "map");
  params.set("phase", "pet");
  if (drop) {
    const siteId = drop.matchedKnownSite ? drop.id : drop.nearestSiteId || "";
    if (siteId) params.set("site", String(siteId));
    if (Number.isFinite(Number(drop.lat))) params.set("lat", Number(drop.lat).toFixed(4));
    if (Number.isFinite(Number(drop.lon))) params.set("lon", Number(drop.lon).toFixed(4));
    const displayTitle = formatDropDisplayTitle(drop);
    if (displayTitle) params.set("dropName", displayTitle);
  }
  return `./game/index.html?${params.toString()}`;
}

export function PetSelectionSlide({ selectedDrop, onBackToMap }) {
  const effectiveDrop = useMemo(() => selectedDrop || readStoredDrop(), [selectedDrop]);
  const [frameReady, setFrameReady] = useState(false);

  const frameUrl = useMemo(() => buildGameFrameUrl(effectiveDrop), [effectiveDrop]);
  const coordText = effectiveDrop
    ? formatCoordinates(effectiveDrop.lat, effectiveDrop.lon)
    : "South Pole · Default";

  useEffect(() => {
    setFrameReady(false);
  }, [frameUrl]);

  useEffect(() => {
    const onMessage = (event) => {
      if (event?.data?.type === "payloadpets:back-to-map") {
        onBackToMap();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onBackToMap]);

  return (
    <motion.section
      key="slide-pets"
      aria-label="Payload Pet Selection & Rover Run"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-30 overflow-hidden bg-[#0B1320] text-[#D1D4DB]"
    >
      <iframe
        title="Payload Pets — Choose Pet & Rover Run"
        src={frameUrl}
        onLoad={() => setFrameReady(true)}
        className="h-full w-full border-0 bg-[#0B1320]"
        allow="autoplay"
      />

      {!frameReady && (
        <div className="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#0B1320] px-6 text-center">
          <div className="flex items-center gap-2.5 rounded-full border border-[#64748B]/40 bg-[#202938]/90 px-4 py-2 text-sm text-[#D1D4DB]">
            <Loader2 className="size-4 animate-spin text-[#F97216]" />
            <span>Loading Pet Selection &amp; Rover Run…</span>
          </div>
          <Badge variant="secondary" className="bg-[#202938] font-mono text-xs text-[#F97216]">
            <MapPin className="mr-1.5 size-3 text-[#F97216]" />
            {coordText}
          </Badge>
          <Button
            type="button"
            variant="outline"
            onClick={onBackToMap}
            className="mt-2 cursor-pointer rounded-full border-[#64748B]/45 bg-[#0B1320] px-4 text-xs text-[#D1D4DB] hover:border-[#F97216] hover:bg-[#202938]"
          >
            <ArrowLeft className="mr-1.5 size-3.5" />
            Back to Moon Map
          </Button>
        </div>
      )}
    </motion.section>
  );
}
