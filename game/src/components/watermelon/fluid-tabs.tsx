'use client';

// Watermelon UI "Fluid Tabs" (registry.watermelon.sh/r/fluid-tabs), adapted for Rover Run's
// time-warp selector: controlled value, per-instance pill id, compact size, Canva palette.

import { useId, type ReactNode, type FC } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  title?: string;
}

interface FluidTabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}

export const FluidTabs: FC<FluidTabsProps> = ({ tabs, active, onChange, ariaLabel, className }) => {
  const pillId = useId();

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('relative flex items-center gap-0.5 rounded-full border border-white/10 bg-panel/90 p-1 backdrop-blur', className)}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={tab.title}
            onClick={() => onChange(tab.id)}
            className="group relative rounded-full px-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-orange-ui"
          >
            {isActive && (
              <motion.div
                layoutId={`active-pill-${pillId}`}
                transition={{ type: 'spring', stiffness: 280, damping: 25, mass: 0.8 }}
                className="absolute inset-0 rounded-full border border-white/60 bg-gradient-to-b from-mist to-[#c3c8cf] shadow-xs"
              />
            )}
            <motion.div
              transition={{ duration: 0.3, ease: 'easeOut' }}
              animate={{ filter: isActive ? ['blur(0px)', 'blur(3px)', 'blur(0px)'] : 'blur(0px)' }}
              className={cn(
                'relative z-10 flex items-center gap-1.5 text-xs font-semibold tabular-nums transition-colors duration-200',
                isActive ? 'text-night' : 'text-white/70 group-hover:text-white',
              )}
            >
              {tab.icon && (
                <motion.span animate={{ scale: isActive ? 1.05 : 1 }} className="flex shrink-0 items-center justify-center">
                  {tab.icon}
                </motion.span>
              )}
              <span className="whitespace-nowrap">{tab.label}</span>
            </motion.div>
          </button>
        );
      })}
    </div>
  );
};
