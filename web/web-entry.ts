import '../src/web-style.css'

const storageKey = 'microduck-habitat-web-state'
const quietListeners = new Set<(quiet: boolean) => void>()

const defaults: HabitatSnapshot = {
  seed: 0x5eed1234,
  quiet: true,
  trust: 0.18,
  encounters: 0,
  bench: false,
  discoveries: 0,
  presenceAware: false,
  ownerPresent: true,
}

function loadSnapshot(): HabitatSnapshot {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<HabitatSnapshot>
    return {
      ...defaults,
      seed: Number.isInteger(saved.seed) ? Number(saved.seed) : defaults.seed,
      quiet: typeof saved.quiet === 'boolean' ? saved.quiet : defaults.quiet,
      trust: finite(saved.trust, defaults.trust),
      encounters: finite(saved.encounters, defaults.encounters),
      bench: typeof saved.bench === 'boolean' ? saved.bench : defaults.bench,
      discoveries: finite(saved.discoveries, defaults.discoveries) & 0b111,
    }
  } catch {
    return { ...defaults }
  }
}

function saveSnapshot(update: Partial<HabitatSnapshot>): void {
  localStorage.setItem(storageKey, JSON.stringify({ ...loadSnapshot(), ...update }))
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

const noopSubscription = (): (() => void) => () => undefined

window.habitat = {
  loadState: async () => loadSnapshot(),
  saveState: saveSnapshot,
  setQuiet: (quiet) => {
    saveSnapshot({ quiet })
    quietListeners.forEach((listener) => listener(quiet))
  },
  resetPosition: () => undefined,
  hide: () => undefined,
  setMotion: () => undefined,
  dragBegin: () => undefined,
  dragEnd: () => undefined,
  reportHitTest: () => undefined,
  onHitTest: noopSubscription,
  onEdge: noopSubscription,
  onQuietChanged: (callback) => {
    quietListeners.add(callback)
    return () => quietListeners.delete(callback)
  },
  onOwnerPresence: noopSubscription,
}

document.documentElement.dataset.web = 'true'
await import('../src/main')
