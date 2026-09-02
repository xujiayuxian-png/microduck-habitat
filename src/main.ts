import type { IconNode } from 'lucide'
import createElement from 'lucide/dist/esm/createElement.js'
import EllipsisVertical from 'lucide/dist/esm/icons/ellipsis-vertical.js'
import GripHorizontal from 'lucide/dist/esm/icons/grip-horizontal.js'
import House from 'lucide/dist/esm/icons/house.js'
import Moon from 'lucide/dist/esm/icons/moon.js'
import Sun from 'lucide/dist/esm/icons/sun.js'
import Volume2 from 'lucide/dist/esm/icons/volume-2.js'
import VolumeX from 'lucide/dist/esm/icons/volume-x.js'
import Wrench from 'lucide/dist/esm/icons/wrench.js'
import X from 'lucide/dist/esm/icons/x.js'
import * as THREE from 'three'
import { DuckAnimator } from './animation'
import { accentFor, DuckRig } from './duck-model'
import { PetMind, type Activity, type BehaviorController } from './mind'
import { DuckVoice, type VoiceTag } from './voice'
import { CalibrationBench, WorkbenchExplorer, type BenchStation } from './workbench'
import './style.css'

const canvas = required<HTMLCanvasElement>('world')
const presence = required<HTMLElement>('presence')
const controls = required<HTMLElement>('controls')
const menuToggle = required<HTMLButtonElement>('menu-toggle')
const quietButton = required<HTMLButtonElement>('quiet')
const restButton = required<HTMLButtonElement>('rest')
const benchButton = required<HTMLButtonElement>('bench')
const homeButton = required<HTMLButtonElement>('home')
const closeButton = required<HTMLButtonElement>('close')
const dragHandle = required<HTMLElement>('drag-handle')

setIcon(restButton, Moon)
setIcon(benchButton, Wrench)
setIcon(homeButton, House)
setIcon(closeButton, X)
setIcon(dragHandle, GripHorizontal)
setIcon(menuToggle, EllipsisVertical)

menuToggle.addEventListener('click', () => {
  const open = controls.dataset.open !== 'true'
  controls.dataset.open = String(open)
  menuToggle.setAttribute('aria-expanded', String(open))
})

for (const action of [quietButton, restButton, benchButton, homeButton, closeButton]) {
  action.addEventListener('click', closeControls)
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true,
})
renderer.setClearColor(0x000000, 0)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight, false)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.01, 4)
const desktopCameraPosition = new THREE.Vector3(0.48, 0.28, 0.4)
const desktopCameraTarget = new THREE.Vector3(0, 0.14, 0)
const benchCameraPosition = new THREE.Vector3(0.79, 0.45, 0.73)
const benchCameraTarget = new THREE.Vector3(0.03, 0.14, 0.035)
const cameraTarget = desktopCameraTarget.clone()
camera.position.copy(desktopCameraPosition)
camera.lookAt(desktopCameraTarget)

scene.add(new THREE.HemisphereLight(0xfffbef, 0x58605c, 2.1))
const key = new THREE.DirectionalLight(0xfff2d0, 4.2)
key.position.set(0.34, 0.65, 0.42)
key.castShadow = true
key.shadow.mapSize.set(1_024, 1_024)
key.shadow.camera.left = -0.35
key.shadow.camera.right = 0.35
key.shadow.camera.top = 0.35
key.shadow.camera.bottom = -0.12
scene.add(key)

const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.13, 48),
  new THREE.ShadowMaterial({ color: 0x101211, opacity: 0.26 }),
)
shadow.rotation.x = -Math.PI / 2
shadow.scale.set(1.25, 0.64, 1)
shadow.receiveShadow = true
scene.add(shadow)

const assetFrame = new THREE.Group()
assetFrame.rotation.x = -Math.PI / 2
const stage = new THREE.Group()
stage.add(assetFrame)
scene.add(stage)

