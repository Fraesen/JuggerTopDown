import { QUICK_PRESSURE_COUNT, TEAMS } from '../config.js'
import { distance, normalize } from '../geometry.js'
import { isGrappling, isInactive, isPompfer, isQuick, playerIndex, playerPositionSlot } from '../players.js'

export function createAiUpdater({
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
  sidePressureSafeDistance,
  pompferDuelSeekRange,
  pinTargetSeekRange,
}) {
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

  function updateAi(player, dt = 0) {
    const team = TEAMS[player.team]
    const ownQuick = state.jugg.quick?.team === player.team
    const enemyQuick = state.jugg.quick && state.jugg.quick.team !== player.team
    let target = { x: state.jugg.x, y: state.jugg.y }
    let faceTarget = target
    const nearestActiveEnemy = nearestEnemy(player, (other) => !isInactive(other))
    const callTarget = callTargetFor(player)
    const rushTarget = openingRushTarget(player)
  
    if (state.jugg.quick !== player) {
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
    } else if (isQuick(player)) {
      if (state.jugg.quick === player) {
        const blockers = directMalBlockers(player)
        const nearestActivePompfer = nearestEnemy(player, (other) => !isInactive(other) && isPompfer(other))
        const enoughSpaceForSidePressure = nearestActivePompfer.distance > sidePressureSafeDistance
        const useSidePressure = blockers.length > 0 && (player.retreatingWithJugg || player.sidePressureSide) && enoughSpaceForSidePressure

        if (blockers.length <= 0) {
          player.retreatingWithJugg = false
          player.sidePressureSide = null
          player.sidePressureFailedSide = null
          target = team.attackMal
        } else if (useSidePressure) {
          player.retreatingWithJugg = false
          target = sidePressureTargetForQuick(player)
        } else {
          player.retreatingWithJugg = true
          player.sidePressureSide = null
          player.sidePressureFailedSide = null
          target = retreatPointForQuick(player, blockers)
        }
      } else if (enemyQuick) {
        target = state.jugg.quick
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
      } else if (inactive.target && (inactive.distance < pinTargetSeekRange || !enemy.target) && !enemyQuick) {
        target = inactive.target
      } else if (enemyQuick) {
        const quick = state.jugg.quick
        const pressureRank = quickPressureRank(player, quick)
        if (pressureRank >= 0 && pressureRank < QUICK_PRESSURE_COUNT) {
          target = quickPressurePoint(quick, player)
        } else {
          const opposite = oppositePlayer(player)
          const oppositeIsRelevant = opposite && !isInactive(opposite) && distance(opposite, quick) < 260
          target = oppositeIsRelevant ? opposite : laneBlockPoint(player, quick)
        }
      } else if (ownQuick && state.jugg.quick.retreatingWithJugg) {
        target = enemy.target && enemy.distance < 220 ? enemy.target : player
      } else if (ownQuick) {
        const quick = state.jugg.quick
        target = supportPoint(player, quick)
      } else if (enemy.target && enemy.distance < pompferDuelSeekRange) {
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
    const quickBoost = state.jugg.quick === player ? 1.13 : 1
    const pinSlowdown = player.pinTarget ? 0.18 : 1
    const speed = player.speed * quickBoost * pinSlowdown

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


  return updateAi
}
