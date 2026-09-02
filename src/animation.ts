import * as THREE from 'three'
import { DuckRig, HOME_POSE } from './duck-model'
import type { MindFrame } from './mind'

export class DuckAnimator {
  private readonly pose: number[] = [...HOME_POSE]
  private readonly target: number[] = [...HOME_POSE]
  private gaitPhase = 0
  private expressionPhase = 0
  private voiceDuration = 0
  private voiceRemaining = 0

  constructor(
    private readonly rig: DuckRig,
    private readonly stage: THREE.Group,
  ) {}

  vocalize(duration: number): void {
    if (duration <= 0) return
    this.voiceDuration = duration
    this.voiceRemaining = duration
  }

  tick(dt: number, time: number, mind: MindFrame): void {
    this.target.splice(0, this.target.length, ...HOME_POSE)
    this.expressionPhase += dt

    this.applyAttention(mind)
    switch (mind.activity) {
      case 'settle':
        this.settle(time)
        break
      case 'observe':
        this.observe(time, mind)
        break
      case 'stroll':
        this.stroll(dt, mind)
        break
      case 'preen':
        this.preen(time)
        break
      case 'doze':
        this.doze(time)
        break
      case 'delight':
        this.delight(time, mind)
        break
      case 'startle':
        this.startle(time)
        break
    }

    const response = mind.activity === 'startle' ? 14 : mind.activity === 'stroll' ? 10 : 6.5
    const blend = 1 - Math.exp(-response * dt)
    for (let index = 0; index < this.pose.length; index += 1) {
      const current = this.pose[index] ?? 0
      const target = this.target[index] ?? current
      this.pose[index] = current + (target - current) * blend
    }
    this.rig.setPose(this.pose)
    this.animateMouth(dt)
  }

  private animateMouth(dt: number): void {
    if (this.voiceRemaining <= 0 || this.voiceDuration <= 0) {
      this.rig.setMouth(0)
      return
    }
    const elapsed = this.voiceDuration - this.voiceRemaining
    const envelope = Math.min(1, elapsed / 0.045, this.voiceRemaining / 0.075)
    const syllable = 0.28 + Math.abs(Math.sin(elapsed * 25)) * 0.72
    this.rig.setMouth(envelope * syllable)
    this.voiceRemaining = Math.max(0, this.voiceRemaining - dt)
  }

  private applyAttention(mind: MindFrame): void {
    const [side, height] = mind.look
    const attention = mind.attention
    this.target[5] = (this.target[5] ?? 0) + height * 0.12 * attention
    this.target[6] = (this.target[6] ?? 0) - height * 0.34 * attention
    this.target[7] = side * 0.72 * attention
    this.target[8] = -side * 0.11 * attention
  }

  private settle(time: number): void {
    const breath = Math.sin(time * 1.7)
    this.stage.position.y = 0.003 + breath * 0.0014
    this.stage.rotation.y = Math.sin(time * 0.34) * 0.025
    this.target[5] = (this.target[5] ?? 0) + breath * 0.014
    this.target[6] = (this.target[6] ?? 0) - breath * 0.02
  }

  private observe(time: number, mind: MindFrame): void {
    this.stage.position.y = 0.004 + Math.sin(time * 2.2) * 0.001
    this.target[5] = (this.target[5] ?? 0) - 0.06
    this.target[8] = (this.target[8] ?? 0) + Math.sin(time * 1.25) * 0.055
    if (mind.attention < 0.2) {
      this.target[7] = Math.sin(time * 0.7) * 0.34
    }
  }

  private stroll(dt: number, mind: MindFrame): void {
    this.gaitPhase += dt * 6.8
    const step = Math.sin(this.gaitPhase)
    const liftLeft = Math.max(0, step)
    const liftRight = Math.max(0, -step)
    this.target[2] = (this.target[2] ?? 0) + step * 0.28
    this.target[3] = (this.target[3] ?? 0) + liftLeft * 0.36
    this.target[4] = (this.target[4] ?? 0) - step * 0.18
    this.target[12] = (this.target[12] ?? 0) + step * 0.28
    this.target[13] = (this.target[13] ?? 0) - liftRight * 0.36
    this.target[14] = (this.target[14] ?? 0) - step * 0.18
    this.target[1] = (this.target[1] ?? 0) + Math.sin(this.gaitPhase * 2) * 0.035
    this.target[11] = (this.target[11] ?? 0) - Math.sin(this.gaitPhase * 2) * 0.035
    this.target[7] = mind.direction * 0.12
    this.stage.position.y = 0.005 + Math.abs(Math.sin(this.gaitPhase)) * 0.006
    this.stage.rotation.y = mind.direction * 0.14 + Math.sin(this.gaitPhase) * 0.025
  }

  private preen(time: number): void {
    const peck = Math.max(0, Math.sin(time * 3.1))
    this.target[5] = 0.58
    this.target[6] = 0.48 + peck * 0.14
    this.target[7] = 0.44
    this.target[8] = -0.12
    this.target[2] = (this.target[2] ?? 0) - 0.08
    this.target[12] = (this.target[12] ?? 0) + 0.08
    this.stage.position.y = 0.002
    this.stage.rotation.y = 0.04
  }

  private doze(time: number): void {
    const breath = (Math.sin(time * 1.25) + 1) * 0.5
    this.target[2] = -0.76
    this.target[3] = 0.42
    this.target[4] = 0.22
    this.target[12] = 0.76
    this.target[13] = -0.42
    this.target[14] = -0.22
    this.target[5] = 0.62 + breath * 0.02
    this.target[6] = 0.74 + breath * 0.025
    this.target[8] = -0.1
    this.stage.position.y = -0.014 + breath * 0.001
    this.stage.rotation.y = -0.08
  }

  private delight(time: number, mind: MindFrame): void {
    const sway = Math.sin(time * 5.2)
    this.target[5] = 0.22
    this.target[6] = 0.18
    this.target[7] = mind.look[0] * 0.42
    this.target[8] = sway * 0.14
    this.target[1] = (this.target[1] ?? 0) + sway * 0.045
    this.target[11] = (this.target[11] ?? 0) - sway * 0.045
    this.stage.position.y = 0.006 + Math.max(0, Math.sin(time * 5.2)) * 0.004
    this.stage.rotation.y = sway * 0.035
  }

  private startle(time: number): void {
    const tremble = Math.sin(time * 34) * 0.012
    this.target[2] = -0.72
    this.target[3] = 0.25
    this.target[12] = 0.72
    this.target[13] = -0.25
    this.target[5] = 0.02
    this.target[6] = 0.06
    this.stage.position.y = 0.018 + tremble
    this.stage.rotation.y = tremble * 2
  }
}
