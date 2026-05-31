export function readStoredString(key, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function writeStoredString(key, value) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Storage can be unavailable in restricted browser contexts; the UI remains usable in memory.
  }
}

export function readStoredArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore quota/private-mode failures; callers already updated live state.
  }
}
