import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { DuckAnimator } from '../src/animation'
import type { DuckRig } from '../src/duck-model'
import type { MindFrame } from '../src/mind'

const restingFrame: MindFrame = {
  activity: 'settle',
  energy: 0.7,
  curiosity: 0.5,
  trust: 0.3,
  attention: 0,
  look: [0, 0],
  direction: 1,
  changed: false,
}

describe('DuckAnimator voice motion', () => {
  it('opens the lower beak during a voice envelope and closes it afterwards', () => {
    const mouthValues: number[] = []
    const rig = {
      setPose: vi.fn(),
      setMouth: vi.fn((value: number) => mouthValues.push(value)),
    } as unknown as DuckRig
    const animator = new DuckAnimator(rig, new THREE.Group())

    animator.vocalize(0.24)
    for (let index = 0; index < 8; index += 1) {
      animator.tick(0.04, index * 0.04, restingFrame)
    }

    expect(Math.max(...mouthValues)).toBeGreaterThan(0.25)
    expect(mouthValues.at(-1)).toBe(0)
  })
})
