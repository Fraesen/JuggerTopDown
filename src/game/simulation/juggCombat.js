import {
  ATTACK_COOLDOWN,
  CHAIN_HIT_STONES,
  FIELD,
  HIT_STONES,
  JUGG_RADIUS,
  PIN_RANGE,
  PLAYER_RADIUS,
  QUICK_DUEL_COOLDOWN,
  QUICK_DUEL_RANGE,
  QUICK_GRAPPLE_BREAK_RANGE,
  QUICK_GRAPPLE_RANGE,
  QUICK_JUGG_CONTEST_COOLDOWN,
  QUICK_JUGG_CONTEST_PRESSURE_RANGE,
  TEAMS,
} from '../config.js'
import { constrainToField, distance, normalize } from '../geometry.js'
import { canReceiveNewPin, isInactive, isPompfer, isQuick } from '../players.js'
import { canPinTargetForJuggState } from '../pinRules.js'
import { attackRangeFor, canPinWithPompfe, isInAttackArc } from '../pompfen.js'
import { t, teamLabel } from '../../i18n/index.js'

export function createJuggCombatSystem({
  state,
  rng,
  cinema,
  burst,
  playerPoint,
  nearbyActiveEnemyPayload,
  canDoubleAgainst,
  announceDouble,
  queueDoubleParticipant,
  queueInactive,
  cancelAttack,
  decision,
  hitChance,
  chainAttackBlocked,
  defensiveBindingActiveFor,
  releaseGrapple,
  CHAIN_HIT_COOLDOWN_MULTIPLIER,
}) {
  function techniqueContestChance(challenger, defender) {
    return challenger.technik / (challenger.technik + defender.technik)
  }
  
  function quickJuggReach() {
    return PLAYER_RADIUS + JUGG_RADIUS + 8
  }
  
  function quickJuggContestResult(a, b) {
    const aChance = techniqueContestChance(a, b)
    const bChance = techniqueContestChance(b, a)
    const aHits = rng.chance(aChance)
    const bHits = rng.chance(bChance)
  
    if (aHits && !bHits) return a
    if (bHits && !aHits) return b
    if (aHits && bHits) return 'held'
    return null
  }
  
  function nearbyEnemyPompferPressure(quick) {
    return decision.nearestEnemy(quick, (other) => isPompfer(other) && !isInactive(other))
  }
  
  function retreatQuickFromPressure(quick, threat) {
    const ownMal = TEAMS[quick.team].mal
    const awayFromThreat = threat ? normalize(quick.x - threat.x, quick.y - threat.y) : { x: 0, y: 0 }
    const towardHome = normalize(ownMal.x - quick.x, ownMal.y - quick.y)
    const fallback = quick.team === 'blue' ? { x: -1, y: 0 } : { x: 1, y: 0 }
    const direction = normalize(awayFromThreat.x * 1.35 + towardHome.x * 0.75, awayFromThreat.y * 1.35 + towardHome.y * 0.75)
    quick.quickJuggRetreatTimer = 0.5
    quick.quickJuggRetreatX = direction.x || fallback.x
    quick.quickJuggRetreatY = direction.y || fallback.y
    quick.vx = quick.quickJuggRetreatX * quick.speed * 0.92
    quick.vy = quick.quickJuggRetreatY * quick.speed * 0.92
    quick.angle = Math.atan2(quick.vy, quick.vx)
    quick.duelCooldown = Math.max(quick.duelCooldown, QUICK_DUEL_COOLDOWN * 0.7)
  }
  
  function assignJuggQuick(quick, message = null) {
    state.jugg.quick = quick
    state.jugg.contest = null
    state.jugg.vx = 0
    state.jugg.vy = 0
    quick.holdOffset = 0
    cinema?.recordEvent({
      type: 'juggPickup',
      ...cinema.quickOddsPayload(quick),
    })
    if (message) {
      state.message = message
      state.messageTimer = 0.7
    }
    burst(state.jugg.x, state.jugg.y, TEAMS[quick.team].color, 8)
  }
  
  function startQuickJuggContest(a, b) {
    state.jugg.quick = null
    state.jugg.contest = {
      quicks: [a, b],
      cooldown: QUICK_JUGG_CONTEST_COOLDOWN,
    }
    cinema?.recordEvent({
      type: 'juggContest',
      quickIds: [a.id, b.id],
      points: [playerPoint(a), playerPoint(b), playerPoint(state.jugg)].filter(Boolean),
    })
    state.jugg.vx = 0
    state.jugg.vy = 0
    for (const quick of [a, b]) {
      quick.vx = 0
      quick.vy = 0
      quick.duelCooldown = Math.max(quick.duelCooldown, QUICK_JUGG_CONTEST_COOLDOWN)
    }
    state.message = 'Jugg umkaempft'
    state.messageTimer = 0.55
  }
  
  function findStrikeTarget(attacker) {
    let best = null
    let bestScore = Infinity
  
    if (attacker.attackTarget && attacker.attackTarget.team !== attacker.team && !isInactive(attacker.attackTarget)) {
      const target = attacker.attackTarget
      const range = attackRangeFor(attacker, target)
      if (isInAttackArc(attacker, target, range) && !chainAttackBlocked(attacker, target)) return target
    }
  
    for (const target of state.players) {
      if (target.team === attacker.team || isInactive(target)) continue
      const d = distance(attacker, target)
      const range = attackRangeFor(attacker, target)
      const inArc = isInAttackArc(attacker, target, range)
      const score = d - (isQuick(target) ? 24 : 0)
      if (d < range && inArc && !chainAttackBlocked(attacker, target) && score < bestScore) {
        best = target
        bestScore = score
      }
    }
  
    return best
  }
  
  function resolveStrikeEvents(events) {
    const hits = []
  
    for (const attacker of events) {
      if (!isPompfer(attacker)) continue
      const intendedTarget = attacker.attackTarget
      const intendedQuick = intendedTarget && isQuick(intendedTarget) && intendedTarget.team !== attacker.team && !isInactive(intendedTarget) ? intendedTarget : null
      const target = findStrikeTarget(attacker)
      attacker.attackTarget = null
      if (!target) {
        if (intendedQuick) recordQuickAttackMiss(attacker, intendedQuick, 'out_of_reach')
        continue
      }
  
      const hitSuccessful = rng.chance(hitChance(attacker, target))
      if (hitSuccessful) {
        hits.push({ attacker, target })
      } else if (isQuick(target) || intendedQuick) {
        recordQuickAttackMiss(attacker, isQuick(target) ? target : intendedQuick, 'miss')
      }
    }

    const reciprocalHits = new Set()
    for (const hit of hits) {
      if (hits.some((other) => other.attacker === hit.target && other.target === hit.attacker)) {
        reciprocalHits.add(hit)
      }
    }
  
    for (const hit of hits) {
      const penaltyStones = hit.attacker.pompfe === 'chain' ? CHAIN_HIT_STONES : HIT_STONES
      const targetCanDouble = canDoubleAgainst(hit.target, hit.attacker)
      const reciprocal = reciprocalHits.has(hit)
      const clearWin = !reciprocal && !targetCanDouble
      const nearbyEnemies = nearbyActiveEnemyPayload(hit.attacker)
      cinema?.recordEvent({
        type: reciprocal ? 'double' : 'hit',
        attackerId: hit.attacker.id,
        targetId: hit.target.id,
        attackerPompfe: hit.attacker.pompfe,
        targetPompfe: hit.target.pompfe,
        clearWin,
        attackerPoint: playerPoint(hit.attacker),
        targetPoint: playerPoint(hit.target),
        nearbyEnemyIds: nearbyEnemies.map((enemy) => enemy.id),
        nearbyEnemyPoints: nearbyEnemies.map((enemy) => enemy.point),
      })
      if (hit.attacker.pompfe === 'chain') {
        hit.attacker.attackCooldown = Math.max(hit.attacker.attackCooldown, ATTACK_COOLDOWN * CHAIN_HIT_COOLDOWN_MULTIPLIER)
      }
      if (hit.target.pompfe === 'chain') {
        cancelAttack(hit.target)
      }
      if (clearWin) {
        decision.tryIssueOverzahlCall(hit.attacker, hit.target)
      }
      queueInactive(hit.target, penaltyStones, hit.attacker)
      burst(hit.target.x, hit.target.y, TEAMS[hit.attacker.team].color, 8)
    }
  }

  function recordQuickAttackMiss(attacker, quick, reason) {
    if (!quick) return
    cinema?.recordEvent({
      type: 'quickAttackMiss',
      attackerId: attacker.id,
      quickId: quick.id,
      attackerPompfe: attacker.pompfe,
      targetPompfe: quick.pompfe,
      reason,
      attackerPoint: playerPoint(attacker),
      quickPoint: playerPoint(quick),
      juggPoint: { x: state.jugg.x, y: state.jugg.y },
    })
  }
  
  function resolvePins() {
    const previousPinned = new Map()
    const assignedPinners = new Set()
    const assignedTargets = new Set()
  
    for (const player of state.players) {
      if (player.pinnedBy) previousPinned.set(player, player.pinnedBy)
      player.pinnedBy = null
      player.pinClaimedBy = null
      player.pinTarget = null
    }
  
    for (const [target, pinner] of previousPinned) {
      if (
        !isPompfer(pinner) ||
        !canPinWithPompfe(pinner) ||
        isInactive(pinner) ||
        defensiveBindingActiveFor(pinner) ||
        pinner.callType === 'hilfmir' ||
        pinner.doublePinReleasePause > 0 ||
        target.team === pinner.team ||
        !canPinTargetForJuggState(pinner, target, state) ||
        distance(pinner, target) > PIN_RANGE
      ) {
        continue
      }
  
      target.pinnedBy = pinner
      target.pinClaimedBy = pinner
      target.pinWasActive = true
      pinner.pinTarget = target
      assignedPinners.add(pinner)
      assignedTargets.add(target)
    }
  
    for (const pinner of state.players) {
      if (!isPompfer(pinner) || !canPinWithPompfe(pinner) || isInactive(pinner)) continue
      if (defensiveBindingActiveFor(pinner)) continue
      if (pinner.callType === 'hilfmir') continue
      if (pinner.doublePinReleasePause > 0 || pinner.doublePinTrapTarget) continue
      if (assignedPinners.has(pinner)) continue
  
      let best = null
      let bestDistance = Infinity
      for (const target of state.players) {
        if (
          target.team === pinner.team ||
          !canReceiveNewPin(target) ||
          !canPinTargetForJuggState(pinner, target, state) ||
          assignedTargets.has(target)
        ) {
          continue
        }
        const d = distance(pinner, target)
        if (d <= PIN_RANGE && d < bestDistance) {
          best = target
          bestDistance = d
        }
      }
  
      if (best) {
        best.pinnedBy = pinner
        best.pinClaimedBy = pinner
        best.pinWasActive = true
        pinner.pinTarget = best
        cinema?.recordEvent({
          type: 'pin',
          pinnerId: pinner.id,
          targetId: best.id,
          points: [playerPoint(pinner), playerPoint(best)],
        })
        assignedPinners.add(pinner)
        assignedTargets.add(best)
      }
    }
  
    for (const [target] of previousPinned) {
      if (!target.pinnedBy && target.penaltyStones <= 0) {
        target.pinLock = 1
      }
    }
  
    for (const pinner of state.players) {
      if (pinner.pinTarget?.pinnedBy !== pinner) pinner.pinTarget = null
    }
  }
  
  function quickThreatensMal(team, quick) {
    if (!quick || quick.team === team || !isQuick(quick) || isInactive(quick)) return false
  
    const ownMal = TEAMS[team].mal
    const ownHalf = team === 'blue' ? quick.x < FIELD.center.x : quick.x > FIELD.center.x
    const towardMal = normalize(ownMal.x - quick.x, ownMal.y - quick.y)
    const progress = quick.vx * towardMal.x + quick.vy * towardMal.y
  
    return ownHalf && progress > 20
  }
  
  function resolveQuickGrapples() {
    for (const player of state.players) {
      if (!player.grappleTarget) continue
      const target = player.grappleTarget
      if (
        state.jugg.quick !== target ||
        player.team === target.team ||
        isInactive(player) ||
        isInactive(target) ||
        distance(player, target) > QUICK_GRAPPLE_BREAK_RANGE
      ) {
        releaseGrapple(player)
        continue
      }
  
      const angle = Math.atan2(target.y - player.y, target.x - player.x)
      player.vx = 0
      player.vy = 0
      player.angle = angle
      target.vx = 0
      target.vy = 0
      target.angle = angle + Math.PI
    }
  
    const quick = state.jugg.quick
    if (!quick || !isQuick(quick) || isInactive(quick) || quick.grappledBy) return
  
    const defender = state.players.find(
      (player) =>
        player.team !== quick.team &&
        isQuick(player) &&
        !isInactive(player) &&
        !player.grappleTarget &&
        quickThreatensMal(player.team, quick) &&
        distance(player, quick) <= QUICK_GRAPPLE_RANGE,
    )
  
    if (!defender) return
  
    defender.grappleTarget = quick
    quick.grappledBy = defender
    defender.vx = 0
    defender.vy = 0
    quick.vx = 0
    quick.vy = 0
    state.message = t('match.teamGrapples', { team: teamLabel(defender.team) })
    state.messageTimer = 0.8
    burst(quick.x, quick.y, TEAMS[defender.team].color, 12)
  }
  
  function resolveQuickDuels() {
    const quick = state.jugg.quick
    if (!quick || !isQuick(quick) || isInactive(quick) || quick.grappledBy || quick.duelCooldown > 0) return
  
    const challenger = state.players.find(
      (player) =>
        player.team !== quick.team &&
        isQuick(player) &&
        !isInactive(player) &&
        player.duelCooldown <= 0 &&
        distance(player, quick) <= QUICK_DUEL_RANGE,
    )
  
    if (!challenger) return
  
    quick.duelCooldown = QUICK_DUEL_COOLDOWN
    challenger.duelCooldown = QUICK_DUEL_COOLDOWN
  
    const challengerWins = rng.chance(techniqueContestChance(challenger, quick))
    const winner = challengerWins ? challenger : quick
    const loser = challengerWins ? quick : challenger
    const angle = Math.atan2(loser.y - winner.y, loser.x - winner.x)
  
    if (challengerWins) {
      state.jugg.quick = challenger
      challenger.holdOffset = 0
      state.message = t('match.teamCapturesJugg', { team: teamLabel(challenger.team) })
      state.messageTimer = 0.9
    }
  
    winner.vx += Math.cos(angle + Math.PI) * 38
    winner.vy += Math.sin(angle + Math.PI) * 38
    loser.vx += Math.cos(angle) * 92
    loser.vy += Math.sin(angle) * 92
    burst(state.jugg.x, state.jugg.y, TEAMS[winner.team].color, challengerWins ? 14 : 8)
  }
  
  function updateQuickJuggContest(dt) {
    const contest = state.jugg.contest
    if (!contest) return false
  
    const [a, b] = contest.quicks
    if (!a || !b || isInactive(a) || isInactive(b) || distance(a, b) > QUICK_DUEL_RANGE * 1.6) {
      state.jugg.contest = null
      state.jugg.cooldown = 0.18
      return false
    }
  
    const midX = (a.x + b.x) / 2
    const midY = (a.y + b.y) / 2
    state.jugg.x = midX
    state.jugg.y = midY
    state.jugg.vx = 0
    state.jugg.vy = 0
  
    contest.cooldown = Math.max(0, contest.cooldown - dt)
    for (const quick of contest.quicks) {
      quick.vx = 0
      quick.vy = 0
      quick.angle = Math.atan2(state.jugg.y - quick.y, state.jugg.x - quick.x)
    }
  
    if (contest.cooldown > 0) return true
  
    const pressured = contest.quicks
      .map((quick) => ({ quick, pressure: nearbyEnemyPompferPressure(quick) }))
      .filter(({ pressure }) => pressure.target && pressure.distance < QUICK_JUGG_CONTEST_PRESSURE_RANGE)
  
    if (pressured.length > 0) {
      state.jugg.contest = null
      state.jugg.cooldown = 0.32
      state.message = 'Läufer:innen lösen'
      state.messageTimer = 0.55
      for (const { quick, pressure } of pressured) retreatQuickFromPressure(quick, pressure.target)
      return true
    }
  
    const result = quickJuggContestResult(a, b)
    if (result === 'held') {
      contest.cooldown = QUICK_JUGG_CONTEST_COOLDOWN
      state.message = 'Jugg festgehalten'
      state.messageTimer = 0.55
      return true
    }
  
    if (result) {
      assignJuggQuick(result, t('match.teamSecuresJugg', { team: teamLabel(result.team) }))
      return true
    }
  
    contest.cooldown = QUICK_JUGG_CONTEST_COOLDOWN * 0.65
    return true
  }
  
  function resolveFreeJuggQuickPickup() {
    if (state.jugg.cooldown > 0 || state.jugg.quick || state.jugg.contest) return
  
    const quicks = state.players
      .filter((player) => isQuick(player) && !isInactive(player) && distance(player, state.jugg) <= quickJuggReach())
      .sort((a, b) => distance(a, state.jugg) - distance(b, state.jugg))
  
    if (quicks.length <= 0) return
  
    const first = quicks[0]
    const opponent = quicks.find((quick) => quick.team !== first.team)
  
    if (!opponent) {
      assignJuggQuick(first)
      return
    }
  
    const result = quickJuggContestResult(first, opponent)
    if (result === 'held') {
      startQuickJuggContest(first, opponent)
    } else if (result) {
      assignJuggQuick(result)
    } else {
      state.jugg.cooldown = QUICK_JUGG_CONTEST_COOLDOWN * 0.55
    }
  }
  
  function updateJugg(dt) {
    const jugg = state.jugg
    jugg.cooldown = Math.max(0, jugg.cooldown - dt)
  
    if (updateQuickJuggContest(dt)) return
  
    if (jugg.quick) {
      const quick = jugg.quick
      quick.holdOffset += dt * 8
      jugg.x = quick.x + Math.cos(quick.angle) * 23
      jugg.y = quick.y + Math.sin(quick.angle) * 23 + Math.sin(quick.holdOffset) * 2
      jugg.vx = quick.vx
      jugg.vy = quick.vy
      resolveQuickGrapples()
      resolveQuickDuels()
      return
    }
  
    jugg.x += jugg.vx * dt
    jugg.y += jugg.vy * dt
    jugg.vx *= Math.pow(0.08, dt)
    jugg.vy *= Math.pow(0.08, dt)
  
    constrainToField(jugg, JUGG_RADIUS, true)
  
    resolveFreeJuggQuickPickup()
    if (jugg.quick || jugg.contest) return
  
    for (const player of state.players) {
      if (isInactive(player)) continue
      const d = distance(player, jugg)
  
      if (isPompfer(player) && d < player.radius + JUGG_RADIUS + 8) {
        const push = normalize(jugg.x - player.x, jugg.y - player.y)
        jugg.vx += push.x * 92
        jugg.vy += push.y * 92
      }
    }
  }
  

  return {
    resolvePins,
    resolveStrikeEvents,
    updateJugg,
  }
}
