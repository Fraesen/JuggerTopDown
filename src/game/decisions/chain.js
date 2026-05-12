import { TEAMS } from '../config.js'
import { distance, normalize } from '../geometry.js'
import { isInactive, isPompfer, playerPositionSlot } from '../players.js'
import { attackRangeFor } from '../pompfen.js'

const CHAIN_GUARD_RANGE_FACTOR = 0.9
const CHAIN_COOLDOWN_THREAT_RANGE = 260
const CHAIN_COOLDOWN_RETREAT_DISTANCE = 170

export function createChainDecisions({ state }) {
  function isChain(player) {
    return player.pompfe === 'chain'
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

  function chainCooldownThreat(chainPlayer) {
    if (!isChain(chainPlayer) || chainPlayer.attackCooldown <= 0) return null

    return state.players
      .filter((enemy) => enemy.team !== chainPlayer.team && isPompfer(enemy) && !isInactive(enemy))
      .map((enemy) => {
        const d = distance(chainPlayer, enemy)
        const towardChain = normalize(chainPlayer.x - enemy.x, chainPlayer.y - enemy.y)
        const closingSpeed = enemy.vx * towardChain.x + enemy.vy * towardChain.y
        return { enemy, distance: d, closingSpeed }
      })
      .filter(({ distance: d, closingSpeed }) => d < CHAIN_COOLDOWN_THREAT_RANGE && closingSpeed > 24)
      .sort((a, b) => a.distance - b.distance)[0]?.enemy
  }

  function chainRetreatPoint(chainPlayer, threat) {
    const away = normalize(chainPlayer.x - threat.x, chainPlayer.y - threat.y)
    const ownMal = TEAMS[chainPlayer.team].mal
    const towardOwnSide = normalize(ownMal.x - chainPlayer.x, ownMal.y - chainPlayer.y)
    const laneBias = playerPositionSlot(chainPlayer) <= 2 ? { x: 0, y: -0.25 } : { x: 0, y: 0.25 }
    const fallback = chainPlayer.team === 'blue' ? { x: -1, y: laneBias.y } : { x: 1, y: laneBias.y }
    const retreat = normalize(away.x * 1.25 + towardOwnSide.x * 0.55 + laneBias.x, away.y * 1.25 + towardOwnSide.y * 0.55 + laneBias.y)

    return {
      x: chainPlayer.x + (retreat.x || fallback.x) * CHAIN_COOLDOWN_RETREAT_DISTANCE,
      y: chainPlayer.y + (retreat.y || fallback.y) * CHAIN_COOLDOWN_RETREAT_DISTANCE,
    }
  }

  return {
    chainCooldownThreat,
    chainGuardPoint,
    chainRetreatPoint,
    isChain,
  }
}
