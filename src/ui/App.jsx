import React, { useCallback, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { MoonGlobeViewport, evaluateDropCoordinates } from "@/components/MoonGlobeViewport";
import { DropInfoCard } from "@/slides/DropInfoCard";
import { LandingSlide } from "@/slides/LandingSlide";
import { PetSelectionSlide } from "@/slides/PetSelectionSlide";
import {
  buildSelectedDropPayload,
  getInitialDataset,
  persistDropSelection,
} from "@/lib/moon-bridge";

const VALID_SLIDES = new Set(["landing", "map", "pets"]);

function resolveInitialSlide(defaultSlide = "landing") {
  try {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("slide");
    if (s && VALID_SLIDES.has(s)) return s;
    const hash = window.location.hash.replace(/^#/, "");
    if (VALID_SLIDES.has(hash)) return hash;
  } catch {
    // Ignore URL parsing errors.
  }
  return VALID_SLIDES.has(defaultSlide) ? defaultSlide : "landing";
}

export function App({ initialSlide = "landing" }) {
  const [slide, setSlide] = useState(() => resolveInitialSlide(initialSlide));
  const [dataset, setDataset] = useState(() => getInitialDataset());
  const [pendingCoords, setPendingCoords] = useState(null);
  const [evaluatedDrop, setEvaluatedDrop] = useState(null);
  const [confirmedDrop, setConfirmedDrop] = useState(null);
  const [loadingDrop, setLoadingDrop] = useState(false);
  const [overlaySignal, setOverlaySignal] = useState(0);

  const cardRef = useRef(null);
  const requestSeqRef = useRef(0);

  const handleSelectCoordinates = useCallback(async (lat, lon) => {
    const seq = ++requestSeqRef.current;
    setPendingCoords({ lat, lon });
    setLoadingDrop(true);
    setOverlaySignal((n) => n + 1);

    try {
      const result = await evaluateDropCoordinates(lat, lon);
      if (seq !== requestSeqRef.current) return;
      setEvaluatedDrop(result);
    } finally {
      if (seq === requestSeqRef.current) {
        setLoadingDrop(false);
        setOverlaySignal((n) => n + 1);
      }
    }
  }, []);

  const handleClearSelection = useCallback(() => {
    requestSeqRef.current += 1;
    setPendingCoords(null);
    setEvaluatedDrop(null);
    setLoadingDrop(false);
    setOverlaySignal((n) => n + 1);
  }, []);

  const handleConfirmDrop = useCallback(() => {
    if (!evaluatedDrop) return;
    const payload = buildSelectedDropPayload(evaluatedDrop);
    persistDropSelection(payload);
    setConfirmedDrop(payload);
    setSlide("pets");
  }, [evaluatedDrop]);

  const handleCardMotionUpdate = useCallback(() => {
    setOverlaySignal((n) => n + 1);
  }, []);

  const showDropCard = slide === "map" && Boolean(evaluatedDrop || pendingCoords);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0B1320]">
      {/* Persistent interactive 3D WebGL Moon stage across Slide 1 & Slide 2 */}
      <MoonGlobeViewport
        slide={slide}
        selectedDrop={evaluatedDrop}
        pendingCoords={pendingCoords}
        cardRef={cardRef}
        overlaySignal={overlaySignal}
        onDatasetReady={setDataset}
        onSelectCoordinates={handleSelectCoordinates}
        onResetSelection={handleClearSelection}
      />

      {/* Slide 1: Frameless intro slot transitioning seamlessly into Slide 2 */}
      <AnimatePresence>
        {slide === "landing" && (
          <LandingSlide key="slide-landing" onStart={() => setSlide("map")} />
        )}
      </AnimatePresence>

      {/* Slide 2: Floating Watermelon UI Drop Info Panel (shown strictly when a point is clicked) */}
      <div className="pointer-events-none fixed inset-0 z-20 flex items-end justify-center p-4 sm:p-8 md:items-center md:justify-end md:pr-10 lg:pr-14">
        <AnimatePresence>
          {showDropCard && (
            <DropInfoCard
              key="drop-info-card"
              cardRef={cardRef}
              drop={evaluatedDrop}
              dataset={dataset}
              pendingCoords={pendingCoords}
              loading={loadingDrop}
              onConfirm={handleConfirmDrop}
              onClear={handleClearSelection}
              onPositionUpdate={handleCardMotionUpdate}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Slide 3: Pet Selection placeholder receiving confirmed coordinates */}
      <AnimatePresence>
        {slide === "pets" && (
          <PetSelectionSlide
            key="slide-pets"
            selectedDrop={confirmedDrop}
            onBackToMap={() => setSlide("map")}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

export default App;
