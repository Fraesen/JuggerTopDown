import { FIELD, PLAYER_RADIUS, fieldPoint } from '../config.js'
import { clamp, distance } from '../geometry.js'
import { isInactive, isRunner, playerPositionSlot } from '../players.js'
import { attackRangeFor } from '../pompfen.js'

const FLANK_CURVE_REACHED_DISTANCE = 38

export function createFlankDecisions({ state, distanceToSegment }) {
  function flankStrategyTarget(player) {
    const flanks = state.players
      .filter((enemy) => enemy.team !== player.team && !isInactive(enemy))
      .map((enemy) => {
        const range = attackRangeFor(player, enemy) * 0.72
        const point = {
          x: clamp(enemy.x - Math.cos(enemy.angle) * range, fieldPoint(1, 10).x, fieldPoint(FIELD.lengthMeters - 1, 10).x),
          y: clamp(enemy.y - Math.sin(enemy.angle) * range, fieldPoint(20, 1.2).y, fieldPoint(20, FIELD.widthMeters - 1.2).y),
        }
        return { enemy, point, score: distance(player, point) - (isRunner(enemy) ? 20 : 0) }
      })
      .sort((a, b) => a.score - b.score)
    const flank = flanks[0]
    const laneOffset = playerPositionSlot(player) <= 2 ? -54 : 54
    const fallback = fieldPoint(player.team === 'blue' ? 30 : 10, playerPositionSlot(player) <= 2 ? 5.4 : 14.6)

    if (!flank) return { point: fallback, enemy: null }

    const side = playerPositionSlot(player) <= 2 ? 'top' : 'bottom'
    const sideY = side === 'top' ? fieldPoint(20, 1.6).y : fieldPoint(20, FIELD.widthMeters - 1.6).y
    const entry = {
      x: player.x + (flank.point.x - player.x) * 0.42,
      y: sideY,
    }
    const curvePoint = Math.abs(player.y - sideY) > FLANK_CURVE_REACHED_DISTANCE ? entry : flank.point

    return {
      point:
        Math.abs(curvePoint.y - flank.enemy.y) < 1
          ? { x: curvePoint.x, y: clamp(curvePoint.y + laneOffset * 0.15, fieldPoint(20, 1.2).y, fieldPoint(20, FIELD.widthMeters - 1.2).y) }
          : curvePoint,
      enemy: flank.enemy,
    }
  }

  function flankPathBlocker(player, flankPoint) {
    return state.players
      .filter((enemy) => enemy.team !== player.team && !isInactive(enemy))
      .map((enemy) => ({
        enemy,
        pathDistance: distanceToSegment(enemy, player, flankPoint),
        playerDistance: distance(player, enemy),
      }))
      .filter(({ enemy, pathDistance }) => pathDistance <= Math.max(PLAYER_RADIUS * 1.8, attackRangeFor(player, enemy) * 0.72))
      .sort((a, b) => a.playerDistance - b.playerDistance)[0]?.enemy
  }

  return {
    flankPathBlocker,
    flankStrategyTarget,
  }
}
