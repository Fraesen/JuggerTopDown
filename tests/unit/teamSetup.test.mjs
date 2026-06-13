import assert from 'node:assert/strict'
import { TEAM_STRATEGIES } from '../../src/game/config.js'
import { createInitialState } from '../../src/game/state.js'
import { createTeamSetupSystem } from '../../src/game/simulation/teamSetup.js'

function createSystem(state) {
  return createTeamSetupSystem({
    state,
    hud: {},
    headless: true,
    updateHud: () => {},
    updatePlayerTooltip: () => {},
    onLocalTeamConfigChanged: () => {},
    getPlayerNames: () => [],
    isRoundBreakLocked: () => false,
    shouldPreviewSetupAtGroundLine: () => false,
  })
}

const savedStrategies = { ...TEAM_STRATEGIES }

try {
  const state = createInitialState()
  const setup = createSystem(state)

  TEAM_STRATEGIES.blue = 'wide_line'
  TEAM_STRATEGIES.red = 'top_defense'
  state.nextTeamStrategies.blue = 'standard'
  state.nextTeamStrategies.red = 'standard'

  setup.resetNextTeamStrategies()

  assert.equal(state.nextTeamStrategies.blue, 'wide_line')
  assert.equal(state.nextTeamStrategies.red, 'top_defense')

  setup.resetNextTeamStrategies({ toDefaults: true })

  assert.equal(state.nextTeamStrategies.blue, 'standard')
  assert.equal(state.nextTeamStrategies.red, 'standard')
} finally {
  TEAM_STRATEGIES.blue = savedStrategies.blue
  TEAM_STRATEGIES.red = savedStrategies.red
}

console.log('team-setup tests passed')
