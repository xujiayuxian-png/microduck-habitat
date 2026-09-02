import { xorshift } from './mind'

export type VoiceTag = 'greet' | 'inquire' | 'chirp' | 'coo' | 'alarm'

type VoiceTraits = {
  centre: number
  brightness: number
  quackiness: number
  speed: number
}

export class DuckVoice {
  private readonly traits: VoiceTraits
  private context: AudioContext | null = null
  private quiet = false
  private variant = 0

  constructor(seed: number) {
    const random = xorshift(seed ^ 0x51f15e)
    this.traits = {
      centre: 255 + random() * 125,
      brightness: 0.35 + random() * 0.55,
      quackiness: 0.45 + random() * 0.48,
      speed: 0.85 + random() * 0.3,
    }
  }

  setQuiet(quiet: boolean): void {
    this.quiet = quiet
  }

  play(tag: VoiceTag): number {
    if (this.quiet || !navigator.userActivation.hasBeenActive) return 0
    this.context ??= new AudioContext({ sampleRate: 48_000 })
    if (this.context.state === 'suspended') void this.context.resume()

    const recipe = this.recipe(tag)
    const sampleRate = this.context.sampleRate
    const length = Math.ceil(recipe.duration * sampleRate)
    const buffer = this.context.createBuffer(1, length, sampleRate)
    const samples = buffer.getChannelData(0)
    const random = xorshift((this.variant += 1) * 0x9e3779b9)

    for (let index = 0; index < length; index += 1) {
      const time = index / sampleRate
      const progress = time / recipe.duration
      const pitch = this.traits.centre * recipe.pitch * (1 + recipe.glide * (progress - 0.5))
      const phase = Math.PI * 2 * pitch * time
      const attack = Math.min(1, progress / 0.075)
      const release = Math.min(1, (1 - progress) / 0.2)
      const pulse = 0.68 + this.traits.quackiness * 0.32 * Math.sin(time * Math.PI * 2 * 24)
      const envelope = smooth(attack) * smooth(release) * pulse
      const fundamental = Math.sin(phase)
      const second = Math.sin(phase * 2.01 + 0.2) * (0.22 + this.traits.brightness * 0.2)
      const third = Math.sin(phase * 3.02 + 1.1) * this.traits.brightness * 0.14
      const breath = (random() * 2 - 1) * (0.025 + (1 - this.traits.brightness) * 0.025)
      samples[index] = (fundamental + second + third + breath) * envelope * recipe.level * 0.42
    }

    const source = this.context.createBufferSource()
    const gain = this.context.createGain()
    const filter = this.context.createBiquadFilter()
    source.buffer = buffer
    filter.type = 'lowpass'
    filter.frequency.value = 1_450 + this.traits.brightness * 2_500
    gain.gain.value = 0.82
    source.connect(filter).connect(gain).connect(this.context.destination)
    source.start()
    return recipe.duration
  }

  private recipe(tag: VoiceTag): { duration: number; pitch: number; glide: number; level: number } {
    const speed = this.traits.speed
    switch (tag) {
      case 'greet':
        return { duration: 0.48 / speed, pitch: 1.08, glide: 0.34, level: 0.8 }
      case 'inquire':
        return { duration: 0.32 / speed, pitch: 1.2, glide: 0.58, level: 0.68 }
      case 'chirp':
        return { duration: 0.18 / speed, pitch: 1.42, glide: -0.14, level: 0.72 }
      case 'coo':
        return { duration: 0.72 / speed, pitch: 0.72, glide: -0.2, level: 0.52 }
      case 'alarm':
        return { duration: 0.24 / speed, pitch: 1.62, glide: -0.42, level: 0.9 }
    }
  }
}

function smooth(value: number): number {
  const x = Math.min(1, Math.max(0, value))
  return x * x * (3 - 2 * x)
}
