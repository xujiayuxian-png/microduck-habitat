import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { BehaviorIntent, MindFrame } from './mind'
import { xorshift } from './mind'

export type BenchStation = 'charge' | 'balance' | 'beacon'

export const BENCH_STATIONS: readonly BenchStation[] = ['charge', 'balance', 'beacon']

const STATION_X: Readonly<Record<BenchStation, number>> = {
  charge: -0.072,
  balance: 0,
  beacon: 0.072,
}

const STATION_BIT: Readonly<Record<BenchStation, number>> = {
  charge: 1,
  balance: 2,
  beacon: 4,
}

export type ExplorationStep = {
  position: number
  station: BenchStation
  discovery: number
  intent?: BehaviorIntent
}

export class WorkbenchExplorer {
  private readonly random: () => number
  private readonly visits: Record<BenchStation, number>
  private position = 0
  private destination: BenchStation = 'beacon'
  private arrived = false
  private dwellRemaining = 0
  private intentCooldown = 0
  private discoveries: number

  constructor(seed: number, discoveries = 0) {
    this.random = xorshift(seed ^ 0x6d2b79f5)
    this.discoveries = discoveries & 0b111
    this.visits = {
      charge: this.discoveries & STATION_BIT.charge ? 1 : 0,
      balance: this.discoveries & STATION_BIT.balance ? 1 : 0,
      beacon: this.discoveries & STATION_BIT.beacon ? 1 : 0,
    }
  }

  direct(station: BenchStation): void {
    this.destination = station
    this.arrived = false
    this.dwellRemaining = 0
    this.intentCooldown = 0
  }

  tick(dt: number, frame: MindFrame): ExplorationStep {
    this.intentCooldown = Math.max(0, this.intentCooldown - dt)
    const target = STATION_X[this.destination]
    const distance = target - this.position

    if (Math.abs(distance) > 0.003) {
      const direction: -1 | 1 = distance < 0 ? -1 : 1
      const intent = this.walkIntent(frame, direction)
      if (frame.activity === 'stroll') {
        this.position += direction * Math.min(Math.abs(distance), dt * 0.043)
      }
      return { position: this.position, station: this.destination, discovery: 0, intent }
    }

    this.position = target
    if (!this.arrived) {
      this.arrived = true
      this.visits[this.destination] += 1
      this.dwellRemaining = 3.8 + this.random() * 2.8
      const bit = STATION_BIT[this.destination]
      const discovery = this.discoveries & bit ? 0 : bit
      this.discoveries |= bit
      return {
        position: this.position,
        station: this.destination,
        discovery,
        intent: arrivalIntent(this.destination, frame.energy),
      }
    }

    this.dwellRemaining -= dt
    if (this.dwellRemaining <= 0 && frame.activity !== 'doze') {
      this.destination = this.chooseNext(frame)
      this.arrived = false
      this.intentCooldown = 0
    }
    return { position: this.position, station: this.destination, discovery: 0 }
  }

  snapshot(): Readonly<{ position: number; station: BenchStation; discoveries: number }> {
    return { position: this.position, station: this.destination, discoveries: this.discoveries }
  }

  private walkIntent(frame: MindFrame, direction: -1 | 1): BehaviorIntent | undefined {
    if (frame.activity === 'stroll' || this.intentCooldown > 0) return undefined
    this.intentCooldown = 1.1
    return { activity: 'stroll', confidence: 0.92, direction }
  }

  private chooseNext(frame: MindFrame): BenchStation {
    if (frame.energy < 0.38 && this.destination !== 'charge') return 'charge'
    if (frame.curiosity > 0.68 && this.destination !== 'beacon') return 'beacon'

    const candidates = BENCH_STATIONS.filter((station) => station !== this.destination)
    const fewestVisits = Math.min(...candidates.map((station) => this.visits[station]))
    const leastKnown = candidates.filter((station) => this.visits[station] === fewestVisits)
    return leastKnown[Math.floor(this.random() * leastKnown.length)] ?? 'balance'
  }
}

export class CalibrationBench {
  readonly root = new THREE.Group()
  readonly pickables: THREE.Object3D[] = []
  private readonly beaconLens: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
  private readonly chargeRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>
  private readonly balanceLights: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[] = []
  private readonly discoveryLights: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[] = []
  private focused: BenchStation = 'balance'
  private pulse = 0
  private discoveries = 0

