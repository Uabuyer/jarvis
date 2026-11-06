import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Drive } from './Scene'

/**
 * Two slow pools of orange light in opposite corners, taken from the TARGET HUB
 * artwork, with the faint rings of a huge target turning behind everything.
 *
 * Additive with no black of its own, so a background colour set through
 * ui_theme still shows through.
 */

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uLevel;
  uniform float uAspect;
  uniform float uIntensity;
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv * 2.0 - 1.0) * vec2(uAspect, 1.0);
    float t = uTime;

    vec2 a = vec2(-uAspect * 0.95 + sin(t * 0.13) * 0.22, 0.95 + cos(t * 0.11) * 0.18);
    vec2 b = vec2( uAspect * 0.95 + cos(t * 0.09) * 0.22, -0.95 + sin(t * 0.12) * 0.18);
    float pools = exp(-dot(p - a, p - a) * 0.95) + exp(-dot(p - b, p - b) * 0.95);

    float r = length(p);
    float ang = atan(p.y, p.x);
    float bands = smoothstep(0.012, 0.0, abs(fract(r * 1.55 - t * 0.012) - 0.5) - 0.012);
    float turning = 0.55 + 0.45 * sin(ang * 2.0 + t * 0.1);
    float rings = bands * turning * smoothstep(0.35, 0.8, r) * 0.05;

    float v = (pools * (0.17 + uLevel * 0.13) + rings) * uIntensity;
    gl_FragColor = vec4(uColor * v, v);
  }
`

export function Backdrop({ drive }: { drive: Drive }) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#ff7a12') },
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uAspect: { value: 1 },
      uIntensity: { value: 1 },
    }),
    [],
  )

  useFrame((state, dt) => {
    if (!mat.current) return
    const u = mat.current.uniforms
    u.uTime.value = state.clock.elapsedTime
    u.uAspect.value = state.viewport.aspect
    u.uIntensity.value = drive.reactor.intensity
    u.uLevel.value += (drive.level - u.uLevel.value) * Math.min(1, dt * 4)
    ;(u.uColor.value as THREE.Color).lerp(drive.color, Math.min(1, dt * 1.5))
  })

  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={vertex}
        fragmentShader={fragment}
        transparent
        blending={THREE.AdditiveBlending}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}
