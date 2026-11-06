import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Drive } from './Scene'

/**
 * The Target: a ball of molten amber held inside the rings of a target.
 *
 * Each state has its own motion, so the colour never has to do the explaining:
 * the rings close in while he listens, a comet circles while he thinks, more of
 * them race while a tool runs, and bars rise around the ball while he speaks.
 * Every state change sends one shockwave out from the centre.
 *
 * It is one camera-facing quad with a fragment shader, because nearly all of it
 * is a function of radius and angle.
 */

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragment = /* glsl */ `
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uLevel;
  uniform float uPhase;
  uniform float uOpen;
  uniform float uZoom;
  uniform float uIntensity;
  uniform float uStyle;
  uniform float uListen;
  uniform float uThink;
  uniform float uTool;
  uniform float uSpeak;
  uniform float uWave;

  varying vec2 vUv;

  #define TAU 6.28318530718
  #define PI 3.14159265359

  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash(i), f), dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
          dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  // A crisp line at radius r0.
  float line(float r, float r0, float w) {
    return smoothstep(w, w * 0.35, abs(r - r0));
  }

  // n arcs around the circle, each losing the fraction gap to a break.
  float arcs(float a, float n, float gap, float turn) {
    float d = abs(fract((a + turn) / TAU * n) - 0.5);
    return smoothstep(0.5 - gap * 0.5, 0.5 - gap * 0.5 - 0.015, d);
  }

  // The bright head and fading tail of something travelling round a ring.
  float comet(float a, float at, float tail) {
    float d = mod(a - at + PI, TAU) - PI;
    return smoothstep(-tail, 0.0, d) * (1.0 - smoothstep(0.0, 0.05, d));
  }

  void main() {
    vec2 p = (vUv * 2.0 - 1.0) * uZoom;
    float r = length(p);
    float a = atan(p.y, p.x);
    vec2 onCircle = vec2(cos(a), sin(a));
    float t = uPhase;

    // 0 ring, 1 sphere, 2 wire, as set by the ui_reactor tool.
    float wSphere = clamp(1.0 - abs(uStyle - 1.0), 0.0, 1.0);
    float wWire   = clamp(1.0 - abs(uStyle - 2.0), 0.0, 1.0);

    // -- the ball -----------------------------------------------------------
    float orbR = (0.29 + uLevel * 0.04) * mix(1.0, 1.9, wSphere);
    orbR += fbm(onCircle * 1.7 + vec2(t * 0.3, 7.0)) * (0.045 + uLevel * 0.07);
    float mask = smoothstep(orbR + 0.006, orbR - 0.006, r);

    // Warped noise is what makes it flow like a liquid rather than boil.
    vec2 q = p * 3.0;
    vec2 warp = vec2(fbm(q + vec2(t * 0.22, 0.0)), fbm(q + vec2(5.2, 1.3) - vec2(0.0, t * 0.18)));
    float heat = clamp(0.5 + fbm(q + warp * 2.0 + vec2(0.0, t * 0.12)) * 1.5, 0.0, 1.0);

    float rr = clamp(r / orbR, 0.0, 1.0);
    float z = sqrt(max(1.0 - rr * rr, 0.0));
    float lit = clamp(dot(vec3(p / orbR, z), normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);

    // Contour lines, as on a map. They give the surface something to read as
    // moving even when the colour is nearly flat.
    float contour = smoothstep(0.05, 0.0, abs(fract(heat * 7.0 + t * 0.05) - 0.5));

    // Never darker than a third of the colour: a real black patch on the surface
    // reads as a hole, not as the far side of a flow.
    vec3 body = mix(uColor * 0.42, uColor * 1.05, smoothstep(0.12, 0.85, heat));
    body *= 0.62 + 0.62 * lit + uLevel * 0.3;
    body += uHot * smoothstep(0.7, 1.0, heat) * (0.28 + lit * 0.3);
    body += uHot * contour * (0.07 + uLevel * 0.16);
    body += uColor * pow(1.0 - z, 3.0) * 1.2;
    body = mix(body, uHot * contour * 0.8, wWire);

    // -- the target ---------------------------------------------------------
    // Closes in as soon as he is paying attention.
    float lock = clamp(uListen + uThink * 0.6 + uTool * 0.8 + uSpeak * 0.35, 0.0, 1.0);
    float R1 = mix(0.47, 0.41, lock);
    float R2 = mix(0.61, 0.53, lock);
    float R3 = mix(0.74, 0.66, lock);

    float rings =
        line(r, R1, 0.0045) * arcs(a, 3.0, 0.12, t * 0.35) * 0.85
      + line(r, R2, 0.0025) * 0.30
      + smoothstep(R2 + 0.016, R2 + 0.012, r) * smoothstep(R2 - 0.001, R2 + 0.001, r)
        * arcs(a, 72.0, 0.72, -t * 0.08) * 0.55
      + line(r, R3, 0.0065) * arcs(a, 4.0, 0.24, -t * 0.2);
    rings *= mix(1.0, 0.0, wSphere);

    // Comets: one while thinking, more and faster while a tool runs.
    float racing = 1.5 + uTool * 2.2;
    float comets =
        line(r, R1, 0.012) * comet(a, mod(t * racing, TAU), 1.9) * max(uThink, uTool)
      + line(r, R3, 0.012) * comet(a, mod(-t * racing * 0.7, TAU) , 1.4) * uTool
      + line(r, R2, 0.008) * comet(a, mod(t * racing * 1.3 + PI, TAU), 1.2) * uTool;

    // Listening: rings falling inward onto the ball, stronger the louder you are.
    float falling = 0.0;
    for (int i = 0; i < 3; i++) {
      float k = fract(t * 0.45 + float(i) / 3.0);
      falling += line(r, mix(R3, orbR, k), 0.003) * sin(k * PI);
    }
    falling *= uListen * (0.35 + uLevel * 1.4);

    // Speaking: bars standing around the ball.
    float cell = floor((a + PI) / TAU * 64.0);
    float inCell = abs(fract((a + PI) / TAU * 64.0) - 0.5);
    float tall = 0.012 + (noise(vec2(cell * 0.41, t * 2.8)) + 0.5) * 0.13 * (0.15 + uLevel * 1.6);
    float start = orbR + 0.028;
    float bars = smoothstep(0.34, 0.24, inCell)
               * smoothstep(start - 0.002, start, r)
               * (1.0 - smoothstep(start + tall, start + tall + 0.004, r))
               * uSpeak;

    // One shockwave per state change.
    float shock = line(r, orbR + uWave * 0.72, 0.012) * pow(1.0 - uWave, 2.0) * 1.3;

    float glow = exp(-max(r - orbR, 0.0) * 7.0) * (0.14 + uLevel * 0.42) * (1.0 - mask);

    float bright = rings + comets + falling + bars + shock;
    vec3 col = body * mask + uColor * (bright * 1.1 + glow) + uHot * (comets + bars + shock) * 0.55;
    float alpha = max(mask, clamp(bright + glow, 0.0, 1.0));

    // The whole thing assembles outward from the centre on power-up.
    float reveal = smoothstep(0.0, 0.35, uOpen - r * 0.45);
    col *= reveal * uIntensity;
    alpha *= reveal * min(uIntensity, 1.0);

    gl_FragColor = vec4(col, alpha);
  }
`

