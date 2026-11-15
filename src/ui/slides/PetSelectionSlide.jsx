import React, { useEffect, useMemo, useRef, useState } from "react";
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

function buildRoverFrameUrl(launch, fallbackDrop) {
  const params = new URLSearchParams();
  const pets =
    Array.isArray(launch?.pets) && launch.pets.length === 2
      ? launch.pets
      : ["lister", "ln-1"];
  params.set("pets", pets.join(","));
  const site =
    launch?.site ||
    (fallbackDrop?.matchedKnownSite ? fallbackDrop.id : fallbackDrop?.nearestSiteId) ||
    "";
  if (site) params.set("site", String(site));
  const lat = launch?.lat ?? fallbackDrop?.lat;
  const lon = launch?.lon ?? fallbackDrop?.lon;
  if (Number.isFinite(Number(lat))) params.set("lat", Number(lat).toFixed(4));
  if (Number.isFinite(Number(lon))) params.set("lon", Number(lon).toFixed(4));
  const dropName =
    launch?.dropName || (fallbackDrop ? formatDropDisplayTitle(fallbackDrop) : "");
  if (dropName) params.set("dropName", dropName);
  params.set("from", "map");
  return `./story/rover.html?${params.toString()}`;
}

export function PetSelectionSlide({ selectedDrop, onBackToMap }) {
  const effectiveDrop = useMemo(() => selectedDrop || readStoredDrop(), [selectedDrop]);
  const [viewMode, setViewMode] = useState("pets");
  const [roverLaunch, setRoverLaunch] = useState(null);
  const [frameReady, setFrameReady] = useState(false);
  const iframeRef = useRef(null);

  const gameFrameUrl = useMemo(() => buildGameFrameUrl(effectiveDrop), [effectiveDrop]);
  const roverFrameUrl = useMemo(
    () => buildRoverFrameUrl(roverLaunch, effectiveDrop),
    [roverLaunch, effectiveDrop],
  );
  const activeUrl = viewMode === "rover3d" ? roverFrameUrl : gameFrameUrl;

  const coordText = effectiveDrop
    ? formatCoordinates(effectiveDrop.lat, effectiveDrop.lon)
    : "South Pole · Default";

  useEffect(() => {
    setViewMode("pets");
    setRoverLaunch(null);
  }, [gameFrameUrl]);

  useEffect(() => {
    setFrameReady(false);
  }, [activeUrl]);

  useEffect(() => {
    const onMessage = (event) => {
      const msg = event?.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "payloadpets:back-to-map") {
        onBackToMap();
      } else if (msg.type === "payloadpets:launch-rover-3d") {
        setRoverLaunch({
          pets: msg.pets,
          site: msg.site,
          lat: msg.lat,
          lon: msg.lon,
          dropName: msg.dropName,
        });
        setViewMode("rover3d");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onBackToMap]);

  const handleFrameLoad = () => {
    setFrameReady(true);
    try {
      iframeRef.current?.contentWindow?.focus();
    } catch {
      // Cross-origin guard; local same-origin frames allow focus directly.
    }
  };

  return (
    <motion.section
      key="slide-pets"
      aria-label={
        viewMode === "rover3d"
          ? "3D Lunar Rover Surface Story"
          : "Payload Pet Selection & Rover Run"
      }
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-30 overflow-hidden bg-[#0B1320] text-[#D1D4DB]"
    >
      <iframe
        ref={iframeRef}
        key={activeUrl}
        title={
          viewMode === "rover3d"
            ? "Payload Pets — 3D Lunar Rover Drive"
            : "Payload Pets — Choose Pet & Rover Run"
        }
        src={activeUrl}
        onLoad={handleFrameLoad}
        className="h-full w-full border-0 bg-[#0B1320]"
        allow="autoplay"
      />

      {viewMode === "rover3d" && (
        <div className="fixed top-3 left-3 z-40 flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setViewMode("pets")}
            className="h-8 cursor-pointer rounded-full border-[#64748B]/50 bg-[#0B1320]/85 px-3 text-xs text-[#D1D4DB] backdrop-blur-md hover:border-[#F97216] hover:bg-[#202938]"
          >
            <ArrowLeft className="mr-1 size-3.5 text-[#F97216]" />
            Pets
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBackToMap}
            className="h-8 cursor-pointer rounded-full border-[#64748B]/50 bg-[#0B1320]/85 px-3 text-xs text-[#D1D4DB] backdrop-blur-md hover:border-[#F97216] hover:bg-[#202938]"
          >
            <MapPin className="mr-1 size-3.5 text-[#F97216]" />
            Map
          </Button>
        </div>
      )}

      {!frameReady && (
        <div className="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#0B1320] px-6 text-center">
          <div className="flex items-center gap-2.5 rounded-full border border-[#64748B]/40 bg-[#202938]/90 px-4 py-2 text-sm text-[#D1D4DB]">
            <Loader2 className="size-4 animate-spin text-[#F97216]" />
            <span>
              {viewMode === "rover3d"
                ? "Launching 3D Lunar Rover Surface Drive…"
                : "Loading Pet Selection & Rover Run…"}
            </span>
          </div>
          <Badge variant="secondary" className="bg-[#202938] font-mono text-xs text-[#F97216]">
            <MapPin className="mr-1.5 size-3 text-[#F97216]" />
            {coordText}
          </Badge>
          <Button
            type="button"
            variant="outline"
            onClick={viewMode === "rover3d" ? () => setViewMode("pets") : onBackToMap}
            className="mt-2 cursor-pointer rounded-full border-[#64748B]/45 bg-[#0B1320] px-4 text-xs text-[#D1D4DB] hover:border-[#F97216] hover:bg-[#202938]"
          >
            <ArrowLeft className="mr-1.5 size-3.5" />
            {viewMode === "rover3d" ? "Back to Pet Selection" : "Back to Moon Map"}
          </Button>
        </div>
      )}
    </motion.section>
  );
}
