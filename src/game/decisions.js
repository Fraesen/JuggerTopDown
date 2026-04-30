import {
  CALL_BUBBLE_DURATION,
  CALL_COOLDOWN,
  CALL_CORRIDOR_LENGTH,
  CALL_CORRIDOR_WIDTH,
  CALL_DURATION,
  CARRIER_PRESSURE_COUNT,
  DOUBLE_PIN_TRAP_DURATION,
  FIELD,
  OPENING_FAN_REACHED_RADIUS,
  OPENING_RUSH_SECONDS,
  PIN_ORBIT_MAX_RADIUS,
  PIN_RANGE,
  PLAYER_RADIUS,
  RUNNER_DUEL_RANGE,
  TEAMS,
  fieldPoint,
} from './config.js'
import { clamp, distance, normalize } from './geometry.js'
import { canReceiveNewPin, isGrappling, isInactive, isPompfer, isRunner, playerIndex, playerPositionSlot } from './players.js'
import { attackRangeFor, canPinWithPompfe, isInAttackArc, maxPompfeAttackRange } from './pompfen.js'

const SIDE_PRESSURE_SAFE_DISTANCE = (FIELD.lengthMeters * FIELD.scale) / 4
const SIDE_PRESSURE_REACHED_DISTANCE = 42
const SIDE_PRESSURE_CURVE_STEPS = 9
const DOUBLE_PIN_RANGE_FACTOR = 0.95
const CHAIN_GUARD_RANGE_FACTOR = 0.9
const FULL_TURN_SECONDS = 0.75
const TURN_RATE = (Math.PI * 2) / FULL_TURN_SECONDS
const SIDE_PRESSURE_LANES = {
  top: () => fieldPoint(20, 1.8).y,
  bottom: () => fieldPoint(20, FIELD.widthMeters - 1.8).y,
}
const MALSCHUTZ_FREE_JUGG_RANGE = 10 * FIELD.scale

