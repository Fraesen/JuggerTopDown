import { FIELD, FIELD_POLYGON } from './config.js'

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function normalize(x, y) {
  const length = Math.hypot(x, y)
  if (length < 0.001) return { x: 0, y: 0 }
  return { x: x / length, y: y / length }
}

export function facePoint(player, target) {
  const dx = target.x - player.x
  const dy = target.y - player.y
  if (Math.hypot(dx, dy) < 0.001) return
  player.angle = Math.atan2(dy, dx)
}

export function pointInPolygon(point, polygon = FIELD_POLYGON) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

export function closestPointOnSegment(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= 0.0001) return a
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1)
  return {
    x: a.x + dx * t,
    y: a.y + dy * t,
  }
}

export function nearestFieldBoundary(point) {
  let nearest = FIELD_POLYGON[0]
  let nearestA = FIELD_POLYGON[0]
  let nearestB = FIELD_POLYGON[1]
  let bestDistance = Infinity

  for (let i = 0; i < FIELD_POLYGON.length; i += 1) {
    const a = FIELD_POLYGON[i]
    const b = FIELD_POLYGON[(i + 1) % FIELD_POLYGON.length]
    const candidate = closestPointOnSegment(point, a, b)
    const d = distance(point, candidate)
    if (d < bestDistance) {
      nearest = candidate
      nearestA = a
      nearestB = b
      bestDistance = d
    }
  }

  return { point: nearest, distance: bestDistance, a: nearestA, b: nearestB }
}

export function fieldBoundaryInwardNormal(boundary) {
  const dx = boundary.b.x - boundary.a.x
  const dy = boundary.b.y - boundary.a.y
  const left = normalize(-dy, dx)
  const toCenter = normalize(FIELD.center.x - boundary.point.x, FIELD.center.y - boundary.point.y)
  return left.x * toCenter.x + left.y * toCenter.y >= 0 ? left : { x: -left.x, y: -left.y }
}

export function constrainToField(entity, radius, bounce = false) {
  const point = { x: entity.x, y: entity.y }
  const nearest = nearestFieldBoundary(point)
  const inside = pointInPolygon(point)

  if (inside && nearest.distance >= radius + 1) return

  const inward = fieldBoundaryInwardNormal(nearest)
  entity.x = nearest.point.x + inward.x * (radius + 2)
  entity.y = nearest.point.y + inward.y * (radius + 2)

  if (!bounce) return

  const outwardVelocity = entity.vx * inward.x + entity.vy * inward.y
  if (outwardVelocity < 0) {
    entity.vx -= outwardVelocity * inward.x
    entity.vy -= outwardVelocity * inward.y
  }

  const tangent = normalize(nearest.b.x - nearest.a.x, nearest.b.y - nearest.a.y)
  const tangentVelocity = entity.vx * tangent.x + entity.vy * tangent.y
  const inwardVelocity = Math.max(0, entity.vx * inward.x + entity.vy * inward.y)
  entity.vx = tangent.x * tangentVelocity * 0.22 + inward.x * inwardVelocity
  entity.vy = tangent.y * tangentVelocity * 0.22 + inward.y * inwardVelocity
}
