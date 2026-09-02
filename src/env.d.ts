/// <reference types="vite/client" />

declare module 'lucide/dist/esm/createElement.js' {
  import type { IconNode, SVGProps } from 'lucide'
  export default function createElement(icon: IconNode, customAttrs?: SVGProps): SVGElement
}

declare module 'lucide/dist/esm/icons/*.js' {
  import type { IconNode } from 'lucide'
  const icon: IconNode
  export default icon
}

type HabitatSnapshot = {
  seed: number
  quiet: boolean
  trust: number
  encounters: number
  bench: boolean
  discoveries: number
  presenceAware: boolean
  ownerPresent: boolean
}

type HabitatHitTest = {
  sequence: number
  x: number
  y: number
}

interface HabitatBridge {
  loadState(): Promise<HabitatSnapshot>
  saveState(state: Partial<HabitatSnapshot>): void
  setQuiet(quiet: boolean): void
  resetPosition(): void
  hide(): void
  setMotion(direction: -1 | 0 | 1): void
  dragBegin(): void
  dragEnd(): void
  reportHitTest(sequence: number, interactive: boolean): void
  onHitTest(callback: (point: HabitatHitTest) => void): () => void
  onEdge(callback: (direction: -1 | 1) => void): () => void
  onQuietChanged(callback: (quiet: boolean) => void): () => void
  onOwnerPresence(callback: (present: boolean) => void): () => void
}

interface Window {
  habitat: HabitatBridge
}
