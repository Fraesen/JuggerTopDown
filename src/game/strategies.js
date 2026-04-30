import { FIELD, PLAYER_POSITIONS, PLAYER_STRATEGIES, TEAM_STRATEGIES, fieldPoint } from './config.js'

export const TEAM_STRATEGY_OPTIONS = [
  { id: 'standard', label: 'Standard' },
  { id: 'wide_line', label: 'Breite Linie' },
  { id: 'top_defense', label: 'Rechts Druck' },
  { id: 'bottom_defense', label: 'Links Druck' },
]

export const PLAYER_STRATEGY_OPTIONS = [
  { id: 'none', label: 'Keine' },
  { id: 'flank', label: 'Umlaufen' },
]

export const DEFENSIVE_HIT_MODIFIER = 0.15
export const AGGRESSIVE_DOUBLE_WINDOW_FACTOR = 0.25
export const FLANK_DURATION = 6
export const FLANK_TRIGGER_ROUND_TIME = 14

export function teamStrategy(team) {
  return TEAM_STRATEGIES[team] ?? 'standard'
}

export function playerStrategy(player) {
  const index = Number(player.id.split('-')[1])
  return player.strategy ?? PLAYER_STRATEGIES[player.team]?.[index] ?? 'none'
}

export function teamStrategyLabel(strategy) {
  return TEAM_STRATEGY_OPTIONS.find((option) => option.id === strategy)?.label ?? strategy
}

export function normalizeTeamStrategy(strategy) {
  return TEAM_STRATEGY_OPTIONS.some((option) => option.id === strategy) ? strategy : 'standard'
}

export function playerStrategyLabel(strategy) {
  return PLAYER_STRATEGY_OPTIONS.find((option) => option.id === strategy)?.label ?? strategy
}

export function isWideLineStrategy(team) {
  return teamStrategy(team) === 'wide_line'
}

export function isSideDefenseStrategy(team) {
  const strategy = teamStrategy(team)
  return strategy === 'top_defense' || strategy === 'bottom_defense'
}

export function strategySideForSlot(slot) {
  if (slot === 1 || slot === 2) return 'top'
  if (slot === 3 || slot === 4) return 'bottom'
  return 'middle'
}

export function slotForPlayer(player) {
  if (player.positionSlot !== undefined) return player.positionSlot
  return PLAYER_POSITIONS[player.team]?.[Number(player.id.split('-')[1])] ?? Number(player.id.split('-')[1])
}

export function isDefensiveStrategyPlayer(player) {
  if (player.role === 'runner') return false
  const strategy = teamStrategy(player.team)
  const side = strategySideForSlot(slotForPlayer(player))
  return (strategy === 'top_defense' && side === 'top') || (strategy === 'bottom_defense' && side === 'bottom')
}

export function isAggressiveStrategyPlayer(player) {
  return player.role !== 'runner' && isSideDefenseStrategy(player.team) && !isDefensiveStrategyPlayer(player)
}

export function doubleWindowFactorFor(player) {
  return isAggressiveStrategyPlayer(player) ? AGGRESSIVE_DOUBLE_WINDOW_FACTOR : 1
}

export function openingStrategyPoint(player) {
  const slot = slotForPlayer(player)
  const strategy = teamStrategy(player.team)

  if (strategy === 'wide_line') {
    if (player.role === 'runner') {
      const meterX = player.team === 'blue' ? FIELD.lengthMeters * 0.25 : FIELD.lengthMeters * 0.75
      return fieldPoint(meterX, FIELD.widthMeters * 0.5)
    }
    const lane = [10, 2.3, 6.1, 13.9, 17.7][slot]
    const meterX = player.team === 'blue' ? 16.4 + slot * 0.15 : 23.6 - slot * 0.15
    return fieldPoint(meterX, lane)
  }
  return null
}

export function defensiveHoldPoint(player) {
  const slot = slotForPlayer(player)
  const side = strategySideForSlot(slot)
  const lane = side === 'top' ? (slot === 1 ? 3.1 : 6.6) : slot === 4 ? 16.9 : 13.4
  const meterX = player.team === 'blue' ? 5.8 : FIELD.lengthMeters - 5.8
  return fieldPoint(meterX, lane)
}
