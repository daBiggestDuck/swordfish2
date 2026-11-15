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
        className="pointer-events-auto relative z-10 max-w-2xl px-8 py-16 md:px-16"
      >
        <motion.h1
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
          className="font-sterion text-6xl leading-[0.95] uppercase text-[#D1D4DB] md:text-7xl lg:text-8xl"
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
          className="mt-5 max-w-[30ch] text-xl font-semibold leading-snug text-[#D1D4DB] md:text-2xl"
        >
          Adopt a pet that is a real CLPS instrument, land it on the Moon, and
          keep it alive for one lunar day.
        </motion.p>

        <motion.p
          variants={item}
          className="mt-4 max-w-[58ch] text-base leading-relaxed text-[#94A3B8]"
        >
          Ghost the Blue Ghost lander, Triddy the TRIDENT ice drill, Nodey the
          LN-1 beacon — every pet is a real NASA payload. Pick a real landing
          site, plan your Sun and Earth windows, then live 14 Earth days in
          about 25 seconds. Finish with a Pet Passport that cites NASA.
        </motion.p>

        <motion.p
          variants={item}
          className="mt-4 text-sm text-[#94A3B8]"
        >
          4 pets · 8 CLPS landing sites · 1 Pet Passport
        </motion.p>

        <motion.div variants={item} className="mt-8">
          <Button
            ref={startRef}
            type="button"
            size="lg"
            onClick={onStart}
            className="group h-auto cursor-pointer rounded-xl bg-[#F97216] px-9 py-4 text-lg font-bold text-[#0B1320] shadow-[0_12px_40px_rgba(249,114,22,0.28)] transition-all hover:bg-[#fb923c] hover:shadow-[0_14px_44px_rgba(249,114,22,0.38)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D1D4DB] active:scale-[0.985]"
          >
            <span>Start</span>
            <ArrowRight className="ml-2.5 size-5 transition-transform group-hover:translate-x-1" />
          </Button>
        </motion.div>

        <motion.p
          variants={item}
          className="mt-10 text-[13px] leading-relaxed text-[#94A3B8]"
        >
          A Payload Pets game · NASA Space Apps 2026 · Moon: NASA / GSFC / ASU
          LROC WAC + LOLA topography, rendered live in WebGL — move your cursor
          across it
        </motion.p>
      </motion.div>
    </motion.section>
  );
}
