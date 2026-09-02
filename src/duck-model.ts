import * as THREE from 'three'
import duckAssetUrl from '../assets/duck.bin?url'

const FORMAT_VERSION = 1
const JOINT_COUNT = 15

export const HOME_POSE: readonly number[] = [
  0,
  -0.0873,
  -0.4579,
  -0.0049,
  0.453,
  0.3491,
  0.3491,
  0,
  0,
  0,
  0,
  0.0873,
  0.4579,
  0.0049,
  -0.453,
]

type BakedMesh = {
  vertices: Float32Array
  indices: Uint16Array
}

type BakedBody = {
  parent: number
  joint: number
  position: THREE.Vector3
  rotation: THREE.Quaternion
  axis: THREE.Vector3
}

type BakedPart = {
  body: number
  mesh: number
  color: THREE.Color
  position: THREE.Vector3
  rotation: THREE.Quaternion
}

type BakedDuck = {
  meshes: BakedMesh[]
  bodies: BakedBody[]
  parts: BakedPart[]
}

class Cursor {
  private readonly view: DataView
  private at = 0

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer)
  }

  bytes(length: number): Uint8Array {
    this.ensure(length)
    const value = new Uint8Array(this.view.buffer, this.at, length)
    this.at += length
    return value
  }

  u16(): number {
    this.ensure(2)
    const value = this.view.getUint16(this.at, true)
    this.at += 2
    return value
  }

  i16(): number {
    this.ensure(2)
    const value = this.view.getInt16(this.at, true)
    this.at += 2
    return value
  }

  u32(): number {
    this.ensure(4)
    const value = this.view.getUint32(this.at, true)
    this.at += 4
    return value
  }

  f32(): number {
    this.ensure(4)
    const value = this.view.getFloat32(this.at, true)
    this.at += 4
    return value
  }

  vec3(): THREE.Vector3 {
    return new THREE.Vector3(this.f32(), this.f32(), this.f32())
  }

  quaternion(): THREE.Quaternion {
    const w = this.f32()
    const x = this.f32()
    const y = this.f32()
    const z = this.f32()
    return new THREE.Quaternion(x, y, z, w).normalize()
  }

  private ensure(length: number): void {
    if (this.at + length > this.view.byteLength) {
      throw new Error('duck.bin ended before its declared model was complete')
    }
  }
}

function parseDuck(buffer: ArrayBuffer): BakedDuck {
  const cursor = new Cursor(buffer)
  const magic = String.fromCharCode(...cursor.bytes(4))
  const version = cursor.u32()
  if (magic !== 'DUCK' || version !== FORMAT_VERSION) {
    throw new Error(`unsupported duck asset ${JSON.stringify(magic)} v${version}`)
  }

  const meshCount = cursor.u16()
  const bodyCount = cursor.u16()
  const partCount = cursor.u16()
  const meshes: BakedMesh[] = []
  for (let i = 0; i < meshCount; i += 1) {
    const vertexCount = cursor.u16()
    const triangleCount = cursor.u16()
    const vertices = new Float32Array(vertexCount * 3)
    const indices = new Uint16Array(triangleCount * 3)
    for (let j = 0; j < vertices.length; j += 1) vertices[j] = cursor.f32()
    for (let j = 0; j < indices.length; j += 1) indices[j] = cursor.u16()
    orientFacesOutward(vertices, indices)
    meshes.push({ vertices, indices })
  }

  const bodies: BakedBody[] = []
  for (let i = 0; i < bodyCount; i += 1) {
    const parent = cursor.i16()
    const joint = cursor.i16()
    const body: BakedBody = {
      parent,
      joint,
      position: cursor.vec3(),
      rotation: cursor.quaternion(),
      axis: cursor.vec3().normalize(),
    }
    if (body.parent >= i || body.joint >= JOINT_COUNT) {
      throw new Error(`duck body ${i} has invalid parent or joint`)
    }
    bodies.push(body)
  }

  const parts: BakedPart[] = []
  for (let i = 0; i < partCount; i += 1) {
    const body = cursor.u16()
    const mesh = cursor.u16()
    const rgb = cursor.bytes(4)
    const red = rgb[0]
    const green = rgb[1]
    const blue = rgb[2]
    if (red === undefined || green === undefined || blue === undefined) {
      throw new Error(`duck part ${i} has no material colour`)
    }
    if (body >= bodies.length || mesh >= meshes.length) {
      throw new Error(`duck part ${i} refers to a missing body or mesh`)
    }
    parts.push({
      body,
      mesh,
      color: new THREE.Color(red / 255, green / 255, blue / 255),
      position: cursor.vec3(),
      rotation: cursor.quaternion(),
    })
  }
  return { meshes, bodies, parts }
}

