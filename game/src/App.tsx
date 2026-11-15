import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { connectEngine, EngineSession, LocalBackend, type EngineBackend, type EngineKind } from "@/engine/client";
import type { Catalog, EngineEvent, EngineState } from "@/engine/types";
import { MoonStage } from "@/components/game/MoonStage";
import { TopBar } from "@/components/game/TopBar";
import { SourcesSheet } from "@/components/game/SourcesSheet";
import { usePetSprite } from "@/components/game/PetVisuals";
import { Particles } from "@/components/ui/particles";
import { HomeScreen } from "@/scenes/HomeScreen";
import { SiteScreen } from "@/scenes/SiteScreen";
import { PetScreen } from "@/scenes/PetScreen";
import { DriveScreen } from "@/scenes/DriveScreen";
import { EndScreen, type Outcome } from "@/scenes/EndScreen";
import type { LegInfo } from "@/scenes/ArrivalCard";
import { describeEvent, type FeedItem } from "@/lib/events";
import { modelMood } from "@/lib/pets";

type Phase = "boot" | "home" | "land" | "pet" | "destination" | "drive" | "arrived" | "over";

const TICK_MS = 180;
const STEP_OF: Partial<Record<Phase, number>> = { land: 0, pet: 1, destination: 2, drive: 3, arrived: 3 };

interface LaunchContext {
  fromMap: boolean;
  phase: Phase | null;
  siteId: string | null;
  lat: number | null;
  lon: number | null;
  dropName: string | null;
}

function readLaunchContext(): LaunchContext {
  if (typeof window === "undefined") {
    return { fromMap: false, phase: null, siteId: null, lat: null, lon: null, dropName: null };
  }
  const params = new URLSearchParams(window.location.search);
  const phaseParam = params.get("phase");
  const latRaw = params.get("lat");
  const lonRaw = params.get("lon");
  const latNum = latRaw !== null && latRaw !== "" ? Number(latRaw) : NaN;
  const lonNum = lonRaw !== null && lonRaw !== "" ? Number(lonRaw) : NaN;
  return {
    fromMap: params.get("from") === "map",
    phase: phaseParam === "pet" || phaseParam === "land" ? phaseParam : null,
    siteId: params.get("site"),
    lat: Number.isFinite(latNum) ? latNum : null,
    lon: Number.isFinite(lonNum) ? lonNum : null,
    dropName: params.get("dropName")?.trim() || null,
  };
}