/** The plane's half-width in world units. */
const HALF = 2.7
/** Radius, in the shader's own field units, of the outermost ring at rest. */
const RING_R = 0.74
/** Outer ring diameter as a fraction of the shorter viewport dimension. */
const FIT = 0.56

export function Core({ drive }: { drive: Drive }) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const mesh = useRef<THREE.Mesh>(null)
  const viewport = useThree((s) => s.viewport)

  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#ff8a1f') },
      uHot: { value: new THREE.Color('#fff1c4') },
      uLevel: { value: 0 },
      uPhase: { value: 0 },
      uOpen: { value: 0 },
      uZoom: { value: 1.2 },
      uIntensity: { value: 1 },
      uStyle: { value: 0 },
      uListen: { value: 0 },
      uThink: { value: 0 },
      uTool: { value: 0 },
      uSpeak: { value: 0 },
      uWave: { value: 1 },
    }),
    [],
  )

  useFrame((_, dt) => {
    if (!mat.current || !mesh.current) return
    const u = mat.current.uniforms
    const r = drive.reactor

    mesh.current.visible = r.visible
    // Scaling the mesh, not the field: the art sits inside a fixed quad, and
    // zooming the field out would crop it to a square.
    mesh.current.scale.setScalar(r.scale)
    // Lifted a little, because the words live under it.
    mesh.current.position.y = viewport.height * 0.06

    const fit = Math.min(viewport.width, viewport.height)
    u.uZoom.value = (RING_R * HALF) / (FIT * 0.5 * fit)
    u.uLevel.value += (drive.level - u.uLevel.value) * Math.min(1, dt * 8)
    // Accumulated, not elapsed time times level: scaling the clock would rewrite
    // the motion that has already happened.
    u.uPhase.value += dt * (0.5 + u.uLevel.value * 0.7) * r.spin
    u.uOpen.value += (drive.open - u.uOpen.value) * Math.min(1, dt * 1.6)
    u.uIntensity.value = r.intensity
    u.uStyle.value = r.style
    u.uListen.value = drive.modes.listen
    u.uThink.value = drive.modes.think
    u.uTool.value = drive.modes.tool
    u.uSpeak.value = drive.modes.speak
    u.uWave.value = drive.modes.wave
    ;(u.uColor.value as THREE.Color).lerp(r.color, Math.min(1, dt * 2.5))
  })

  return (
    <mesh ref={mesh} frustumCulled={false}>
      <planeGeometry args={[5.4, 5.4]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={vertex}
        fragmentShader={fragment}
        transparent
        premultipliedAlpha
        depthWrite={false}
      />
    </mesh>
  )
}
