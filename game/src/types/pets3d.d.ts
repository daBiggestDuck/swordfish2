// Types for the team's shared pet renderer (web/pets-3d/pets3d.js, plain JS).
declare module "@pets3d" {
  export interface Pet3DHandle {
    el: HTMLElement;
    petId: string;
    mood: string;
    update(moodOrPhase: string, opts?: Record<string, unknown>): void;
    setPet(id: string): void;
    setSignal?(signal: number): void;
    dispose(): void;
  }
  export function renderPet3D(
    id: string,
    moodOrPhase: string,
    el: HTMLElement,
    options?: {
      autoRotate?: boolean;
      interactive?: boolean;
      mode?: "live" | "shared";
      transparent?: boolean;
      surface?: boolean;
      signal?: number;
      powerGlow?: boolean;
      signalStress?: boolean;
      showError?: boolean;
    },
  ): Promise<Pet3DHandle>;
  export function capturePetSprite(
    id: string,
    moodOrPhase: string,
    options?: { size?: number; signal?: number; powerGlow?: boolean; signalStress?: boolean; bust?: boolean },
  ): Promise<{ dataUrl: string; petId: string; mood: string; size: number }>;
  export function resolvePetId(id: string): string;
  export const MOODS: readonly string[];
}
