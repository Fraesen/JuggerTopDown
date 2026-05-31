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
  1: 'Oben außen',
  2: 'Oben innen',
  3: 'Unten innen',
  4: 'Unten außen',
}
