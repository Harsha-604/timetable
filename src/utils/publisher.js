/**
 * Utilities for authentication and publishing timetables to GitHub via the GitHub Contents API.
 * Security Note: Tokens and PIN hashes are stored exclusively in localStorage and must never
 * be leaked into project payloads, console logs, or error messages.
 */

export const TOKEN_STORAGE_KEY = 'tt_publish_token'
export const PIN_STORAGE_KEY = 'tt_editor_pin'
export const AUTH_CACHE_KEY = 'tt_auth_verified_at'
export const PIN_UNLOCKED_KEY = 'tt_pin_unlocked'
export const AUTH_CACHE_TTL = 12 * 60 * 60 * 1000 // 12 hours

let offlineState = false
export function getIsOffline() {
  return offlineState
}
export function setIsOffline(val) {
  offlineState = !!val
}

export function toBase64Utf8(str) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64')
  }
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  const len = bytes.byteLength
  const chunkSize = 8192
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)))
  }
  return btoa(binary)
}

export function fromBase64Utf8(b64) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf-8')
  }
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

/* ─── Token Storage ─── */

export function getStoredToken() {
  if (typeof localStorage === 'undefined') return ''
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function setStoredToken(token) {
  if (typeof localStorage === 'undefined') return
  try {
    if (token && typeof token === 'string' && token.trim()) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token.trim())
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  } catch {}
}

export function clearStoredToken() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {}
}

/* ─── PIN Storage & Hashing ─── */

