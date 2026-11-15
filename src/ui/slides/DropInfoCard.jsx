import React from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  Compass,
  Loader2,
  Mountain,
  Radio,
  Rocket,
  Sun,
  Thermometer,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  extractDropMetrics,
  extractDropSiteContext,
  formatCoordinates,
  formatDropDisplayTitle,
} from "@/lib/moon-bridge";

const METRIC_ICONS = {
  sunlight: Sun,
  temperature: Thermometer,
  ground: Mountain,
  earthSignal: Radio,
};

function getStatusPillClasses(siteStatus) {
  if (siteStatus === "LANDED") {
    return "border-emerald-500/40 bg-emerald-950/70 text-emerald-300";
  }
  if (siteStatus === "NO_LANDING") {
    return "border-rose-500/40 bg-rose-950/70 text-rose-300";
  }
  if (siteStatus === "PLANNED") {
    return "border-[#F97216]/45 bg-[#F97216]/15 text-[#F97216]";
  }
  return "border-[#64748B]/45 bg-[#202938] text-[#D1D4DB]/90";
}

export function DropInfoCard({
  cardRef,
  drop,
  dataset,
  pendingCoords,
  loading = false,
  onConfirm,
  onClear,
  onPositionUpdate,
}) {
  const activeLat = drop?.lat ?? pendingCoords?.lat ?? 0;
  const activeLon = drop?.lon ?? pendingCoords?.lon ?? 0;
  const coordText = formatCoordinates(activeLat, activeLon);
  const spotTitle = formatDropDisplayTitle(drop, loading);
  const metrics = drop ? extractDropMetrics(drop) : null;
  const siteContext = drop ? extractDropSiteContext(drop, dataset) : null;

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, x: 28, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 18, scale: 0.97, transition: { duration: 0.16, ease: "easeOut" } }}
      transition={{ type: "spring", stiffness: 360, damping: 30, mass: 0.8 }}
      onAnimationComplete={onPositionUpdate}
      className="predrop-card pointer-events-auto relative w-[min(92vw,420px)] max-w-full"
    >
      <Card className="predrop-card gap-3 overflow-hidden rounded-[26px] border border-[#64748B]/45 bg-[#D1D4DB] p-3 text-[#0B1320] shadow-[0_24px_80px_rgba(0,0,0,0.88)]">
        {/* Header dark block: Coordinates + Spot Name (strictly contained, zero spillover) */}
        <CardHeader className="flex flex-row items-start justify-between gap-2.5 overflow-hidden rounded-[18px] bg-[#0B1320] px-4 py-3.5 text-[#D1D4DB] shadow-inner">
          <div className="min-w-0 flex-1 space-y-1.5 overflow-hidden">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge
                variant="secondary"
                className="max-w-full shrink whitespace-normal break-words border border-[#64748B]/45 bg-[#202938] px-2.5 py-0.5 font-mono text-[11px] tracking-wider text-[#F97216]"
              >
                <Compass className="mr-1 size-3 shrink-0 text-[#F97216]" />
                <span>{coordText}</span>
              </Badge>
              {siteContext && (
                <Badge
                  variant="secondary"
                  className={`max-w-full shrink whitespace-normal break-words border px-2 py-0.5 font-mono text-[10px] tracking-wider ${getStatusPillClasses(siteContext.siteStatus)}`}
                >
                  {siteContext.statusBadge}
                </Badge>
              )}
            </div>
            <h2 className="font-display w-full break-words whitespace-normal text-[15px] leading-snug tracking-wide text-[#D1D4DB] sm:text-base">
              {spotTitle}
            </h2>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear selected point"
            onClick={onClear}
            className="shrink-0 rounded-full text-[#9AA4B4] hover:bg-[#202938] hover:text-[#D1D4DB]"
          >
            <X className="size-4" />
          </Button>
        </CardHeader>

        {/* Body dark block: 4 core drop metrics + existing drop point / site intel */}
        <CardContent className="overflow-hidden rounded-[18px] bg-[#0B1320] p-3.5 text-[#D1D4DB] shadow-inner">
          {loading && !metrics ? (
            <div className="flex h-36 items-center justify-center gap-2.5 text-sm text-[#D1D4DB]/90">
              <Loader2 className="size-4 animate-spin text-[#F97216]" />
              <span>Evaluating NASA LOLA &amp; ephemeris data...</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                {Object.entries(metrics || {}).map(([key, item]) => {
                  const Icon = METRIC_ICONS[key] || Compass;
                  return (
                    <div
                      key={key}
                      className="min-w-0 flex flex-col justify-between gap-1 rounded-xl border border-[#64748B]/35 bg-[#202938] px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="truncate text-[10px] font-medium uppercase tracking-wider text-[#9AA4B4]">
                          {item.label}
                        </span>
                        <Icon
                          className={`size-3.5 shrink-0 ${
                            item.good ? "text-[#D1D4DB]" : "text-[#F97216]"
                          }`}
                        />
                      </div>
                      <div className="break-words text-sm font-semibold leading-tight text-[#D1D4DB]">
                        {item.value}
                      </div>
                      <div className="break-words text-[11px] leading-snug text-[#9AA4B4]">
                        {item.sub}
                      </div>
                    </div>
                  );
                })}
              </div>

              {siteContext && (
                <div className="max-h-44 space-y-2 overflow-y-auto rounded-xl border border-[#64748B]/35 bg-[#202938] px-3 py-2.5 text-xs leading-relaxed text-[#D1D4DB]/90">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#F97216]">
                      <Rocket className="size-3 shrink-0" />
                      {siteContext.kicker}
                    </span>
                    {drop?.scores?.overall != null && (
                      <span className="font-mono text-[10px] text-[#9AA4B4]">
                        Drop Score {drop.scores.overall}/100
                      </span>
                    )}
                  </div>

                  {siteContext.isOfficialSite ? (
                    <>
                      {siteContext.missions.length > 0 && (
                        <div className="space-y-1">
                          {siteContext.missions.map((m) => (
                            <div
                              key={m.id}
                              className="rounded-lg border border-[#64748B]/30 bg-[#0B1320]/60 px-2.5 py-1.5 text-[11px] text-[#D1D4DB]"
                            >
                              <div className="font-medium text-[#D1D4DB]">
                                {m.name} ({m.taskOrder}) · {m.vendor}
                              </div>
                              <div className="text-[10.5px] text-[#F97216]/90">{m.when}</div>
                              {m.note && (
                                <div className="mt-0.5 text-[10.5px] leading-snug text-[#9AA4B4]">
                                  {m.note}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {siteContext.terrainSummary && (
                        <p className="text-[11px] text-[#D1D4DB]/90">
                          <span className="font-medium text-[#D1D4DB]">Terrain: </span>
                          {siteContext.terrainSummary}
                        </p>
                      )}
                      {siteContext.scienceGoal && (
                        <p className="text-[11px] text-[#D1D4DB]/90">
                          <span className="font-medium text-[#D1D4DB]">Science: </span>
                          {siteContext.scienceGoal}
                        </p>
                      )}
                      {siteContext.nearestPsr && (
                        <p className="text-[11px] text-[#9AA4B4]">
                          <span className="font-medium text-[#D1D4DB]">Nearest Cold Trap: </span>
                          {siteContext.nearestPsr}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      {siteContext.terrainSummary && (
                        <p className="text-[11px] text-[#D1D4DB]">{siteContext.terrainSummary}</p>
                      )}
                      <p className="text-[11px] text-[#9AA4B4]">
                        {siteContext.scheduleSummary}
                      </p>
                      {siteContext.primaryNote && (
                        <p className="text-[11px] text-[#F97216]">
                          {siteContext.primaryNote}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>

        {/* Footer CTA: Select spot and proceed to Pet Selection */}
        <CardFooter className="p-0">
          <Button
            type="button"
            size="lg"
            disabled={loading || !drop}
            onClick={onConfirm}
            className="group h-12 w-full cursor-pointer rounded-[16px] bg-[#0B1320] px-5 font-display text-xs tracking-wider text-[#D1D4DB] shadow-md transition-transform hover:bg-[#202938] active:scale-[0.985] disabled:opacity-60 sm:text-sm"
          >
            <span>Proceed to Pet Selection</span>
            <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
