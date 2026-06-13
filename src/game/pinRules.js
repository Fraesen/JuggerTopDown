import { FIELD } from './config.js'
import { distance } from './geometry.js'
import { isQuick } from './players.js'

const QUICK_PIN_FREE_JUGG_RANGE_METERS = 5

function isJuggFree(state) {
  return !state.jugg.quick && !state.jugg.contest
}

function isPointInOwnThird(team, point) {
  const leftThird = FIELD.originX + (FIELD.lengthMeters * FIELD.scale) / 3
  const rightThird = FIELD.originX + (FIELD.lengthMeters * FIELD.scale * 2) / 3
  return team === 'blue' ? point.x <= leftThird : point.x >= rightThird
}

export function canPinTargetForJuggState(pinner, target, state) {
  if (!isQuick(target)) return true
  if (!isJuggFree(state)) return false

  const juggRange = QUICK_PIN_FREE_JUGG_RANGE_METERS * FIELD.scale
  return distance(target, state.jugg) <= juggRange || isPointInOwnThird(pinner.team, state.jugg)
}
