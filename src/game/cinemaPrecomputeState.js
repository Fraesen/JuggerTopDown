import { createInitialState } from './state.js'
import { createSeededRng } from './rng.js'

const PLAYER_REF_KEYS = [
  'attackTarget',
  'chainStrikeTarget',
  'grappleTarget',
  'grappledBy',
  'callSource',
  'pinnedBy',
  'pinTarget',
  'pinClaimedBy',
  'doublePinTrapTarget',
  'doublePinReleaseTarget',
]

export function cloneStateForCinemaPrecompute({ state, rng }) {
  const fork = createInitialState(state.matchSeed)
  const rngSnapshot = rng.snapshot()
  fork.rng = createSeededRng(rngSnapshot.seed, rngSnapshot.state)
  fork.matchSeed = state.matchSeed
  fork.running = true
  fork.paused = false
  fork.playbackSpeed = state.playbackSpeed
  fork.timeLeft = state.timeLeft
  fork.score = { ...state.score }
  fork.message = state.message
  fork.messageTimer = state.messageTimer
  fork.roundBreakTimer = 0
  fork.roundBreakLabel = ''
  fork.nextTeamStrategies = { ...state.nextTeamStrategies }
  fork.roundTime = state.roundBreakTimer > 0 ? 0 : state.roundTime
  fork.stoneTimer = state.roundBreakTimer > 0 ? 0 : state.stoneTimer
  fork.stoneCount = state.stoneCount
  fork.teamCallCooldowns = { ...state.teamCallCooldowns }
  fork.camera = { ...state.camera }
  fork.particles = []
  fork.hover = { active: false, x: 0, y: 0, clientX: 0, clientY: 0, player: null }

  const playerPairs = state.players.map((player) => [player, clonePlayerForPrecompute(player)])
  const playerMap = new Map(playerPairs.map(([, clone]) => [clone.id, clone]))
  fork.players = playerPairs.map(([, clone]) => clone)
  for (const [source, clone] of playerPairs) relinkPlayerRefs(source, clone, playerMap)

  fork.jugg = {
    ...state.jugg,
    carrier: state.jugg.carrier ? playerMap.get(state.jugg.carrier.id) ?? null : null,
    contest: state.jugg.contest
      ? {
          ...state.jugg.contest,
          runners: state.jugg.contest.runners.map((runner) => playerMap.get(runner.id)).filter(Boolean),
        }
      : null,
  }
  fork.cinema.enabled = true
  return fork
}

export function createHeadlessHud() {
  return {
    blueScore: { textContent: '' },
    redScore: { textContent: '' },
    clock: { textContent: '' },
    matchState: { textContent: '' },
    possession: { textContent: '' },
    pins: { textContent: '' },
    inactive: { textContent: '' },
    stone: { textContent: '' },
    miniMap: { innerHTML: '' },
    skillList: { innerHTML: '' },
    playerTooltip: { hidden: true },
    startBtn: { textContent: '' },
    pauseBtn: { textContent: '' },
    resetBtn: { textContent: '' },
    seedInput: { value: '' },
    speedButtons: [],
  }
}

function clonePlayerForPrecompute(player) {
  const clone = { ...player }
  for (const key of PLAYER_REF_KEYS) {
    clone[key] = null
  }
  clone.callContext = cloneCallContext(player.callContext)
  return clone
}

function relinkPlayerRefs(source, clone, playerMap) {
  for (const key of PLAYER_REF_KEYS) {
    clone[key] = source[key]?.id ? playerMap.get(source[key].id) ?? null : null
  }
  clone.callContext = relinkCallContext(source.callContext, playerMap)
}

function cloneCallContext(context) {
  if (!context) return null
  const clone = { ...context }
  for (const key of ['target', 'ally', 'carrier']) {
    if (clone[key]?.id) clone[key] = { id: clone[key].id }
  }
  return clone
}

function relinkCallContext(context, playerMap) {
  if (!context) return null
  const clone = { ...context }
  for (const key of ['target', 'ally', 'carrier']) {
    if (context[key]?.id) clone[key] = playerMap.get(context[key].id) ?? null
  }
  return clone
}
