import { FIELD, TEAMS } from './config.js'
import { clamp } from './geometry.js'
import { isInactive } from './players.js'

const SNAPSHOT_WINDOW_SECONDS = 6
const EVENT_WINDOW_SECONDS = 8
const SCENE_IN_SECONDS = 0.5
const SCENE_HOLD_SECONDS = 2
const SCENE_OUT_SECONDS = 0.5
const SCENE_SECONDS = SCENE_IN_SECONDS + SCENE_HOLD_SECONDS + SCENE_OUT_SECONDS
const SCENE_COOLDOWN_SECONDS = 4
const SCENE_QUEUE_HOLD_SECONDS = 0.25
const SCENE_EXPIRE_SECONDS = 2.5
const SCENE_PRE_ROLL_SECONDS = 0.9
const SCENE_POST_ROLL_SECONDS = 1.1
const FULL_CAMERA = { x: 0, y: 0, zoom: 1 }
const SLOW_MOTION_SPEED = 0.35
const MULTI_HIT_STREAK_STONES = 2
const MULTI_HIT_STREAK_MIN_TARGETS = 3
const ALONE_VS_TWO_STONES = 3
const DEFAULT_FOCUS_PADDING = { x: 180, y: 150, minX: 160, minY: 120, minZoom: 2.2, maxZoom: 3 }
const ALONE_VS_TWO_FOCUS_PADDING = { x: 270, y: 210, minX: 230, minY: 170, minZoom: 1.85, maxZoom: 2.45 }
const CHAIN_FOCUS_PADDING = { x: 360, y: 260, minX: 300, minY: 220, minZoom: 1.65, maxZoom: 2.35 }

const PRIORITY = {
  multi_hit_streak: 120,
  alone_vs_two: 100,
  runner_jugg_against_odds: 95,
  runner_attack_miss: 80,
}

