'use client';

// Watermelon UI "Step Indicator" (registry.watermelon.sh/r/step-indicator), adapted for Rover Run:
// controlled by the game's flow (current step + completed steps), Canva palette, tooltip below the
// bars (it sits at the top of the screen), and completed steps are clickable to go back.

import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useRef, useState, type ComponentType } from 'react';

export type Step = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

interface StepIndicatorProps {
  steps: Step[];
  /** index of the step the player is on */
  current: number;
  /** steps before this index are done (and can be revisited) */
  completed: number;
  tooltipDelay?: number;
  onStepChange?: (index: number) => void;
  className?: string;
}

export const StepIndicator = ({
  steps,
  current,
  completed,
  tooltipDelay = 0,
  onStepChange,
  className,
}: StepIndicatorProps) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [coords, setCoords] = useState({ clipPath: '', translateX: 0 });

  const measureRefs = useRef<(HTMLDivElement | null)[]>([]);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [isEntering, setIsEntering] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const calculatePosition = (index: number) => {
    const activeLabel = measureRefs.current[index];
    const activeButton = buttonRefs.current[index];
    if (!activeLabel || !activeButton) return null;

    const labelLeft = activeLabel.offsetLeft;
    const labelWidth = activeLabel.offsetWidth;
    const labelCenter = labelLeft + labelWidth / 2;
    const buttonCenter = activeButton.offsetLeft + activeButton.offsetWidth / 2;
    const totalWidth = measureRefs.current.reduce((acc, el) => acc + (el?.offsetWidth || 0), 0);

    const cLeft = (labelLeft / totalWidth) * 100;
    const cRight = 100 - ((labelLeft + labelWidth) / totalWidth) * 100;

    return {
      clipPath: `inset(0 ${cRight}% 0 ${cLeft}% round 9999px)`,
      translateX: buttonCenter - labelCenter,
    };
  };

  const handleShow = (index: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const performUpdate = () => {
      const newCoords = calculatePosition(index);
      if (newCoords) {
        setCoords(newCoords);
        setActiveIndex(index);
      }
    };
    if (activeIndex === null) {
      setIsEntering(true);
      if (tooltipDelay > 0) timeoutRef.current = setTimeout(performUpdate, tooltipDelay);
      else performUpdate();
    } else {
      setIsEntering(false);
      performUpdate();
    }
  };

  const handleHide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setActiveIndex(null);
    setCoords({ clipPath: '', translateX: 0 });
    setIsEntering(true);
  };

  const Current = steps[current]?.icon;

  return (
    <nav aria-label="Rover Run steps" className={cn('flex items-center gap-3', className)}>
      <div className="relative w-[200px] sm:w-[260px]">
        <div className="relative flex h-2.5 w-full items-center gap-2 px-0.5" onMouseLeave={handleHide}>
          <AnimatePresence>
            {activeIndex !== null && coords.clipPath !== '' && (
              <motion.div
                className="pointer-events-none absolute top-6 left-0 z-50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <motion.div
                  className="flex bg-mist shadow-lg"
                  animate={{ clipPath: coords.clipPath, x: coords.translateX }}
                  transition={{ type: 'spring', bounce: 0, duration: isEntering ? 0 : 0.4 }}
                  onUpdate={() => {
                    if (isEntering) setIsEntering(false);
                  }}
                >
                  <div className="inline-flex items-center justify-center">
                    {steps.map((step, index) => (
                      <motion.div
                        key={`real-${step.id}`}
                        animate={{
                          opacity: activeIndex === index ? 1 : 0,
                          filter: activeIndex === index ? 'blur(0px)' : 'blur(4px)',
                        }}
                        transition={{ duration: 0.4 }}
                        className="flex items-center justify-center gap-2 px-3 py-1.5 whitespace-nowrap text-night"
                      >
                        <step.icon className="size-4" />
                        <span className="text-sm font-semibold">
                          {index + 1}. {step.label}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {steps.map((step, index) => {
            const done = index < completed;
            const isCurrent = index === current;
            const clickable = done && !isCurrent && !!onStepChange;
            return (
              <button
                key={step.id}
                ref={(el) => {
                  buttonRefs.current[index] = el;
                }}
                type="button"
                aria-label={`Step ${index + 1}: ${step.label}${isCurrent ? ' (current)' : done ? ' (done)' : ''}`}
                aria-current={isCurrent ? 'step' : undefined}
                disabled={!clickable}
                onMouseEnter={() => handleShow(index)}
                onFocus={() => handleShow(index)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) handleHide();
                }}
                onClick={() => clickable && onStepChange?.(index)}
                className={cn('group relative h-2.5 flex-1 outline-none disabled:cursor-default', clickable && 'cursor-pointer')}
              >
                <div
                  className={cn(
                    'absolute inset-0 overflow-hidden rounded-full transition-colors duration-300',
                    'group-focus-visible:ring-2 group-focus-visible:ring-orange-ui group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-night',
                    done ? 'bg-orange-ui' : isCurrent ? 'bg-mist' : 'bg-white/15',
                    activeIndex === index && !done && !isCurrent && 'bg-white/30',
                  )}
                >
                  {isCurrent && (
                    <motion.div
                      className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-orange-ui/70 to-transparent"
                      initial={{ x: '-100%' }}
                      animate={{ x: '220%' }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="pointer-events-none absolute bottom-0 left-0 flex h-0 overflow-hidden whitespace-nowrap opacity-0" aria-hidden="true">
          {steps.map((step, index) => (
            <div
              key={`measure-${step.id}`}
              ref={(el) => {
                measureRefs.current[index] = el;
              }}
              className="flex items-center justify-center gap-2 px-3 py-1.5"
            >
              <step.icon className="size-4" />
              <span className="text-sm font-semibold">
                {index + 1}. {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      {Current && (
        <span className="hidden items-center gap-1.5 text-xs font-medium tracking-wide text-white/80 sm:inline-flex">
          <Current className="size-3.5 text-orange-ui" />
          <span>
            {current + 1}/{steps.length} · {steps[current].label}
          </span>
        </span>
      )}
    </nav>
  );
};
