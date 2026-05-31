import { createInitialState } from '../src/game/state.js'
import { createSimulation } from '../src/game/simulation.js'

const seeds = ['jugger-match-1', 'chain-pressure-seed', 'pvp-loadout-seed']
const steps = 60 * 35
const dt = 1 / 60

for (const seed of seeds) {
  const first = run(seed)
  const second = run(seed)
  assertEqual(first, second, `Seed ${seed} ist nicht deterministisch.`)
}

const baseline = run(seeds[0])
const changed = run('different-seed')
if (JSON.stringify(baseline) === JSON.stringify(changed)) {
  throw new Error('Unterschiedliche Seeds erzeugen denselben Snapshot. Seed-Pfad pruefen.')
}

console.log(`deterministic-check passed (${seeds.length} seeds, ${steps} steps each)`)

function run(seed) {
  const state = createInitialState(seed)
  state.app.mode = 'bot'
  const simulation = createSimulation({
    state,
    hud: createHudStub(),
    updateHud: () => {},
    updatePlayerTooltip: () => {},
    headless: true,
  })
  simulation.resetMatch()
  simulation.startMatch()
  for (let index = 0; index < steps; index += 1) {
    simulation.update(dt)
    if (String(state.message).includes(':')) {
      throw new Error(`Simulation meldet Fehlerzustand: ${state.message}`)
    }
  }
  return compactSnapshot(state)
}

function compactSnapshot(state) {
  return {
    seed: state.matchSeed,
    running: state.running,
    timeLeft: round(state.timeLeft),
    roundTime: round(state.roundTime),
    stoneCount: state.stoneCount,
    score: { ...state.score },
    jugg: {
      x: round(state.jugg.x),
      y: round(state.jugg.y),
      quick: state.jugg.quick?.id ?? null,
      contest: state.jugg.contest?.quicks.map((quick) => quick.id).sort() ?? null,
    },
    players: state.players.map((player) => ({
      id: player.id,
      x: round(player.x),
      y: round(player.y),
      angle: round(player.angle),
      vx: round(player.vx),
      vy: round(player.vy),
      penaltyStones: player.penaltyStones,
      pinnedBy: player.pinnedBy?.id ?? null,
      pinTarget: player.pinTarget?.id ?? null,
      grappleTarget: player.grappleTarget?.id ?? null,
      grappledBy: player.grappledBy?.id ?? null,
      callType: player.callType,
      pompfe: player.pompfe,
    })),
  }
}

function createHudStub() {
  const element = () => ({
    textContent: '',
    value: '',
    hidden: false,
    innerHTML: '',
    disabled: false,
    classList: { toggle: () => {} },
    setAttribute: () => {},
  })
  return {
    blueScore: element(),
    redScore: element(),
    clock: element(),
    matchState: element(),
    possession: element(),
    pins: element(),
    inactive: element(),
    stone: element(),
    miniMap: element(),
    skillList: element(),
    opponentSkillPanel: element(),
    opponentSkillList: element(),
    opponentTeamLabel: element(),
    localSkillPanel: element(),
    skillPanelTitle: element(),
    playerTooltip: element(),
    startBtn: element(),
    pauseBtn: element(),
    resetBtn: element(),
    seedInput: element(),
    speedButtons: [],
    cinemaToggle: element(),
    seedControl: element(),
    speedControl: element(),
    cinemaControl: element(),
  }
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000
}

function assertEqual(left, right, message) {
  const a = JSON.stringify(left)
  const b = JSON.stringify(right)
  if (a !== b) {
    throw new Error(`${message}\nA: ${a}\nB: ${b}`)
  }
}
