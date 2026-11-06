import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Drive } from './Scene'

/** Embers rising through the frame, faster and brighter the louder it gets. */

const COUNT = 700
const SPAN = 9

const vertex = /* glsl */ `
  uniform float uFlow;
  uniform float uLevel;
  uniform float uSize;
  attribute float aSeed;
  varying float vAlpha;

  void main() {
    float y = mod(position.y + uFlow * (0.18 + aSeed * 0.5), ${SPAN.toFixed(1)}) - ${(SPAN / 2).toFixed(1)};
    float x = position.x + sin(uFlow * 0.7 + aSeed * 40.0) * (0.12 + aSeed * 0.25);
    vec4 mv = modelViewMatrix * vec4(x, y, position.z, 1.0);
    gl_Position = projectionMatrix * mv;

    // Born and dying at the edges of the span, so none of them pop.
    float life = (y + ${(SPAN / 2).toFixed(1)}) / ${SPAN.toFixed(1)};
    float twinkle = 0.55 + 0.45 * sin(uFlow * 3.0 + aSeed * 90.0);
    vAlpha = sin(life * 3.14159) * twinkle * (0.32 + uLevel * 0.5);

    gl_PointSize = uSize * (0.5 + aSeed) * (1.0 + uLevel * 0.5) * (13.0 / -mv.z);
  }
`

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vAlpha;

  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    float falloff = 1.0 - smoothstep(0.0, 0.5, r);
    gl_FragColor = vec4(uColor, vAlpha * falloff * uIntensity);
  }
`

export function Particles({ drive }: { drive: Drive }) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const pts = useRef<THREE.Points>(null)

  const { positions, seeds } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3)
    const seeds = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 12
      positions[i * 3 + 1] = Math.random() * SPAN
      positions[i * 3 + 2] = -3 + Math.random() * 4
      seeds[i] = Math.random()
    }
    return { positions, seeds }
  }, [])

  const uniforms = useMemo(
    () => ({
      uFlow: { value: 0 },
      uLevel: { value: 0 },
      uSize: { value: 3.0 },
      uColor: { value: new THREE.Color('#ff8a1f') },
      uIntensity: { value: 1 },
    }),
    [],
  )

  useFrame((_, dt) => {
    if (!mat.current || !pts.current) return
    const u = mat.current.uniforms
    pts.current.visible = drive.reactor.visible
    u.uIntensity.value = drive.reactor.intensity
    u.uLevel.value += (drive.level - u.uLevel.value) * Math.min(1, dt * 6)
    // Accumulated so a change in speed never jumps every ember at once.
    u.uFlow.value += dt * (0.45 + u.uLevel.value * 1.6)
    ;(u.uColor.value as THREE.Color).lerp(drive.color, Math.min(1, dt * 3))
  })

  return (
    <points ref={pts} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[seeds, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={vertex}
        fragmentShader={fragment}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}
