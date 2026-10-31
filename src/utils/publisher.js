/**
 * Utilities for publishing timetables to GitHub via the GitHub Contents API.
 * Security Note: Tokens are stored exclusively in localStorage and must never
 * be leaked into project payloads, console logs, or error messages.
 */

export const TOKEN_STORAGE_KEY = 'tt_publish_token'

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
 * that any token or credential is strictly omitted from the exported JSON.
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

  // Deep clone settings and strip any accidentally attached token
  const safeSettings = JSON.parse(JSON.stringify(settings || {}))
  if (safeSettings.publishing) {
    delete safeSettings.publishing.token
  }

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

  // Security invariant: Ensure stored token never appears in payload string
  const stored = getStoredToken()
  if (stored && stored.length > 5) {
    const raw = JSON.stringify(payload)
    if (raw.includes(stored)) {
      throw new Error('Security violation: GitHub token leaked into project payload')
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
    return { ok: false, error: 'No GitHub token entered' }
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
      return { ok: false, error: '401 invalid/expired token' }
    }
    if (res.status === 404) {
      return { ok: false, error: '404 repo not found or token has no access' }
    }
    if (!res.ok) {
      return { ok: false, error: `GitHub API error (HTTP ${res.status})` }
    }

    const data = await res.json()
    if (data?.permissions?.push === true) {
      return { ok: true, message: 'Connected, can publish' }
    } else {
      return { ok: false, error: 'push false = token is read-only' }
    }
  } catch (err) {
    return { ok: false, error: 'Could not reach GitHub' }
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

