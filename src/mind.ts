export type Activity = 'settle' | 'observe' | 'stroll' | 'preen' | 'doze' | 'delight' | 'startle'

export type Stimulus =
  | { type: 'pointer-near'; side: number; height: number }
  | { type: 'pointer-left' }
  | { type: 'touch'; head: boolean; intensity: number }
  | { type: 'surprise'; strength: number }
  | { type: 'rest-request' }
  | { type: 'wake' }
  | { type: 'edge'; direction: -1 | 1 }
  | { type: 'owner-away' }
  | { type: 'owner-returned' }

export type MindFrame = {
  activity: Activity
  energy: number
  curiosity: number
  trust: number
  attention: number
  look: [number, number]
  direction: -1 | 1
  changed: boolean
}

export type MindMemory = {
  trust: number
  encounters: number
}

export type BehaviorIntent = {
  activity: 'observe' | 'stroll' | 'preen' | 'doze'
  confidence: number
  direction?: -1 | 1
}

export interface BehaviorController {
  stimulate(stimulus: Stimulus): void
  suggest(intent: BehaviorIntent): boolean
  tick(dt: number): MindFrame
  memory(): MindMemory
}

type Traits = {
  boldness: number
  sociability: number
  patience: number
}

export class PetMind implements BehaviorController {
  private readonly random: () => number
  private readonly traits: Traits
  private activity: Activity = 'settle'
  private energy = 0.72
  private curiosity = 0.58
  private trust: number
  private encounters: number
  private attention = 0
  private look: [number, number] = [0, 0]
  private direction: -1 | 1 = -1
  private nextDecision = 2.4
  private activityAge = 0
  private touchWarmth = 0
  private forcedRest = false
  private ownerAway = false

  constructor(seed: number, memory: MindMemory) {
    this.random = xorshift(seed)
    this.traits = {
      boldness: 0.28 + this.random() * 0.6,
      sociability: 0.35 + this.random() * 0.58,
      patience: 0.3 + this.random() * 0.65,
    }
    this.trust = clamp01(memory.trust)
    this.encounters = Math.max(0, Math.floor(memory.encounters))
    this.direction = this.random() < 0.5 ? -1 : 1
  }

  stimulate(stimulus: Stimulus): void {
    switch (stimulus.type) {
      case 'pointer-near':
        this.ownerAway = false
        this.look = [clamp(stimulus.side, -1, 1), clamp(stimulus.height, -1, 1)]
        this.attention = Math.max(this.attention, 0.75)
        this.curiosity = clamp01(this.curiosity + 0.025)
        if (this.activity === 'doze' && this.attention > 0.9) this.choose('observe')
        break
      case 'pointer-left':
        this.attention = Math.min(this.attention, 0.42)
        break
      case 'touch':
        this.ownerAway = false
        this.forcedRest = false
        this.touchWarmth = clamp01(this.touchWarmth + stimulus.intensity * (stimulus.head ? 0.3 : 0.13))
        this.attention = 1
        this.trust = clamp01(this.trust + stimulus.intensity * (stimulus.head ? 0.006 : 0.002))
        if (this.touchWarmth > 0.3 || this.activity === 'doze') this.choose('delight')
        break
      case 'surprise':
        this.ownerAway = false
        if (stimulus.strength > this.traits.boldness * 0.7) this.choose('startle')
        break
      case 'rest-request':
        this.forcedRest = true
        this.choose('doze')
        break
      case 'wake':
        this.ownerAway = false
        this.forcedRest = false
        this.energy = Math.max(this.energy, 0.35)
        this.choose('observe')
        break
      case 'edge':
        this.direction = stimulus.direction === -1 ? 1 : -1
        this.attention = Math.max(this.attention, 0.25)
        this.curiosity = clamp01(this.curiosity - 0.08)
        this.choose('stroll')
        break
      case 'owner-away':
        this.ownerAway = true
        this.attention = 0
        this.touchWarmth = 0
        if (!this.forcedRest) this.choose(this.energy < 0.62 ? 'doze' : 'preen')
        break
      case 'owner-returned': {
        const returning = this.ownerAway
        this.ownerAway = false
        if (!returning || this.forcedRest) break
        this.attention = 1
        this.energy = Math.max(this.energy, 0.28)
        const warmGreeting = this.trust > 0.34 && this.traits.sociability > 0.56
        this.choose(warmGreeting ? 'delight' : 'observe')
        break
      }
    }
  }

