import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  LunarGlobeGL,
  evaluateDropCoordinates,
  getInitialDataset,
  getPrimarySiteStatus,
  loadMoonBootstrap,
} from "@/lib/moon-bridge";

const STATUS_COLORS = {
  LANDED: "#45d48a",
  NO_LANDING: "#ff6b6b",
  PLANNED: "#F97216",
};

function getSiteLabelOffset(siteId) {
  if (siteId === "SINUS_VISCOSITATIS") {
    return { dx: -9, dy: 9, anchor: "end" };
  }
  if (siteId === "GRUITHUISEN_DOMES") {
    return { dx: 9, dy: -5, anchor: "start" };
  }
  if (siteId === "SHACKLETON_RIM") {
    return { dx: 9, dy: -5, anchor: "start" };
  }
  return { dx: 9, dy: 4, anchor: "start" };
}

export function MoonGlobeViewport({
  slide,
  selectedDrop,
  pendingCoords,
  cardRef,
  onSelectCoordinates,
  onResetSelection,
  onDatasetReady,
  overlaySignal = 0,
}) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const globeRef = useRef(null);
  const selectHandlerRef = useRef(onSelectCoordinates);
  selectHandlerRef.current = onSelectCoordinates;

  const datasetRef = useRef(getInitialDataset());
  const selectedDropRef = useRef(selectedDrop);
  selectedDropRef.current = selectedDrop;

  const markerDownRef = useRef(null);
  const [hoveredSiteId, setHoveredSiteId] = useState(null);
  const [overlayGeom, setOverlayGeom] = useState({ pin: null, sites: [] });

  const activeCoords = selectedDrop
    ? { lat: Number(selectedDrop.lat), lon: Number(selectedDrop.lon) }
    : pendingCoords
      ? { lat: Number(pendingCoords.lat), lon: Number(pendingCoords.lon) }
      : null;
  const activeCoordsRef = useRef(activeCoords);
  activeCoordsRef.current = activeCoords;

  const slideRef = useRef(slide);
  slideRef.current = slide;

  const computeOverlayGeometry = useCallback(() => {
    const globe = globeRef.current;
    const stageEl = stageRef.current;

    if (!globe || !stageEl || slideRef.current !== "map") {
      setOverlayGeom({ pin: null, sites: [] });
      return;
    }

    const activeDataset = datasetRef.current || {};
    const missions = activeDataset.missions || [];
    const currentDrop = selectedDropRef.current;
    const selectedSiteId =
      currentDrop?.matchedKnownSite
        ? currentDrop.nearestSiteId || currentDrop.id
        : null;

    const sites = [];
    for (const site of activeDataset.sites || []) {
      const pt = globe.latLonToScreen(site.lat, site.lon);
      if (!pt || !pt.visible || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
      const status = getPrimarySiteStatus(site.id, missions);
      const labelPos = getSiteLabelOffset(site.id);
      const selected =
        Boolean(selectedSiteId && site.id === selectedSiteId) ||
        Boolean(
          activeCoordsRef.current &&
            Math.abs(activeCoordsRef.current.lat - site.lat) < 0.08 &&
            Math.abs(activeCoordsRef.current.lon - site.lon) < 0.08
        );
      sites.push({
        id: site.id,
        shortName: site.shortName || site.name,
        lat: site.lat,
        lon: site.lon,
        x: pt.x,
        y: pt.y,
        status,
        color: STATUS_COLORS[status] || STATUS_COLORS.PLANNED,
        selected,
        ...labelPos,
      });
    }

    let pin = null;
    const coords = activeCoordsRef.current;
    if (coords) {
      const pt = globe.latLonToScreen(coords.lat, coords.lon);
      if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
        const pinX = pt.x;
        const pinY = pt.y;
        const visible = Boolean(pt.visible);

        const cardEl = cardRef?.current;
        if (cardEl && visible) {
          const stageRect = stageEl.getBoundingClientRect();
          const cardRect = cardEl.getBoundingClientRect();
          if (cardRect.width > 0 && cardRect.height > 0) {
            const cardLeft = cardRect.left - stageRect.left;
            const cardTop = cardRect.top - stageRect.top;
            const isBottomDock =
              window.innerWidth < 768 && cardTop > stageRect.height * 0.45;
            const endX = isBottomDock ? cardLeft + cardRect.width * 0.5 : cardLeft + 4;
            const endY = isBottomDock ? cardTop + 4 : cardTop + 34;
            pin = {
              pinX,
              pinY,
              visible,
              line: { x1: pinX, y1: pinY, x2: endX, y2: endY },
            };
          } else {
            pin = { pinX, pinY, visible, line: null };
          }
        } else {
          pin = { pinX, pinY, visible, line: null };
        }
      }
    }

    setOverlayGeom({ pin, sites });
  }, [cardRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let disposed = false;
    const initialData = getInitialDataset();
    datasetRef.current = initialData;
    onDatasetReady?.(initialData);

    const globe = new LunarGlobeGL(canvas, {
      sites: initialData.sites || [],
      psrZones: initialData.psrZones || [],
      quickmap: initialData.quickmap || null,
      dragEnabled: slideRef.current === "map",
      zoomEnabled: slideRef.current === "map",
      parallaxOnSphere: slideRef.current === "landing",
      onSelectPoint: ({ lat, lon, siteId }) => {
        if (slideRef.current !== "map") return;
        if (siteId) {
          const matched = (datasetRef.current?.sites || []).find((s) => s.id === siteId);
          if (matched) {
            selectHandlerRef.current?.(matched.lat, matched.lon);
            return;
          }
        }
        selectHandlerRef.current?.(lat, lon);
      },
      onViewChange: () => {
        computeOverlayGeometry();
      },
      onTextureLoad: () => {
        computeOverlayGeometry();
      },
    });

    // Preserve the signature Lunar POM + crater rim shadow + terminator shader
    globe.setLayers({ showTerminator: true, showGraticule: false });

    const initialEp = (initialData.ephemeris || [])[141] || initialData.ephemeris?.[0];
    if (initialEp) {
      globe.setSunAndEarth(
        initialEp.sunSubLat,
        initialEp.sunSubLon,
        initialEp.obsSubLat,
        initialEp.obsSubLon
      );
    }
    globe.resetView();
    globeRef.current = globe;
    computeOverlayGeometry();

    const handleResize = () => {
      globe.resize();
      computeOverlayGeometry();
    };

    const ro = new ResizeObserver(handleResize);
    if (stageRef.current) ro.observe(stageRef.current);
    window.addEventListener("resize", handleResize);

    loadMoonBootstrap()
      .then((boot) => {
        if (disposed) return;
        if (boot.data) {
          datasetRef.current = boot.data;
          onDatasetReady?.(boot.data);
        }
        const ep = boot.ephemerisSample;
        if (ep) {
          globe.setSunAndEarth(ep.sunSubLat, ep.sunSubLon, ep.obsSubLat, ep.obsSubLon);
        }
        computeOverlayGeometry();
      })
      .catch(() => {
        // Initial synchronous dataset + shaders remain active.
      });

    return () => {
      disposed = true;
      ro.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [computeOverlayGeometry, onDatasetReady]);

  // Keep SVG connector anchored accurately whenever DropInfoCard resizes or animates
  useEffect(() => {
    const cardEl = cardRef?.current;
    if (!cardEl || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => computeOverlayGeometry());
    ro.observe(cardEl);
    return () => ro.disconnect();
  }, [cardRef, selectedDrop, computeOverlayGeometry]);

  // Synchronize globe interaction mode, idle spin, highlight + focus across slides
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return undefined;

    const isLandingSlide = slide === "landing";
    const isMapSlide = slide === "map";
    globe.dragEnabled = isMapSlide;
    globe.zoomEnabled = isMapSlide;
    globe.parallaxOnSphere = isLandingSlide;

    if (isLandingSlide) {
      globe.setStagedPoint(null, null);
      globe.resetView();
      globe.distance = 3.6;
      globe.resize();

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let rafId = 0;
      const spin = () => {
        if (slideRef.current !== "landing") return;
        globe.yaw += 0.00035;
        globe.render();
        rafId = requestAnimationFrame(spin);
      };
      if (!reduceMotion) {
        rafId = requestAnimationFrame(spin);
      } else {
        globe.render();
      }
      return () => {
        if (rafId) cancelAnimationFrame(rafId);
      };
    }

    if (globe.distance > 3.1) {
      globe.distance = 2.68;
    }
    globe.resize();

    if (isMapSlide && activeCoords) {
      globe.setStagedPoint(activeCoords.lat, activeCoords.lon);
      globe.focusLatLon(activeCoords.lat, activeCoords.lon, {
        duration: 360,
        yawOffsetRad: window.innerWidth >= 768 ? 0.24 : 0,
        animate: true,
      });
    } else {
      globe.setStagedPoint(null, null);
    }

    let rafId = 0;
    const start = performance.now();
    const tick = (now) => {
      computeOverlayGeometry();
      if (now - start < 680) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [slide, activeCoords?.lat, activeCoords?.lon, overlaySignal, computeOverlayGeometry]);

  // Allow ESC to clear selection back to fullscreen map
  useEffect(() => {
    if (slide !== "map") return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onResetSelection?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [slide, onResetSelection]);

  const isLanding = slide === "landing";
  const pinGeom = overlayGeom.pin;

  return (
    <div
      ref={stageRef}
      aria-label="Interactive 3D Lunar Moon Map"
      className={`fixed bg-[#0B1320] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isLanding
          ? "top-1/2 left-[-18vw] h-[100vh] w-[180vw] -translate-y-1/2"
          : "top-0 left-0 h-[100vh] w-[100vw] translate-y-0"
      } ${slide === "pets" ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <canvas
        ref={canvasRef}
        className={`lunar-globe-canvas ${
          slide === "map"
            ? "cursor-crosshair active:cursor-grabbing"
            : "cursor-default"
        }`}
      />

      <svg
        id="globe-overlay"
        aria-label="Lunar landing sites and drop selector overlay"
        className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible select-none"
      >
        {/* Existing NASA CLPS / Artemis Drop Points */}
        {slide === "map" &&
          overlayGeom.sites.map((site) => {
            const isHovered = hoveredSiteId === site.id;
            const highlighted = site.selected || isHovered;
            return (
              <g
                key={site.id}
                data-site-id={site.id}
                className="pointer-events-auto cursor-pointer"
                onMouseEnter={() => setHoveredSiteId(site.id)}
                onMouseLeave={() =>
                  setHoveredSiteId((prev) => (prev === site.id ? null : prev))
                }
                onPointerDown={(e) => {
                  markerDownRef.current = {
                    id: site.id,
                    x: e.clientX,
                    y: e.clientY,
                  };
                }}
                onPointerUp={(e) => {
                  const down = markerDownRef.current;
                  markerDownRef.current = null;
                  if (
                    down &&
                    down.id === site.id &&
                    Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 5
                  ) {
                    e.stopPropagation();
                    selectHandlerRef.current?.(site.lat, site.lon);
                  }
                }}
              >
                {/* Invisible hit-target buffer for effortless pointing without blocking drags */}
                <circle cx={site.x} cy={site.y} r="13" fill="transparent" />
                {highlighted && (
                  <circle
                    cx={site.x}
                    cy={site.y}
                    r="10.5"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    strokeOpacity="0.9"
                  />
                )}
                <circle
                  cx={site.x}
                  cy={site.y}
                  r={highlighted ? 6.2 : 4.8}
                  fill={site.color}
                  stroke="#0B1320"
                  strokeWidth="1.6"
                />
                <text
                  x={site.x + site.dx}
                  y={site.y + site.dy}
                  textAnchor={site.anchor}
                  fill={highlighted ? "#ffffff" : "#D1D4DB"}
                  fontSize="11.5"
                  fontWeight={highlighted ? "700" : "500"}
                  style={{
                    fontFamily: "var(--font-sans)",
                    paintOrder: "stroke",
                    stroke: "#0B1320",
                    strokeWidth: "3.5px",
                    strokeLinejoin: "round",
                  }}
                >
                  {site.shortName}
                </text>
              </g>
            );
          })}

        {/* Active Drop Pin & Dynamic Leader Connector to DropInfoCard */}
        {pinGeom?.visible && (
          <>
            {pinGeom.line && (
              <>
                <line
                  x1={pinGeom.line.x1}
                  y1={pinGeom.line.y1}
                  x2={pinGeom.line.x2}
                  y2={pinGeom.line.y2}
                  stroke="#D1D4DB"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle
                  cx={pinGeom.line.x2}
                  cy={pinGeom.line.y2}
                  r="4"
                  fill="#D1D4DB"
                />
              </>
            )}
            <circle
              cx={pinGeom.pinX}
              cy={pinGeom.pinY}
              r="18"
              fill="none"
              stroke="#F97216"
              strokeWidth="1.5"
              className="pin-pulse-ring"
            />
            <circle
              cx={pinGeom.pinX}
              cy={pinGeom.pinY}
              r="10.5"
              fill="#0B1320"
              stroke="#F97216"
              strokeWidth="2.5"
            />
          </>
        )}
      </svg>
    </div>
  );
}

export { evaluateDropCoordinates };
