import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, RotateCcw } from 'lucide-react'
import MoonGlobe from './components/MoonGlobe.jsx'

// The game lives in the existing showcase shell. In dev the shell runs on
// :8767; a built app sits beside it. Start reveals it in-place (one tab).
const SHELL_URL = import.meta.env.DEV
  ? 'http://localhost:8767/index.html#story'
  : '../index.html#story'

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', damping: 26, stiffness: 140 },
  },
}

const word = {
  hidden: { opacity: 0, y: 20, rotateX: 10 },
  show: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: { type: 'spring', damping: 20, stiffness: 160 },
  },
}

function Title() {
  const words = [
    { t: 'CLPS', ember: false },
    { t: 'PET', ember: true },
    { t: 'GAME', ember: false },
  ]
  return (
    <motion.h1
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      className="pointer-events-auto mt-2 font-display text-6xl uppercase text-stardust md:text-7xl lg:text-8xl"
      style={{ perspective: '800px', textWrap: 'balance' }}
    >
      {words.map((w, i) => (
        <motion.span
          key={i}
          variants={word}
          className={`mr-[0.22em] inline-block last:mr-0 ${w.ember ? 'text-ember' : ''}`}
        >
          {w.t}
        </motion.span>
      ))}
    </motion.h1>
  )
}

export default function App() {
  const reduce = useReducedMotion()
  const v = reduce ? { hidden: { opacity: 0 }, show: { opacity: 1 } } : item

  const [started, setStarted] = useState(false)
  const [appReady, setAppReady] = useState(false)
  const [landingGone, setLandingGone] = useState(false)
  const [shellFailed, setShellFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const startRef = useRef(null)
  const failTimer = useRef(null)

  useEffect(() => {
    startRef.current?.focus({ preventScroll: true })
    return () => clearTimeout(failTimer.current)
  }, [])

  const start = () => {
    if (started) return
    setStarted(true)
    // If the shell never loads, tell the player how to run it instead of
    // leaving them with a silent black frame.
    failTimer.current = setTimeout(() => setShellFailed(true), 3500)
  }

  const onAppLoad = () => {
    clearTimeout(failTimer.current)
    setShellFailed(false)
    setAppReady(true)
    setTimeout(() => setLandingGone(true), 1000)
  }

  const entered = started && appReady

  return (
    <>
      {/* The moon sits against the right side like slide 1 of the mockup:
          centre at ~72% width, ~75% of screen height tall. The canvas is
          oversized so its deep-space starfield still covers the whole
          viewport. No drag — it spins on its own and answers the cursor
          subtly while the cursor is on the disc. */}
      {!landingGone && (
        <div
          className={`relative min-h-screen overflow-hidden bg-void text-stardust antialiased selection:bg-ember/30 transition-all duration-700 ease-out ${
            entered ? 'pointer-events-none scale-[1.03] opacity-0' : ''
          }`}
          aria-hidden={started ? 'true' : undefined}
        >
          <MoonGlobe
            className="pointer-events-auto scene-in fixed top-1/2 left-[-18vw] h-[100vh] w-[180vw] -translate-y-1/2"
            distance={3.6}
          />

          <main className="pointer-events-none relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6 py-16 md:px-12">
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="pointer-events-none max-w-2xl"
            >
              <motion.div variants={v}>
                <Title />
              </motion.div>

              <motion.p
                variants={v}
                className="pointer-events-auto mt-5 max-w-[30ch] text-xl font-semibold text-stardust md:text-2xl"
              >
                Adopt a pet that is a real CLPS instrument, land it on the Moon,
                and keep it alive for one lunar day.
              </motion.p>

              <motion.p
                variants={v}
                className="pointer-events-auto mt-4 max-w-[58ch] text-base text-moonrock"
              >
                Ghost the Blue Ghost lander, Triddy the TRIDENT ice drill, Nodey
                the LN-1 beacon — every pet is a real NASA payload. Pick a real
                landing site, plan your Sun and Earth windows, then live 14 Earth
                days in about 25 seconds. Finish with a Pet Passport that cites
                NASA.
              </motion.p>

              <motion.p
                variants={v}
                className="pointer-events-auto mt-4 text-sm text-moonrock"
              >
                4 pets · 5 landing sites · 1 Pet Passport
              </motion.p>

              <motion.div variants={v} className="mt-8 flex items-center gap-4">
                <motion.button
                  ref={startRef}
                  type="button"
                  onClick={start}
                  whileHover={reduce ? {} : { scale: 1.03 }}
                  whileTap={reduce ? {} : { scale: 0.96 }}
                  className="pointer-events-auto group flex items-center gap-2.5 rounded-xl bg-ember px-9 py-4 text-lg font-bold text-void transition-colors hover:bg-ember-soft focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-stardust"
                >
                  Start
                  <ArrowRight className="h-5 w-5 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                </motion.button>
              </motion.div>

              <motion.p
                variants={v}
                className="pointer-events-auto mt-10 text-[13px] text-moonrock"
              >
                A Payload Pets game · NASA Space Apps 2026 · Moon: NASA / GSFC /
                ASU LROC WAC + LOLA topography, rendered live in WebGL — move
                your cursor across it
              </motion.p>
            </motion.div>
          </main>
        </div>
      )}

      {/* The app itself — the showcase shell revealed in-place over the
          landing (one tab, no navigation). Hidden until it reports ready. */}
      {started && (
        <iframe
          key={attempt}
          src={SHELL_URL}
          title="Payload Pets showcase"
          onLoad={onAppLoad}
          className={`fixed inset-0 z-40 h-full w-full border-0 bg-void transition-opacity duration-700 ease-out ${
            entered ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          }`}
        />
      )}

      {/* Shell not running: exact fix instead of a dead click. */}
      {shellFailed && !appReady && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-lunarline bg-panel px-4 py-3 text-sm text-stardust shadow-xl"
        >
          The showcase shell isn&rsquo;t running. Start it with{' '}
          <code className="rounded bg-void px-1.5 py-0.5 text-ember">./run-v0.sh</code>{' '}
          from the repo root, then
          <button
            type="button"
            onClick={() => {
              setShellFailed(false)
              clearTimeout(failTimer.current)
              failTimer.current = setTimeout(() => setShellFailed(true), 3500)
              setAttempt((a) => a + 1)
            }}
            className="ml-1.5 inline-flex items-center gap-1 text-ember underline underline-offset-2 hover:text-ember-soft"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            try again
          </button>
          .
        </div>
      )}
    </>
  )
}
