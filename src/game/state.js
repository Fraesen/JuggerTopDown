import { FIELD, MATCH_SECONDS, STONE_SECONDS } from './config.js'
import { createSeededRng } from './rng.js'

export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2]
export const CAMERA_MIN_ZOOM = 1
export const CAMERA_MAX_ZOOM = 4
export const CAMERA_ZOOM_STEP = 1.18
export const ROUND_BREAK_STONES = 20
export const ROUND_BREAK_LOCK_STONES = 3
export const ROUND_BREAK_SECONDS = ROUND_BREAK_STONES * STONE_SECONDS
export const SIMULATION_STEP_SECONDS = 1 / 60
export const DEFAULT_MATCH_SEED = 'jugger-match-1'

export function createInitialState(seed = DEFAULT_MATCH_SEED) {
  return {
    running: false,
    paused: false,
    lastTime: 0,
    frameAccumulator: 0,
    app: {
      mode: 'menu',
    },
    matchSeed: String(seed),
    rng: createSeededRng(seed),
    playbackSpeed: 1,
    timeLeft: MATCH_SECONDS,
    score: { blue: 0, red: 0 },
    players: [],
    particles: [],
    message: 'Bereit',
    messageTimer: 0,
    roundBreakTimer: 0,
    roundBreakLabel: '',
    roundBreakLocked: false,
    roundBreakPrecomputed: false,
    roundSetupOpen: false,
    nextTeamStrategies: { blue: 'standard', red: 'standard' },
    roundTime: 0,
    stoneTimer: 0,
    stoneCount: 0,
    teamCallCooldowns: { blue: 0, red: 0 },
    pvp: {
      playerName: '',
      modal: null,
      roomCode: '',
      connected: false,
      connectionStatus: 'idle',
      statusText: '',
      error: '',
      publicRooms: [],
      createPublic: false,
      role: null,
      playerId: null,
      localTeam: 'blue',
      opponentTeam: 'red',
      players: [],
      setupEndsAt: null,
      setupRemaining: 0,
      setupSkillSaved: false,
      serverTimeOffset: 0,
      roundId: 1,
      nextRoundId: 1,
      roundBreakEndsAt: null,
      lastServerSeq: 0,
      teamVersions: { blue: 0, red: 0 },
    },
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    cinema: {
      enabled: false,
      activeScene: null,
      cooldown: 0,
      queue: [],
      manualCamera: null,
      playbackSpeed: 1,
      snapshots: [],
      events: [],
      hitStreaks: {},
      sceneCounter: 0,
      sceneBlockAfter: null,
    },
    hover: {
      active: false,
      x: 0,
      y: 0,
      clientX: 0,
      clientY: 0,
      player: null,
    },
    jugg: {
      x: FIELD.width / 2,
      y: FIELD.height / 2,
      vx: 0,
      vy: 0,
      carrier: null,
      contest: null,
      cooldown: 0,
    },
  }
}