export function getStoredPinHash() {
  if (typeof localStorage === 'undefined') return ''
  try {
    return localStorage.getItem(PIN_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function setStoredPinHash(hash) {
  if (typeof localStorage === 'undefined') return
  try {
    if (hash && typeof hash === 'string' && hash.trim()) {
      localStorage.setItem(PIN_STORAGE_KEY, hash.trim())
    } else {
      localStorage.removeItem(PIN_STORAGE_KEY)
    }
  } catch {}
}

export function clearStoredPinHash() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(PIN_STORAGE_KEY)
  } catch {}
}

export function isPinSet() {
  return !!getStoredPinHash()
}

/**
 * Computes a salted SHA-256 hash using Web Cryptography API.
 * Format returned: "<saltHex>:<hashHex>"
 */
export async function hashPin(pin, saltHex = null) {
  if (!saltHex) {
    const saltBytes = new Uint8Array(16)
    crypto.getRandomValues(saltBytes)
    saltHex = Array.from(saltBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  const enc = new TextEncoder()
  const data = enc.encode(saltHex + ':' + pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${saltHex}:${hashHex}`
}

export async function verifyPin(pin, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false
  const [saltHex] = storedHash.split(':')
  const check = await hashPin(pin, saltHex)
  return check === storedHash
}

/* ─── Session Flags (Auth cache & PIN unlock) ─── */

export function isPinUnlocked() {
  if (!isPinSet()) return true
  if (typeof sessionStorage === 'undefined') return false
  try {
    return sessionStorage.getItem(PIN_UNLOCKED_KEY) === 'true'
  } catch {
    return false
  }
}

export function setPinUnlocked(unlocked) {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (unlocked) {
      sessionStorage.setItem(PIN_UNLOCKED_KEY, 'true')
    } else {
      sessionStorage.removeItem(PIN_UNLOCKED_KEY)
    }
  } catch {}
}

export function isAuthCached() {
  if (typeof sessionStorage === 'undefined') return false
  try {
    const val = sessionStorage.getItem(AUTH_CACHE_KEY)
    if (!val) return false
    const time = Number(val)
    return Date.now() - time < AUTH_CACHE_TTL
  } catch {
    return false
  }
}

export function setAuthCached() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(AUTH_CACHE_KEY, String(Date.now()))
  } catch {}
}

export function clearAuthCache() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(AUTH_CACHE_KEY)
  } catch {}
}

export function logout() {
  clearStoredToken()
  clearAuthCache()
  setPinUnlocked(false)
}

export function formatPublishCommitMessage(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const yyyy = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const min = pad(date.getMinutes())
  return `publish timetable ${yyyy}-${mm}-${dd} ${hh}:${min}`
}

/**
 * Builds the project payload for Save Project and Publish, ensuring
 * that neither token nor PIN hash leaks into the exported JSON.
 */
export function buildProjectPayload(state, savedAt = new Date().toISOString()) {
  const {
    classes = [],
    faculty = [],
    rooms = [],
    subjects = {},
    assignments = {},
    lockedAssignments = {},
    subjectFacultyPresets = {},
    timetable = {},
    settings = {},
  } = state || {}

  // Deep clone settings and strip any credentials
  const safeSettings = JSON.parse(JSON.stringify(settings || {}))
  if (safeSettings.publishing) {
    delete safeSettings.publishing.token
  }
  delete safeSettings.pin
  delete safeSettings.pinHash

  const payload = {
    savedAt,
    classes,
    faculty,
    rooms,
    subjects,
    assignments,
    lockedAssignments,
    subjectFacultyPresets,
    timetable,
    settings: safeSettings,
  }

  // Security invariant: Ensure stored token and PIN hash never appear in payload string
  const stored = getStoredToken()
  if (stored && stored.length > 5) {
    const raw = JSON.stringify(payload)
    if (raw.includes(stored)) {
      throw new Error('Security violation: GitHub token leaked into project payload')
    }
  }

  const storedPin = getStoredPinHash()
  if (storedPin && storedPin.length > 5) {
    const raw = JSON.stringify(payload)
    if (raw.includes(storedPin)) {
      throw new Error('Security violation: PIN hash leaked into project payload')
    }
  }

  return payload
}

/**
 * Tests GitHub connection and repository push permissions.
 */
export async function testGitHubConnection({
  owner = 'Harsha-604',
  repo = 'timetable',
  token,
} = {}) {
  const cleanOwner = (owner || 'Harsha-604').trim()
  const cleanRepo = (repo || 'timetable').trim()
  const cleanToken = (token || getStoredToken()).trim()

  if (!cleanToken) {
    return { ok: false, canPush: false, error: 'No GitHub token entered' }
  }

  const url = `https://api.github.com/repos/${cleanOwner}/${cleanRepo}`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (res.status === 401) {
      return { ok: false, canPush: false, status: 401, error: '401 invalid/expired token' }
    }
    if (res.status === 404) {
      return { ok: false, canPush: false, status: 404, error: '404 repo not found or token has no access' }
    }
    if (!res.ok) {
      return { ok: false, canPush: false, status: res.status, error: `GitHub API error (HTTP ${res.status})` }
    }

    const data = await res.json()
    if (data?.permissions?.push === true) {
      return { ok: true, canPush: true, status: 200, message: 'Connected, can publish' }
    } else {
      return { ok: false, canPush: false, status: 200, error: 'push false = token is read-only' }
    }
  } catch (err) {
    return { ok: false, canPush: false, isNetworkError: true, error: 'Could not reach GitHub' }
  }
}

/**
 * Verifies access on editor load.
 * 401 / push false / 404 -> clears token and cache, returns not allowed.
 * Network error -> allows editor with isOffline: true.
 * Success -> sets cache and allows editor.
 */
export async function verifyEditorAccess({
  owner = 'Harsha-604',
  repo = 'timetable',
  token,
} = {}) {
  const currentToken = token || getStoredToken()
  if (!currentToken) {
    return { allowed: false, reason: 'no_token' }
  }

  if (isAuthCached()) {
    return { allowed: true, cached: true }
  }

  const res = await testGitHubConnection({ owner, repo, token: currentToken })
  if (res.ok && res.canPush) {
    setAuthCached()
    return { allowed: true, cached: false }
  }

  if (res.isNetworkError) {
    return { allowed: true, isOffline: true }
  }

  // 401, 404, or push false
  clearStoredToken()
  clearAuthCache()
  return {
    allowed: false,
    reason: 'revoked',
    error: 'Your access was revoked or the token expired. Log in again.',
  }
}

/**
 * Publishes the timetable project data to public/data.json in the repository.
 * Handles SHA detection, UTF-8 base64 encoding, and 409/422 retry.
 */
export async function publish({
  owner = 'Harsha-604',
  repo = 'timetable',
  branch = 'master',
  token,
  projectData,
  message,
} = {}) {
  const authToken = (token || getStoredToken()).trim()
  if (!authToken) {
    const err = new Error('Token invalid or expired, update it in Settings')
    err.status = 401
    throw err
  }

  const cleanOwner = (owner || 'Harsha-604').trim()
  const cleanRepo = (repo || 'timetable').trim()
  const cleanBranch = (branch || 'master').trim()

  const commitMsg = message || formatPublishCommitMessage()
  const jsonStr = JSON.stringify(projectData, null, 2)
  const contentBase64 = toBase64Utf8(jsonStr)

  const headers = {
    Authorization: `Bearer ${authToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  const fileUrl = `https://api.github.com/repos/${cleanOwner}/${cleanRepo}/contents/public/data.json`

  const fetchSha = async () => {
    let res
    try {
      res = await fetch(`${fileUrl}?ref=${encodeURIComponent(cleanBranch)}`, {
        method: 'GET',
        headers,
      })
    } catch {
      const err = new Error('Could not reach GitHub')
      err.status = 0
      throw err
    }

    if (res.status === 200) {
      const data = await res.json()
      return data.sha || null
    }
    if (res.status === 404) {
      return null
    }
    if (res.status === 401) {
      const err = new Error('Token invalid or expired, update it in Settings')
      err.status = 401
      throw err
    }
    if (res.status === 403 || res.status === 404) {
      const err = new Error('Token cannot write to this repo')
      err.status = res.status
      throw err
    }

    const err = new Error(`GitHub error reading file: HTTP ${res.status}`)
    err.status = res.status
    throw err
  }

  const putFile = async (currentSha) => {
    const body = {
      message: commitMsg,
      content: contentBase64,
      branch: cleanBranch,
    }
    if (currentSha) {
      body.sha = currentSha
    }

    let res
    try {
      res = await fetch(fileUrl, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch {
      const err = new Error('Could not reach GitHub')
      err.status = 0
      throw err
    }

    if (res.status === 200 || res.status === 201) {
      return await res.json()
    }

    if (res.status === 409 || res.status === 422) {
      return { retry: true }
    }

    if (res.status === 401) {
      const err = new Error('Token invalid or expired, update it in Settings')
      err.status = 401
      throw err
    }
    if (res.status === 403 || res.status === 404) {
      const err = new Error('Token cannot write to this repo')
      err.status = res.status
      throw err
    }

    const err = new Error(`Failed to commit file: HTTP ${res.status}`)
    err.status = res.status
    throw err
  }

  let sha = await fetchSha()
  let result = await putFile(sha)

  if (result?.retry) {
    // 409/422 sha mismatch: re-fetch sha once and retry once
    sha = await fetchSha()
    result = await putFile(sha)
    if (result?.retry) {
      const err = new Error('Token cannot write to this repo')
      err.status = 409
      throw err
    }
  }

  return result
}

// Alias for explicit naming
export const publishTimetableToGitHub = publish

/**
 * Polls the latest GitHub Actions workflow run for the target branch.
 */
export async function getLatestWorkflowRun({
  owner = 'Harsha-604',
  repo = 'timetable',
  branch = 'master',
  token,
} = {}) {
  const authToken = (token || getStoredToken()).trim()
  const cleanOwner = (owner || 'Harsha-604').trim()
  const cleanRepo = (repo || 'timetable').trim()
  const cleanBranch = (branch || 'master').trim()

  const url = `https://api.github.com/repos/${cleanOwner}/${cleanRepo}/actions/runs?branch=${encodeURIComponent(cleanBranch)}&per_page=1`
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
  }

  try {
    const res = await fetch(url, { headers })
    if (!res.ok) return null
    const data = await res.json()
    const latest = data.workflow_runs?.[0]
    if (!latest) {
      return {
        status: 'Deploying…',
        state: 'deploying',
        url: `https://github.com/${cleanOwner}/${cleanRepo}/actions`,
      }
    }

    const runUrl = latest.html_url || `https://github.com/${cleanOwner}/${cleanRepo}/actions`
    if (latest.status === 'queued' || latest.status === 'in_progress' || !latest.conclusion) {
      return { status: 'Deploying…', state: 'deploying', url: runUrl }
    }
    if (latest.conclusion === 'success') {
      return { status: 'Live', state: 'live', url: runUrl }
    }
    return { status: 'Deploy failed, see Actions', state: 'failed', url: runUrl }
  } catch {
    return null
  }
}
