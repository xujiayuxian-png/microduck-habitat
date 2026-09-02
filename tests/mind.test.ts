import { describe, expect, it } from 'vitest'
import { PetMind, xorshift } from '../src/mind'

describe('PetMind', () => {
  it('gives one seed a stable personality', () => {
    const first = new PetMind(42, { trust: 0.2, encounters: 0 })
    const second = new PetMind(42, { trust: 0.2, encounters: 0 })

    expect(first.traitsSnapshot()).toEqual(second.traitsSnapshot())
    for (let index = 0; index < 100; index += 1) {
      expect(first.tick(0.1)).toEqual(second.tick(0.1))
    }
  })

  it('turns repeated head contact into trust and delight', () => {
    const mind = new PetMind(7, { trust: 0.1, encounters: 0 })
    for (let index = 0; index < 4; index += 1) {
      mind.stimulate({ type: 'touch', head: true, intensity: 0.8 })
    }

    const frame = mind.tick(0.02)
    expect(frame.activity).toBe('delight')
    expect(frame.trust).toBeGreaterThan(0.1)
  })

  it('honours rest until explicitly woken', () => {
    const mind = new PetMind(99, { trust: 0.4, encounters: 2 })
    mind.stimulate({ type: 'rest-request' })
    for (let index = 0; index < 1_000; index += 1) mind.tick(0.05)
    expect(mind.tick(0.01).activity).toBe('doze')

    mind.stimulate({ type: 'wake' })
    expect(mind.tick(0.01).activity).toBe('observe')
  })

  it('uses a reproducible random stream without returning one', () => {
    const random = xorshift(1)
    const values = Array.from({ length: 8 }, random)
    expect(values).toEqual(Array.from({ length: 8 }, xorshift(1)))
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
  })

  it('turns around when a desktop edge interrupts a stroll', () => {
    const mind = new PetMind(13, { trust: 0.2, encounters: 0 })
    const before = mind.tick(0.01).direction
    mind.stimulate({ type: 'edge', direction: before })
    const after = mind.tick(0.01)

    expect(after.activity).toBe('stroll')
    expect(after.direction).toBe(-before)
  })

  it('arbitrates high-level agent suggestions instead of exposing joints', () => {
    const mind = new PetMind(17, { trust: 0.2, encounters: 0 })

    expect(mind.suggest({ activity: 'stroll', confidence: 0.2, direction: 1 })).toBe(false)
    expect(mind.tick(0.01).activity).toBe('settle')

    expect(mind.suggest({ activity: 'stroll', confidence: 1, direction: 1 })).toBe(true)
    const exploring = mind.tick(0.01)
    expect(exploring.activity).toBe('stroll')
    expect(exploring.direction).toBe(1)

    mind.stimulate({ type: 'rest-request' })
    expect(mind.suggest({ activity: 'stroll', confidence: 1, direction: -1 })).toBe(false)
    expect(mind.tick(0.01).activity).toBe('doze')
  })

  it('settles into quiet local behavior while its owner is away', () => {
    const mind = new PetMind(23, { trust: 0.2, encounters: 0 })
    mind.stimulate({ type: 'owner-away' })
    let rested = false

    for (let index = 0; index < 1_200; index += 1) {
      const frame = mind.tick(0.05)
      rested ||= frame.activity === 'doze'
      expect(frame.activity).not.toBe('stroll')
      expect(frame.activity).not.toBe('delight')
    }
    expect(rested).toBe(true)
  })

  it('greets a returning owner according to personality without forcing affection', () => {
    const reserved = new PetMind(5, { trust: 0.1, encounters: 0 })
    reserved.stimulate({ type: 'owner-away' })
    reserved.stimulate({ type: 'owner-returned' })
    const greeting = reserved.tick(0.01)

    expect(['observe', 'delight']).toContain(greeting.activity)
    expect(greeting.attention).toBeGreaterThan(0.9)
  })

  it('does not let a return event override explicit rest', () => {
    const mind = new PetMind(29, { trust: 0.6, encounters: 4 })
    mind.stimulate({ type: 'rest-request' })
    mind.stimulate({ type: 'owner-away' })
    mind.stimulate({ type: 'owner-returned' })

    expect(mind.tick(0.01).activity).toBe('doze')
  })

  it('rejects roaming suggestions while nobody is present', () => {
    const mind = new PetMind(37, { trust: 0.3, encounters: 1 })
    mind.stimulate({ type: 'owner-away' })

    expect(mind.suggest({ activity: 'stroll', confidence: 1, direction: 1 })).toBe(false)
    expect(mind.suggest({ activity: 'observe', confidence: 1 })).toBe(false)
    expect(mind.suggest({ activity: 'preen', confidence: 1 })).toBe(true)
  })
})
