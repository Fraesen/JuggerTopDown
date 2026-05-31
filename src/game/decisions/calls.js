import {
  CALL_BUBBLE_DURATION,
  CALL_COOLDOWN,
  CALL_CORRIDOR_LENGTH,
  CALL_CORRIDOR_WIDTH,
  CALL_DURATION,
  DOUBLE_PIN_TRAP_DURATION,
  FIELD,
  PLAYER_RADIUS,
  QUICK_DUEL_RANGE,
  TEAMS,
  MALSCHUTZ_FREE_JUGG_RANGE,
} from '../config.js'
import { distance, normalize } from '../geometry.js'
import { isGrappling, isInactive, isPompfer, isQuick } from '../players.js'
import { attackRangeFor, canPinWithPompfe } from '../pompfen.js'
import { t } from '../../i18n/index.js'

const DOUBLE_PIN_RANGE_FACTOR = 0.95
const OVERZAHL_SEARCH_RANGE = 260

export function createCallDecisions({
  state,
  rng,
  activeTeamPompfers,
  supportPoint,
  quickThreatensMal,
  overzahlDuration,
}) {
  function callPerceivedBy(player, caller) {
    return player === caller || rng.range(0, 100) < player.wahrnehmung
  }

  function callLabel(type) {
    if (type === 'malschutz') return t('call.malschutz')
    if (type === 'hilfmir') return t('call.hilfmir')
    if (type === 'doppelpin') return t('call.doppelpin')
    if (type === 'ueberzahl') return t('call.ueberzahl')
    return t('call.mitkommen')
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

  function duelInMutualRange(ally, enemy) {
    if (!ally || !enemy || ally.team === enemy.team || isInactive(ally) || isInactive(enemy)) return false
    if (!isPompfer(ally) || !isPompfer(enemy)) return false
    const d = distance(ally, enemy)
    return d <= attackRangeFor(ally, enemy) && d <= attackRangeFor(enemy, ally)
  }

  function nearbyDuelForOverzahl(caller, defeatedTarget) {
    return state.players
      .filter((ally) => ally !== caller && ally.team === caller.team && !isInactive(ally) && isPompfer(ally) && ally.callType !== 'ueberzahl')
      .flatMap((ally) =>
        state.players
          .filter((enemy) => enemy !== defeatedTarget && enemy.team !== caller.team && duelInMutualRange(ally, enemy))
          .map((enemy) => ({ ally, enemy })),
      )
      .filter(({ ally, enemy }) => Math.min(distance(caller, ally), distance(caller, enemy)) <= OVERZAHL_SEARCH_RANGE)
      .sort((a, b) => distance(caller, a.enemy) + distance(caller, a.ally) * 0.35 - (distance(caller, b.enemy) + distance(caller, b.ally) * 0.35))[0]
  }

  function tryIssueOverzahlCall(caller, defeatedTarget) {
    if (!caller || !defeatedTarget || caller.callCooldown > 0 || isInactive(caller) || !isPompfer(caller)) return false
    const duel = nearbyDuelForOverzahl(caller, defeatedTarget)
    if (!duel) return false

    caller.callCooldown = CALL_COOLDOWN
    caller.callBubbleText = callLabel('ueberzahl')
    caller.callBubbleTimer = CALL_BUBBLE_DURATION
    setCallIntent(caller, 'ueberzahl', caller, overzahlDuration, { target: duel.enemy, ally: duel.ally })

    if (callPerceivedBy(duel.ally, caller)) {
      duel.ally.overzahlDefenseTimer = overzahlDuration
      setCallIntent(duel.ally, 'ueberzahl', caller, overzahlDuration, { target: duel.enemy })
    } else {
      duel.ally.callMissTimer = CALL_BUBBLE_DURATION * 0.85
    }

    return true
  }

  function callTargetFor(player) {
    if (player.callTimer <= 0 || !player.callType) return null

    if (player.callType === 'malschutz') {
      const quick = state.jugg.quick
      const ownMal = TEAMS[player.team].mal
      const mode = player.callContext?.mode
      const expectedQuick = player.callContext?.quick

      if (mode === 'quick' && state.jugg.quick !== expectedQuick) {
        clearCallIntent(player)
        return null
      }

      if (mode === 'freeJugg' && quick?.team === player.team) {
        clearCallIntent(player)
        return null
      }

      if (
        isPompfer(player) &&
        quick &&
        quick.team !== player.team &&
        isQuick(quick) &&
        distance(player, ownMal) < distance(quick, ownMal)
      ) {
        clearCallIntent(player)
        player.angle = Math.atan2(quick.y - player.y, quick.x - player.x)
        return null
      }

      return ownMal
    }

    if (player.callType === 'mitkommen') {
      const caller = player.callSource
      if (!caller || state.jugg.quick !== caller || isInactive(caller)) {
        clearCallIntent(player)
        return null
      }
      return supportPoint(player, caller)
    }

    if (player.callType === 'hilfmir') {
      const caller = player.callSource
      const target = caller?.grappledBy || caller?.grappleTarget
      if (!target || isInactive(target)) return null
      return target
    }

    if (player.callType === 'ueberzahl') {
      const target = player.callContext?.target
      if (!target || target.team === player.team || isInactive(target)) {
        clearCallIntent(player)
        return null
      }
      return player.callSource === player ? target : null
    }

    return null
  }

  function enemiesInQuickLane(quick) {
    const target = TEAMS[quick.team].attackMal
    const forward = normalize(target.x - quick.x, target.y - quick.y)
    const perpendicular = { x: -forward.y, y: forward.x }

    return state.players.filter((player) => {
      if (player.team === quick.team || isInactive(player)) return false
      const dx = player.x - quick.x
      const dy = player.y - quick.y
      const ahead = dx * forward.x + dy * forward.y
      const lateral = Math.abs(dx * perpendicular.x + dy * perpendicular.y)
      return ahead > 0 && ahead < CALL_CORRIDOR_LENGTH && lateral < CALL_CORRIDOR_WIDTH
    })
  }

  function bestMitkommenRecipient(quick) {
    return activeTeamPompfers(quick.team)
      .filter((player) => player.callTimer <= 0)
      .sort((a, b) => distance(a, quick) - distance(b, quick))[0]
  }

  function bestHilfMirRecipient(quick) {
    const threat = quick.grappledBy || quick.grappleTarget || quick
    return activeTeamPompfers(quick.team)
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

  function enemyQuickPinned(team) {
    return state.players.some((player) => player.team !== team && isQuick(player) && Boolean(player.pinnedBy))
  }

  function shouldCallMalschutz(team) {
    const quick = state.jugg.quick
    if (enemyQuickPinned(team)) return false
    if (!quick) return distance(state.jugg, TEAMS[team].mal) <= MALSCHUTZ_FREE_JUGG_RANGE
    if (quick.team === team || !isQuick(quick) || isInactive(quick)) return false

    return quickThreatensMal(team, quick)
  }

  function malschutzThreatPoint(team) {
    const quick = state.jugg.quick
    if (quick && quick.team !== team) return quick
    return state.jugg
  }

  function emitCalls() {
    const quick = state.jugg.quick

    const grapplingQuicks = state.players.filter(
      (player) => isQuick(player) && !isInactive(player) && isGrappling(player) && player.callCooldown <= 0,
    )
    for (const quick of grapplingQuicks) {
      const recipient = bestHilfMirRecipient(quick)
      if (recipient) issueCall(quick, 'hilfmir', [recipient])
    }

    if (quick && isQuick(quick) && !isInactive(quick) && quick.callCooldown <= 0) {
      const blockers = enemiesInQuickLane(quick)
      const recipient = blockers.length === 1 ? bestMitkommenRecipient(quick) : null
      if (recipient) {
        issueCall(quick, 'mitkommen', [recipient])
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
        mode: state.jugg.quick ? 'quick' : 'freeJugg',
        quick: state.jugg.quick,
      })
      state.teamCallCooldowns[team] = CALL_COOLDOWN
    }
  }

  return {
    callTargetFor,
    clearCallIntent,
    emitCalls,
    tryIssueOverzahlCall,
  }
}