const saved = await window.habitat.loadState()
const mind: BehaviorController = new PetMind(saved.seed, {
  trust: saved.trust,
  encounters: saved.encounters,
})
if (!saved.ownerPresent) mind.stimulate({ type: 'owner-away' })
const voice = new DuckVoice(saved.seed)
const forcedActivity = captureActivity()
const calibrationBench = new CalibrationBench(accentFor(saved.seed), saved.discoveries)
const explorer = new WorkbenchExplorer(saved.seed, saved.discoveries)
scene.add(calibrationBench.root)
voice.setQuiet(saved.quiet)
setQuietUi(saved.quiet)

let quiet = saved.quiet
let benchOpen = saved.bench
let discoveries = saved.discoveries
let rig: DuckRig
let animator: DuckAnimator
try {
  rig = await DuckRig.load(saved.seed)
  assetFrame.add(rig.root)
  animator = new DuckAnimator(rig, stage)
} catch (error) {
  presence.textContent = 'asset error'
  presence.dataset.visible = 'true'
  throw error
}
calibrationBench.setVisible(benchOpen)
setBenchUi(benchOpen)

const pointer = new THREE.Vector2(2, 2)
const raycaster = new THREE.Raycaster()
let pointerInside = false
let pointerDown = false
let touchingDuck = false
let lastTouchAt = 0
let lastFrame = performance.now()
let lastSaved = performance.now()
let lastProximityAt = 0
let bubbleTimer = 0
let previousActivity = 'settle'
let lastMotionDirection: -1 | 0 | 1 = 0
let pendingReturnGreeting = false

canvas.addEventListener('pointermove', (event) => {
  updatePointer(event)
  const hit = duckHit()
  const station = benchStationHit()
  touchingDuck = hit !== null
  canvas.style.cursor = hit || station ? 'pointer' : 'default'
  const side = (event.clientX / window.innerWidth) * 2 - 1
  const height = 1 - (event.clientY / window.innerHeight) * 2
  mind.stimulate({ type: 'pointer-near', side, height })
  if (pointerDown && hit && performance.now() - lastTouchAt > 85) {
    mind.stimulate({ type: 'touch', head: rig.isHeadPart(hit.object), intensity: 0.22 })
    lastTouchAt = performance.now()
  }
})

canvas.addEventListener('pointerenter', () => {
  pointerInside = true
})

canvas.addEventListener('pointerleave', () => {
  pointerInside = false
  pointerDown = false
  touchingDuck = false
  pointer.set(2, 2)
  mind.stimulate({ type: 'pointer-left' })
})

canvas.addEventListener('pointerdown', (event) => {
  updatePointer(event)
  pointerDown = true
  const hit = duckHit()
  if (!hit) {
    const station = benchStationHit()
    if (station) {
      explorer.direct(station)
      calibrationBench.activate(station)
      mind.suggest({
        activity: 'stroll',
        confidence: 0.96,
        direction: station === 'charge' ? -1 : 1,
      })
      vocalize('inquire')
      showPresence('?')
      return
    }
    mind.stimulate({ type: 'surprise', strength: 0.5 })
    return
  }
  const head = rig.isHeadPart(hit.object)
  mind.stimulate({ type: 'touch', head, intensity: 0.75 })
  vocalize(head ? 'coo' : 'chirp')
  showPresence(head ? '...' : '?')
})

window.addEventListener('pointerup', () => {
  pointerDown = false
})

quietButton.addEventListener('click', () => {
  quiet = !quiet
  voice.setQuiet(quiet)
  window.habitat.setQuiet(quiet)
  setQuietUi(quiet)
})

restButton.addEventListener('click', () => {
  if (previousActivity === 'doze') {
    mind.stimulate({ type: 'wake' })
    showPresence('!')
  } else {
    mind.stimulate({ type: 'rest-request' })
    showPresence('z z')
  }
})