export class DuckRig {
  readonly root = new THREE.Group()
  readonly pickables: THREE.Mesh[] = []
  private readonly bodyNodes: THREE.Group[]
  private readonly bodies: BakedBody[]
  private readonly restRotations: THREE.Quaternion[]
  private mouthPivot: THREE.Group | null = null

  private constructor(model: BakedDuck, accent: THREE.Color) {
    this.bodies = model.bodies
    this.bodyNodes = model.bodies.map(() => new THREE.Group())
    this.restRotations = model.bodies.map((body) => body.rotation.clone())
    const headIndex = this.bodies.findIndex((body) => body.joint === 8)
    const headParts: THREE.Mesh[] = []
    const headAccentParts: THREE.Mesh[] = []

    model.bodies.forEach((body, index) => {
      const node = this.bodyNodes[index]
      if (!node) return
      node.name = `duck-body-${index}`
      node.position.copy(body.position)
      node.quaternion.copy(body.rotation)
      if (body.parent < 0) this.root.add(node)
      else this.bodyNodes[body.parent]?.add(node)
    })

    const geometries = model.meshes.map(({ vertices, indices }) => {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
      geometry.setIndex(new THREE.BufferAttribute(indices, 1))
      geometry.computeVertexNormals()
      geometry.computeBoundingSphere()
      return geometry
    })

    model.parts.forEach((part, index) => {
      const geometry = geometries[part.mesh]
      const body = this.bodyNodes[part.body]
      if (!geometry || !body) return
      const material = new THREE.MeshStandardMaterial({
        color: isAccent(part.color) ? accent : part.color,
        roughness: 0.72,
        metalness: 0.02,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = `duck-part-${index}`
      mesh.position.copy(part.position)
      mesh.quaternion.copy(part.rotation)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData.body = part.body
      body.add(mesh)
      this.pickables.push(mesh)
      if (part.body === headIndex) {
        headParts.push(mesh)
        if (isAccent(part.color)) headAccentParts.push(mesh)
      }
    })

    this.attachMouth(headIndex, headParts, headAccentParts)
    this.addCameraEye(headIndex, accent)

    this.root.name = 'microduck'
    this.setPose(HOME_POSE)
  }

  static async load(seed: number): Promise<DuckRig> {
    const response = await fetch(duckAssetUrl)
    if (!response.ok) throw new Error(`could not load duck.bin: ${response.status}`)
    return new DuckRig(parseDuck(await response.arrayBuffer()), accentFor(seed))
  }

  setPose(joints: readonly number[]): void {
    if (joints.length !== JOINT_COUNT) throw new Error(`expected ${JOINT_COUNT} joints`)
    this.bodies.forEach((body, index) => {
      const node = this.bodyNodes[index]
      const rest = this.restRotations[index]
      if (!node || !rest) return
      node.quaternion.copy(rest)
      if (body.joint >= 0) {
        const angle = joints[body.joint] ?? 0
        node.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(body.axis, angle))
      }
    })
  }

  isHeadPart(mesh: THREE.Object3D): boolean {
    let bodyIndex = Number(mesh.userData.body)
    while (Number.isInteger(bodyIndex) && bodyIndex >= 0) {
      const body = this.bodies[bodyIndex]
      if (!body) break
      if (body.joint >= 5 && body.joint <= 8) return true
      bodyIndex = body.parent
    }
    return false
  }

  setMouth(openness: number): void {
    if (this.mouthPivot) {
      this.mouthPivot.rotation.y = Math.min(1, Math.max(0, openness)) * 0.16
    }
  }

  private attachMouth(
    headIndex: number,
    headParts: THREE.Mesh[],
    accentParts: THREE.Mesh[],
  ): void {
    const head = this.bodyNodes[headIndex]
    if (!head) return

    // The head carries two accent parts: a band that wraps all the way around
    // the shell and the servo-driven beak. The beak is the one whose bounds
    // stay in front of the head centre (local -Z); the band reaches behind it.
    const lowerBeak = accentParts.find((mesh) => {
      mesh.geometry.computeBoundingBox()
      const bounds = mesh.geometry.boundingBox
      if (!bounds) return false
      mesh.updateMatrix()
      return bounds.clone().applyMatrix4(mesh.matrix).max.z < 0
    })
    if (!lowerBeak) return

    const bounds = lowerBeak.geometry.boundingBox?.clone().applyMatrix4(lowerBeak.matrix)
    if (!bounds) return

    // The CAD mouth is a two-part assembly: the coloured rigid jaw surrounds
    // a pale flexible insert. A second pale strip belongs to the fixed upper
    // mouth, so choose the front-facing, wide insert whose centre is lowest
    // on the head's local X (X is vertical in this body frame).
    const lowerInsert = headParts
      .filter((mesh) => mesh !== lowerBeak && !accentParts.includes(mesh))
      .map((mesh) => {
        mesh.geometry.computeBoundingBox()
        mesh.updateMatrix()
        const meshBounds = mesh.geometry.boundingBox?.clone().applyMatrix4(mesh.matrix)
        return meshBounds ? { mesh, bounds: meshBounds } : null
      })
      .filter((entry): entry is { mesh: THREE.Mesh; bounds: THREE.Box3 } => entry !== null)
      .filter(({ bounds: candidate }) => {
        const size = candidate.getSize(new THREE.Vector3())
        return (
          candidate.min.z < -0.07 &&
          candidate.max.z < -0.035 &&
          size.x < 0.015 &&
          size.y > 0.07
        )
      })
      .sort((left, right) => {
        const leftHeight = left.bounds.getCenter(new THREE.Vector3()).x
        const rightHeight = right.bounds.getCenter(new THREE.Vector3()).x
        return leftHeight - rightHeight
      })[0]?.mesh

    // The baked beak is fixed because the hardware mouth servo is not an MJCF
    // joint. Hinge it where it meets the mouth servo: the rear top corner of
    // the beak (max x is up, max z is rear in head-local space) sits against
    // the servo's rear face. The camera-facing tip then swings downward
    // during voice envelopes.
    const pivot = new THREE.Group()
    pivot.name = 'duck-mouth-pivot'
    pivot.position.set(bounds.max.x - 0.002, 0, bounds.max.z)
    for (const part of lowerInsert ? [lowerBeak, lowerInsert] : [lowerBeak]) {
      part.position.sub(pivot.position)
      head.remove(part)
      pivot.add(part)
    }
    head.add(pivot)
    this.mouthPivot = pivot
  }

  private addCameraEye(headIndex: number, accent: THREE.Color): void {
    const head = this.bodyNodes[headIndex]
    if (!head) return

    // The baked asset already contains the real face panel. Only the camera
    // assembly is absent. Its MJCF mount faces local -Z at (0.01175, 0, -0.0735).
    // On the hardware the eye is a flat accent-coloured ring sitting nearly
    // flush with the panel, with the dark lens at its front plane.
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.0025, 32),
      new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6, metalness: 0.04 }),
    )
    ring.name = 'duck-camera-ring'
    ring.position.set(0.01175, 0, -0.07435)
    ring.rotation.x = Math.PI / 2

    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.0085, 32),
      new THREE.MeshStandardMaterial({ color: 0x0b1112, roughness: 0.2, metalness: 0.28, side: THREE.DoubleSide }),
    )
    lens.name = 'duck-camera-lens'
    lens.position.set(0.01175, 0, -0.0757)

    const glint = new THREE.Mesh(
      new THREE.CircleGeometry(0.0017, 16),
      new THREE.MeshBasicMaterial({ color: 0xd8f4f4 }),
    )
    glint.name = 'duck-camera-glint'
    glint.position.set(0.016, -0.003, -0.07585)

    // The small dark dot beside the eye is the ToF sensor at its MJCF site.
    const tof = new THREE.Mesh(
      new THREE.CircleGeometry(0.0022, 16),
      new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide }),
    )
    tof.name = 'duck-tof-sensor'
    tof.position.set(0.0143, 0.0225, -0.0732)

    for (const detail of [ring, lens, glint, tof]) {
      detail.userData.body = headIndex
      detail.castShadow = true
      head.add(detail)
      this.pickables.push(detail)
    }
  }
}

