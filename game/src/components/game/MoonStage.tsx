import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { MoonScene } from "@/three/MoonScene";
import { MOON_TEXTURES } from "@/lib/assets";

const MoonContext = createContext<MoonScene | null>(null);

export function useMoon() {
  return useContext(MoonContext);
}

/** Full-screen WebGL Moon shared by every screen, plus an overlay layer for pins, the rover and UI. */
export function MoonStage({ children, onReady }: { children?: ReactNode; onReady?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<MoonScene | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    let s: MoonScene;
    try {
      s = new MoonScene(canvas, {
        colorUrl: MOON_TEXTURES.color,
        normalUrl: MOON_TEXTURES.normal,
        southNormalUrl: MOON_TEXTURES.southNormal,
        onReady: () => readyRef.current?.(),
        onError: () => setFailed("Moon textures failed to load. The game still works; the globe stays plain."),
      });
    } catch {
      setFailed("This browser could not start WebGL, so the 3D Moon is off. Everything else still works.");
      readyRef.current?.();
      return;
    }
    const resize = () => {
      const r = host.getBoundingClientRect();
      s.setSize(r.width, r.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    setScene(s);
    return () => {
      ro.disconnect();
      s.dispose();
      setScene(null);
    };
  }, []);

  return (
    <MoonContext.Provider value={scene}>
      <div ref={hostRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
        {failed && (
          <p role="status" className="absolute bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-full bg-panel/90 px-3 py-1 text-xs text-white/80">
            {failed}
          </p>
        )}
        {children}
      </div>
    </MoonContext.Provider>
  );
}