  suggest(intent: BehaviorIntent): boolean {
    const confidence = clamp01(intent.confidence)
    if (confidence < 0.5 || this.activity === 'startle' || this.activity === 'delight') return false
    if (this.ownerAway && (intent.activity === 'observe' || intent.activity === 'stroll')) return false

    switch (intent.activity) {
      case 'observe':
        this.forcedRest = false
        this.attention = Math.max(this.attention, confidence * 0.7)
        this.choose('observe')
        return true
      case 'stroll': {
        const threshold = 0.5 + (1 - this.traits.boldness) * 0.22
        if (this.forcedRest || this.energy < 0.25 || confidence < threshold) return false
        if (intent.direction === -1 || intent.direction === 1) this.direction = intent.direction
        this.choose('stroll')
        return true
      }
      case 'preen':
        if (this.forcedRest || this.energy < 0.18 || confidence < 0.62) return false
        this.choose('preen')
        return true
      case 'doze':
        if (this.attention > 0.72 && confidence < 0.9) return false
        this.choose('doze')
        return true
    }
  }

  tick(dt: number): MindFrame {
    const before = this.activity
    this.activityAge += dt
    this.nextDecision -= dt
    this.attention = Math.max(0, this.attention - dt * 0.14)
    this.touchWarmth = Math.max(0, this.touchWarmth - dt * 0.16)

    const activityCost = this.activity === 'stroll' ? 0.012 : this.activity === 'observe' ? 0.003 : 0.001
    this.energy = clamp01(this.energy + dt * (this.activity === 'doze' ? 0.032 : -activityCost))
    this.curiosity = clamp01(this.curiosity + dt * (this.activity === 'stroll' ? -0.025 : 0.006))

    if (this.activity === 'startle' && this.activityAge > 0.75) this.choose('observe')
    if (this.activity === 'delight' && this.touchWarmth <= 0.04 && this.activityAge > 1.2) {
      this.encounters += 1
      this.choose('settle')
    }
    if (!this.forcedRest && this.activity === 'doze' && this.energy > 0.86) this.choose('settle')

    if (this.nextDecision <= 0 && this.activity !== 'startle' && this.activity !== 'delight') {
      this.decide()
    }

    return {
      activity: this.activity,
      energy: this.energy,
      curiosity: this.curiosity,
      trust: this.trust,
      attention: this.attention,
      look: this.look,
      direction: this.direction,
      changed: before !== this.activity,
    }
  }

  memory(): MindMemory {
    return { trust: this.trust, encounters: this.encounters }
  }

  traitsSnapshot(): Readonly<Traits> {
    return this.traits
  }

  private decide(): void {
    if (this.forcedRest || this.energy < 0.2) {
      this.choose('doze')
      return
    }
    if (this.ownerAway) {
      this.choose(this.energy < 0.78 ? 'doze' : this.random() < this.traits.patience ? 'preen' : 'settle')
      return
    }
    if (this.attention > 0.48) {
      this.choose(this.random() < this.traits.sociability ? 'observe' : 'settle')
      return
    }
    const roll = this.random()
    const strollChance = this.curiosity * (0.28 + this.traits.boldness * 0.44)
    if (roll < strollChance) {
      this.direction = this.random() < 0.5 ? -1 : 1
      this.choose('stroll')
    } else if (roll < strollChance + 0.16) {
      this.choose('preen')
    } else if (this.energy < 0.42 && roll > 0.72) {
      this.choose('doze')
    } else {
      this.choose(this.random() < 0.42 ? 'observe' : 'settle')
    }
  }

  private choose(activity: Activity): void {
    if (activity !== this.activity) {
      this.activity = activity
      this.activityAge = 0
    }
    const pace = 0.75 + this.traits.patience * 1.5
    this.nextDecision = pace * (2.2 + this.random() * 3.8)
  }
}

export function xorshift(seed: number): () => number {
  let value = seed >>> 0 || 0x9e3779b9
  return () => {
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    return (value >>> 0) / 0x1_0000_0000
  }
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
