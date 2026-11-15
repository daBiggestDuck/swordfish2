import { cn } from "@/lib/utils";

/**
 * Rover Run's rover (original artwork in the Canva palette): an open-frame lunar rover with a
 * high-gain dish, camera mast, mesh wheels and a pod on the cargo bed where the pet rides.
 * Wheels spin and the body bobs while `moving`; headlights come on at night.
 */
export function Rover({
  moving,
  night,
  petSprite,
  petLabel,
  className,
}: {
  moving: boolean;
  night: boolean;
  petSprite?: string | null;
  petLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative select-none", className)} role="img" aria-label={`Rover carrying ${petLabel ?? "your pet"}${moving ? ", driving" : ", parked"}`}>
      {night && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-[44%] left-[78%] h-24 w-72 -translate-y-1/2 rounded-[50%] bg-gradient-to-r from-amber-100/45 via-amber-100/10 to-transparent blur-md"
          style={{ clipPath: "polygon(0 42%, 100% 0, 100% 100%, 0 58%)" }}
        />
      )}
      <div className={cn(moving && "animate-[rover-bob_0.9s_ease-in-out_infinite]")}>
        <svg viewBox="0 0 260 150" className="h-auto w-full overflow-visible drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)]">
          <defs>
            <linearGradient id="rr-body" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#e5e7eb" />
              <stop offset="1" stopColor="#9ca3af" />
            </linearGradient>
            <linearGradient id="rr-dish" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#f3f4f6" />
              <stop offset="1" stopColor="#94a3b8" />
            </linearGradient>
            <radialGradient id="rr-pod" cx="0.5" cy="0.4" r="0.6">
              <stop offset="0" stopColor="#1f2937" />
              <stop offset="1" stopColor="#0b1320" />
            </radialGradient>
          </defs>

          {/* shadow */}
          <ellipse cx="130" cy="140" rx="112" ry="7" fill="rgba(0,0,0,0.45)" />

          {/* high-gain dish + mast (front) */}
          <line x1="196" y1="72" x2="206" y2="30" stroke="#cbd5e1" strokeWidth="4" strokeLinecap="round" />
          <g transform="translate(206 26) rotate(-24)">
            <ellipse cx="0" cy="0" rx="21" ry="21" fill="url(#rr-dish)" stroke="#64748b" strokeWidth="2" />
            {[0, 30, 60, 90, 120, 150].map((a) => (
              <line key={a} x1={-20 * Math.cos((a * Math.PI) / 180)} y1={-20 * Math.sin((a * Math.PI) / 180)} x2={20 * Math.cos((a * Math.PI) / 180)} y2={20 * Math.sin((a * Math.PI) / 180)} stroke="#94a3b8" strokeWidth="1" />
            ))}
            <circle r="3.5" fill="#f97316" />
          </g>

          {/* camera mast (front) */}
          <line x1="176" y1="74" x2="168" y2="44" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
          <rect x="160" y="36" width="16" height="10" rx="2" fill="#1f2937" stroke="#cbd5e1" strokeWidth="1.5" />
          <circle cx="172" cy="41" r="2.4" fill={night ? "#fde68a" : "#f97316"} />

          {/* chassis */}
          <path d="M28 92 L44 74 L214 74 L234 92 Z" fill="url(#rr-body)" stroke="#64748b" strokeWidth="2" />
          <rect x="30" y="90" width="204" height="10" rx="3" fill="#64748b" />
          {/* console + seat frame */}
          <path d="M60 74 L66 50 L82 50 L84 74" fill="none" stroke="#cbd5e1" strokeWidth="4" strokeLinejoin="round" />
          <rect x="182" y="58" width="22" height="16" rx="3" fill="#1f2937" stroke="#cbd5e1" strokeWidth="1.5" />
          <rect x="186" y="62" width="14" height="3" rx="1" fill="#f97316" />

          {/* pet pod on the cargo bed */}
          <g>
            <rect x="96" y="66" width="70" height="10" rx="3" fill="#475569" />
            <circle cx="131" cy="44" r="27" fill="url(#rr-pod)" stroke="#f97316" strokeWidth="3" />
            <circle cx="131" cy="44" r="27" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
            {petSprite ? (
              <image href={petSprite} x="106" y="18" width="50" height="50" preserveAspectRatio="xMidYMid meet" />
            ) : (
              <circle cx="131" cy="44" r="8" fill="#f97316" />
            )}
            <path d="M112 30 Q 120 22 132 21" stroke="rgba(255,255,255,0.35)" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>

          {/* fenders */}
          <path d="M34 100 Q 62 76 92 100" fill="none" stroke="#cbd5e1" strokeWidth="5" strokeLinecap="round" />
          <path d="M168 100 Q 198 76 228 100" fill="none" stroke="#cbd5e1" strokeWidth="5" strokeLinecap="round" />

          {/* wheels */}
          {[63, 198].map((cx) => (
            <g key={cx} transform={`translate(${cx} 112)`}>
              <circle r="26" fill="#1f2937" />
              <circle r="23" fill="#64748b" stroke="#475569" strokeWidth="2" />
              <g className={cn(moving && "animate-[spin_0.8s_linear_infinite]")} style={{ transformOrigin: "0 0", transformBox: "fill-box" }}>
                {[0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5].map((a) => (
                  <line key={a} x1={-21 * Math.cos((a * Math.PI) / 180)} y1={-21 * Math.sin((a * Math.PI) / 180)} x2={21 * Math.cos((a * Math.PI) / 180)} y2={21 * Math.sin((a * Math.PI) / 180)} stroke="#cbd5e1" strokeWidth="2" />
                ))}
              </g>
              <circle r="8" fill="#d1d5db" stroke="#475569" strokeWidth="2" />
              <circle r="3" fill="#0b1320" />
            </g>
          ))}
        </svg>
      </div>
      {moving && (
        <div aria-hidden="true" className="pointer-events-none absolute bottom-1 -left-6 flex gap-1 opacity-70">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-3 rounded-full bg-mist/50 blur-[2px]" style={{ animation: `rover-dust 0.9s ${i * 0.25}s ease-out infinite` }} />
          ))}
        </div>
      )}
    </div>
  );
}
