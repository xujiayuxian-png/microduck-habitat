import { describe, expect, it } from 'vitest'
import type { MindFrame } from '../src/mind'
import { WorkbenchExplorer } from '../src/workbench'

const walkingFrame: MindFrame = {
  activity: 'stroll',
  energy: 0.72,
  curiosity: 0.52,
  trust: 0.3,
  attention: 0,
  look: [0, 0],
  direction: 1,
  changed: false,
}

describe('WorkbenchExplorer', () => {
  it('keeps exploration reproducible for one duck seed', () => {
    const first = new WorkbenchExplorer(42)
    const second = new WorkbenchExplorer(42)

    for (let index = 0; index < 800; index += 1) {
      expect(first.tick(0.05, walkingFrame)).toEqual(second.tick(0.05, walkingFrame))
    }
  })

  it('visits unknown stations before endlessly repeating one', () => {
    const explorer = new WorkbenchExplorer(7)
    let discoveries = 0
    for (let index = 0; index < 1_200 && discoveries !== 0b111; index += 1) {
      discoveries |= explorer.tick(0.05, walkingFrame).discovery
    }

    expect(discoveries).toBe(0b111)
  })

  it('returns to the charge station when energy is low', () => {
    const explorer = new WorkbenchExplorer(19)
    const tiredFrame = { ...walkingFrame, energy: 0.2 }
    let foundCharge = false

    for (let index = 0; index < 700 && !foundCharge; index += 1) {
      foundCharge = explorer.tick(0.05, tiredFrame).discovery === 1
    }

    expect(foundCharge).toBe(true)
  })

  it('accepts a direct station choice as a high-level destination', () => {
    const explorer = new WorkbenchExplorer(31)
    explorer.direct('charge')
    const waitingFrame = { ...walkingFrame, activity: 'settle' as const }

    const firstStep = explorer.tick(0.05, waitingFrame)
    expect(firstStep.station).toBe('charge')
    expect(firstStep.intent).toEqual({ activity: 'stroll', confidence: 0.92, direction: -1 })
  })
})
