import {
  QUICK_PRESSURE_COUNT,
  FIELD,
  OPENING_FAN_REACHED_RADIUS,
  OPENING_RUSH_SECONDS,
  PIN_ORBIT_MAX_RADIUS,
  PIN_RANGE,
  PLAYER_RADIUS,
  QUICK_DUEL_RANGE,
  STONE_SECONDS,
  TEAMS,
  fieldPoint,
} from '../config.js'
import { createCallDecisions } from './calls.js'
import { createChainDecisions } from './chain.js'
import { createAiUpdater } from './ai.js'
import { clamp, distance, normalize } from '../geometry.js'
import { canReceiveNewPin, isGrappling, isInactive, isPompfer, isQuick, playerIndex, playerPositionSlot } from '../players.js'
import { attackRangeFor, canPinWithPompfe, isInAttackArc, maxPompfeAttackRange } from '../pompfen.js'
import { isDefensiveStrategyPlayer, openingStrategyPoint } from '../strategies.js'

const SIDE_PRESSURE_SAFE_DISTANCE = (FIELD.lengthMeters * FIELD.scale) / 4
const SIDE_PRESSURE_REACHED_DISTANCE = 42
const SIDE_PRESSURE_CURVE_STEPS = 9
const CHAIN_GUARD_RANGE_FACTOR = 0.9
const POMPFER_DUEL_SEEK_RANGE = 260
const PIN_TARGET_SEEK_RANGE = 260
const OVERZAHL_DURATION = STONE_SECONDS * 2
const FULL_TURN_SECONDS = 0.75
const TURN_RATE = (Math.PI * 2) / FULL_TURN_SECONDS
const SIDE_PRESSURE_LANES = {
  top: () => fieldPoint(20, 1.8).y,
  bottom: () => fieldPoint(20, FIELD.widthMeters - 1.8).y,
}
export function createDecisionEngine({ state, attack, rng = state.rng }) {
  function angleDelta(target, current) {
    return Math.atan2(Math.sin(target - current), Math.cos(target - current))
  }

  function rotateTowardAngle(player, targetAngle, dt) {
    const delta = angleDelta(targetAngle, player.angle)
    const step = clamp(delta, -TURN_RATE * dt, TURN_RATE * dt)
    player.angle += step
    return Math.abs(delta - step)
  }

  function rotateTowardPoint(player, target, dt) {
    if (!target) return 0
    const dx = target.x - player.x
    const dy = target.y - player.y
    if (Math.hypot(dx, dy) < 0.001) return 0
    return rotateTowardAngle(player, Math.atan2(dy, dx), dt)
  }

  function nearestEnemy(player, filter = () => true) {
    let best = null
    let bestDistance = Infinity
    for (const other of state.players) {
      if (other.team === player.team || !filter(other)) continue
      const d = distance(player, other)
      if (d < bestDistance) {
        best = other
        bestDistance = d
      }
    }
    return { target: best, distance: bestDistance }
  }
  
  function nearestInactiveEnemy(player) {
    return nearestEnemy(player, (other) => isInactive(other))
  }

  function nearestUnpinnedInactiveEnemy(player) {
    return nearestEnemy(player, (other) => isInactive(other) && !other.pinnedBy)
  }
  
  function canSeekNewPin(player) {
    return (
      isPompfer(player) &&
      canPinWithPompfe(player) &&
      !isInactive(player) &&
      !player.pinTarget &&
      !defensiveBindingActive(player) &&
      player.callType !== 'hilfmir' &&
      player.doublePinReleasePause <= 0 &&
      !player.doublePinTrapTarget
    )
  }
  
  function pinPriorityCompare(a, b, target) {
    const distanceDiff = distance(a, target) - distance(b, target)
    if (Math.abs(distanceDiff) > 0.01) return distanceDiff
    return playerIndex(a) - playerIndex(b)
  }
  
  function bestPinnerForTarget(target, team) {
    return activeTeamPompfers(team)
      .filter((player) => canSeekNewPin(player))
      .sort((a, b) => pinPriorityCompare(a, b, target))[0]
  }
  
  function nearestClaimablePinTarget(player) {
    return nearestEnemy(player, (other) => canReceiveNewPin(other) && bestPinnerForTarget(other, player.team) === player)
  }

  function bestPinApproacherForTarget(target, team) {
    return activeTeamPompfers(team)
      .filter((player) => canSeekNewPin(player) && canPinWithPompfe(player))
      .sort((a, b) => pinPriorityCompare(a, b, target))[0]
  }

  function nearestApproachablePinTarget(player) {
    return nearestEnemy(
      player,
      (other) => other.penaltyStones > 0 && !other.pinnedBy && bestPinApproacherForTarget(other, player.team) === player,
    )
  }

  function isChain(player) {
    return player.pompfe === 'chain'
  }

  function vulnerableOpposingChain(player) {
    const opposite = oppositePlayer(player)
    if (!opposite || !isPompfer(opposite) || opposite.pompfe !== 'chain') return null
    if (isInactive(opposite) || opposite.attackCooldown <= 0) return null
    return opposite
  }
  
  function oppositePlayer(player) {
    const index = playerIndex(player)
    const enemyTeam = player.team === 'blue' ? 'red' : 'blue'
    return state.players.find((other) => other.team === enemyTeam && playerIndex(other) === index)
  }

  function enemyQuickInOwnHalf(player) {
    const enemyQuick = state.players.find((other) => other.team !== player.team && isQuick(other) && !isInactive(other))
    if (!enemyQuick) return false
    return player.team === 'blue' ? enemyQuick.x < FIELD.center.x : enemyQuick.x > FIELD.center.x
  }

  function defensiveBindingActive(player) {
    if (!isDefensiveStrategyPlayer(player) || player.defensiveStrategyDone) return false

    const opponent = oppositePlayer(player)
    if ((opponent && isInactive(opponent)) || enemyQuickInOwnHalf(player)) {
      player.defensiveStrategyDone = true
      return false
    }

    return Boolean(opponent && !isInactive(opponent))
  }
  
  function openingFanPoint(player) {
    const slot = playerPositionSlot(player)
    const lane = [10, 4.4, 7.2, 12.8, 15.6][slot]
    const meterX = player.team === 'blue' ? 10 + slot * 0.75 : 30 - slot * 0.75
    return fieldPoint(meterX, lane)
  }

  function quickOpeningPoint(player) {
    const meterX = player.team === 'blue' ? FIELD.lengthMeters * 0.25 : FIELD.lengthMeters * 0.75
    return fieldPoint(meterX, FIELD.widthMeters * 0.5)
  }

  function openingTarget(point) {
    return { ...point, stopDistance: 4 }
  }
  
  function openingRushTarget(player) {
    if (player.openingComplete) return null

    const strategyPoint = isQuick(player) ? quickOpeningPoint(player) : openingStrategyPoint(player)
    const openingDuration = strategyPoint ? OPENING_RUSH_SECONDS * 1.25 : OPENING_RUSH_SECONDS
    if (state.roundTime > openingDuration || state.jugg.quick) {
      player.openingComplete = true
      return null
    }
  
    const fanPoint = strategyPoint || openingFanPoint(player)
    if (isQuick(player)) return openingTarget(fanPoint)

    if (distance(player, fanPoint) <= OPENING_FAN_REACHED_RADIUS) {
      player.openingComplete = true
      return null
    }
  
    return openingTarget(fanPoint)
  }
  
  function activeTeamPompfers(team) {
    return state.players.filter((player) => player.team === team && isPompfer(player) && !isInactive(player))
  }
  
  function quickPressureRank(player, quick) {
    return [...activeTeamPompfers(player.team)]
      .sort((a, b) => distance(a, quick) - distance(b, quick))
      .findIndex((candidate) => candidate === player)
  }
  
  function quickPressurePoint(target, player, distanceFromTarget = 44) {
    const side = playerPositionSlot(player) % 2 === 0 ? -1 : 1
    const approach = normalize(target.x - player.x, target.y - player.y)
    const perpendicular = { x: -approach.y * side, y: approach.x * side }
    return {
      x: target.x - approach.x * distanceFromTarget + perpendicular.x * 34,
      y: target.y - approach.y * distanceFromTarget + perpendicular.y * 34,
    }
  }
  
  function laneBlockPoint(player, quick) {
    const ownMal = TEAMS[player.team].mal
    const slot = playerPositionSlot(player)
    const lane = slot <= 2 ? -1 : 1
    const toMal = normalize(ownMal.x - quick.x, ownMal.y - quick.y)
    const perpendicular = { x: -toMal.y, y: toMal.x }
  
    return {
      x: quick.x + (ownMal.x - quick.x) * 0.42 + perpendicular.x * lane * 86,
      y: quick.y + (ownMal.y - quick.y) * 0.42 + perpendicular.y * lane * 86,
    }
  }
  
  function supportPoint(player, quick) {
    const slot = playerPositionSlot(player)
    const lane = [-1.9, -0.85, 0.85, 1.9][slot - 1] ?? 0
    const forward = normalize(TEAMS[player.team].attackMal.x - quick.x, TEAMS[player.team].attackMal.y - quick.y)
    const perpendicular = { x: -forward.y, y: forward.x }
    const depth = slot <= 2 ? 104 : 46
  
    return {
      x: quick.x + forward.x * depth + perpendicular.x * lane * 74,
      y: quick.y + forward.y * depth + perpendicular.y * lane * 74,
    }
  }
  
  function distanceToSegment(point, start, end) {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSq = dx * dx + dy * dy
    if (lengthSq <= 0.001) return distance(point, start)
    const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq, 0, 1)
    return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t))
  }
  
  function enemyReachRadius(enemy) {
    return isPompfer(enemy) ? attackRangeFor(enemy, { role: 'quick' }) + PLAYER_RADIUS : QUICK_DUEL_RANGE + PLAYER_RADIUS
  }
  
  function directMalBlockers(quick) {
    const mal = TEAMS[quick.team].attackMal
    return state.players.filter((enemy) => {
      if (enemy.team === quick.team || isInactive(enemy)) return false
      const ahead = (enemy.x - quick.x) * (mal.x - quick.x) + (enemy.y - quick.y) * (mal.y - quick.y)
      return ahead > 0 && distanceToSegment(enemy, quick, mal) <= enemyReachRadius(enemy)
    })
  }

  function sidePressureLaneY(side) {
    return SIDE_PRESSURE_LANES[side]?.() ?? FIELD.center.y
  }

  function otherSide(side) {
    return side === 'top' ? 'bottom' : 'top'
  }

  function preferredSideByFriends(quick) {
    const friends = state.players.filter((player) => player.team === quick.team && player !== quick && !isInactive(player))
    const topCount = friends.filter((player) => player.y < FIELD.center.y).length
    const bottomCount = friends.length - topCount
    if (topCount === bottomCount) return quick.y < FIELD.center.y ? 'top' : 'bottom'
    return topCount > bottomCount ? 'top' : 'bottom'
  }

  function sidePressureEntryPoint(quick, side) {
    const mal = TEAMS[quick.team].attackMal
    return {
      x: quick.x + (mal.x - quick.x) * 0.14,
      y: sidePressureLaneY(side),
    }
  }

  function curvePoint(start, control, end, t) {
    const inv = 1 - t
    return {
      x: inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x,
      y: inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y,
    }
  }

  function sidePressureCurveControl(quick, side) {
    const mal = TEAMS[quick.team].attackMal
    return {
      x: quick.x + (mal.x - quick.x) * 0.48,
      y: sidePressureLaneY(side),
    }
  }

  function sidePressureCurveBlockers(quick, side) {
    const mal = TEAMS[quick.team].attackMal
    const control = sidePressureCurveControl(quick, side)
    const blockers = new Set()
    let previous = { x: quick.x, y: quick.y }

    for (let i = 1; i <= SIDE_PRESSURE_CURVE_STEPS; i += 1) {
      const point = curvePoint(quick, control, mal, i / SIDE_PRESSURE_CURVE_STEPS)
      for (const enemy of state.players) {
        if (enemy.team === quick.team || isInactive(enemy)) continue
        if (!isPompfer(enemy)) continue
        if (distanceToSegment(enemy, previous, point) <= attackRangeFor(enemy, { role: 'quick' }) + PLAYER_RADIUS) blockers.add(enemy)
      }
      previous = point
    }

    return [...blockers]
  }

  function sidePressureAdvancePoint(quick, side) {
    const mal = TEAMS[quick.team].attackMal
    const control = sidePressureCurveControl(quick, side)
    const progress = clamp(distance(quick, TEAMS[quick.team].mal) / Math.max(1, distance(TEAMS[quick.team].mal, mal)), 0.08, 0.78)
    return curvePoint(quick, control, mal, Math.min(0.9, progress + 0.18))
  }

  function sidePressureTargetForQuick(quick) {
    if (!quick.sidePressureSide) {
      quick.sidePressureSide = preferredSideByFriends(quick)
      quick.sidePressureFailedSide = null
    }

    const side = quick.sidePressureSide
    const entry = sidePressureEntryPoint(quick, side)
    if (Math.abs(quick.y - entry.y) > SIDE_PRESSURE_REACHED_DISTANCE) return entry

    const blockers = sidePressureCurveBlockers(quick, side)
    if (blockers.length > 0 && !quick.sidePressureFailedSide) {
      quick.sidePressureFailedSide = side
      quick.sidePressureSide = otherSide(side)
      return sidePressureEntryPoint(quick, quick.sidePressureSide)
    }

    if (blockers.length > 0) {
      if (quick.sidePressureFailedSide !== side) quick.sidePressureFailedSide = 'both'
      return entry
    }

    quick.sidePressureFailedSide = null
    return sidePressureAdvancePoint(quick, side)
  }

  function retreatPointForQuick(quick, blockers) {
    const friendlySafety = friendlyPompferSafetyPoint(quick, blockers)
    if (friendlySafety) return extendPointIfClose(quick, friendlySafety, 120)
  
    const team = TEAMS[quick.team]
    const awayFromMal = normalize(quick.x - team.attackMal.x, quick.y - team.attackMal.y)
    let avoidX = 0
    let avoidY = 0
  
    for (const blocker of blockers) {
      const d = distance(quick, blocker) || 1
      const strength = clamp((210 - d) / 210, 0.18, 1)
      avoidX += ((quick.x - blocker.x) / d) * strength
      avoidY += ((quick.y - blocker.y) / d) * strength
    }
  
    const retreat = normalize(awayFromMal.x * 1.15 + avoidX, awayFromMal.y * 1.15 + avoidY)
    const fallback = quick.team === 'blue' ? { x: -1, y: 0 } : { x: 1, y: 0 }
    return {
      x: quick.x + (retreat.x || fallback.x) * 150,
      y: quick.y + (retreat.y || fallback.y) * 150,
    }
  }

  function extendPointIfClose(origin, target, minimumDistance) {
    const currentDistance = distance(origin, target)
    if (currentDistance >= minimumDistance) return target
    const direction = normalize(target.x - origin.x, target.y - origin.y)
    const fallback = origin.team === 'blue' ? { x: -1, y: 0 } : { x: 1, y: 0 }
    return {
      x: origin.x + (direction.x || fallback.x) * minimumDistance,
      y: origin.y + (direction.y || fallback.y) * minimumDistance,
    }
  }
  
  function friendlyPompferSafetyPoint(quick, blockers) {
    const team = TEAMS[quick.team]
    const candidates = activeTeamPompfers(quick.team)
      .map((friend) => {
        const toOwnSide = normalize(team.mal.x - friend.x, team.mal.y - friend.y)
        const point = {
          x: friend.x + toOwnSide.x * 46,
          y: friend.y + toOwnSide.y * 46,
        }
        const nearestBlockerDistance = blockers.reduce((best, blocker) => Math.min(best, distance(point, blocker)), Infinity)
        return {
          point,
          score: distance(quick, point) - nearestBlockerDistance * 0.55,
          nearestBlockerDistance,
        }
      })
      .filter((candidate) => candidate.nearestBlockerDistance > maxPompfeAttackRange({ role: 'quick' }) + PLAYER_RADIUS)
      .filter((candidate) => distance(quick, candidate.point) > 72)
      .sort((a, b) => a.score - b.score)
  
    return candidates[0]?.point ?? null
  }
  
  function quickThreatensMal(team, quick) {
    if (!quick || quick.team === team || !isQuick(quick) || isInactive(quick)) return false

    const ownMal = TEAMS[team].mal
    const ownHalf = team === 'blue' ? quick.x < FIELD.center.x : quick.x > FIELD.center.x
    const towardMal = normalize(ownMal.x - quick.x, ownMal.y - quick.y)
    const progress = quick.vx * towardMal.x + quick.vy * towardMal.y

    return ownHalf && progress > 20
  }
  
  const calls = createCallDecisions({
    state,
    rng,
    activeTeamPompfers,
    supportPoint,
    quickThreatensMal,
    overzahlDuration: OVERZAHL_DURATION,
  })

  const callTargetFor = calls.callTargetFor
  const clearCallIntent = calls.clearCallIntent
  const emitCalls = calls.emitCalls
  const tryIssueOverzahlCall = calls.tryIssueOverzahlCall

  function stopDistanceFor(player, target) {
    if (typeof target?.stopDistance === 'number') return target.stopDistance
    if (target === state.jugg) return isQuick(player) ? 0 : 46
    if (!target || !target.radius) return 18
    if (isChain(player) && target.team !== player.team && !isInactive(target)) return attackRangeFor(player, target) * CHAIN_GUARD_RANGE_FACTOR
    if (isPompfer(player) && target.team !== player.team && !isInactive(target)) return attackRangeFor(player, target) * 0.78
    if (isPompfer(player) && target.team !== player.team && isInactive(target)) return PIN_RANGE * 0.7
    if (isQuick(player) && target.team !== player.team) return QUICK_DUEL_RANGE * 0.72
    return PLAYER_RADIUS * 2.4
  }

  function canStrikeTarget(player, target, extraRange = 0) {
    if (!isPompfer(player) || !target?.radius || target.team === player.team || isInactive(target)) return false
    const range = attackRangeFor(player, target) + extraRange
    return distance(player, target) < range && isInAttackArc(player, target, range)
  }
  
  function pinOrbitPoint(player) {
    const target = player.pinTarget
    if (!target) return player
    const enemy = nearestEnemy(player, (other) => !isInactive(other)).target
    if (!enemy) return null
  
    const radial = normalize(player.x - target.x, player.y - target.y)
    const fallback = player.team === 'blue' ? { x: 0, y: -1 } : { x: 0, y: 1 }
    const rx = radial.x || fallback.x
    const ry = radial.y || fallback.y
    const leftTangent = { x: -ry, y: rx }
    const rightTangent = { x: ry, y: -rx }
    const currentDistance = distance(player, enemy)
    const leftPoint = { x: player.x + leftTangent.x * 96, y: player.y + leftTangent.y * 96 }
    const rightPoint = { x: player.x + rightTangent.x * 96, y: player.y + rightTangent.y * 96 }
    const leftGain = currentDistance - distance(leftPoint, enemy)
    const rightGain = currentDistance - distance(rightPoint, enemy)
    const currentGain = player.pinOrbitDirection === 1 ? leftGain : rightGain
    const oppositeGain = player.pinOrbitDirection === 1 ? rightGain : leftGain
  
    if (currentGain <= 2 && oppositeGain <= 2) return null
    if (oppositeGain > currentGain + 10) player.pinOrbitDirection *= -1
  
    const tangent = player.pinOrbitDirection === 1 ? leftTangent : rightTangent
  
    return {
      x: player.x + tangent.x * 96,
      y: player.y + tangent.y * 96,
    }
  }
  
  function doublePinTrapPoint(player) {
    const pinned = player.pinTarget
    const trapTarget = player.doublePinTrapTarget
    if (!pinned || !trapTarget) return null
  
    const towardTrap = normalize(trapTarget.x - pinned.x, trapTarget.y - pinned.y)
    const fallback = normalize(trapTarget.x - player.x, trapTarget.y - player.y)
    const sideX = towardTrap.x || fallback.x || (player.team === 'blue' ? 1 : -1)
    const sideY = towardTrap.y || fallback.y
  
    return {
      x: pinned.x + sideX * PIN_ORBIT_MAX_RADIUS,
      y: pinned.y + sideY * PIN_ORBIT_MAX_RADIUS,
    }
  }

  const chain = createChainDecisions({ state })
  const chainCooldownThreat = chain.chainCooldownThreat
  const chainGuardPoint = chain.chainGuardPoint
  const chainRetreatPoint = chain.chainRetreatPoint

  const updateAi = createAiUpdater({
    state,
    attack,
    nearestEnemy,
    nearestUnpinnedInactiveEnemy,
    callTargetFor,
    openingRushTarget,
    canStrikeTarget,
    directMalBlockers,
    sidePressureTargetForQuick,
    retreatPointForQuick,
    nearestClaimablePinTarget,
    nearestApproachablePinTarget,
    vulnerableOpposingChain,
    defensiveBindingActive,
    oppositePlayer,
    quickPressureRank,
    quickPressurePoint,
    laneBlockPoint,
    supportPoint,
    chainCooldownThreat,
    chainRetreatPoint,
    chainGuardPoint,
    stopDistanceFor,
    rotateTowardPoint,
    rotateTowardAngle,
    pinOrbitPoint,
    doublePinTrapPoint,
    isChain,
    sidePressureSafeDistance: SIDE_PRESSURE_SAFE_DISTANCE,
    pompferDuelSeekRange: POMPFER_DUEL_SEEK_RANGE,
    pinTargetSeekRange: PIN_TARGET_SEEK_RANGE,
  })
  return {
    activeTeamPompfers,
    clearCallIntent,
    emitCalls,
    nearestEnemy,
    tryIssueOverzahlCall,
    updateAi,
  }
}
