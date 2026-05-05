const DEFAULT_ENDPOINT = '/ws/pvp'

export function defaultPvpWebSocketUrl() {
  const configuredUrl = import.meta.env?.VITE_PVP_WS_URL
  if (configuredUrl) return configuredUrl
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${DEFAULT_ENDPOINT}`
}

export function createPvpClient({ url = defaultPvpWebSocketUrl(), onEvent = () => {}, onStatus = () => {} } = {}) {
  let socket = null
  let requestCounter = 0

  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return socket
    onStatus('connecting')
    socket = new WebSocket(url)
    socket.addEventListener('open', () => onStatus('open'))
    socket.addEventListener('close', () => onStatus('closed'))
    socket.addEventListener('error', () => onStatus('error'))
    socket.addEventListener('message', (event) => {
      try {
        onEvent(JSON.parse(event.data))
      } catch (error) {
        onEvent({ type: 'error', code: 'invalid_json', message: 'Ungültige WebSocket-Nachricht', detail: String(error) })
      }
    })
    return socket
  }

  function send(type, payload = {}) {
    connect()
    const message = {
      type,
      requestId: nextRequestId(),
      ...payload,
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      onStatus('connecting')
      socket?.addEventListener('open', () => socket.send(JSON.stringify(message)), { once: true })
      return
    }
    socket.send(JSON.stringify(message))
  }

  function nextRequestId() {
    requestCounter += 1
    return `client-${requestCounter}`
  }

  return {
    connect,
    createRoom: (options = {}) => send('create_room', { isPublic: Boolean(options.isPublic) }),
    listPublicRooms: () => send('list_public_rooms'),
    joinRoom: (roomCode) => send('join_room', { roomCode }),
    leaveRoom: () => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'leave_room', requestId: nextRequestId() }))
      socket?.close()
    },
    selectTeam: (team) => send('select_team', { team }),
    sendTeamConfig: (config) => send('team_config_update', { config }),
    reportRoundBreak: (payload) => send('round_break_report', payload),
    ping: () => send('ping', { clientTime: Date.now() }),
    close: () => socket?.close(),
  }
}
