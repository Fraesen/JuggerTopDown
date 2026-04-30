export const FIELD = {
  width: 1280,
  height: 640,
  lengthMeters: 40,
  widthMeters: 20,
  groundLineMeters: 10,
  malDistanceMeters: 2,
  scale: 30,
  originX: 40,
  originY: 20,
  malRadius: 16,
}

FIELD.center = { x: FIELD.width / 2, y: FIELD.height / 2 }

export function fieldPoint(meterX, meterY) {
  return {
    x: FIELD.originX + meterX * FIELD.scale,
    y: FIELD.originY + meterY * FIELD.scale,
  }
}

export const TEAMS = {
  blue: {
    name: 'Blau',
    color: '#21a8a3',
    dark: '#116d76',
    spawnX: fieldPoint(-0.65, 10).x,
    mal: fieldPoint(2, 10),
    attackMal: fieldPoint(38, 10),
  },
  red: {
    name: 'Rot',
    color: '#dd614a',
    dark: '#8f382c',
    spawnX: fieldPoint(40.65, 10).x,
    mal: fieldPoint(38, 10),
    attackMal: fieldPoint(2, 10),
  },
}

export const FIELD_POLYGON = [
  fieldPoint(0, 5),
  fieldPoint(5, 0),
  fieldPoint(35, 0),
  fieldPoint(40, 5),
  fieldPoint(40, 15),
  fieldPoint(35, 20),
  fieldPoint(5, 20),
  fieldPoint(0, 15),
]

export const START_POSITIONS = {
  blue: [
    fieldPoint(-0.65, 10.0),
    fieldPoint(-0.65, 6.0),
    fieldPoint(-0.65, 8.0),
    fieldPoint(-0.65, 12.0),
    fieldPoint(-0.65, 14.0),
  ],
  red: [
    fieldPoint(40.65, 10.0),
    fieldPoint(40.65, 6.0),
    fieldPoint(40.65, 8.0),
    fieldPoint(40.65, 12.0),
    fieldPoint(40.65, 14.0),
  ],
}

export const POSITION_LABELS = {
  1: 'Oben aussen',
  2: 'Oben innen',
  3: 'Unten innen',
  4: 'Unten aussen',
}

export const PLAYER_POSITIONS = {
  blue: [0, 1, 2, 3, 4],
  red: [0, 1, 2, 3, 4],
}

export const PLAYER_RADIUS = 17
export const JUGG_RADIUS = 11
export const MATCH_SECONDS = 180
export const MATCH_POINT = 3
export const STONE_SECONDS = 1.5
export const HIT_STONES = 5
export const RECOVERY_DASH_DURATION = 0.24
export const RECOVERY_DASH_SPEED = 315
export const PIN_RANGE = 64
export const PIN_MIN_COUNTED_STONES = 3
export const PIN_ORBIT_MIN_RADIUS = 38
export const PIN_ORBIT_MAX_RADIUS = 60
export const PIN_ORBIT_SPEED_FACTOR = 0.36
export const ATTACK_DURATION = 0.1
export const DOUBLE_HIT_WINDOW = 0.3
export const ATTACK_COOLDOWN = 0.72
export const RUNNING_ATTACK_SPEED_THRESHOLD = 12
export const OPENING_RUSH_SECONDS = 2.8
export const OPENING_FAN_REACHED_RADIUS = 30
export const CARRIER_PRESSURE_COUNT = 2
export const RUNNER_DUEL_RANGE = 48
export const RUNNER_DUEL_COOLDOWN = 0.8
export const RUNNER_JUGG_CONTEST_COOLDOWN = 0.46
export const RUNNER_JUGG_CONTEST_PRESSURE_RANGE = 140
export const RUNNER_GRAPPLE_RANGE = 42
export const RUNNER_GRAPPLE_BREAK_RANGE = 68
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

export const PLAYER_SKILLS = {
  blue: [
    { technik: 2, geschwindigkeit: 2, wahrnehmung: 2 },
    { technik: 2, geschwindigkeit: 3, wahrnehmung: 1 },
    { technik: 4, geschwindigkeit: 1, wahrnehmung: 1 },
    { technik: 2, geschwindigkeit: 2, wahrnehmung: 2 },
    { technik: 3, geschwindigkeit: 2, wahrnehmung: 1 },
  ],
  red: [
    { technik: 2, geschwindigkeit: 2, wahrnehmung: 2 },
    { technik: 2, geschwindigkeit: 3, wahrnehmung: 1 },
    { technik: 4, geschwindigkeit: 1, wahrnehmung: 1 },
    { technik: 2, geschwindigkeit: 2, wahrnehmung: 2 },
    { technik: 3, geschwindigkeit: 2, wahrnehmung: 1 },
  ],
}

export const TEAM_LOADOUTS = {
  blue: ['runner', 'shield', 'qtip', 'staff', 'chain'],
  red: ['runner', 'shield', 'qtip', 'staff', 'chain'],
}

export const TEAM_STRATEGIES = {
  blue: 'standard',
  red: 'standard',
}

export const PLAYER_STRATEGIES = {
  blue: ['none', 'none', 'none', 'none', 'none'],
  red: ['none', 'none', 'none', 'none', 'none'],
}
