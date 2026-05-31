import {
  PLAYER_POSITIONS,
  PLAYER_SKILLS,
  TEAM_LOADOUTS,
  TEAM_STRATEGIES,
} from './teamDefaults.js'
import { SKILL_POINTS_PER_PLAYER } from './matchRules.js'

export const TEAMS_LIST = ['blue', 'red']
export const SKILL_KEYS = ['technik', 'geschwindigkeit', 'wahrnehmung']
export const POSITION_SLOTS = [1, 2, 3, 4]
export const POMPFEN_OPTIONS = ['shield', 'longpompfe', 'staff', 'qtip', 'chain']
export const TEAM_STRATEGY_IDS = ['standard', 'wide_line', 'top_defense', 'bottom_defense']

export function createDefaultTeamConfig(team) {
  return {
    team,
    version: 0,
    skills: defaultSkillsForTeam(team).map((skill) => ({ ...skill })),
    positions: [...(PLAYER_POSITIONS[team] ?? [0, ...POSITION_SLOTS])],
    loadout: [...(TEAM_LOADOUTS[team] ?? ['quick', 'shield', 'qtip', 'staff', 'chain'])],
    teamStrategy: normalizeTeamStrategyId(TEAM_STRATEGIES[team]),
  }
}

export function normalizeTeamConfig(config = {}, fallback = createDefaultTeamConfig(config?.team ?? 'blue'), { allowSkills = true, allowLoadout = true } = {}) {
  return {
    team: fallback.team,
    version: Number.isFinite(Number(config.version)) ? Number(config.version) : fallback.version,
    skills: allowSkills
      ? Array.from({ length: 5 }, (_, index) => normalizeSkillConfig(config.skills?.[index], fallback.skills[index]))
      : fallback.skills.map((skill) => ({ ...skill })),
    positions: normalizePositionConfig(fallback.team, config.positions ?? fallback.positions),
    loadout: allowLoadout ? normalizeLoadoutConfig(fallback.team, config.loadout ?? fallback.loadout) : [...fallback.loadout],
    teamStrategy: normalizeTeamStrategyId(config.teamStrategy, fallback.teamStrategy),
  }
}

export function cloneTeamConfig(config) {
  return {
    ...config,
    skills: config.skills.map((skill) => ({ ...skill })),
    positions: [...config.positions],
    loadout: [...config.loadout],
  }
}

export function normalizeSkillConfig(skill, fallbackSkill) {
  const fallback = fallbackSkill ?? defaultSkillsForTeam('blue')[0]
  const normalized = Object.fromEntries(
    SKILL_KEYS.map((key) => {
      const value = Number(skill?.[key])
      return [key, Number.isInteger(value) && value >= 0 ? value : fallback[key]]
    }),
  )
  const spent = SKILL_KEYS.reduce((sum, key) => sum + normalized[key], 0)
  return spent === SKILL_POINTS_PER_PLAYER ? normalized : { ...fallback }
}

export function normalizePositionConfig(team, source = PLAYER_POSITIONS[team]) {
  const fallback = PLAYER_POSITIONS[team] ?? [0, ...POSITION_SLOTS]
  const used = new Set([0])
  const next = [0]
  for (let index = 1; index < 5; index += 1) {
    const raw = Number(source?.[index])
    const fallbackSlot = Number(fallback[index])
    let slot = Number.isInteger(raw) && POSITION_SLOTS.includes(raw) && !used.has(raw) ? raw : null
    if (slot === null && Number.isInteger(fallbackSlot) && POSITION_SLOTS.includes(fallbackSlot) && !used.has(fallbackSlot)) {
      slot = fallbackSlot
    }
    if (slot === null) slot = POSITION_SLOTS.find((candidate) => !used.has(candidate)) ?? index
    next[index] = slot
    used.add(slot)
  }
  return next
}

export function normalizeLoadoutConfig(team, source = TEAM_LOADOUTS[team]) {
  const fallback = TEAM_LOADOUTS[team] ?? ['quick', 'shield', 'qtip', 'staff', 'chain']
  const next = ['quick']
  let chainUsed = false
  for (let index = 1; index < 5; index += 1) {
    const fallbackPompfe = POMPFEN_OPTIONS.includes(fallback[index]) ? fallback[index] : 'staff'
    let pompfe = POMPFEN_OPTIONS.includes(source?.[index]) ? source[index] : fallbackPompfe
    if (pompfe === 'chain') {
      if (chainUsed) pompfe = fallbackPompfe === 'chain' ? 'staff' : fallbackPompfe
      chainUsed = true
    }
    next[index] = pompfe
  }
  return next
}

export function normalizeTeamStrategyId(strategy, fallback = 'standard') {
  return TEAM_STRATEGY_IDS.includes(strategy) ? strategy : fallback
}

function defaultSkillsForTeam(team) {
  return PLAYER_SKILLS[team] ?? PLAYER_SKILLS.blue
}
