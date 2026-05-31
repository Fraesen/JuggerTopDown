import assert from 'node:assert/strict'
import { createMovementSystem } from '../../src/game/simulation/movement.js'

const movement = createMovementSystem({
  state: { players: [], jugg: { contest: null } },
  startRecoveryDash: () => {},
  chainBandSegment: () => ({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }),
  CHAIN_BAND_END_CLEARANCE: 0.84,
  CHAIN_BLOCKER_PADDING: 8,
})

const horizontalHit = movement.distanceToSegmentWithT(
  { x: 5, y: 3 },
  { x: 0, y: 0 },
  { x: 10, y: 0 },
)

assert.equal(horizontalHit.distance, 3)
assert.equal(horizontalHit.t, 0.5)

const clampedHit = movement.distanceToSegmentWithT(
  { x: 16, y: 4 },
  { x: 0, y: 0 },
  { x: 10, y: 0 },
)

assert.equal(clampedHit.distance, Math.hypot(6, 4))
assert.equal(clampedHit.t, 1)

console.log('movement tests passed')
