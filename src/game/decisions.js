import {
  CARRIER_PRESSURE_COUNT,
  FIELD,
  OPENING_FAN_REACHED_RADIUS,
  OPENING_RUSH_SECONDS,
  PIN_ORBIT_MAX_RADIUS,
  PIN_RANGE,
  PLAYER_RADIUS,
  RUNNER_DUEL_RANGE,
  STONE_SECONDS,
  TEAMS,
  fieldPoint,
} from './config.js'
import { createCallDecisions } from './decisions/calls.js'
import { createChainDecisions } from './decisions/chain.js'
import { clamp, distance, normalize } from './geometry.js'
import { canReceiveNewPin, isGrappling, isInactive, isPompfer, isRunner, playerIndex, playerPositionSlot } from './players.js'
import { attackRangeFor, canPinWithPompfe, isInAttackArc, maxPompfeAttackRange } from './pompfen.js'
import { isDefensiveStrategyPlayer, openingStrategyPoint } from './strategies.js'

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

  function enemyRunnerInOwnHalf(player) {
    const enemyRunner = state.players.find((other) => other.team !== player.team && isRunner(other) && !isInactive(other))
    if (!enemyRunner) return false
    return player.team === 'blue' ? enemyRunner.x < FIELD.center.x : enemyRunner.x > FIELD.center.x
  }

  function defensiveBindingActive(player) {
    if (!isDefensiveStrategyPlayer(player) || player.defensiveStrategyDone) return false

    const opponent = oppositePlayer(player)
    if ((opponent && isInactive(opponent)) || enemyRunnerInOwnHalf(player)) {
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

  function runnerOpeningPoint(player) {
    const meterX = player.team === 'blue' ? FIELD.lengthMeters * 0.25 : FIELD.lengthMeters * 0.75
    return fieldPoint(meterX, FIELD.widthMeters * 0.5)
  }

  function openingTarget(point) {
    return { ...point, stopDistance: 4 }
  }
  
  function openingRushTarget(player) {
    if (player.openingComplete) return null

    const strategyPoint = isRunner(player) ? runnerOpeningPoint(player) : openingStrategyPoint(player)
    const openingDuration = strategyPoint ? OPENING_RUSH_SECONDS * 1.25 : OPENING_RUSH_SECONDS
    if (state.roundTime > openingDuration || state.jugg.carrier) {
      player.openingComplete = true
      return null
    }
  
    const fanPoint = strategyPoint || openingFanPoint(player)
    if (isRunner(player)) return openingTarget(fanPoint)

    if (distance(player, fanPoint) <= OPENING_FAN_REACHED_RADIUS) {
      player.openingComplete = true
      return null
    }
  
    return openingTarget(fanPoint)
  }
  
  function activeTeamPompfers(team) {
    return state.players.filter((player) => player.team === team && isPompfer(player) && !isInactive(player))
  }
  
  function carrierPressureRank(player, carrier) {
    return [...activeTeamPompfers(player.team)]
      .sort((a, b) => distance(a, carrier) - distance(b, carrier))
      .findIndex((candidate) => candidate === player)
  }
  
  function flankPoint(target, player, distanceFromTarget = 44) {
    const side = playerPositionSlot(player) % 2 === 0 ? -1 : 1
    const approach = normalize(target.x - player.x, target.y - player.y)
    const perpendicular = { x: -approach.y * side, y: approach.x * side }
    return {
      x: target.x - approach.x * distanceFromTarget + perpendicular.x * 34,
      y: target.y - approach.y * distanceFromTarget + perpendicular.y * 34,
    }
  }
  
  function laneBlockPoint(player, carrier) {
    const ownMal = TEAMS[player.team].mal
    const slot = playerPositionSlot(player)
    const lane = slot <= 2 ? -1 : 1
    const toMal = normalize(ownMal.x - carrier.x, ownMal.y - carrier.y)
    const perpendicular = { x: -toMal.y, y: toMal.x }
  
    return {
      x: carrier.x + (ownMal.x - carrier.x) * 0.42 + perpendicular.x * lane * 86,
      y: carrier.y + (ownMal.y - carrier.y) * 0.42 + perpendicular.y * lane * 86,
    }
  }
  
  function supportPoint(player, carrier) {
    const slot = playerPositionSlot(player)
    const lane = [-1.9, -0.85, 0.85, 1.9][slot - 1] ?? 0
    const forward = normalize(TEAMS[player.team].attackMal.x - carrier.x, TEAMS[player.team].attackMal.y - carrier.y)
    const perpendicular = { x: -forward.y, y: forward.x }
    const depth = slot <= 2 ? 104 : 46
  
    return {
      x: carrier.x + forward.x * depth + perpendicular.x * lane * 74,
      y: carrier.y + forward.y * depth + perpendicular.y * lane * 74,
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
    return isPompfer(enemy) ? attackRangeFor(enemy, { role: 'runner' }) + PLAYER_RADIUS : RUNNER_DUEL_RANGE + PLAYER_RADIUS
  }
  
  function directMalBlockers(runner) {
    const mal = TEAMS[runner.team].attackMal
    return state.players.filter((enemy) => {
      if (enemy.team === runner.team || isInactive(enemy)) return false
      const ahead = (enemy.x - runner.x) * (mal.x - runner.x) + (enemy.y - runner.y) * (mal.y - runner.y)
      return ahead > 0 && distanceToSegment(enemy, runner, mal) <= enemyReachRadius(enemy)
    })
  }

  function sidePressureLaneY(side) {
    return SIDE_PRESSURE_LANES[side]?.() ?? FIELD.center.y
  }

  function otherSide(side) {
    return side === 'top' ? 'bottom' : 'top'
  }

  function preferredSideByFriends(runner) {
    const friends = state.players.filter((player) => player.team === runner.team && player !== runner && !isInactive(player))
    const topCount = friends.filter((player) => player.y < FIELD.center.y).length
    const bottomCount = friends.length - topCount
    if (topCount === bottomCount) return runner.y < FIELD.center.y ? 'top' : 'bottom'
    return topCount > bottomCount ? 'top' : 'bottom'
  }

  function sidePressureEntryPoint(runner, side) {
    const mal = TEAMS[runner.team].attackMal
    return {
      x: runner.x + (mal.x - runner.x) * 0.14,
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

  function sidePressureCurveControl(runner, side) {
    const mal = TEAMS[runner.team].attackMal
    return {
      x: runner.x + (mal.x - runner.x) * 0.48,
      y: sidePressureLaneY(side),
    }
  }

  function sidePressureCurveBlockers(runner, side) {
    const mal = TEAMS[runner.team].attackMal
    const control = sidePressureCurveControl(runner, side)
    const blockers = new Set()
    let previous = { x: runner.x, y: runner.y }

    for (let i = 1; i <= SIDE_PRESSURE_CURVE_STEPS; i += 1) {
      const point = curvePoint(runner, control, mal, i / SIDE_PRESSURE_CURVE_STEPS)
      for (const enemy of state.players) {
        if (enemy.team === runner.team || isInactive(enemy)) continue
        if (!isPompfer(enemy)) continue
        if (distanceToSegment(enemy, previous, point) <= attackRangeFor(enemy, { role: 'runner' }) + PLAYER_RADIUS) blockers.add(enemy)
      }
      previous = point
    }

    return [...blockers]
  }

  function sidePressureAdvancePoint(runner, side) {
    const mal = TEAMS[runner.team].attackMal
    const control = sidePressureCurveControl(runner, side)
    const progress = clamp(distance(runner, TEAMS[runner.team].mal) / Math.max(1, distance(TEAMS[runner.team].mal, mal)), 0.08, 0.78)
    return curvePoint(runner, control, mal, Math.min(0.9, progress + 0.18))
  }

  function sidePressureTargetForRunner(runner) {
    if (!runner.sidePressureSide) {
      runner.sidePressureSide = preferredSideByFriends(runner)
      runner.sidePressureFailedSide = null
    }

    const side = runner.sidePressureSide
    const entry = sidePressureEntryPoint(runner, side)
    if (Math.abs(runner.y - entry.y) > SIDE_PRESSURE_REACHED_DISTANCE) return entry

    const blockers = sidePressureCurveBlockers(runner, side)
    if (blockers.length > 0 && !runner.sidePressureFailedSide) {
      runner.sidePressureFailedSide = side
      runner.sidePressureSide = otherSide(side)
      return sidePressureEntryPoint(runner, runner.sidePressureSide)
    }

    if (blockers.length > 0) {
      if (runner.sidePressureFailedSide !== side) runner.sidePressureFailedSide = 'both'
      return entry
    }

    runner.sidePressureFailedSide = null
    return sidePressureAdvancePoint(runner, side)
  }

  function retreatPointForRunner(runner, blockers) {
    const friendlySafety = friendlyPompferSafetyPoint(runner, blockers)
    if (friendlySafety) return extendPointIfClose(runner, friendlySafety, 120)
  
    const team = TEAMS[runner.team]
    const awayFromMal = normalize(runner.x - team.attackMal.x, runner.y - team.attackMal.y)
    let avoidX = 0
    let avoidY = 0
  
    for (const blocker of blockers) {
      const d = distance(runner, blocker) || 1
      const strength = clamp((210 - d) / 210, 0.18, 1)
      avoidX += ((runner.x - blocker.x) / d) * strength
      avoidY += ((runner.y - blocker.y) / d) * strength
    }
  
    const retreat = normalize(awayFromMal.x * 1.15 + avoidX, awayFromMal.y * 1.15 + avoidY)
    const fallback = runner.team === 'blue' ? { x: -1, y: 0 } : { x: 1, y: 0 }
    return {
      x: runner.x + (retreat.x || fallback.x) * 150,
      y: runner.y + (retreat.y || fallback.y) * 150,
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
  
  function friendlyPompferSafetyPoint(runner, blockers) {
    const team = TEAMS[runner.team]
    const candidates = activeTeamPompfers(runner.team)
      .map((friend) => {
        const toOwnSide = normalize(team.mal.x - friend.x, team.mal.y - friend.y)
        const point = {
          x: friend.x + toOwnSide.x * 46,
          y: friend.y + toOwnSide.y * 46,
        }
        const nearestBlockerDistance = blockers.reduce((best, blocker) => Math.min(best, distance(point, blocker)), Infinity)
        return {
          point,
          score: distance(runner, point) - nearestBlockerDistance * 0.55,
          nearestBlockerDistance,
        }
      })
      .filter((candidate) => candidate.nearestBlockerDistance > maxPompfeAttackRange({ role: 'runner' }) + PLAYER_RADIUS)
      .filter((candidate) => distance(runner, candidate.point) > 72)
      .sort((a, b) => a.score - b.score)
  
    return candidates[0]?.point ?? null
  }
  
  function teammateAvoidance(player) {
    let x = 0
    let y = 0
  
    for (const other of state.players) {
      if (other === player || other.team !== player.team) continue
      const d = distance(player, other)
      if (d <= 0.01 || d > 92) continue
      const strength = (92 - d) / 92
      x += ((player.x - other.x) / d) * strength
      y += ((player.y - other.y) / d) * strength
    }
  
    return { x, y }
  }

  function carrierThreatensMal(team, carrier) {
    if (!carrier || carrier.team === team || !isRunner(carrier) || isInactive(carrier)) return false

    const ownMal = TEAMS[team].mal
    const ownHalf = team === 'blue' ? carrier.x < FIELD.center.x : carrier.x > FIELD.center.x
    const towardMal = normalize(ownMal.x - carrier.x, ownMal.y - carrier.y)
    const progress = carrier.vx * towardMal.x + carrier.vy * towardMal.y

    return ownHalf && progress > 20
  }
  
  const calls = createCallDecisions({
    state,
    rng,
    activeTeamPompfers,
    supportPoint,
    carrierThreatensMal,
    overzahlDuration: OVERZAHL_DURATION,
  })

  const callTargetFor = calls.callTargetFor
  const clearCallIntent = calls.clearCallIntent
  const emitCalls = calls.emitCalls
  const tryIssueOverzahlCall = calls.tryIssueOverzahlCall

  function stopDistanceFor(player, target) {
    if (typeof target?.stopDistance === 'number') return target.stopDistance
    if (target === state.jugg) return isRunner(player) ? 0 : 46
    if (!target || !target.radius) return 18
    if (isChain(player) && target.team !== player.team && !isInactive(target)) return attackRangeFor(player, target) * CHAIN_GUARD_RANGE_FACTOR
    if (isPompfer(player) && target.team !== player.team && !isInactive(target)) return attackRangeFor(player, target) * 0.78
    if (isPompfer(player) && target.team !== player.team && isInactive(target)) return PIN_RANGE * 0.7
    if (isRunner(player) && target.team !== player.team) return RUNNER_DUEL_RANGE * 0.72
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

  function updateAi(player, dt = 0) {
    const team = TEAMS[player.team]
    const ownCarrier = state.jugg.carrier?.team === player.team
    const enemyCarrier = state.jugg.carrier && state.jugg.carrier.team !== player.team
    let target = { x: state.jugg.x, y: state.jugg.y }
    let faceTarget = target
    const nearestActiveEnemy = nearestEnemy(player, (other) => !isInactive(other))
    const callTarget = callTargetFor(player)
    const rushTarget = openingRushTarget(player)
  
    if (state.jugg.carrier !== player) {
      player.retreatingWithJugg = false
      player.sidePressureSide = null
      player.sidePressureFailedSide = null
    }
  
    if (player.pinTarget && player.callType === 'hilfmir' && callTarget) {
      player.pinTarget = null
      target = callTarget
      faceTarget = callTarget
      if (canStrikeTarget(player, target, 8)) attack(player, target)
    } else if (player.pinTarget && player.callType === 'doppelpin' && player.doublePinTrapTarget) {
      const trapTarget = player.doublePinTrapTarget
      const trapPoint = doublePinTrapPoint(player)
      target = trapPoint && distance(player, trapPoint) > 9 ? trapPoint : player
      faceTarget = trapTarget
      if (canStrikeTarget(player, trapTarget, 8)) {
        attack(player, trapTarget)
      }
    } else if (player.pinTarget) {
      target = pinOrbitPoint(player) || player
      faceTarget = nearestActiveEnemy.target || player.pinTarget
      if (canStrikeTarget(player, nearestActiveEnemy.target, 8)) {
        target = nearestActiveEnemy.target
        faceTarget = nearestActiveEnemy.target
        attack(player, target)
      }
    } else if (player.grappleTarget) {
      target = player.grappleTarget
    } else if (callTarget) {
      target = callTarget
      if ((player.callType === 'hilfmir' || player.callType === 'ueberzahl') && canStrikeTarget(player, target, 8)) {
        attack(player, target)
      }
    } else if (rushTarget) {
      target = rushTarget
      if (canStrikeTarget(player, rushTarget, 8)) attack(player, rushTarget)
    } else if (isRunner(player)) {
      if (state.jugg.carrier === player) {
        const blockers = directMalBlockers(player)
        const nearestActivePompfer = nearestEnemy(player, (other) => !isInactive(other) && isPompfer(other))
        const enoughSpaceForSidePressure = nearestActivePompfer.distance > SIDE_PRESSURE_SAFE_DISTANCE
        const useSidePressure = blockers.length > 0 && (player.retreatingWithJugg || player.sidePressureSide) && enoughSpaceForSidePressure

        if (blockers.length <= 0) {
          player.retreatingWithJugg = false
          player.sidePressureSide = null
          player.sidePressureFailedSide = null
          target = team.attackMal
        } else if (useSidePressure) {
          player.retreatingWithJugg = false
          target = sidePressureTargetForRunner(player)
        } else {
          player.retreatingWithJugg = true
          player.sidePressureSide = null
          player.sidePressureFailedSide = null
          target = retreatPointForRunner(player, blockers)
        }
      } else if (enemyCarrier) {
        target = state.jugg.carrier
      } else {
        target = state.jugg
      }
    } else {
      const enemy = nearestActiveEnemy
      const inactive = isChain(player)
        ? { target: null, distance: Infinity }
        : enemy.target
          ? nearestClaimablePinTarget(player)
          : nearestApproachablePinTarget(player)
      const exposedChain = vulnerableOpposingChain(player)
      const bindOpponent = defensiveBindingActive(player) ? oppositePlayer(player) : null
      const chainThreat = chainCooldownThreat(player)

      if (bindOpponent) {
        target = bindOpponent
        faceTarget = bindOpponent
        if (canStrikeTarget(player, bindOpponent, 8)) attack(player, bindOpponent)
      } else if (chainThreat) {
        target = chainRetreatPoint(player, chainThreat)
        faceTarget = chainThreat
      } else if (exposedChain) {
        target = exposedChain
      } else if (isChain(player) && enemy.target) {
        target = enemy.target
      } else if (isChain(player) && !enemy.target) {
        const watched = nearestUnpinnedInactiveEnemy(player).target
        target = watched ? chainGuardPoint(player, watched) : player
        faceTarget = watched || target
      } else if (inactive.target && (inactive.distance < PIN_TARGET_SEEK_RANGE || !enemy.target) && !enemyCarrier) {
        target = inactive.target
      } else if (enemyCarrier) {
        const carrier = state.jugg.carrier
        const pressureRank = carrierPressureRank(player, carrier)
        if (pressureRank >= 0 && pressureRank < CARRIER_PRESSURE_COUNT) {
          target = flankPoint(carrier, player)
        } else {
          const opposite = oppositePlayer(player)
          const oppositeIsRelevant = opposite && !isInactive(opposite) && distance(opposite, carrier) < 260
          target = oppositeIsRelevant ? opposite : laneBlockPoint(player, carrier)
        }
      } else if (ownCarrier && state.jugg.carrier.retreatingWithJugg) {
        target = enemy.target && enemy.distance < 220 ? enemy.target : player
      } else if (ownCarrier) {
        const carrier = state.jugg.carrier
        target = supportPoint(player, carrier)
      } else if (enemy.target && enemy.distance < POMPFER_DUEL_SEEK_RANGE) {
        target = enemy.target
      } else {
        const lane = playerPositionSlot(player) - 2.5
        target = {
          x: state.jugg.x + (player.team === 'blue' ? -96 : 96),
          y: state.jugg.y + lane * 70,
        }
      }
  
      const strikeTarget = target?.team !== player.team && target?.radius && !isInactive(target) ? target : enemy.target
      if (canStrikeTarget(player, strikeTarget, 8)) attack(player, strikeTarget)
    }
  
    if (player.attackWindup > 0 || isGrappling(player)) {
      if (isGrappling(player)) {
        player.vx = 0
        player.vy = 0
      }
      return
    }
  
    if (player.pinTarget && target === player) {
      player.vx = 0
      player.vy = 0
      rotateTowardPoint(player, faceTarget, dt)
      return
    }
  
    if (!player.pinTarget && distance(player, target) <= stopDistanceFor(player, target)) {
      player.vx = 0
      player.vy = 0
      rotateTowardPoint(player, faceTarget, dt)
      return
    }
  
    const desired = normalize(target.x - player.x, target.y - player.y)
    const avoid = teammateAvoidance(player)
    let direction = normalize(desired.x + avoid.x * 0.95, desired.y + avoid.y * 0.95)
    if (!direction.x && !direction.y && (desired.x || desired.y || avoid.x || avoid.y)) {
      const turn = playerIndex(player) % 2 === 0 ? -1 : 1
      direction = normalize(desired.x + -desired.y * 0.55 * turn + avoid.x * 0.35, desired.y + desired.x * 0.55 * turn + avoid.y * 0.35)
    }
    const carrierBoost = state.jugg.carrier === player ? 1.13 : 1
    const pinSlowdown = player.pinTarget ? 0.18 : 1
    const speed = player.speed * carrierBoost * pinSlowdown

    if (player.pinTarget) {
      player.vx = direction.x * speed
      player.vy = direction.y * speed
      rotateTowardPoint(player, faceTarget, dt)
      return
    }

    if (direction.x || direction.y) rotateTowardAngle(player, Math.atan2(direction.y, direction.x), dt)
    player.vx = Math.cos(player.angle) * speed
    player.vy = Math.sin(player.angle) * speed
  }

  return {
    activeTeamPompfers,
    clearCallIntent,
    emitCalls,
    nearestEnemy,
    tryIssueOverzahlCall,
    updateAi,
  }
}
