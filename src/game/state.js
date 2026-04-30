import { FIELD, MATCH_SECONDS } from './config.js'

export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2]
export const CAMERA_MIN_ZOOM = 1
export const CAMERA_MAX_ZOOM = 4
export const CAMERA_ZOOM_STEP = 1.18
export const ROUND_BREAK_SECONDS = 10

export function createInitialState() {
  return {
    running: false,
    paused: false,
    lastTime: 0,
    playbackSpeed: 1,
    timeLeft: MATCH_SECONDS,
    score: { blue: 0, red: 0 },
    players: [],
    particles: [],
    message: 'Bereit',
    messageTimer: 0,
    roundBreakTimer: 0,
    roundBreakLabel: '',
    nextTeamStrategies: { blue: 'standard', red: 'standard' },
    roundTime: 0,
    stoneTimer: 0,
    stoneCount: 0,
    teamCallCooldowns: { blue: 0, red: 0 },
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
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