export function createDecisionEngine({ state, attack }) {
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
  
  function canSeekNewPin(player) {
    return (
      isPompfer(player) &&
      canPinWithPompfe(player) &&
      !isInactive(player) &&
      !player.pinTarget &&
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
  
  function openingFanPoint(player) {
    const slot = playerPositionSlot(player)
    const lane = [10, 4.4, 7.2, 12.8, 15.6][slot]
    const meterX = player.team === 'blue' ? 10 + slot * 0.75 : 30 - slot * 0.75
    return fieldPoint(meterX, lane)
  }
  
  function openingRushTarget(player) {
    if (player.openingComplete) return null
    if (state.roundTime > OPENING_RUSH_SECONDS || state.jugg.carrier) {
      player.openingComplete = true
      return null
    }
  
    const fanPoint = openingFanPoint(player)
    if (distance(player, fanPoint) <= OPENING_FAN_REACHED_RADIUS) {
      player.openingComplete = true
      return null
    }
  
    return fanPoint
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
  
  function callPerceivedBy(player, caller) {
    return player === caller || Math.random() * 100 < player.wahrnehmung
  }
  
  function callLabel(type) {
    if (type === 'malschutz') return 'Malschutz!'
    if (type === 'hilfmir') return 'Hilf mir!'
    if (type === 'doppelpin') return 'Doppelpin!'
    return 'Mitkommen!'
  }
  
  function setCallIntent(player, type, caller, duration = CALL_DURATION, context = null) {
    player.callType = type
    player.callSource = caller
    player.callContext = context
    player.callTimer = duration
  }
  
  function clearCallIntent(player) {
    if (player.callType === 'doppelpin') player.doublePinTrapTarget = null
    player.callTimer = 0
    player.callType = null
    player.callSource = null
    player.callContext = null
  }
  
  function issueCall(caller, type, recipients, context = null) {
    caller.callCooldown = CALL_COOLDOWN
    caller.callBubbleText = callLabel(type)
    caller.callBubbleTimer = CALL_BUBBLE_DURATION
    for (const recipient of recipients) {
      if (recipient.team !== caller.team || isInactive(recipient)) continue
      if (callPerceivedBy(recipient, caller)) {
        setCallIntent(recipient, type, caller, CALL_DURATION, context)
      } else {
        recipient.callMissTimer = CALL_BUBBLE_DURATION * 0.85
      }
    }
  }
  
  function issueDoppelpinCall(caller, teammate, target) {
    caller.callCooldown = CALL_COOLDOWN
    caller.callBubbleText = callLabel('doppelpin')
    caller.callBubbleTimer = CALL_BUBBLE_DURATION
  
    if (!callPerceivedBy(teammate, caller)) {
      teammate.callMissTimer = CALL_BUBBLE_DURATION * 0.85
      return
    }
  
    caller.doublePinTrapTarget = target
    setCallIntent(caller, 'doppelpin', caller, DOUBLE_PIN_TRAP_DURATION)
    teammate.doublePinReleaseTarget = target
    setCallIntent(teammate, 'doppelpin', caller, DOUBLE_PIN_TRAP_DURATION)
  }
  
  function callTargetFor(player) {
    if (player.callTimer <= 0 || !player.callType) return null
  
    if (player.callType === 'malschutz') {
      const carrier = state.jugg.carrier
      const ownMal = TEAMS[player.team].mal
      const mode = player.callContext?.mode
      const expectedCarrier = player.callContext?.carrier

      if (mode === 'carrier' && state.jugg.carrier !== expectedCarrier) {
        clearCallIntent(player)
        return null
      }

      if (mode === 'freeJugg' && carrier?.team === player.team) {
        clearCallIntent(player)
        return null
      }
  
      if (
        isPompfer(player) &&
        carrier &&
        carrier.team !== player.team &&
        isRunner(carrier) &&
        distance(player, ownMal) < distance(carrier, ownMal)
      ) {
        clearCallIntent(player)
        player.angle = Math.atan2(carrier.y - player.y, carrier.x - player.x)
        return null
      }
  
      return ownMal
    }
  
    if (player.callType === 'mitkommen') {
      const caller = player.callSource
      if (!caller || state.jugg.carrier !== caller || isInactive(caller)) return null
      return supportPoint(player, caller)
    }
  
    if (player.callType === 'hilfmir') {
      const caller = player.callSource
      const target = caller?.grappledBy || caller?.grappleTarget
      if (!target || isInactive(target)) return null
      return target
    }
  
    return null
  }
  
  function enemiesInRunnerLane(runner) {
    const target = TEAMS[runner.team].attackMal
    const forward = normalize(target.x - runner.x, target.y - runner.y)
    const perpendicular = { x: -forward.y, y: forward.x }
  
    return state.players.filter((player) => {
      if (player.team === runner.team || isInactive(player)) return false
      const dx = player.x - runner.x
      const dy = player.y - runner.y
      const ahead = dx * forward.x + dy * forward.y
      const lateral = Math.abs(dx * perpendicular.x + dy * perpendicular.y)
      return ahead > 0 && ahead < CALL_CORRIDOR_LENGTH && lateral < CALL_CORRIDOR_WIDTH
    })
  }
  
  function bestMitkommenRecipient(runner) {
    return activeTeamPompfers(runner.team)
      .filter((player) => player.callTimer <= 0)
      .sort((a, b) => distance(a, runner) - distance(b, runner))[0]
  }
  
  function bestHilfMirRecipient(runner) {
    const threat = runner.grappledBy || runner.grappleTarget || runner
    return activeTeamPompfers(runner.team)
      .filter((player) => player.callTimer <= 0)
      .sort((a, b) => distance(a, threat) - distance(b, threat))[0]
  }
  
  function doppelpinOpportunity(caller) {
    if (!isPompfer(caller) || !canPinWithPompfe(caller) || isInactive(caller) || !caller.pinTarget || caller.callCooldown > 0) return null
    if (caller.callType === 'doppelpin' || caller.doublePinTrapTarget || caller.doublePinReleaseTarget) return null
  
    return state.players
      .filter((teammate) => {
        if (teammate === caller || teammate.team !== caller.team || !isPompfer(teammate) || !canPinWithPompfe(teammate) || isInactive(teammate)) return false
        if (teammate.callType === 'doppelpin' || teammate.doublePinTrapTarget) return false
        if (!teammate.pinTarget || teammate.doublePinReleaseTarget || teammate.doublePinReleasePause > 0) return false
        const target = teammate.pinTarget
        return (
          target !== caller.pinTarget &&
          target.team !== caller.team &&
          isPompfer(target) &&
          target.pinnedBy === teammate &&
          target.penaltyStones <= 1 &&
          distance(caller, target) <= attackRangeFor(caller, target) * DOUBLE_PIN_RANGE_FACTOR
        )
      })
      .map((teammate) => ({ teammate, target: teammate.pinTarget, distance: distance(caller, teammate.pinTarget) }))
      .sort((a, b) => a.distance - b.distance)[0]
  }
  
  function emitDoppelpinCalls() {
    for (const caller of state.players) {
      const opportunity = doppelpinOpportunity(caller)
      if (!opportunity) continue
      issueDoppelpinCall(caller, opportunity.teammate, opportunity.target)
    }
  }
  
  function shouldCallMalschutz(team) {
    const carrier = state.jugg.carrier
    if (enemyRunnerPinned(team)) return false
    if (!carrier) return distance(state.jugg, TEAMS[team].mal) <= MALSCHUTZ_FREE_JUGG_RANGE
    if (carrier.team === team || !isRunner(carrier) || isInactive(carrier)) return false
  
    return carrierThreatensMal(team, carrier)
  }

  function enemyRunnerPinned(team) {
    return state.players.some((player) => player.team !== team && isRunner(player) && Boolean(player.pinnedBy))
  }

  function malschutzThreatPoint(team) {
    const carrier = state.jugg.carrier
    if (carrier && carrier.team !== team) return carrier
    return state.jugg
  }
  
  function carrierThreatensMal(team, carrier) {
    if (!carrier || carrier.team === team || !isRunner(carrier) || isInactive(carrier)) return false
  
    const ownMal = TEAMS[team].mal
    const ownHalf = team === 'blue' ? carrier.x < FIELD.center.x : carrier.x > FIELD.center.x
    const towardMal = normalize(ownMal.x - carrier.x, ownMal.y - carrier.y)
    const progress = carrier.vx * towardMal.x + carrier.vy * towardMal.y
  
    return ownHalf && progress > 20
  }
  
  function emitCalls() {
    const carrier = state.jugg.carrier
  
    const grapplingRunners = state.players.filter(
      (player) => isRunner(player) && !isInactive(player) && isGrappling(player) && player.callCooldown <= 0,
    )
    for (const runner of grapplingRunners) {
      const recipient = bestHilfMirRecipient(runner)
      if (recipient) issueCall(runner, 'hilfmir', [recipient])
    }
  
    if (carrier && isRunner(carrier) && !isInactive(carrier) && carrier.callCooldown <= 0) {
      const blockers = enemiesInRunnerLane(carrier)
      const recipient = blockers.length === 1 ? bestMitkommenRecipient(carrier) : null
      if (recipient) {
        issueCall(carrier, 'mitkommen', [recipient])
      }
    }
  
    emitDoppelpinCalls()
  
    for (const team of Object.keys(TEAMS)) {
      if (state.teamCallCooldowns[team] > 0) continue
      if (!shouldCallMalschutz(team)) continue
      const threatPoint = malschutzThreatPoint(team)
      const caller = state.players
        .filter((player) => player.team === team && player.callCooldown <= 0)
        .sort((a, b) => distance(a, threatPoint) - distance(b, threatPoint))[0]
  
      if (!caller) continue
      issueCall(caller, 'malschutz', state.players.filter((player) => player.team === team), {
        mode: state.jugg.carrier ? 'carrier' : 'freeJugg',
        carrier: state.jugg.carrier,
      })
      state.teamCallCooldowns[team] = CALL_COOLDOWN
    }
  }
  
  function stopDistanceFor(player, target) {
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

  function chainGuardPoint(player, watched) {
    const guardDistance = attackRangeFor(player, watched) * CHAIN_GUARD_RANGE_FACTOR
    const away = normalize(player.x - watched.x, player.y - watched.y)
    const laneFallback = playerPositionSlot(player) <= 2 ? { x: 0, y: -1 } : { x: 0, y: 1 }
    const teamFallback = player.team === 'blue' ? { x: -0.35, y: laneFallback.y } : { x: 0.35, y: laneFallback.y }
    const fallback = normalize(teamFallback.x, teamFallback.y)
    const dir = away.x || away.y ? away : fallback

    return {
      x: watched.x + dir.x * guardDistance,
      y: watched.y + dir.y * guardDistance,
    }
  }
  
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
      faceTarget = player.pinTarget
      if (canStrikeTarget(player, nearestActiveEnemy.target, 8)) {
        target = nearestActiveEnemy.target
        faceTarget = nearestActiveEnemy.target
        attack(player, target)
      }
    } else if (player.grappleTarget) {
      target = player.grappleTarget
    } else if (callTarget) {
      target = callTarget
      if (player.callType === 'hilfmir' && canStrikeTarget(player, target, 8)) {
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
      const inactive = isChain(player) ? { target: null, distance: Infinity } : nearestClaimablePinTarget(player)
      const enemy = nearestActiveEnemy
      const exposedChain = vulnerableOpposingChain(player)
  
      if (exposedChain) {
        target = exposedChain
      } else if (isChain(player) && enemy.target) {
        target = enemy.target
      } else if (isChain(player) && !enemy.target) {
        const watched = nearestInactiveEnemy(player).target
        target = watched ? chainGuardPoint(player, watched) : player
        faceTarget = watched || target
      } else if (inactive.target && inactive.distance < 132 && !enemyCarrier) {
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
      } else if (enemy.target && enemy.distance < 188) {
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

    if (direction.x || direction.y) rotateTowardAngle(player, Math.atan2(direction.y, direction.x), dt)
    player.vx = Math.cos(player.angle) * speed
    player.vy = Math.sin(player.angle) * speed
  }

  return {
    activeTeamPompfers,
    clearCallIntent,
    emitCalls,
    nearestEnemy,
    updateAi,
  }
}
