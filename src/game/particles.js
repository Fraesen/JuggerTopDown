export function createParticleSystem({ state, rng }) {
  function burst(x, y, color, amount) {
    for (let i = 0; i < amount; i += 1) {
      const angle = rng.range(0, Math.PI * 2)
      const speed = rng.range(80, 240)
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rng.range(0.35, 0.7),
        maxLife: 0.7,
        color,
      })
    }
  }

  function updateParticles(dt) {
    for (const particle of state.particles) {
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.vx *= 0.94
      particle.vy *= 0.94
      particle.life -= dt
    }
    state.particles = state.particles.filter((particle) => particle.life > 0)
  }

  return {
    burst,
    updateParticles,
  }
}
