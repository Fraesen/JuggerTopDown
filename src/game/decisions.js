import { createDecisionEngine as createDecisionEngineCore } from './decisions/engine.js'

/**
 * Public decision-engine entry point used by the simulation.
 *
 * The implementation is intentionally split into smaller modules under
 * `game/decisions/`, while this file keeps the stable factory name and
 * documents the boundary for callers.
 */
export function createDecisionEngine({ state, attack, rng = state.rng }) {
  return createDecisionEngineCore({ state, attack, rng })
}
