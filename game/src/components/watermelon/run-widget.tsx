'use client';

// Watermelon UI "Run Widget" (registry.watermelon.sh/r/run-widget), adapted into Rover Run's odometer:
// the number is the engine's kmDriven (NumberFlow digits roll as it changes) and the tick ruler slides
// under the needle as the rover drives instead of being dragged.

import { useEffect } from 'react';
import { motion, useSpring } from 'motion/react';
import NumberFlow from '@number-flow/react';
import { Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';

const TICK_GAP = 10;
const TICK_W = 3;
const PX_PER_KM = (TICK_GAP + TICK_W) / 5; // one tick every 5 km

export interface RunWidgetProps {
  km: number;
  kmh: number;
  legs: number;
  className?: string;
}

export const RunWidget = ({ km, kmh, legs, className }: RunWidgetProps) => {
  const x = useSpring(0, { stiffness: 120, damping: 24 });

  useEffect(() => {
    // loop the ruler every 100 ticks so it never runs out
    const span = 100 * (TICK_GAP + TICK_W);
    x.set(-((km * PX_PER_KM) % span));
  }, [km, x]);

  return (
    <div className={cn('relative flex w-[220px] flex-col overflow-hidden rounded-2xl border border-white/60 bg-mist p-3 text-night shadow-lg', className)}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-baseline gap-1">
            <NumberFlow
              value={Math.round(km * 10) / 10}
              format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
              className="font-title text-3xl leading-none tabular-nums"
            />
            <span className="text-sm font-semibold text-ink-2">km</span>
          </div>
          <span className="mt-1 block text-[11px] font-medium text-ink-2">
            odometer · {legs} {legs === 1 ? 'leg' : 'legs'} done
          </span>
        </div>
        <span className="flex items-center gap-1 rounded-lg bg-night px-2 py-1 text-[11px] font-semibold text-mist" title="Apollo 17 rover average: 35.9 km in 4 h 26 min">
          <Gauge className="size-3.5 text-orange-ui" />
          {kmh.toFixed(1)} km/h
        </span>
      </div>

      <div className="relative -mx-3 mt-2 flex h-9 items-center" aria-hidden="true">
        <div className="absolute left-1/2 z-10 h-7 w-[3px] -translate-x-1/2 rounded-full bg-orange-ui" />
        <motion.div style={{ x, left: '50%' }} className="absolute flex items-center">
          <div className="flex items-center" style={{ gap: TICK_GAP }}>
            {Array.from({ length: 260 }, (_, i) => (
              <div key={i} className={cn('w-[3px] shrink-0 rounded-full', i % 5 === 0 ? 'h-6 bg-night/45' : 'h-4 bg-night/20')} />
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};