function isAccent(color: THREE.Color): boolean {
  return color.r > 0.72 && color.g > 0.32 && color.b < 0.28
}

export function accentFor(seed: number): THREE.Color {
  const palette = [0xffc400, 0xff6a19, 0x6fd5d0, 0xa987d4]
  return new THREE.Color(palette[(seed >>> 0) % palette.length] ?? palette[0])
}

function orientFacesOutward(vertices: Float32Array, indices: Uint16Array): void {
  const centre = new THREE.Vector3()
  const vertex = new THREE.Vector3()
  const count = vertices.length / 3
  for (let index = 0; index < count; index += 1) {
    centre.add(vertex.fromArray(vertices, index * 3))
  }
  if (count > 0) centre.multiplyScalar(1 / count)

  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const normal = new THREE.Vector3()
  const faceCentre = new THREE.Vector3()
  for (let index = 0; index < indices.length; index += 3) {
    const ia = indices[index]
    const ib = indices[index + 1]
    const ic = indices[index + 2]
    if (ia === undefined || ib === undefined || ic === undefined) continue
    a.fromArray(vertices, ia * 3)
    b.fromArray(vertices, ib * 3)
    c.fromArray(vertices, ic * 3)
    normal.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a))
    faceCentre.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(centre)
    if (normal.dot(faceCentre) < 0) {
      indices[index + 1] = ic
      indices[index + 2] = ib
    }
  }
}