  constructor(accent: THREE.Color, discoveries: number) {
    this.root.name = 'calibration-bench'
    this.root.visible = false

    const graphite = new THREE.MeshStandardMaterial({ color: 0x252a28, roughness: 0.78, metalness: 0.24 })
    const steel = new THREE.MeshStandardMaterial({ color: 0x9da5a1, roughness: 0.42, metalness: 0.68 })
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x4c5450, roughness: 0.54, metalness: 0.58 })
    const yellow = new THREE.MeshStandardMaterial({ color: 0xe8b51f, roughness: 0.5, metalness: 0.18 })

    const base = mesh(
      new RoundedBoxGeometry(0.43, 0.018, 0.245, 4, 0.008),
      graphite,
      [0, -0.019, 0.025],
    )
    this.addStationPart(base, 'balance')

    const inset = mesh(
      new RoundedBoxGeometry(0.39, 0.006, 0.205, 3, 0.004),
      darkSteel,
      [0, -0.007, 0.025],
    )
    this.addStationPart(inset, 'balance')

    const chargePad = mesh(new THREE.CylinderGeometry(0.049, 0.052, 0.009, 40), steel, [-0.155, 0, 0.038])
    this.addStationPart(chargePad, 'charge')
    this.chargeRing = mesh(
      new THREE.TorusGeometry(0.034, 0.003, 10, 40),
      new THREE.MeshStandardMaterial({
        color: accent,
        emissive: accent,
        emissiveIntensity: 0.22,
        roughness: 0.44,
      }),
      [-0.155, 0.006, 0.038],
    )
    this.chargeRing.rotation.x = Math.PI / 2
    this.addStationPart(this.chargeRing, 'charge')

    const rail = mesh(new RoundedBoxGeometry(0.13, 0.012, 0.022, 3, 0.004), steel, [0, 0.002, 0.098])
    this.addStationPart(rail, 'balance')
    for (const x of [-0.047, 0.047]) {
      const light = mesh(
        new THREE.SphereGeometry(0.006, 18, 12),
        new THREE.MeshStandardMaterial({ color: 0x7fd7d1, emissive: 0x4fb8b2, emissiveIntensity: 0.18 }),
        [x, 0.012, 0.088],
      )
      this.balanceLights.push(light)
      this.addStationPart(light, 'balance')
    }

    const beaconFoot = mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.012, 32), darkSteel, [0.164, 0, 0.052])
    const beaconStem = mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.062, 24), steel, [0.164, 0.036, 0.052])
    this.beaconLens = mesh(
      new THREE.SphereGeometry(0.017, 24, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffcf3f,
        emissive: 0xf0a600,
        emissiveIntensity: 0.38,
        roughness: 0.3,
      }),
      [0.164, 0.074, 0.052],
    )
    this.addStationPart(beaconFoot, 'beacon')
    this.addStationPart(beaconStem, 'beacon')
    this.addStationPart(this.beaconLens, 'beacon')

    const cableCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.196, -0.002, 0.055),
      new THREE.Vector3(-0.204, -0.002, 0.11),
      new THREE.Vector3(-0.13, -0.002, 0.134),
    ])
    const cable = mesh(new THREE.TubeGeometry(cableCurve, 24, 0.004, 8, false), yellow, [0, 0, 0])
    this.addStationPart(cable, 'charge')

    const statusBlock = mesh(
      new RoundedBoxGeometry(0.092, 0.018, 0.026, 3, 0.004),
      graphite,
      [0.105, 0.002, 0.132],
    )
    this.addStationPart(statusBlock, 'beacon')
    BENCH_STATIONS.forEach((station, index) => {
      const light = mesh(
        new THREE.SphereGeometry(0.005, 16, 10),
        new THREE.MeshStandardMaterial({ color: 0x68706c, emissive: accent, emissiveIntensity: 0 }),
        [0.08 + index * 0.025, 0.013, 0.12],
      )
      light.userData.station = station
      this.discoveryLights.push(light)
      this.root.add(light)
      this.pickables.push(light)
    })

    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    this.setDiscoveries(discoveries)
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible
  }

  focus(station: BenchStation): void {
    this.focused = station
  }

  activate(station: BenchStation): void {
    this.focused = station
    this.pulse = 1
  }

  stationFor(object: THREE.Object3D): BenchStation | null {
    const station = object.userData.station
    return station === 'charge' || station === 'balance' || station === 'beacon' ? station : null
  }

  setDiscoveries(discoveries: number): void {
    this.discoveries = discoveries & 0b111
    this.discoveryLights.forEach((light, index) => {
      const material = light.material
      const bit = 1 << index
      material.color.set(this.discoveries & bit ? 0xf6d45c : 0x68706c)
      material.emissiveIntensity = this.discoveries & bit ? 0.85 : 0
    })
  }

  tick(dt: number, time: number, energy: number): void {
    this.pulse = Math.max(0, this.pulse - dt * 1.7)
    const beat = 0.5 + Math.sin(time * 4.2) * 0.5
    this.beaconLens.material.emissiveIntensity =
      0.24 + (this.focused === 'beacon' ? beat * 0.85 : 0) + this.pulse * 1.25
    this.chargeRing.material.emissiveIntensity =
      0.16 + (this.focused === 'charge' ? (1 - energy) * 1.4 + beat * 0.18 : 0)
    this.balanceLights.forEach((light, index) => {
      light.material.emissiveIntensity =
        0.14 + (this.focused === 'balance' ? 0.4 + Math.sin(time * 3.1 + index * Math.PI) * 0.18 : 0)
    })
  }

  private addStationPart(object: THREE.Object3D, station: BenchStation): void {
    object.userData.station = station
    this.root.add(object)
    this.pickables.push(object)
  }
}

function arrivalIntent(station: BenchStation, energy: number): BehaviorIntent {
  if (station === 'charge') {
    return energy < 0.48
      ? { activity: 'doze', confidence: 0.94 }
      : { activity: 'observe', confidence: 0.82 }
  }
  if (station === 'balance') return { activity: 'preen', confidence: 0.82 }
  return { activity: 'observe', confidence: 0.9 }
}

function mesh<G extends THREE.BufferGeometry, M extends THREE.Material>(
  geometry: G,
  material: M,
  position: readonly [number, number, number],
): THREE.Mesh<G, M> {
  const result = new THREE.Mesh(geometry, material)
  result.position.set(...position)
  return result
}
