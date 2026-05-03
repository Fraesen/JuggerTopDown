const DEFAULT_SEED = 'jluiolj734234'

export function hashSeed(seed = DEFAULT_SEED) {
  const text = String(seed)
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function createSeededRng(seed = DEFAULT_SEED, state = null) {
  const rng = {
    seed: String(seed),
    state: state ?? hashSeed(seed),
    nextUint() {
      rng.state = (rng.state + 0x6d2b79f5) >>> 0
      let t = rng.state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return (t ^ (t >>> 14)) >>> 0
    },
    next() {
      return rng.nextUint() / 4294967296
    },
    chance(probability) {
      return rng.next() <= probability
    },
    range(min, max) {
      return min + rng.next() * (max - min)
    },
    fork(label) {
      return createSeededRng(`${rng.seed}:${label}`, hashSeed(`${rng.state}:${label}`))
    },
    snapshot() {
      return { seed: rng.seed, state: rng.state >>> 0 }
    },
  }

  return rng
}