export function createCinemaDirector({ state, debug = true }) {
  function ensureCinemaState() {
    if (!state.cinema) {
      state.cinema = {
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
      }
    }
    return state.cinema
  }

  function reset({ preserveEnabled = true } = {}) {
    const cinema = ensureCinemaState()
    const enabled = preserveEnabled ? cinema.enabled : false
    const manualCamera = preserveEnabled ? cinema.manualCamera : null
    state.cinema = {
      enabled,
      activeScene: null,
      cooldown: 0,
      queue: [],
      manualCamera,
      playbackSpeed: 1,
      snapshots: [],
      events: [],
      hitStreaks: {},
      sceneCounter: 0,
      sceneBlockAfter: null,
    }
    if (enabled) setFullCamera()
  }

  function setEnabled(enabled) {
    const cinema = ensureCinemaState()
    if (cinema.enabled === enabled) return
    cinema.enabled = enabled
    cinema.activeScene = null
    cinema.cooldown = 0
    cinema.queue = []
    cinema.playbackSpeed = 1
    cinema.sceneBlockAfter = null

    if (enabled) {
      cinema.manualCamera = { ...state.camera }
      setFullCamera()
    } else if (cinema.manualCamera) {
      state.camera.x = cinema.manualCamera.x
      state.camera.y = cinema.manualCamera.y
      state.camera.zoom = cinema.manualCamera.zoom
    }
  }

  function recordSnapshot() {
    const cinema = ensureCinemaState()
    if (!cinema.enabled) return
    const snapshot = {
      time: state.roundTime,
      stone: state.stoneCount,
      players: state.players.map((player) => ({
        id: player.id,
        team: player.team,
        role: player.role,
        x: player.x,
        y: player.y,
        active: !isInactive(player),
        pinned: Boolean(player.pinnedBy),
      })),
      jugg: {
        x: state.jugg.x,
        y: state.jugg.y,
        carrierId: state.jugg.carrier?.id ?? null,
      },
      score: { ...state.score },
    }
    cinema.snapshots.push(snapshot)
    pruneByTime(cinema.snapshots, state.roundTime - SNAPSHOT_WINDOW_SECONDS)
  }

  function recordEvent(event) {
    const cinema = ensureCinemaState()
    if (!cinema.enabled) return
    const recorded = {
      ...event,
      time: state.roundTime,
      stone: state.stoneCount,
    }
    cinema.events.push(serializableEvent(recorded))
    pruneByTime(cinema.events, state.roundTime - EVENT_WINDOW_SECONDS)
    detectScene(recorded)
  }

  function serializableEvent(event) {
    return JSON.parse(JSON.stringify(event))
  }

  function pruneByTime(items, earliestTime) {
    while (items.length && items[0].time < earliestTime) items.shift()
  }

  function detectScene(event) {
    if (event.type === 'hit' || event.type === 'double') {
      trackHitStreak(event)
      detectMultiHitStreak(event)
      if (event.type === 'hit' && event.clearWin) detectAloneVsTwo(event)
    }

    if ((event.type === 'juggPickup' || event.type === 'score') && event.runnerId && event.teammatesActive <= 0 && event.enemiesActive > 0) {
      enqueueScene(sceneFromEvent('runner_jugg_against_odds', event, {
        title: 'Jugg gegen alle',
        participantIds: [event.runnerId, ...(event.nearbyEnemyIds ?? [])],
        points: [event.runnerPoint, event.juggPoint, event.malPoint, ...(event.enemyPoints ?? [])].filter(Boolean),
      }))
    }

    if (event.type === 'runnerAttackMiss' && event.attackerId && event.runnerId) {
      enqueueScene(sceneFromEvent('runner_attack_miss', event, {
        title: 'Laeufer entkommt',
        participantIds: [event.attackerId, event.runnerId],
        points: [event.attackerPoint, event.runnerPoint, event.juggPoint].filter(Boolean),
      }))
    }
  }

  function trackHitStreak(event) {
    const cinema = ensureCinemaState()
    const streak = cinema.hitStreaks[event.attackerId] ?? []
    streak.push(event)
    cinema.hitStreaks[event.attackerId] = streak.filter((hit) => event.stone - hit.stone <= MULTI_HIT_STREAK_STONES)
  }

  function detectAloneVsTwo(event) {
    const cinema = ensureCinemaState()
    const streak = (cinema.hitStreaks[event.attackerId] ?? []).filter(
      (hit) => hit.type === 'hit' && hit.clearWin && event.stone - hit.stone <= ALONE_VS_TWO_STONES,
    )
    const uniqueVictims = unique(streak.map((hit) => hit.targetId))
    const threatened = streak.some((hit) => (hit.nearbyEnemyIds?.length ?? 0) >= 2)
    if (uniqueVictims.length < 2 || !threatened) return

    enqueueScene(sceneFromEvent('alone_vs_two', event, {
      title: 'Allein gegen zwei',
      startAt: Math.max(0, streak[0].time - SCENE_PRE_ROLL_SECONDS),
      endAt: event.time + SCENE_POST_ROLL_SECONDS,
      participantIds: [event.attackerId, ...uniqueVictims],
      points: [event.attackerPoint, event.targetPoint, ...(event.nearbyEnemyPoints ?? [])].filter(Boolean),
    }))
  }

  function detectMultiHitStreak(event) {
    const cinema = ensureCinemaState()
    const streak = cinema.hitStreaks[event.attackerId] ?? []
    const uniqueVictims = unique(streak.map((hit) => hit.targetId))
    if (uniqueVictims.length < MULTI_HIT_STREAK_MIN_TARGETS) return

    const firstHit = streak[0]
    const sequenceStartAt = Math.max(0, firstHit.time - SCENE_PRE_ROLL_SECONDS)
    const sequenceEndAt = event.time + SCENE_POST_ROLL_SECONDS

    enqueueScene(sceneFromEvent('multi_hit_streak', event, {
      title: 'Multi-Hit',
      startAt: sequenceStartAt,
      endAt: sequenceEndAt,
      participantIds: [event.attackerId, ...uniqueVictims],
      points: streak.flatMap((hit) => [hit.attackerPoint, hit.targetPoint]).filter(Boolean),
    }))
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))]
  }

  function sceneFromEvent(type, event, detail) {
    const cinema = ensureCinemaState()
    cinema.sceneCounter += 1
    const chainSubject = sceneHasChainSubject(detail.participantIds, event)
    const focus = focusForScene(detail)
    const timing = sceneTiming(detail)
    return {
      id: `${type}-${cinema.sceneCounter}`,
      type,
      title: detail.title,
      priority: PRIORITY[type] ?? 50,
      chainSubject,
      createdAt: state.roundTime,
      expiresAt: Math.max(state.roundTime + SCENE_EXPIRE_SECONDS, timing.endAt + SCENE_EXPIRE_SECONDS),
      elapsed: 0,
      inSeconds: timing.inSeconds,
      holdSeconds: timing.holdSeconds,
      outSeconds: timing.outSeconds,
      duration: timing.duration,
      startAt: timing.startAt,
      endAt: timing.endAt,
      startCamera: null,
      targetCamera: cameraForFocus(focus, cameraOptionsForScene({ type, chainSubject })),
      participantIds: detail.participantIds ?? [],
      points: focus.points,
      event,
    }
  }

  function sceneTiming(detail) {
    const inSeconds = detail.inSeconds ?? SCENE_IN_SECONDS
    const outSeconds = detail.outSeconds ?? SCENE_OUT_SECONDS
    const startAt = detail.startAt ?? Math.max(0, state.roundTime - SCENE_PRE_ROLL_SECONDS)
    const endAt = detail.endAt ?? state.roundTime + SCENE_POST_ROLL_SECONDS
    const holdSeconds = detail.holdSeconds ?? Math.max(SCENE_HOLD_SECONDS, endAt - startAt - inSeconds)
    return {
      inSeconds,
      holdSeconds,
      outSeconds,
      startAt,
      endAt,
      duration: inSeconds + holdSeconds + outSeconds,
    }
  }

  function focusForScene(detail) {
    const livePoints = (detail.participantIds ?? [])
      .map((id) => state.players.find((player) => player.id === id))
      .filter(Boolean)
      .map((player) => ({ x: player.x, y: player.y }))
    const points = [...livePoints, ...(detail.points ?? [])].filter(Boolean)
    return { points: points.length ? points : [{ x: FIELD.center.x, y: FIELD.center.y }] }
  }

  function focusForSceneInstance(scene) {
    const livePoints = (scene.participantIds ?? [])
      .map((id) => state.players.find((player) => player.id === id))
      .filter(Boolean)
      .map((player) => ({ x: player.x, y: player.y }))
    const movingContextPoints = []
    if (scene.event?.juggPoint) movingContextPoints.push({ x: state.jugg.x, y: state.jugg.y })
    if (scene.event?.malPoint) movingContextPoints.push(scene.event.malPoint)
    const points = [...livePoints, ...movingContextPoints]
    return { points: points.length ? points : scene.points ?? [{ x: FIELD.center.x, y: FIELD.center.y }] }
  }

  function sceneHasChainSubject(participantIds = [], event = {}) {
    if (event.attackerPompfe === 'chain' || event.targetPompfe === 'chain') return true
    return participantIds.some((id) => state.players.find((player) => player.id === id)?.pompfe === 'chain')
  }

  function cameraForScene(scene) {
    return cameraForFocus(focusForSceneInstance(scene), cameraOptionsForScene(scene))
  }

  function cameraOptionsForScene(scene) {
    return {
      chainSubject: Boolean(scene.chainSubject),
      aloneVsTwo: scene.type === 'alone_vs_two',
    }
  }

  function cameraForFocus(focus, options = {}) {
    const points = focus.points
    const minX = Math.min(...points.map((point) => point.x))
    const maxX = Math.max(...points.map((point) => point.x))
    const minY = Math.min(...points.map((point) => point.y))
    const maxY = Math.max(...points.map((point) => point.y))
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const padding = options.chainSubject ? CHAIN_FOCUS_PADDING : options.aloneVsTwo ? ALONE_VS_TWO_FOCUS_PADDING : DEFAULT_FOCUS_PADDING
    const spanX = Math.max(padding.minX, maxX - minX + padding.x)
    const spanY = Math.max(padding.minY, maxY - minY + padding.y)
    const zoom = clamp(Math.min(FIELD.width / spanX, FIELD.height / spanY), padding.minZoom, padding.maxZoom)
    return cameraAt(centerX, centerY, zoom)
  }

  function cameraAt(centerX, centerY, zoom) {
    const visibleWidth = FIELD.width / zoom
    const visibleHeight = FIELD.height / zoom
    return {
      x: clamp(centerX - visibleWidth / 2, 0, FIELD.width - visibleWidth),
      y: clamp(centerY - visibleHeight / 2, 0, FIELD.height - visibleHeight),
      zoom,
    }
  }

  function enqueueScene(scene) {
    const cinema = ensureCinemaState()
    if (!scene || sceneTouchesBlockedEnd(cinema, scene) || isDuplicateScene(cinema, scene)) {
      return
    }
    cinema.queue.push(scene)
    sortScenes(cinema.queue)
    logCinemaScene('erkannt', scene)
  }

  function isDuplicateScene(cinema, scene) {
    const sameSceneFamily = (candidate) => candidate.type === scene.type && candidate.participantIds[0] === scene.participantIds[0]
    if (cinema.activeScene && sameSceneFamily(cinema.activeScene)) return true
    return cinema.queue.some((candidate) => {
      if (!sameSceneFamily(candidate)) return false
      if (scene.type === 'multi_hit_streak') return Math.abs((candidate.event?.stone ?? 0) - (scene.event?.stone ?? 0)) <= MULTI_HIT_STREAK_STONES
      return candidate.event?.stone === scene.event?.stone
    })
  }

  function sceneTouchesBlockedEnd(cinema, scene) {
    if (canPlayDuringEndPhase(scene)) return false
    return cinema.sceneBlockAfter !== null && (scene.endAt ?? scene.createdAt ?? state.roundTime) > cinema.sceneBlockAfter
  }

  function canPlayDuringEndPhase(scene) {
    return scene?.type === 'runner_jugg_against_odds' && scene.event?.type === 'score' && Boolean(scene.event?.runnerId)
  }

  function sortScenes(scenes) {
    scenes.sort((a, b) => a.startAt - b.startAt || b.priority - a.priority || a.createdAt - b.createdAt)
  }

  function update(realDt) {
    const cinema = ensureCinemaState()
    if (!cinema.enabled || state.paused) {
      cinema.playbackSpeed = 1
      return
    }

    cinema.cooldown = Math.max(0, cinema.cooldown - realDt)
    const endPhaseActive = cinema.sceneBlockAfter !== null && state.roundTime >= cinema.sceneBlockAfter
    cinema.queue = cinema.queue.filter((scene) => scene.expiresAt >= state.roundTime && !sceneTouchesBlockedEnd(cinema, scene))
    if (endPhaseActive) cinema.queue = cinema.queue.filter(canPlayDuringEndPhase)

    if (endPhaseActive && cinema.activeScene && !canPlayDuringEndPhase(cinema.activeScene)) {
      if (cinema.activeScene) logCinemaScene('abgebrochen Endphase', cinema.activeScene)
      cinema.activeScene = null
      cinema.playbackSpeed = 1
      easeCameraToward(FULL_CAMERA, 0.12)
    }

    if (cinema.activeScene) {
      updateActiveScene(cinema, realDt)
      return
    }

    cinema.playbackSpeed = 1
    if (cinema.cooldown <= 0) maybeStartScene(cinema)
    if (!cinema.activeScene) easeCameraToward(FULL_CAMERA, 0.05)
  }

  function maybeStartScene(cinema) {
    if (!cinema.queue.length) return
    const eligible = cinema.queue
      .filter((scene) => scene.startAt <= state.roundTime)
      .sort((a, b) => b.priority - a.priority || a.startAt - b.startAt)

    for (const scene of eligible) {
      if (state.roundTime - scene.startAt < SCENE_QUEUE_HOLD_SECONDS && scene.priority < 95) return
      const wouldBlockHigherPriority = cinema.queue.some(
        (other) =>
          other !== scene &&
          other.priority > scene.priority &&
          other.startAt > state.roundTime &&
          other.startAt <= state.roundTime + scene.duration + SCENE_COOLDOWN_SECONDS,
      )
      if (wouldBlockHigherPriority) continue
      cinema.queue = cinema.queue.filter((candidate) => candidate !== scene)
      startScene(cinema, scene)
      return
    }
  }

  function startScene(cinema, scene) {
    scene.startCamera = { ...state.camera }
    scene.elapsed = Math.max(0, state.roundTime - scene.startAt)
    cinema.activeScene = scene
    logCinemaScene('umgesetzt', scene)
  }

  function updateActiveScene(cinema, realDt) {
    const scene = cinema.activeScene
    const inSeconds = scene.inSeconds ?? SCENE_IN_SECONDS
    const holdSeconds = scene.holdSeconds ?? SCENE_HOLD_SECONDS
    const outSeconds = scene.outSeconds ?? SCENE_OUT_SECONDS
    scene.elapsed += realDt
    scene.targetCamera = cameraForScene(scene)
    cinema.playbackSpeed = scene.elapsed > inSeconds && scene.elapsed < inSeconds + holdSeconds ? SLOW_MOTION_SPEED : 0.65

    if (scene.elapsed <= inSeconds) {
      setCamera(lerpCamera(scene.startCamera, scene.targetCamera, ease(scene.elapsed / inSeconds)))
    } else if (scene.elapsed <= inSeconds + holdSeconds) {
      easeCameraToward(scene.targetCamera, 0.18)
    } else if (scene.elapsed <= scene.duration) {
      const t = (scene.elapsed - inSeconds - holdSeconds) / outSeconds
      setCamera(lerpCamera(scene.targetCamera, FULL_CAMERA, ease(t)))
    } else {
      logCinemaScene('abgeschlossen', scene)
      cinema.activeScene = null
      cinema.cooldown = SCENE_COOLDOWN_SECONDS
      cinema.playbackSpeed = 1
      setFullCamera()
    }
  }

  function easeCameraToward(target, amount) {
    setCamera(lerpCamera(state.camera, target, amount))
  }

  function setFullCamera() {
    setCamera(FULL_CAMERA)
  }

  function setCamera(camera) {
    state.camera.x = camera.x
    state.camera.y = camera.y
    state.camera.zoom = camera.zoom
  }

  function lerpCamera(a, b, t) {
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      zoom: lerp(a.zoom, b.zoom, t),
    }
  }

  function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1)
  }

  function ease(t) {
    const x = clamp(t, 0, 1)
    return x * x * (3 - 2 * x)
  }

  function activeTeammateCount(runner) {
    return state.players.filter((player) => player.team === runner.team && player !== runner && !isInactive(player)).length
  }

  function activeEnemyCount(player) {
    return state.players.filter((other) => other.team !== player.team && !isInactive(other)).length
  }

  function runnerOddsPayload(runner) {
    const enemies = state.players
      .filter((player) => player.team !== runner.team && !isInactive(player))
      .sort((a, b) => Math.hypot(a.x - runner.x, a.y - runner.y) - Math.hypot(b.x - runner.x, b.y - runner.y))
      .slice(0, 3)
    return {
      runnerId: runner.id,
      teammatesActive: activeTeammateCount(runner),
      enemiesActive: activeEnemyCount(runner),
      nearbyEnemyIds: enemies.map((enemy) => enemy.id),
      runnerPoint: { x: runner.x, y: runner.y },
      juggPoint: { x: state.jugg.x, y: state.jugg.y },
      malPoint: TEAMS[runner.team].attackMal,
      enemyPoints: enemies.map((enemy) => ({ x: enemy.x, y: enemy.y })),
    }
  }

  function isEnabled() {
    return ensureCinemaState().enabled
  }

  function exportPlannedScenes() {
    const cinema = ensureCinemaState()
    return cinema.queue.map((scene) => ({
      ...serializableEvent(scene),
      startCamera: null,
      elapsed: 0,
    }))
  }

  function ingestPrecomputedScenes(scenes, options = {}) {
    const cinema = ensureCinemaState()
    cinema.sceneBlockAfter = options.sceneBlockAfter ?? null
    cinema.queue = scenes.map((scene, index) => ({
      ...scene,
      id: `planned-${index}-${scene.id}`,
      startAt: Math.max(0, scene.startAt ?? scene.createdAt - SCENE_PRE_ROLL_SECONDS),
      expiresAt: scene.createdAt + SCENE_EXPIRE_SECONDS,
      elapsed: 0,
      startCamera: null,
      precomputed: true,
    })).filter((scene) => !sceneTouchesBlockedEnd(cinema, scene))
    sortScenes(cinema.queue)
    logPrecomputedScenes(cinema.queue)
  }

  function logPrecomputedScenes(scenes) {
    if (!debug || !ensureCinemaState().enabled || typeof console === 'undefined') return
    const summaries = scenes.map((scene) => sceneDebugPayload(scene))
    if (!summaries.length) {
      console.info('[Cinema] vorgeplant: keine Szenen fuer diesen Zug erkannt')
      return
    }
    console.groupCollapsed(`[Cinema] vorgeplant: ${summaries.length} Szene${summaries.length === 1 ? '' : 'n'} fuer diesen Zug`)
    for (const summary of summaries) console.info(summary)
    console.groupEnd()
  }

  function logCinemaScene(status, scene) {
    if (!debug || !ensureCinemaState().enabled || typeof console === 'undefined') return
    console.info(`[Cinema] ${status}: ${scene.title} (${scene.type})`, sceneDebugPayload(scene))
  }

  function sceneDebugPayload(scene) {
    return {
      id: scene.id,
      status: scene.precomputed ? 'precomputed' : 'live',
      type: scene.type,
      title: scene.title,
      priority: scene.priority,
      roundTime: Number((scene.createdAt ?? state.roundTime).toFixed(2)),
      startAt: Number((scene.startAt ?? state.roundTime).toFixed(2)),
      endAt: Number((scene.endAt ?? scene.createdAt ?? state.roundTime).toFixed(2)),
      duration: Number((scene.duration ?? 0).toFixed(2)),
      stone: scene.event?.stone ?? null,
      participants: scene.participantIds ?? [],
      event: scene.event?.type ?? null,
      reason: scene.event?.reason ?? null,
      targetCamera: scene.targetCamera
        ? {
            x: Number(scene.targetCamera.x.toFixed(1)),
            y: Number(scene.targetCamera.y.toFixed(1)),
            zoom: Number(scene.targetCamera.zoom.toFixed(2)),
          }
        : null,
    }
  }

  ensureCinemaState()

  return {
    recordEvent,
    recordSnapshot,
    exportPlannedScenes,
    ingestPrecomputedScenes,
    isEnabled,
    reset,
    runnerOddsPayload,
    setEnabled,
    update,
  }
}
