import { useEffect, useRef, useState } from "react";
import { capturePetSprite, renderPet3D, type Pet3DHandle } from "@pets3d";
import { PET_UI } from "@/lib/pets";
import { cn } from "@/lib/utils";

/**
 * The same procedural instrument models as the Pets tab (web/pets-3d/pets3d.js), rendered as a
 * transparent sprite (no extra WebGL context). Re-renders when the mood changes.
 */
export function usePetSprite(petId: string | null | undefined, mood: string, size = 192) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!petId) return;
    let alive = true;
    const model = PET_UI[petId]?.model ?? petId;
    capturePetSprite(model, mood, { size })
      .then((r) => alive && setUrl(r.dataUrl))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [petId, mood, size]);
  return url;
}

/** Live, slowly turning 3D model (shared WebGL farm, so four tiles cost one context). */
export function PetModel({ petId, mood = "happy", className, live = false }: { petId: string; mood?: string; className?: string; live?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<Pet3DHandle | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    const model = PET_UI[petId]?.model ?? petId;
    renderPet3D(model, mood, el, { mode: live ? "live" : "shared", autoRotate: true, interactive: false, showError: false })
      .then((h) => {
        if (cancelled) h.dispose();
        else handle.current = h;
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      handle.current?.dispose();
      handle.current = null;
    };
    // mood changes are applied below without remounting
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, live]);

  useEffect(() => {
    handle.current?.update(mood);
  }, [mood]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div ref={host} className="absolute inset-0 [&_canvas]:!h-full [&_canvas]:!w-full" />
      {failed && <div className="absolute inset-0 grid place-items-center text-3xl" aria-hidden="true">🛰️</div>}
    </div>
  );
}
