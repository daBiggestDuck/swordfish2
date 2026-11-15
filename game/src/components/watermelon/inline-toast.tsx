'use client';

// Watermelon UI "Inline Toast" (registry.watermelon.sh/r/inline-toast), adapted for Rover Run:
// copies the run summary instead of a code, falls back when the clipboard is blocked, Canva palette.

import { useState, type FC } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CircleCheck, CircleAlert } from 'lucide-react';

export interface InlineCopyToastProps {
  /** text placed on the clipboard */
  code: string;
  /** what the pill shows before copying */
  label: string;
  copyDuration?: number;
}

export const InlineToast: FC<InlineCopyToastProps> = ({ code, label, copyDuration = 2000 }) => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), copyDuration);
  };

  return (
    <motion.div
      layout="position"
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className="relative flex h-12 min-w-[280px] items-center justify-center overflow-hidden rounded-full border border-night/10 bg-white/70 pr-1.5 pl-5 shadow-sm"
    >
      <AnimatePresence>
        {state !== 'idle' && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '0%' }}
            transition={{ duration: copyDuration / 1000, ease: 'linear' }}
            className="absolute inset-0 bg-orange-ui/15"
          />
        )}
      </AnimatePresence>

      <div className="z-10 flex w-full items-center justify-between gap-5">
        <AnimatePresence mode="popLayout">
          {state === 'idle' ? (
            <motion.div
              key="copy"
              initial={{ opacity: 0, filter: 'blur(4px)', scale: 0.95 }}
              animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
              exit={{ opacity: 0, filter: 'blur(4px)', scale: 0.95 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              className="flex w-full items-center justify-between gap-4"
            >
              <span className="text-sm font-semibold text-ink-2">{label}</span>
              <motion.button
                type="button"
                onClick={handleCopy}
                whileHover={{ y: -1, scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 350, damping: 18 }}
                className="relative overflow-hidden rounded-full bg-night px-5 py-2 text-sm font-semibold text-mist shadow-[0_6px_12px_rgba(0,0,0,0.12)]"
              >
                <motion.span
                  initial={{ x: '-120%' }}
                  whileHover={{ x: '120%' }}
                  transition={{ duration: 0.6, ease: 'easeInOut' }}
                  className="pointer-events-none absolute inset-0 bg-linear-to-r from-transparent via-white/15 to-transparent"
                />
                <span className="relative z-10">Copy</span>
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key={state}
              role="status"
              initial={{ opacity: 0, filter: 'blur(4px)', scale: 1.1 }}
              animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
              exit={{ opacity: 0, filter: 'blur(4px)', scale: 1.1 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              className="flex w-full items-center justify-center gap-2 text-night"
            >
              {state === 'copied' ? <CircleCheck className="size-5 text-good" /> : <CircleAlert className="size-5 text-bad" />}
              <span className="text-sm font-bold">{state === 'copied' ? 'Run summary copied!' : 'Clipboard blocked by the browser'}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
