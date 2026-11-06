import { useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import {
  EffectComposer,
  Bloom,
  Vignette,
  Noise,
} from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import { Backdrop } from './Backdrop'
import { Core } from './Core'
import { Particles } from './Particles'
import { Orbits } from './Orbits'
import { useStore, phaseColor, accentFor, type Phase } from '../store'

/** Rings spin harder while JARVIS is working — reads as effort. */
const spinFor: Record<Phase, number> = {
  offline: 0.08, // barely turning — the machine is off
  boot: 3.2,
  dormant: 0.25,
  waking: 4.5,
  listening: 1.1,
  thinking: 2.8,
  tooling: 3.6,
  speaking: 1.4,
}

/**
 * Everything the three children animate from, in one mutable object.
 *
 * These used to be render-time props, which had two consequences. The scene
 * subscribed to mic level, so the entire r3f tree reconciled sixty times a
 * second for numbers that never leave useFrame; and because they were only
 * delivered on a re-render, they were delivered late or — before the analyser
 * starts and `level` is a constant zero — not at all, which is why the ignition
 * screen never picked up its own spin rate.
 *
 * Nothing here belongs in React state. The scene is updated by mutation and
 * React only ever mounts it: Rig writes this object once per frame, the
 * children read it in their own useFrame. Children subscribe to the frame loop
 * before their parent does, so they are reading the previous frame's values —
 * one frame of lag on quantities that are all lerped anyway, and invisible.
 */
export type Drive = {
  color: THREE.Color
  /** 0..1 smoothed loudness, with an idle breath under it. */
  level: number
  /** Rotation multiplier for the drifting dust. */
  spin: number
  /** 0..1 power-up reveal — the ring assembles outwards from the centre. */
  open: number
  /** How far each state's own motion has eased in, 0..1. See Core. */
  modes: {
    listen: number
    think: number
    tool: number
    speak: number
    /** 0..1 progress of the shockwave sent out by each state change. */
    wave: number
  }
  /**
   * The reactor slice of the ui state, already resolved and smoothed.
   *
   * Everything here is a no-op at UI_DEFAULTS: colour follows the phase exactly
   * as it always did, and the three multipliers sit at one.
   */
  reactor: {
    /** ui.reactor.color if set, otherwise the accent. */
    color: THREE.Color
    scale: number
    intensity: number
    /** Multiplier on the ring's own rotation rate. */
    spin: number
    /** 0 ring, 1 sphere, 2 wire — a number because it ends up in a uniform. */
    style: number
    visible: boolean
  }
}

/**
 * A colour target that only re-parses when the string actually changes.
 *
 * The colours in the ui slice are arbitrary CSS written by JARVIS, and
 * THREE.Color.set logs a warning for anything it cannot parse. Setting one
 * unconditionally per frame turns a single typo into sixty console lines a
 * second, which drowns everything else out during a demo.
 */
type Tint = { key: string; color: THREE.Color }

function aim(tint: Tint, css: string): THREE.Color {
  if (tint.key !== css) {
    tint.key = css
    tint.color.set(css)
  }
  return tint.color
}

const STYLE_INDEX = { ring: 0, sphere: 1, wire: 2 } as const

function Rig() {
  const drive = useMemo<Drive>(
    () => ({
      color: new THREE.Color(phaseColor.offline),
      level: 0,
      spin: spinFor.offline,
      modes: { listen: 0, think: 0, tool: 0, speak: 0, wave: 1 },
      open: 0,
      reactor: {
        color: new THREE.Color(phaseColor.offline),
        scale: 1,
        intensity: 1,
        spin: 1,
        style: STYLE_INDEX.ring,
        visible: true,
      },
    }),
    [],
  )
  const target = useMemo<Tint>(() => ({ key: '', color: new THREE.Color() }), [])
  const reactorTarget = useMemo<Tint>(
    () => ({ key: '', color: new THREE.Color() }),
    [],
  )

  const lastPhase = useMemo<{ phase: Phase | null }>(() => ({ phase: null }), [])

  useFrame((state, dt) => {
    // Read imperatively rather than subscribing — see the note on Drive.
    const { phase, level, ui } = useStore.getState()

    // accentFor owns the accent -> palette -> phase resolution order. The scene
    // asking the store for the answer rather than working it out again is what
    // keeps the orb and the HUD from ever disagreeing about the colour.
    const accent = accentFor(phase, ui)
    drive.color.lerp(aim(target, accent), Math.min(1, dt * 2.5))

    const r = ui.reactor
    drive.reactor.color.lerp(
      aim(reactorTarget, r.color ?? accent),
      Math.min(1, dt * 2.5),
    )
    // Smoothed rather than assigned, so "make it twice the size" grows into
    // place instead of snapping. The style is the exception: it is a mode, and
    // easing between two of them would drag the picture through the third.
    const k = Math.min(1, dt * 5)
    drive.reactor.scale += (r.scale - drive.reactor.scale) * k
    drive.reactor.intensity += (r.intensity - drive.reactor.intensity) * k
    drive.reactor.spin += (r.spin - drive.reactor.spin) * k
    drive.reactor.style = STYLE_INDEX[r.style] ?? STYLE_INDEX.ring
    drive.reactor.visible = r.visible

    drive.spin += (spinFor[phase] - drive.spin) * Math.min(1, dt * 2)

    const ease = Math.min(1, dt * 4)
    const m = drive.modes
    m.listen += (Number(phase === 'listening' || phase === 'waking') - m.listen) * ease
    m.think += (Number(phase === 'thinking') - m.think) * ease
    m.tool += (Number(phase === 'tooling') - m.tool) * ease
    m.speak += (Number(phase === 'speaking') - m.speak) * ease
    if (lastPhase.phase !== phase) {
      if (lastPhase.phase !== null) m.wave = 0
      lastPhase.phase = phase
    }
    m.wave = Math.min(1, m.wave + dt * 0.95)
    // Only part-revealed until it is powered on, so the outer rings arrive with
    // the click rather than already being there.
    drive.open = phase === 'offline' ? 0.75 : phase === 'boot' ? 0.9 : 1.6

    // Idle breathing so the orb is never completely still.
    const idle = phase === 'offline' ? 0.02 : phase === 'dormant' ? 0.05 : 0.12
    const breathe =
      (Math.sin(state.clock.elapsedTime * 0.9) * 0.5 + 0.5) * idle
    const want = Math.max(level, breathe)
    drive.level += (want - drive.level) * Math.min(1, dt * 9)

    // Slow drift on the camera keeps handheld-ish life in the shot.
    const t = state.clock.elapsedTime
    state.camera.position.x = Math.sin(t * 0.13) * 0.35
    state.camera.position.y = Math.cos(t * 0.17) * 0.22
    state.camera.lookAt(0, 0, 0)
  })

  // Nothing in here is lit: every material is a raw shader, so there are no lights.
  return (
    <>
      <Backdrop drive={drive} />
      <Core drive={drive} />
      <Particles drive={drive} />
      <Orbits />
    </>
  )
}

export function Scene() {
  return (
    <Canvas
      className="scene"
      camera={{ position: [0, 0, 6.2], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
    >
      <Rig />
      {/*
        multisampling={0}: every shape here is soft-edged by its own shader, so
        an MSAA target would cost a lot and smooth nothing.
      */}
      <EffectComposer multisampling={0}>
                <Bloom
          intensity={0.75}
          // High, so the ball keeps its surface instead of glowing into a disc.
          luminanceThreshold={0.5}
          luminanceSmoothing={0.7}
          mipmapBlur
          radius={0.72}
        />
        <Noise opacity={0.035} blendFunction={BlendFunction.OVERLAY} />
        <Vignette eskil={false} offset={0.3} darkness={0.6} />
      </EffectComposer>
    </Canvas>
  )
}
