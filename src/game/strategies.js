import { FIELD, PLAYER_POSITIONS, PLAYER_STRATEGIES, TEAM_STRATEGIES, fieldPoint } from './config.js'
import { t } from '../i18n/index.js'

export const TEAM_STRATEGY_OPTIONS = [
  { id: 'standard', labelKey: 'strategy.standard' },
  { id: 'wide_line', labelKey: 'strategy.wideLine' },
  { id: 'top_defense', labelKey: 'strategy.topDefense' },
  { id: 'bottom_defense', labelKey: 'strategy.bottomDefense' },
]

export const PLAYER_STRATEGY_OPTIONS = [
  { id: 'none', labelKey: 'strategy.none' },
  { id: 'flank', labelKey: 'strategy.flank' },
]

export const RUNNER_STRATEGY_OPTIONS = [
  { id: 'wide_middle', labelKey: 'strategy.wideMiddle' },
  { id: 'direct_jugg', labelKey: 'strategy.directJugg' },
]

export function playerTechniqueOptionsForIndex(index) {
  return index === 0 ? RUNNER_STRATEGY_OPTIONS : PLAYER_STRATEGY_OPTIONS
}

export const DEFENSIVE_HIT_MODIFIER = 0.15
export const AGGRESSIVE_DOUBLE_WINDOW_FACTOR = 0.25
export const FLANK_DURATION = 6
export const FLANK_TRIGGER_ROUND_TIME = 14

export function teamStrategy(team) {
  return TEAM_STRATEGIES[team] ?? 'standard'
}

export function playerStrategy(player) {
  const index = Number(player.id.split('-')[1])
  const strategy = player.strategy ?? PLAYER_STRATEGIES[player.team]?.[index]
  const options = player.role === 'runner' ? RUNNER_STRATEGY_OPTIONS : PLAYER_STRATEGY_OPTIONS
  return options.some((option) => option.id === strategy) ? strategy : options[0].id
}

export function teamStrategyLabel(strategy) {
  const option = TEAM_STRATEGY_OPTIONS.find((candidate) => candidate.id === strategy)
  return option ? t(option.labelKey) : strategy
}

export function normalizeTeamStrategy(strategy) {
  return TEAM_STRATEGY_OPTIONS.some((option) => option.id === strategy) ? strategy : 'standard'
}

export function playerStrategyLabel(strategy) {
  const option =
    RUNNER_STRATEGY_OPTIONS.find((candidate) => candidate.id === strategy) ??
    PLAYER_STRATEGY_OPTIONS.find((candidate) => candidate.id === strategy)
  return option ? t(option.labelKey) : strategy
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
  if (player.role === 'runner') return null

  const slot = slotForPlayer(player)
  const strategy = teamStrategy(player.team)

  if (strategy === 'wide_line') {
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
