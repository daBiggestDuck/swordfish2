import React, { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", damping: 26, stiffness: 140 },
  },
};

const wordVariants = {
  hidden: { opacity: 0, y: 20, rotateX: 10 },
  show: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: { type: "spring", damping: 20, stiffness: 160 },
  },
};

const HERO_WORDS = [
  { text: "CLPS", accent: false },
  { text: "PET", accent: true },
  { text: "GAME", accent: false },
];

export function LandingSlide({ onStart }) {
  const reduce = useReducedMotion();
  const startRef = useRef(null);
  const item = reduce ? { hidden: { opacity: 0 }, show: { opacity: 1 } } : itemVariants;

  useEffect(() => {
    startRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <motion.section
      key="slide-landing"
      aria-label="Payload Pets Introduction"
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -36, transition: { duration: 0.22, ease: "easeOut" } }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none fixed inset-0 z-20 flex items-center"
    >
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="pointer-events-auto flex w-full max-w-[600px] flex-col justify-between gap-6 px-7 py-10 sm:px-14 md:py-14"
      >
        <motion.div variants={item} className="space-y-5">
          {/* Top steel accent bar matching concept Slide 1 & Watermelon UI */}
          <div className="flex items-center gap-3 rounded-xl bg-[#D1D4DB] px-5 py-3 text-[#0B1320] shadow-lg">
            <span className="font-display text-sm tracking-wider uppercase sm:text-base">
              Payload Pets
            </span>
            <span className="ml-auto font-mono text-[11px] font-semibold uppercase tracking-widest text-[#202938]">
              V2 · NASA CLPS
            </span>
          </div>

          <motion.h1
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
            className="font-display pt-1 text-5xl leading-[0.96] tracking-wide uppercase text-[#D1D4DB] sm:text-6xl lg:text-7xl"
            style={{ perspective: "800px", textWrap: "balance" }}
          >
            {HERO_WORDS.map((word) => (
              <motion.span
                key={word.text}
                variants={reduce ? item : wordVariants}
                className={`mr-[0.22em] inline-block last:mr-0 ${
                  word.accent ? "text-[#F97216]" : ""
                }`}
              >
                {word.text}
              </motion.span>
            ))}
          </motion.h1>

          <motion.p
            variants={item}
            className="max-w-[34ch] text-lg font-semibold leading-snug text-[#D1D4DB] sm:text-xl"
          >
            Adopt a pet that is a real CLPS instrument, pick a lunar drop point,
            and keep it alive across one lunar day.
          </motion.p>

          <motion.p
            variants={item}
            className="max-w-[52ch] text-sm leading-relaxed text-[#9AA4B4] sm:text-base"
          >
            Ghost the Blue Ghost lander, Triddy the TRIDENT ice drill, Nodey the
            LN-1 beacon, and LISTER — pick any NASA CLPS target or custom
            coordinates, inspect LRO &amp; JPL Horizons telemetry, then launch
            your rover run.
          </motion.p>

          <motion.p
            variants={item}
            className="font-mono text-xs tracking-wide text-[#9AA4B4]"
          >
            4 payload pets · 8 NASA CLPS sites + custom coordinates · 1 Pet Passport
          </motion.p>
        </motion.div>

        <motion.div variants={item} className="space-y-4 pt-1">
          <Button
            ref={startRef}
            type="button"
            size="lg"
            onClick={onStart}
            className="group h-15 w-full max-w-[360px] cursor-pointer rounded-2xl border border-[#F97216]/70 bg-[#F97216] font-display text-base tracking-widest text-[#0B1320] shadow-[0_12px_40px_rgba(249,114,22,0.28)] transition-all hover:bg-[#fb923c] hover:shadow-[0_14px_44px_rgba(249,114,22,0.38)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D1D4DB] active:scale-[0.985]"
          >
            <span>Start</span>
            <ArrowRight className="ml-2.5 size-5 transition-transform group-hover:translate-x-1" />
          </Button>

          <p className="text-[12px] leading-relaxed text-[#9AA4B4]">
            A Payload Pets game · NASA Space Apps 2026 · Moon: NASA / GSFC /
            ASU LROC WAC + LOLA topography in WebGL · Display accent: Sterion &amp;
            Bruno Ace SC
          </p>
        </motion.div>
      </motion.div>
    </motion.section>
  );
}
