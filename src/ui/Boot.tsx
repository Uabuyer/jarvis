import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useStore } from '../store'

const LOGO = '/brand/target-hub-logo.webp'

// Fetched up front so the logo is ready when its beat arrives.
new Image().src = LOGO

/**
 * The start-up sequence, one short story in three beats:
 *   1. a target draws itself while the systems count up;
 *   2. an arrow flies in and hits dead centre, and the name lands with the hit;
 *   3. the TARGET HUB logo opens out, until the live interface takes over.
 *
 * Runs on elapsed time, so a throttled background tab costs smoothness, never
 * order. App.tsx decides when the overlay ends; keep its wait longer than `logo`.
 */
const T = { hit: 2700, logo: 4300 }

const NAME = 'JARVIS'
const RINGS = [172, 128, 84, 40]

export function Boot() {
  const phase = useStore((s) => s.phase)
  const reduced = !!useReducedMotion()
  const [t, setT] = useState(0)

  // setInterval over wall-clock time, not requestAnimationFrame, which pauses in
  // an unfocused tab and would freeze the sequence on its first beat.
  useEffect(() => {
    if (phase !== 'boot') {
      setT(0)
      return
    }
    const start = Date.now()
    setT(0)
    const id = setInterval(() => setT(Date.now() - start), 50)
    return () => clearInterval(id)
  }, [phase])

  const hit = t >= T.hit
  const showLogo = t >= T.logo
  const pct = Math.min(100, Math.round((t / (T.hit - 200)) * 100))

  return (
    <AnimatePresence>
      {phase === 'boot' && (
        <motion.div
          className="boot"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.8 }}
        >
          <div className="boot-pool boot-pool-a" />
          <div className="boot-pool boot-pool-b" />

          <AnimatePresence>
            {!showLogo && (
              <motion.div
                key="target"
                className="boot-center"
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.3 }}
              >
                <motion.svg
                  className="boot-target"
                  viewBox="-200 -200 400 400"
                  aria-hidden="true"
                  animate={
                    hit
                      ? { scale: [1, 1.09, 1], opacity: [1, 1, 0.2] }
                      : { scale: 1, opacity: 1 }
                  }
                  transition={hit ? { duration: 1.1, times: [0, 0.14, 1] } : { duration: 0 }}
                >
                  {RINGS.map((r, i) => (
                    <motion.circle
                      key={r}
                      r={r}
                      className={`boot-ring boot-ring-${i}`}
                      initial={{ pathLength: 0, rotate: -90 }}
                      animate={{ pathLength: 1, rotate: -90 }}
                      transition={{
                        duration: reduced ? 0 : 1.1,
                        delay: reduced ? 0 : i * 0.3,
                        ease: [0.65, 0, 0.2, 1],
                      }}
                    />
                  ))}
                  {hit && (
                    <motion.g
                      initial={{ x: 240, y: -240, opacity: 0 }}
                      animate={{ x: 0, y: 0, opacity: 1 }}
                      transition={{ duration: reduced ? 0 : 0.2, ease: 'easeIn' }}
                    >
                      <line className="boot-shaft" x1="0" y1="0" x2="118" y2="-118" />
                      <path className="boot-fletch" d="M118 -118 L158 -122 L124 -156 L120 -120 Z" />
                      <circle className="boot-bull" r="7" />
                    </motion.g>
                  )}
                </motion.svg>

                {hit && <div className="boot-shock" />}

                {!hit && (
                  <div className="boot-count">
                    <span className="boot-pct">{pct}%</span>
                    <span className="boot-word">Навожу на ціль</span>
                  </div>
                )}

                {hit && (
                  <div className="boot-name" aria-label={NAME}>
                    {NAME.split('').map((c, i) => (
                      <motion.span
                        key={i}
                        initial={{ y: reduced ? 0 : '110%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{
                          type: 'spring',
                          stiffness: 320,
                          damping: 22,
                          delay: 0.14 + i * 0.05,
                        }}
                      >
                        {c}
                      </motion.span>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {showLogo && (
            <div className="boot-center">
              <div className="boot-halo" />
              <div className="boot-dash boot-dash-a" />
              <div className="boot-dash boot-dash-b" />
              <motion.div
                className="boot-logo"
                initial={{ scale: reduced ? 1 : 0.4, rotate: reduced ? 0 : -14, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 170, damping: 15 }}
              >
                <img src={LOGO} alt="TARGET HUB" draggable={false} />
              </motion.div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
