import assert from 'node:assert/strict'
import {
  createDefaultTeamConfig,
  normalizeLoadoutConfig,
  normalizePositionConfig,
  normalizeSkillConfig,
  normalizeTeamConfig,
} from '../../src/game/rules/teamSchema.js'

const fallback = createDefaultTeamConfig('blue')

assert.deepEqual(
  normalizeSkillConfig({ technik: 12, geschwindigkeit: 0, wahrnehmung: 0 }, fallback.skills[0]),
  { technik: 12, geschwindigkeit: 0, wahrnehmung: 0 },
  'valid skill spreads are preserved',
)

assert.deepEqual(
  normalizeSkillConfig({ technik: 2, geschwindigkeit: 2, wahrnehmung: 2 }, fallback.skills[0]),
  fallback.skills[0],
  'legacy six-point skill totals fall back',
)

assert.deepEqual(
  normalizeSkillConfig({ technik: 6, geschwindigkeit: 6, wahrnehmung: 6 }, fallback.skills[0]),
  fallback.skills[0],
  'invalid skill totals fall back',
)

assert.deepEqual(
  normalizePositionConfig('blue', [0, 4, 4, 2, 99]),
  [0, 4, 2, 3, 1],
  'positions are normalized to a unique slot permutation',
)

assert.deepEqual(
  normalizeLoadoutConfig('blue', ['quick', 'chain', 'chain', 'bogus', 'shield']),
  ['quick', 'chain', 'qtip', 'staff', 'shield'],
  'loadouts allow at most one chain and fall back slot-wise',
)

assert.deepEqual(
  normalizeTeamConfig(
    {
      team: 'blue',
      version: 7,
      skills: [{ technik: 12, geschwindigkeit: 0, wahrnehmung: 0 }],
      loadout: ['quick', 'staff', 'staff', 'staff', 'staff'],
      teamStrategy: 'wide_line',
    },
    fallback,
    { allowSkills: false, allowLoadout: false },
  ),
  {
    ...fallback,
    version: 7,
    positions: [0, 1, 2, 3, 4],
    teamStrategy: 'wide_line',
  },
  'locked skill and loadout sections keep their fallback values',
)

console.log('team-config tests passed')