function nearestCatalogSite(catalog: Catalog, lat: number, lon: number): string {
  const rad = Math.PI / 180;
  const lat1 = lat * rad;
  let bestId = catalog.sites[0]?.id ?? "MALAPERT_A";
  let bestDist = Infinity;
  for (const site of catalog.sites) {
    const lat2 = site.lat * rad;
    const dLat = lat2 - lat1;
    const dLon = (site.lon - lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const dist = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
    if (dist < bestDist) {
      bestDist = dist;
      bestId = site.id;
    }
  }
  return bestId;
}

function formatCoordBadge(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

function nearestOther(catalog: Catalog, fromId: string): string {
  const legs = catalog.routes.filter((r) => r.from === fromId).sort((a, b) => a.distanceKm - b.distanceKm);
  return legs[0]?.to ?? catalog.sites.find((s) => s.id !== fromId)?.id ?? fromId;
}

export default function App() {
  const launch = useMemo(() => readLaunchContext(), []);
  const [phase, setPhase] = useState<Phase>("boot");
  const [backend, setBackend] = useState<EngineBackend | null>(null);
  const [engineNote, setEngineNote] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [engineKind, setEngineKind] = useState<EngineKind>("local");
  const [engineLabel, setEngineLabel] = useState("In-browser engine");

  const [landingId, setLandingId] = useState("MALAPERT_A");
  const [petId, setPetId] = useState("LN-1");
  const [petName, setPetName] = useState("Pip");
  const [tipped, setTipped] = useState(false);
  const [destId, setDestId] = useState("MONS_MOUTON");

  const sessionRef = useRef<EngineSession | null>(null);
  const [state, setState] = useState<EngineState | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [paused, setPaused] = useState(false);
  const [warp, setWarp] = useState("6");
  const warpRef = useRef(warp);
  warpRef.current = warp;
  const [busy, setBusy] = useState(false);
  const [lastLeg, setLastLeg] = useState<LegInfo | null>(null);
  const [visited, setVisited] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<Outcome>("ended");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const feedSeq = useRef(0);

  // ---------------------------------------------------------------- boot: find the engine
  useEffect(() => {
    let alive = true;
    (async () => {
      let { backend: b, note } = await connectEngine();
      let cat: Catalog;
      try {
        cat = await b.catalog();
      } catch {
        b = new LocalBackend("In-browser engine");
        note = "The Java engine stopped answering while loading. Using the in-browser copy of the same rules.";
        cat = await b.catalog();
      }
      if (!alive) return;
      setBackend(b);
      setEngineKind(b.kind);
      setEngineLabel(b.label);
      setEngineNote(note);
      setCatalog(cat);
      if (launch.siteId && cat.sites.some((s) => s.id === launch.siteId)) {
        setLandingId(launch.siteId);
      } else if (launch.lat !== null && launch.lon !== null) {
        setLandingId(nearestCatalogSite(cat, launch.lat, launch.lon));
      }
      setPhase(launch.phase ?? "home");
    })();
    return () => {
      alive = false;
    };
  }, [launch]);

  // ---------------------------------------------------------------- engine events → feed + phase
  const pushEvents = useCallback(
    (events: EngineEvent[], s: EngineState) => {
      if (!catalog || !events.length) return;
      const items: FeedItem[] = [];
      for (const e of events) {
        const d = describeEvent(e, { petId: s.pet.id, milestones: catalog.milestones, sites: catalog.sites });
        if (d) items.push({ key: `e${++feedSeq.current}`, hour: e.hour, text: d.text, tone: d.tone });
      }
      if (items.length) setFeed((f) => [...items.reverse(), ...f].slice(0, 40));
    },
    [catalog],
  );

  const finish = useCallback((s: EngineState, why: Outcome) => {
    setState(s);
    setOutcome(why);
    setPaused(true);
    setPhase("over");
  }, []);

  /** Apply one engine response; returns true when the drive loop should stop (arrived / fainted / won). */
  const apply = useCallback(
    (events: EngineEvent[], s: EngineState): boolean => {
      pushEvents(events, s);
      setState(s);
      if (!s.alive) {
        finish(s, "fainted");
        return true;
      }
      if (s.won) {
        finish(s, "won");
        return true;
      }
      if (events.some((e) => e.type === "arrived")) {
        setVisited((v) => [...v, s.site.id]);
        setDestId(nearestOther(catalog!, s.site.id));
        setPhase("arrived");
        return true;
      }
      return false;
    },
    [pushEvents, finish, catalog],
  );

  // ---------------------------------------------------------------- the drive loop
  useEffect(() => {
    if (phase !== "drive" || paused) return;
    const session = sessionRef.current;
    if (!session) return;
    let stop = false;
    let last = performance.now();
    (async () => {
      while (!stop) {
        await new Promise((r) => setTimeout(r, TICK_MS));
        if (stop) break;
        const now = performance.now();
        const dt = Math.min(0.5, (now - last) / 1000);
        last = now;
        try {
          const r = await session.tick(Number(warpRef.current) * dt);
          if (apply(r.events, r.state)) break;
        } catch (e) {
          setNotice(`Engine error: ${(e as Error).message}. Paused; press Space to retry.`);
          setPaused(true);
          break;
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [phase, paused, apply]);

  // ---------------------------------------------------------------- pause when hidden / Space toggles
  useEffect(() => {
    const onVis = () => document.hidden && setPaused(true);
    const onMsg = (e: MessageEvent) => {
      if (e.source === window.parent && e.data?.type === "shell:tab-hidden") setPaused(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || phase !== "drive") return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, button, a")) return;
      e.preventDefault();
      setPaused((p) => !p);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("message", onMsg);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("message", onMsg);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase]);

  // ---------------------------------------------------------------- actions
  const startRun = async () => {
    if (!backend || !catalog) return;
    setBusy(true);
    try {
      const session = new EngineSession(backend);
      session.setFailoverListener((msg) => {
        setNotice(msg);
        setEngineKind(session.backend.kind);
        setEngineLabel(session.backend.label);
      });
      const s = await session.start({ site: landingId, pet: petId, name: petName.trim() || "Pip", tipped });
      sessionRef.current = session;
      setEngineKind(session.backend.kind);
      setEngineLabel(session.backend.label);
      setState(s);
      setFeed([]);
      setVisited([s.site.id]);
      setLastLeg(null);
      setDestId(nearestOther(catalog, s.site.id));
      const site = catalog.sites.find((x) => x.id === s.site.id);
      setFeed([{ key: `e${++feedSeq.current}`, hour: 0, text: `${s.petName} the ${s.pet.name} touched down at ${site?.name}. Sunrise!`, tone: "big" }]);
      setPhase("destination");
    } catch (e) {
      setNotice(`Could not start the run: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const drive = async () => {
    const session = sessionRef.current;
    if (!session || !state) return;
    setBusy(true);
    try {
      const r = await session.drive(destId);
      if (!r.result.ok) {
        setNotice(r.result.error);
        return;
      }
      setLastLeg({
        from: state.site.id,
        to: destId,
        distanceKm: r.state.trip?.distanceKm ?? 0,
        hours: r.state.trip?.totalHours ?? 0,
        departHour: r.state.hour,
      });
      pushEvents(r.result.events, r.state);
      setState(r.state);
      setPaused(false);
      setPhase("drive");
    } catch (e) {
      setNotice(`Could not start the drive: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const act = async (id: string) => {
    const session = sessionRef.current;
    if (!session) return;
    setBusy(true);
    try {
      const r = await session.act(id);
      if (!r.result.ok && r.result.error) setNotice(r.result.error);
      pushEvents(r.result.events, r.state);
      setState(r.state);
    } catch (e) {
      setNotice(`Engine error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const rest = async (h: number) => {
    const session = sessionRef.current;
    if (!session) return;
    setBusy(true);
    try {
      const r = await session.tick(h);
      pushEvents(r.events, r.state);
      setState(r.state);
      if (!r.state.alive) finish(r.state, "fainted");
      else if (r.state.won) finish(r.state, "won");
    } catch (e) {
      setNotice(`Engine error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const returnToMap = useCallback(() => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "payloadpets:back-to-map" }, "*");
      return;
    }
    setPhase("land");
  }, []);

  const again = () => {
    sessionRef.current = null;
    setState(null);
    setFeed([]);
    setVisited([]);
    setLastLeg(null);
    setPaused(false);
    if (launch.fromMap && window.parent && window.parent !== window) {
      returnToMap();
      return;
    }
    setPhase("land");
  };

  // Read-only snapshot for the end-to-end test (tests/e2e.mjs compares the HUD to the engine's own state).
  useEffect(() => {
    (window as unknown as { __roverRun?: unknown }).__roverRun = {
      phase,
      engineKind,
      engineLabel,
      gameId: sessionRef.current?.id ?? null,
      state,
    };
  }, [phase, engineKind, engineLabel, state]);

  // ---------------------------------------------------------------- render
  const sprite = usePetSprite(state?.pet.id ?? petId, modelMood(state?.mood, state?.pet.passive ?? false));
  const step = STEP_OF[phase] ?? 0;
  const showSteps = phase !== "home" && phase !== "boot" && phase !== "over";
  const onStepChange = useMemo(
    () =>
      phase === "pet"
        ? (i: number) => {
            if (i === 0) {
              if (launch.fromMap) returnToMap();
              else setPhase("land");
            }
          }
        : undefined,
    [phase, launch.fromMap, returnToMap],
  );
  const dropBadge = useMemo(
    () =>
      launch.lat !== null && launch.lon !== null
        ? {
            label: launch.dropName || "Selected Drop Point",
            coords: formatCoordBadge(launch.lat, launch.lon),
          }
        : null,
    [launch],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-night">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,rgba(100,116,139,0.18),transparent_60%),radial-gradient(ellipse_at_10%_90%,rgba(249,115,22,0.08),transparent_55%)]" />
      <Particles className="absolute inset-0" quantity={160} staticity={70} ease={80} size={0.45} color="#d1d5db" />

      <MoonStage>
        {catalog && <TopBar step={step} showSteps={showSteps} onStepChange={onStepChange} onSources={() => setSourcesOpen(true)} />}

        {phase === "boot" && (
          <div className="absolute inset-0 z-30 grid place-items-center" role="status">
            <p className="flex items-center gap-2 rounded-full bg-night/80 px-4 py-2 text-sm text-white/85">
              <Loader2 className="size-4 animate-spin text-orange-ui" /> Connecting to the Payload Pets engine…
            </p>
          </div>
        )}

        {catalog && phase === "home" && (
          <HomeScreen catalog={catalog} engineKind={engineKind} engineLabel={engineLabel} engineNote={engineNote} onStart={() => setPhase("land")} />
        )}

        {catalog && phase === "land" && (
          <SiteScreen
            mode="land"
            catalog={catalog}
            state={null}
            selectedId={landingId}
            onSelect={setLandingId}
            onConfirm={() => setPhase("pet")}
            onBack={() => setPhase("home")}
          />
        )}

        {catalog && phase === "pet" && (
          <PetScreen
            catalog={catalog}
            landingId={landingId}
            petId={petId}
            name={petName}
            tipped={tipped}
            dropBadge={dropBadge}
            onPet={setPetId}
            onName={setPetName}
            onTipped={setTipped}
            onBack={() => (launch.fromMap ? returnToMap() : setPhase("land"))}
            onConfirm={startRun}
            busy={busy}
          />
        )}

        {catalog && state && phase === "destination" && (
          <SiteScreen
            mode="destination"
            catalog={catalog}
            state={state}
            selectedId={destId}
            onSelect={setDestId}
            onConfirm={drive}
            onEndRun={() => finish(state, "ended")}
            busy={busy}
          />
        )}

        {catalog && state && (phase === "drive" || phase === "arrived") && (
          <DriveScreen
            state={state}
            catalog={catalog}
            engineKind={engineKind}
            engineLabel={engineLabel}
            feed={feed}
            arrived={phase === "arrived"}
            paused={paused}
            warp={warp}
            busy={busy}
            petSprite={sprite}
            lastLeg={lastLeg}
            onTogglePause={() => setPaused((p) => !p)}
            onWarp={setWarp}
            onAct={act}
            onRest={rest}
            onNext={() => setPhase("destination")}
            onEndRun={() => finish(state, "ended")}
          />
        )}

        {catalog && state && phase === "over" && <EndScreen state={state} catalog={catalog} outcome={outcome} visited={visited} onAgain={again} />}
      </MoonStage>

      {notice && (
        <div role="alert" className="absolute top-16 left-1/2 z-50 flex max-w-[min(560px,92vw)] -translate-x-1/2 items-start gap-2 rounded-2xl border border-white/20 bg-panel/95 px-4 py-2.5 text-sm text-white shadow-xl">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="rounded p-0.5 hover:bg-white/10">
            <X className="size-4" />
          </button>
        </div>
      )}

      {catalog && <SourcesSheet catalog={catalog} open={sourcesOpen} onClose={() => setSourcesOpen(false)} engineLabel={engineLabel} />}
    </div>
  );
}
