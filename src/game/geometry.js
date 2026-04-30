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
  let bestDistance = Infinity

  for (let i = 0; i < FIELD_POLYGON.length; i += 1) {
    const a = FIELD_POLYGON[i]
    const b = FIELD_POLYGON[(i + 1) % FIELD_POLYGON.length]
    const candidate = closestPointOnSegment(point, a, b)
    const d = distance(point, candidate)
    if (d < bestDistance) {
      nearest = candidate
      bestDistance = d
    }
  }

  return { point: nearest, distance: bestDistance }
}

export function constrainToField(entity, radius, bounce = false) {
  const point = { x: entity.x, y: entity.y }
  const nearest = nearestFieldBoundary(point)
  const inside = pointInPolygon(point)

  if (inside && nearest.distance >= radius + 1) return

  const inward = normalize(FIELD.center.x - nearest.point.x, FIELD.center.y - nearest.point.y)
  entity.x = nearest.point.x + inward.x * (radius + 2)
  entity.y = nearest.point.y + inward.y * (radius + 2)

  if (!bounce) return

  const outwardVelocity = entity.vx * inward.x + entity.vy * inward.y
  if (outwardVelocity < 0) {
    entity.vx -= outwardVelocity * inward.x * 1.55
    entity.vy -= outwardVelocity * inward.y * 1.55
  }
}