benchButton.addEventListener('click', () => {
  benchOpen = !benchOpen
  calibrationBench.setVisible(benchOpen)
  setBenchUi(benchOpen)
  if (benchOpen) {
    mind.suggest({ activity: 'observe', confidence: 0.86 })
    vocalize('inquire')
  } else {
    stage.position.x = 0
    shadow.position.x = 0
  }
  window.habitat.saveState({ ...mind.memory(), bench: benchOpen, discoveries })
})

homeButton.addEventListener('click', () => window.habitat.resetPosition())
closeButton.addEventListener('click', () => {
  window.habitat.saveState(mind.memory())
  window.habitat.hide()
})

dragHandle.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  dragHandle.setPointerCapture(event.pointerId)
  window.habitat.dragBegin()
})
dragHandle.addEventListener('pointerup', () => window.habitat.dragEnd())
dragHandle.addEventListener('pointercancel', () => window.habitat.dragEnd())
window.addEventListener('blur', () => window.habitat.dragEnd())

window.habitat.onHitTest(({ sequence, x, y }) => {
  const now = performance.now()
  if (now - lastProximityAt > 100) {
    mind.stimulate({
      type: 'pointer-near',
      side: (x / window.innerWidth) * 2 - 1,
      height: 1 - (y / window.innerHeight) * 2,
    })
    lastProximityAt = now
  }
  const element = document.elementFromPoint(x, y)
  const isControl = element instanceof Element && Boolean(element.closest('#controls, #drag-handle'))
  window.habitat.reportHitTest(
    sequence,
    isControl || duckHitAt(x, y) !== null || benchStationHitAt(x, y) !== null,
  )
})

window.habitat.onEdge((direction) => mind.stimulate({ type: 'edge', direction }))
window.habitat.onQuietChanged((value) => {
  quiet = value
  voice.setQuiet(value)
  setQuietUi(value)
})
window.habitat.onOwnerPresence((present) => {
  if (present) {
    mind.stimulate({ type: 'owner-returned' })
    pendingReturnGreeting = true
  } else {
    pendingReturnGreeting = false
    mind.stimulate({ type: 'owner-away' })
  }
})

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight, false)
})

function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1_000))
  lastFrame = now
  const naturalState = mind.tick(dt)
  const greetOnFrame = pendingReturnGreeting && naturalState.activity !== 'doze'
  pendingReturnGreeting = false
  const state = forcedActivity
    ? { ...naturalState, activity: forcedActivity, attention: 0, look: [0, 0] as [number, number] }
    : naturalState
  animator.tick(dt, now / 1_000, state)

  if (benchOpen && !forcedActivity) {
    const exploration = explorer.tick(dt, state)
    stage.position.x = exploration.position
    shadow.position.x = exploration.position
    calibrationBench.focus(exploration.station)
    calibrationBench.tick(dt, now / 1_000, state.energy)
    if (exploration.intent) mind.suggest(exploration.intent)
    if (exploration.discovery !== 0) {
      discoveries |= exploration.discovery
      calibrationBench.setDiscoveries(discoveries)
      calibrationBench.activate(exploration.station)
      window.habitat.saveState({ ...mind.memory(), bench: true, discoveries })
      vocalize('chirp')
      showPresence('!')
    }
  } else if (!benchOpen) {
    stage.position.x = THREE.MathUtils.damp(stage.position.x, 0, 12, dt)
    shadow.position.x = stage.position.x
  }
  updateCamera(dt)

  const motionDirection = !benchOpen && state.activity === 'stroll' ? state.direction : 0
  if (motionDirection !== lastMotionDirection) {
    window.habitat.setMotion(motionDirection)
    lastMotionDirection = motionDirection
  }

  if (state.activity !== previousActivity) {
    onActivityChanged(state.activity)
    previousActivity = state.activity
  }
  if (greetOnFrame) {
    vocalize('coo')
    showPresence('...')
  }
  if (!pointerInside && state.attention < 0.08) {
    pointer.set(2, 2)
  }
  if (bubbleTimer > 0) {
    bubbleTimer -= dt
    if (bubbleTimer <= 0) presence.dataset.visible = 'false'
  }
  if (now - lastSaved > 15_000) {
    window.habitat.saveState(mind.memory())
    lastSaved = now
  }

  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)

