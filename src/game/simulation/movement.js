import {
  FIELD,
  PIN_ORBIT_MAX_RADIUS,
  PIN_ORBIT_MIN_RADIUS,
  PIN_ORBIT_SPEED_FACTOR,
  RECOVERY_DASH_SPEED,
  fieldPoint,
} from '../config.js'
import {
  clamp,
  closestPointOnSegment,
  constrainToField,
  distance,
  fieldBoundaryInwardNormal,
  nearestFieldBoundary,
  normalize,
  pointInPolygon,
} from '../geometry.js'
import { isGrappling, isInactive, isRecoveryDashing, isQuick } from '../players.js'

export function createMovementSystem({
  state,
  startRecoveryDash,
  chainBandSegment,
  CHAIN_BAND_END_CLEARANCE,
  CHAIN_BLOCKER_PADDING,
}) {
  function updateInactivePlayer(player, dt) {
    player.vx = 0
    player.vy = 0
    player.attack = 0
    player.attackWindup = 0
    player.attackTarget = null
    player.doubleWindow = 0
    player.callTimer = 0
    player.callType = null
    player.callSource = null
    player.callContext = null
    player.doublePinTrapTarget = null
    player.overzahlDefenseTimer = 0
    player.attackCooldown = Math.max(0, player.attackCooldown - dt)
  
    if (player.recoveryDashQueued && player.penaltyStones <= 0 && !player.pinnedBy && player.pinLock <= 0) {
      player.recoveryDashQueued = false
      startRecoveryDash(player)
    }
  }
  
  function updateRecoveryDash(player, dt) {
    player.recoveryDashTimer = Math.max(0, player.recoveryDashTimer - dt)
    player.attack = 0
    player.attackWindup = 0
    player.attackTarget = null
    player.doubleWindow = 0
    player.callTimer = 0
    player.callType = null
    player.callSource = null
    player.callContext = null
    player.doublePinTrapTarget = null
    player.overzahlDefenseTimer = 0
    const dashSpeed = player.recoveryDashSpeed || RECOVERY_DASH_SPEED
    player.vx = player.recoveryDashX * dashSpeed
    player.vy = player.recoveryDashY * dashSpeed
    if (player.vx || player.vy) player.angle = Math.atan2(player.vy, player.vx)
  }
  
  function updateQuickJuggRetreat(player, dt) {
    player.quickJuggRetreatTimer = Math.max(0, player.quickJuggRetreatTimer - dt)
    player.vx = player.quickJuggRetreatX * player.speed * 0.92
    player.vy = player.quickJuggRetreatY * player.speed * 0.92
    if (player.vx || player.vy) player.angle = Math.atan2(player.vy, player.vx)
  }
  
  function movePinningPlayer(player, dt) {
    const target = player.pinTarget
    if (!target) return false
    if (Math.hypot(player.vx, player.vy) < 1) {
      player.vx = 0
      player.vy = 0
      return false
    }
  
    const dx = player.x - target.x
    const dy = player.y - target.y
    const radius = Math.hypot(dx, dy) || PIN_ORBIT_MIN_RADIUS
    const radial = normalize(dx, dy)
    const fallback = player.team === 'blue' ? { x: 0, y: -1 } : { x: 0, y: 1 }
    const rx = radial.x || fallback.x
    const ry = radial.y || fallback.y
    const tangent = { x: -ry * player.pinOrbitDirection, y: rx * player.pinOrbitDirection }
    const desiredAlongCircle = player.vx * tangent.x + player.vy * tangent.y
    const orbitSpeed = Math.max(Math.abs(desiredAlongCircle), player.speed * PIN_ORBIT_SPEED_FACTOR)
    const direction = desiredAlongCircle < -1 ? -1 : 1
    const orbitTurn = player.pinOrbitDirection * direction
    const angleStep = (orbitSpeed * orbitTurn * dt) / clamp(radius, PIN_ORBIT_MIN_RADIUS, PIN_ORBIT_MAX_RADIUS)
    const nextAngle = Math.atan2(dy, dx) + angleStep
    const nextRadius = clamp(radius, PIN_ORBIT_MIN_RADIUS, PIN_ORBIT_MAX_RADIUS)
  
    player.pinOrbitDirection = orbitTurn
    player.x = target.x + Math.cos(nextAngle) * nextRadius
    player.y = target.y + Math.sin(nextAngle) * nextRadius
    player.vx = 0
    player.vy = 0
    constrainToField(player, player.radius)
    return true
  }
  
  function canEnterFromOutsideStart(player) {
    if (pointInPolygon(player)) return false
    const leftGroundLine = fieldPoint(0, FIELD.widthMeters / 2).x
    const rightGroundLine = fieldPoint(FIELD.lengthMeters, FIELD.widthMeters / 2).x
    return (player.team === 'blue' && player.x < leftGroundLine && player.vx > 0) || (player.team === 'red' && player.x > rightGroundLine && player.vx < 0)
  }
  
  function inactiveQuickSlowdown(player) {
    if (!isQuick(player) || isInactive(player)) return 1
    const nearbyInactive = state.players.filter((other) => other !== player && isInactive(other) && distance(player, other) < player.radius + other.radius + 10).length
    if (nearbyInactive <= 0) return 1
    return clamp(1 - nearbyInactive * 0.22, 0.38, 1)
  }
  
  function isQuickInJuggContest(player) {
    return Boolean(state.jugg.contest?.quicks.includes(player))
  }
  
  function distanceToSegmentWithT(point, start, end) {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSquared = dx * dx + dy * dy
    if (lengthSquared <= 0.001) return { distance: distance(point, start), t: 0 }
    const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
    const x = start.x + dx * t
    const y = start.y + dy * t
    return {
      distance: Math.hypot(point.x - x, point.y - y),
      t,
    }
  }
  
  function capPlayerVelocity(player, maxSpeed = player.speed * 1.2) {
    const currentSpeed = Math.hypot(player.vx, player.vy)
    if (currentSpeed <= maxSpeed || currentSpeed <= 0.001) return
    const scale = maxSpeed / currentSpeed
    player.vx *= scale
    player.vy *= scale
  }
  
  function constrainMovingPlayer(player) {
    const beforeX = player.x
    const beforeY = player.y
    const intendedVx = player.vx
    const intendedVy = player.vy
    const nearest = nearestFieldBoundary(player)
    constrainToField(player, player.radius)
    const wasConstrained = Math.abs(player.x - beforeX) > 0.001 || Math.abs(player.y - beforeY) > 0.001
    if (!wasConstrained) return
  
    const inward = fieldBoundaryInwardNormal(nearest)
    const outwardVelocity = player.vx * inward.x + player.vy * inward.y
    if (outwardVelocity < 0) {
      player.vx -= outwardVelocity * inward.x
      player.vy -= outwardVelocity * inward.y
    }

    const tangent = normalize(nearest.b.x - nearest.a.x, nearest.b.y - nearest.a.y)
    const tangentVelocity = player.vx * tangent.x + player.vy * tangent.y
    const intendedTangentVelocity = intendedVx * tangent.x + intendedVy * tangent.y
    if (Math.abs(tangentVelocity) < 12 && Math.abs(intendedTangentVelocity) > 18) {
      const sign = Math.sign(intendedTangentVelocity)
      const slideSpeed = Math.min(player.speed * 0.36, Math.abs(intendedTangentVelocity) * 0.55)
      player.vx = tangent.x * sign * slideSpeed + inward.x * 8
      player.vy = tangent.y * sign * slideSpeed + inward.y * 8
    }
  
    player.vx *= 0.82
    player.vy *= 0.82
    const maxSpeed = isRecoveryDashing(player) ? (player.recoveryDashSpeed || RECOVERY_DASH_SPEED) : player.speed * 1.15
    capPlayerVelocity(player, maxSpeed)
  }
  
  function movePlayer(player, dt) {
    if (isQuickInJuggContest(player)) {
      player.vx = 0
      player.vy = 0
      return
    }
  
    if (isGrappling(player)) {
      player.vx = 0
      player.vy = 0
      return
    }
  
    if (player.attackWindup <= 0 && movePinningPlayer(player, dt)) return
  
    const slowdown = inactiveQuickSlowdown(player)
    player.x += player.vx * dt * slowdown
    player.y += player.vy * dt * slowdown
    if (!canEnterFromOutsideStart(player)) constrainMovingPlayer(player)
  }
  
  function canPassThroughInactive(a, b) {
    return (isQuick(a) && !isInactive(a) && isInactive(b)) || (isQuick(b) && !isInactive(b) && isInactive(a))
  }
  
  function separatePlayers() {
    for (let i = 0; i < state.players.length; i += 1) {
      for (let j = i + 1; j < state.players.length; j += 1) {
        const a = state.players[i]
        const b = state.players[j]
        if (canPassThroughInactive(a, b)) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.hypot(dx, dy) || 1
        const overlap = a.radius + b.radius - d
        if (overlap <= 0) continue
        const nx = dx / d
        const ny = dy / d
        const aMobility = a.pinnedBy || a.pinTarget || isGrappling(a) ? 0 : isInactive(a) ? 0.25 : 1
        const bMobility = b.pinnedBy || b.pinTarget || isGrappling(b) ? 0 : isInactive(b) ? 0.25 : 1
        const totalMobility = aMobility + bMobility
        if (totalMobility <= 0) continue
        const aMove = aMobility / totalMobility
        const bMove = bMobility / totalMobility
        a.x -= nx * overlap * aMove
        a.y -= ny * overlap * aMove
        b.x += nx * overlap * bMove
        b.y += ny * overlap * bMove
      }
    }
  }
  
  function resolveChainBandCollisions() {
    const chainPlayers = state.players.filter((player) => player.pompfe === 'chain' && player.chainStrikeTimer > 0 && !isInactive(player))
    if (chainPlayers.length <= 0) return
  
    for (const chainPlayer of chainPlayers) {
      const segment = chainBandSegment(chainPlayer)
      const sx = segment.end.x - segment.start.x
      const sy = segment.end.y - segment.start.y
      const segmentLength = Math.hypot(sx, sy)
      if (segmentLength < 24) continue
  
      for (const player of state.players) {
        if (player === chainPlayer) continue
        const bandHit = distanceToSegmentWithT(player, segment.start, segment.end)
        if (bandHit.t >= CHAIN_BAND_END_CLEARANCE) continue
        const closest = closestPointOnSegment(player, segment.start, segment.end)
        const dx = player.x - closest.x
        const dy = player.y - closest.y
        const d = bandHit.distance
        const bandRadius = player.radius + CHAIN_BLOCKER_PADDING
        const overlap = bandRadius - d
        if (overlap <= 0) continue
  
        const fallback = { x: -sy / segmentLength, y: sx / segmentLength }
        const nx = d > 0.001 ? dx / d : fallback.x
        const ny = d > 0.001 ? dy / d : fallback.y
        const mobility = player.pinnedBy || isGrappling(player) ? 0 : isInactive(player) ? 0.25 : 1
        if (mobility <= 0) continue
  
        player.x += nx * overlap * mobility
        player.y += ny * overlap * mobility
        const intoBand = player.vx * nx + player.vy * ny
        if (intoBand < 0) {
          player.vx -= intoBand * nx
          player.vy -= intoBand * ny
        }
        constrainToField(player, player.radius)
      }
    }
  }
  

  return {
    distanceToSegmentWithT,
    isQuickInJuggContest,
    movePlayer,
    resolveChainBandCollisions,
    separatePlayers,
    updateInactivePlayer,
    updateRecoveryDash,
    updateQuickJuggRetreat,
  }
}