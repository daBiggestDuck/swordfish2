'use client';

// Watermelon UI "Labeled Progress Indicator" (registry.watermelon.sh/r/labeled-progress-indicator),
// adapted for Rover Run's route bar: progress is a 0..1 number from the engine's trip, labels rotate
// through live trip facts, and colours follow the Canva palette.

import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, type FC } from 'react';
import { cn } from '@/lib/utils';

export interface LabeledProgressIndicatorProps {
  labels: string[];
  /** 0..1 */
  progress: number;
  intervalMs?: number;
  paused?: boolean;
  className?: string;
}

export const LabeledProgressIndicator: FC<LabeledProgressIndicatorProps> = ({
  labels,
  progress,
  intervalMs = 2600,
  paused = false,
  className,
}) => {
  const [labelIndex, setLabelIndex] = useState(0);
  const count = labels.length;

  useEffect(() => {
    if (count < 2) return;
    const interval = setInterval(() => setLabelIndex((prev) => (prev + 1) % count), intervalMs);
    return () => clearInterval(interval);
  }, [count, intervalMs]);

  const label = labels[labelIndex % Math.max(1, count)] ?? '';
  const pct = `${Math.round(Math.max(0, Math.min(1, progress)) * 1000) / 10}%`;

  return (
    <div className={cn('flex w-full flex-col gap-2', className)}>
      <div className="relative flex h-5 w-full items-center justify-center overflow-hidden perspective-[800px] transform-3d">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={labelIndex + label}
            initial={{ opacity: 0, y: 8, scale: 1.4, filter: 'blur(4px)', rotateX: -60 }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', rotateX: 0 }}
            exit={{ opacity: 0, filter: 'blur(4px)', rotateX: 90, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 600, damping: 100, mass: 10 }}
            className="flex w-full items-center justify-center text-sm font-semibold text-night will-change-transform transform-3d"
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </div>

      <div
        className="h-3 w-full overflow-hidden rounded-full border border-night/10 bg-night/10 shadow-inner"
        role="progressbar"
        aria-label="Trip progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <motion.div
          initial={false}
          animate={{ width: pct }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative h-full overflow-hidden rounded-full bg-orange-ui"
        >
          {!paused && (
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: '200%' }}
              transition={{ duration: intervalMs / 1000, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-y-0 w-full bg-linear-to-r from-transparent via-amber-200/80 to-transparent"
            />
          )}
        </motion.div>
      </div>
    </div>
  );
};
