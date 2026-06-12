import { FIELD } from './field.js'

export const PLAYER_RADIUS = 17
export const JUGG_RADIUS = 11
export const MOVEMENT_SPEED_FACTOR = 0.6
export const MATCH_SECONDS = 180
export const MATCH_POINT = 3
export const STONE_SECONDS = 1.5

export const HIT_STONES = 5
export const CHAIN_HIT_STONES = 8
export const RECOVERY_DASH_DURATION = 0.24
export const RECOVERY_DASH_SPEED = 315 * MOVEMENT_SPEED_FACTOR

export const PIN_RANGE = 64
export const PIN_MIN_COUNTED_STONES = 3
export const PIN_ORBIT_MIN_RADIUS = 38
export const PIN_ORBIT_MAX_RADIUS = 60
export const PIN_ORBIT_SPEED_FACTOR = 0.36

export const ATTACK_DURATION = 0.1
export const DOUBLE_HIT_WINDOW = 0.3
export const ATTACK_COOLDOWN = 0.66
export const RUNNING_ATTACK_SPEED_THRESHOLD = 12

export const OPENING_RUSH_SECONDS = 2.8
export const OPENING_FAN_REACHED_RADIUS = 8
export const QUICK_PRESSURE_COUNT = 2

export const QUICK_DUEL_RANGE = 48
export const QUICK_DUEL_COOLDOWN = 0.8
export const QUICK_JUGG_CONTEST_COOLDOWN = 0.46
export const QUICK_JUGG_CONTEST_PRESSURE_RANGE = 140
export const QUICK_GRAPPLE_RANGE = 42
export const QUICK_GRAPPLE_BREAK_RANGE = 68

export const SKILL_POINTS_PER_PLAYER = 6
export const TECHNIK_BASE = 30
export const TECHNIK_PER_POINT = 10
export const SPEED_BASE = 40
export const SPEED_PER_POINT = 8
export const WAHRNEHMUNG_BASE = 30
export const WAHRNEHMUNG_PER_POINT = 10

export const CALL_DURATION = 1.8
export const CALL_BUBBLE_DURATION = 1.15
export const CALL_COOLDOWN = 2.2
export const CALL_CORRIDOR_LENGTH = 250
export const CALL_CORRIDOR_WIDTH = 92
export const DOUBLE_PIN_CALL_RANGE = 116
export const DOUBLE_PIN_TRAP_DURATION = STONE_SECONDS * 2.4
export const DOUBLE_PIN_RELEASE_PAUSE = STONE_SECONDS * 0.9

export const MALSCHUTZ_FREE_JUGG_RANGE = 10 * FIELD.scale
