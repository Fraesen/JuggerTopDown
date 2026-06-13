import {
  ATTACK_DURATION,
  DOUBLE_HIT_WINDOW,
  DOUBLE_PIN_RELEASE_PAUSE,
  FIELD,
  HIT_STONES,
  MOVEMENT_SPEED_FACTOR,
  RECOVERY_DASH_DURATION,
  RECOVERY_DASH_SPEED,
  RUNNING_ATTACK_SPEED_THRESHOLD,
  TEAMS,
} from '../config.js'
import { CHAIN_STRIKE_VISUAL_DURATION } from '../chainVisuals.js'
import { clamp, distance, normalize } from '../geometry.js'
import { isInactive, isPompfer, isQuick, playerIndex } from '../players.js'
import { isShieldBlockFacing, pompfeFor } from '../pompfen.js'
import {
  AGGRESSIVE_DOUBLE_WINDOW_FACTOR,
  DEFENSIVE_HIT_MODIFIER,
  doubleWindowFactorFor,
  isAggressiveStrategyPlayer,
  isDefensiveStrategyPlayer,
} from '../strategies.js'
import { t } from '../../i18n/index.js'

export function createCombatStateSystem({
  state,
  cinema,
  burst,
  chainVisualStrikeRadius,
  distanceToSegmentWithT,
  releaseGrapple,
  getDecision,
  CHAIN_BLOCKER_PADDING,
}) {
  function throwJugg(quick, force = 535) {
    if (state.jugg.quick !== quick || !isQuick(quick) || quick.grappledBy) return
    const aim = quick.angle
    state.jugg.quick = null
    state.jugg.x = quick.x + Math.cos(aim) * 28
    state.jugg.y = quick.y + Math.sin(aim) * 28
    state.jugg.vx = Math.cos(aim) * force + quick.vx * 0.28
    state.jugg.vy = Math.sin(aim) * force + quick.vy * 0.28
    state.jugg.cooldown = 0.32
    burst(state.jugg.x, state.jugg.y, TEAMS[quick.team].color, 10)
  }

  function dropJuggFromQuick(quick) {
    if (state.jugg.quick !== quick) return
    state.jugg.quick = null
    state.jugg.contest = null
    state.jugg.vx = quick.vx * 0.25
    state.jugg.vy = quick.vy * 0.25
    state.jugg.cooldown = 0.58
  }

  function playerPoint(player) {
    return player ? { x: player.x, y: player.y } : null
  }

  function nearbyActiveEnemyPayload(player, radius = 190) {
    return state.players
      .filter((other) => other.team !== player.team && !isInactive(other) && distance(player, other) <= radius)
      .sort((a, b) => distance(player, a) - distance(player, b))
      .map((enemy) => ({ id: enemy.id, point: playerPoint(enemy) }))
  }

  function attack(player, target = null) {
    if (player.attackCooldown > 0 || player.attackWindup > 0 || isInactive(player) || player.recoveryDashTimer > 0 || !isPompfer(player)) return
    if (target && target.team !== player.team && !isInactive(target)) {
      player.attackTarget = target
    } else {
      player.attackTarget = null
    }
    player.attackWhileMoving = Math.hypot(player.vx, player.vy) > RUNNING_ATTACK_SPEED_THRESHOLD
    player.attack = ATTACK_DURATION
    player.attackWindup = ATTACK_DURATION
    player.doubleWindow = DOUBLE_HIT_WINDOW * doubleWindowFactorFor(player)

    if (player.pompfe === 'chain') {
      const chainTarget = player.attackTarget
      const visualRange = chainVisualStrikeRadius(player)
      player.chainStrikeTimer = CHAIN_STRIKE_VISUAL_DURATION
      player.chainStrikeDuration = CHAIN_STRIKE_VISUAL_DURATION
      player.chainStrikeTarget = chainTarget
      player.chainStrikeX = chainTarget?.x ?? player.x + Math.cos(player.angle) * visualRange
      player.chainStrikeY = chainTarget?.y ?? player.y + Math.sin(player.angle) * visualRange
    }
  }

  function cancelAttack(player) {
    player.attack = 0
    player.attackWindup = 0
    player.attackTarget = null
    player.attackWhileMoving = false
    player.doubleWindow = 0
    player.chainStrikeTimer = 0
    player.chainStrikeDuration = 0
    player.chainStrikeTarget = null
    player.chainStrikeX = 0
    player.chainStrikeY = 0
    player.chainGuardTarget = null
  }

  function startRecoveryDash(player) {
    const nearbyEnemy = getDecision().nearestEnemy(player, () => true).target
    const awayFromEnemy = nearbyEnemy ? normalize(player.x - nearbyEnemy.x, player.y - nearbyEnemy.y) : { x: 0, y: 0 }
    const forward = { x: Math.cos(player.angle), y: Math.sin(player.angle) }
    const direction = normalize(awayFromEnemy.x * 1.4 + forward.x * 0.45, awayFromEnemy.y * 1.4 + forward.y * 0.45)
    const fallback = player.team === 'blue' ? { x: -1, y: 0 } : { x: 1, y: 0 }
    const speedFactor = clamp(player.speed / (195 * MOVEMENT_SPEED_FACTOR), 0.82, 1.24)

    player.recoveryDashTimer = RECOVERY_DASH_DURATION
    player.recoveryDashSpeed = RECOVERY_DASH_SPEED * speedFactor
    player.recoveryDashX = direction.x || fallback.x
    player.recoveryDashY = direction.y || fallback.y
    player.attack = 0
    player.attackWindup = 0
    player.doubleWindow = 0
  }

  function completePenalty(player) {
    player.penaltyStones = 0
    player.countedStones = player.penaltyTotalStones
    if (player.pinnedBy || player.pinLock > 0) {
      player.recoveryDashQueued = true
      return
    }

    player.recoveryDashQueued = false
    startRecoveryDash(player)
  }

  function advanceGlobalStone() {
    for (const player of state.players) {
      if (player.penaltyStones > 0) {
        player.penaltyStones -= 1
        player.countedStones += 1
        if (player.penaltyStones <= 0) completePenalty(player)
      }

      if (player.pinLock > 0 && !player.pinnedBy) {
        player.pinLock = 0
        if (player.recoveryDashQueued && player.penaltyStones <= 0) {
          player.recoveryDashQueued = false
          startRecoveryDash(player)
        }
      }
    }

    releaseDoppelpinPinsOnStone()
  }

  function releaseDoppelpinPinsOnStone() {
    for (const pinner of state.players) {
      const target = pinner.doublePinReleaseTarget
      if (!target) continue

      if (target.pinnedBy === pinner) {
        target.pinnedBy = null
        target.pinClaimedBy = null
        target.pinLock = target.penaltyStones <= 0 ? 1 : target.pinLock
        if (target.penaltyStones <= 0) target.recoveryDashQueued = true
        if (pinner.pinTarget === target) pinner.pinTarget = null
        pinner.doublePinReleasePause = DOUBLE_PIN_RELEASE_PAUSE
      }

      pinner.doublePinReleaseTarget = null
      if (pinner.callType === 'doppelpin') getDecision().clearCallIntent(pinner)
    }
  }

  function makeInactive(player, stones = HIT_STONES, source = null) {
    if (isInactive(player) && player.penaltyStones >= stones) return
    cinema?.recordEvent({
      type: 'madeInactive',
      playerId: player.id,
      sourceId: source?.id ?? null,
      stones,
      point: playerPoint(player),
    })
    releaseGrapple(player)
    if (state.jugg.quick === player) dropJuggFromQuick(player)
    if (state.jugg.contest?.quicks.includes(player)) {
      state.jugg.contest = null
      state.jugg.cooldown = 0.28
    }
    player.penaltyStones = stones
    player.penaltyTotalStones = stones
    player.pendingInactiveStones = 0
    cancelAttack(player)
    player.countedStones = 0
    player.pinLock = 0
    player.pinnedBy = null
    player.pinClaimedBy = null
    player.pinWasActive = false
    player.recoveryDashQueued = false
    player.recoveryDashTimer = 0
    player.recoveryDashSpeed = 0
    player.recoveryDashX = 0
    player.recoveryDashY = 0
    player.quickJuggRetreatTimer = 0
    player.quickJuggRetreatX = 0
    player.quickJuggRetreatY = 0
    player.callTimer = 0
    player.callType = null
    player.callSource = null
    player.callContext = null
    player.callBubbleTimer = 0
    player.callBubbleText = ''
    player.callMissTimer = 0
    player.overzahlDefenseTimer = 0
    player.doublePinTrapTarget = null
    player.doublePinReleaseTarget = null
    player.doublePinReleasePause = 0
    player.vx = 0
    player.vy = 0
  }

  function announceDouble(attacker, target) {
    if (!attacker || !target) return
    for (const player of [attacker, target]) {
      player.callBubbleText = t('call.double')
      player.callBubbleTimer = 0.95
    }
  }

  function queueDoubleParticipant(player, stones) {
    if (!player || isInactive(player)) return

    if (canDouble(player)) {
      player.pendingInactiveStones = Math.max(player.pendingInactiveStones, stones)
      player.vx = 0
      player.vy = 0
      if (state.jugg.quick === player) dropJuggFromQuick(player)
      return
    }

    makeInactive(player, stones)
  }

  function canDouble(player) {
    return !isInactive(player) && player.attackCooldown <= 0 && (player.attackWindup > 0 || player.doubleWindow > 0)
  }

  function canDoubleAgainst(player, source = null) {
    if (!canDouble(player)) return false
    if (player.attackWindup > 0) return true
    if (source && isAggressiveStrategyPlayer(source)) {
      return player.doubleWindow > DOUBLE_HIT_WINDOW * (1 - AGGRESSIVE_DOUBLE_WINDOW_FACTOR)
    }
    return true
  }

  function oppositePlayerFor(player) {
    const enemyTeam = player.team === 'blue' ? 'red' : 'blue'
    const index = playerIndex(player)
    return state.players.find((other) => other.team === enemyTeam && playerIndex(other) === index)
  }

  function enemyQuickInOwnHalfFor(player) {
    const enemyQuick = state.players.find((other) => other.team !== player.team && isQuick(other) && !isInactive(other))
    if (!enemyQuick) return false
    return player.team === 'blue' ? enemyQuick.x < FIELD.center.x : enemyQuick.x > FIELD.center.x
  }

  function defensiveBindingActiveFor(player) {
    if (!isDefensiveStrategyPlayer(player) || player.defensiveStrategyDone) return false
    const opponent = oppositePlayerFor(player)
    if ((opponent && isInactive(opponent)) || enemyQuickInOwnHalfFor(player)) {
      player.defensiveStrategyDone = true
      return false
    }
    return Boolean(opponent && !isInactive(opponent))
  }

  function queueInactive(player, stones = HIT_STONES, source = null) {
    cinema?.recordEvent({
      type: 'inactiveQueued',
      playerId: player.id,
      sourceId: source?.id ?? null,
      stones,
      point: playerPoint(player),
    })
    if (canDoubleAgainst(player, source)) {
      if (source && source !== player && canDoubleAgainst(source, player)) {
        announceDouble(source, player)
        queueDoubleParticipant(source, stones)
      }
      queueDoubleParticipant(player, stones)
      return
    }

    makeInactive(player, stones, source)
  }

  function hitChance(attacker, target) {
    if (attacker.pompfe !== 'chain' && target.pompfe === 'chain' && isPompfer(attacker) && isPompfer(target)) return 1

    const profile = pompfeFor(attacker)
    const backHit = isBackHit(attacker, target)
    const shieldBonus = !backHit && isShieldBlockFacing(target, attacker) ? pompfeFor(target).shieldBlockBonus : 0
    let chance = attacker.technik / (attacker.technik + target.technik + shieldBonus)
    if (isQuick(target)) chance += profile.quickHitBonus
    if (attacker.attackWhileMoving) chance -= profile.runningAttackPenalty
    if (hasDefensiveStance(attacker)) chance -= DEFENSIVE_HIT_MODIFIER
    if (hasDefensiveStance(target)) chance -= DEFENSIVE_HIT_MODIFIER
    if (backHit) chance *= 2
    return clamp(chance, 0.02, 0.98)
  }

  function hasDefensiveStance(player) {
    return player.overzahlDefenseTimer > 0 || (isDefensiveStrategyPlayer(player) && !player.defensiveStrategyDone)
  }

  function isBackHit(attacker, target) {
    const hitAngle = Math.atan2(attacker.y - target.y, attacker.x - target.x)
    const rearAngle = target.angle + Math.PI
    const rearDelta = Math.abs(Math.atan2(Math.sin(hitAngle - rearAngle), Math.cos(hitAngle - rearAngle)))
    return rearDelta < 1.05
  }

  function chainAttackBlocked(attacker, target) {
    if (attacker.pompfe !== 'chain') return false

    const start = { x: attacker.x, y: attacker.y }
    const end = { x: target.x, y: target.y }
    for (const blocker of state.players) {
      if (blocker === attacker || blocker === target) continue
      const hit = distanceToSegmentWithT(blocker, start, end)
      if (hit.t <= 0.08 || hit.t >= 0.96) continue
      if (hit.distance <= blocker.radius + CHAIN_BLOCKER_PADDING) return true
    }

    return false
  }

  return {
    advanceGlobalStone,
    announceDouble,
    attack,
    canDoubleAgainst,
    cancelAttack,
    chainAttackBlocked,
    defensiveBindingActiveFor,
    dropJugg: dropJuggFromQuick,
    hitChance,
    makeInactive,
    nearbyActiveEnemyPayload,
    playerPoint,
    queueDoubleParticipant,
    queueInactive,
    startRecoveryDash,
    throwJugg,
  }
}