function onActivityChanged(activity: string): void {
  setRestUi(activity === 'doze')
  if (activity === 'observe') {
    showPresence('?')
    if (Math.random() < 0.3) vocalize('inquire')
  } else if (activity === 'delight') {
    showPresence('...')
  } else if (activity === 'startle') {
    showPresence('!')
    vocalize('alarm')
  } else if (activity === 'doze') {
    showPresence('z z')
  }
}

function vocalize(tag: VoiceTag): void {
  animator.vocalize(voice.play(tag))
}

function updatePointer(event: PointerEvent): void {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1
  pointer.y = 1 - (event.clientY / window.innerHeight) * 2
}

function duckHit(): THREE.Intersection<THREE.Object3D> | null {
  raycaster.setFromCamera(pointer, camera)
  return raycaster.intersectObjects(rig.pickables, false)[0] ?? null
}

function duckHitAt(x: number, y: number): THREE.Intersection<THREE.Object3D> | null {
  pointer.x = (x / window.innerWidth) * 2 - 1
  pointer.y = 1 - (y / window.innerHeight) * 2
  return duckHit()
}

function benchStationHit(): BenchStation | null {
  if (!benchOpen) return null
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects(calibrationBench.pickables, false)[0]
  return hit ? calibrationBench.stationFor(hit.object) : null
}

function benchStationHitAt(x: number, y: number): BenchStation | null {
  pointer.x = (x / window.innerWidth) * 2 - 1
  pointer.y = 1 - (y / window.innerHeight) * 2
  return benchStationHit()
}

function showPresence(text: string): void {
  presence.textContent = text
  presence.dataset.visible = 'true'
  bubbleTimer = 1.5
}

function updateCamera(dt: number): void {
  const position = benchOpen ? benchCameraPosition : desktopCameraPosition
  const target = benchOpen ? benchCameraTarget : desktopCameraTarget
  camera.position.lerp(position, 1 - Math.exp(-5.5 * dt))
  cameraTarget.lerp(target, 1 - Math.exp(-5.5 * dt))
  camera.fov = THREE.MathUtils.damp(camera.fov, benchOpen ? 34 : 30, 5.5, dt)
  camera.updateProjectionMatrix()
  camera.lookAt(cameraTarget)
}

function setQuietUi(value: boolean): void {
  quietButton.dataset.active = String(value)
  quietButton.title = value ? 'Leave quiet mode' : 'Quiet mode'
  quietButton.setAttribute('aria-label', quietButton.title)
  setIcon(quietButton, value ? VolumeX : Volume2)
}

function setRestUi(resting: boolean): void {
  restButton.title = resting ? 'Wake Microduck' : 'Let Microduck rest'
  restButton.setAttribute('aria-label', restButton.title)
  setIcon(restButton, resting ? Sun : Moon)
}

function setBenchUi(active: boolean): void {
  benchButton.dataset.active = String(active)
  benchButton.title = active ? 'Close the calibration bench' : 'Open the calibration bench'
  benchButton.setAttribute('aria-label', benchButton.title)
}

function setIcon(element: HTMLElement, icon: IconNode): void {
  element.replaceChildren(createElement(icon))
}

function closeControls(): void {
  controls.dataset.open = 'false'
  menuToggle.setAttribute('aria-expanded', 'false')
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`missing #${id}`)
  return element as T
}

function captureActivity(): Activity | null {
  const value = new URLSearchParams(window.location.search).get('activity')
  switch (value) {
    case 'settle':
    case 'observe':
    case 'stroll':
    case 'preen':
    case 'doze':
    case 'delight':
    case 'startle':
      return value
    default:
      return null
  }
}
