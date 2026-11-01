import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { testGitHubConnection, setAuthCached, setIsOffline } from '../utils/publisher'
import {
  hasEncryptedToken,
  deleteEncryptedToken,
  encryptToken,
  decryptToken,
  getMemoryToken,
  setMemoryToken,
} from '../utils/tokenVault'

export function isStoreEmpty(st) {
  if (!st) return true
  const facultyEmpty = !st.faculty || st.faculty.length === 0
  const roomsEmpty = !st.rooms || st.rooms.length === 0
  const subjectsEmpty = !st.subjects || Object.keys(st.subjects).length === 0
  const timetableEmpty = !st.timetable || Object.keys(st.timetable).length === 0
  return facultyEmpty && roomsEmpty && subjectsEmpty && timetableEmpty
}

export default function LoginScreen({ onLoginSuccess, initialError = '', initialMode = null, initialStep = null }) {
  const settings = useStore((s) => s.settings)
  const loadProject = useStore((s) => s.loadProject)
  const toast = useStore((s) => s.toast)

  const owner = settings?.publishing?.owner || 'Harsha-604'
  const repo = settings?.publishing?.repo || 'timetable'

  // Mode A: PIN unlock. Mode B: Token entry + Set PIN
  const [mode, setMode] = useState(() => initialMode || (hasEncryptedToken() ? 'modeA' : 'modeB'))
  const [modeBStep, setModeBStep] = useState(() => initialStep || (initialMode === 'modeB' && getMemoryToken() ? 'setPin' : 'token'))

  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)

  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [showNewPin, setShowNewPin] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(initialError)

  // 60-second cooldown after 5 wrong attempts
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)

  useEffect(() => {
    if (cooldownSeconds <= 0) return
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          setFailedAttempts(0)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldownSeconds])

  // Mode A: Unlock with PIN
  const handleUnlockPin = async (e) => {
    e?.preventDefault()
    if (cooldownSeconds > 0) return
    if (!pin) {
      setError('Please enter your PIN.')
      return
    }

    setLoading(true)
    setError('')

    let decrypted
    try {
      decrypted = await decryptToken(pin)
    } catch {
      const nextFailures = failedAttempts + 1
      setFailedAttempts(nextFailures)
      setPin('')
      setLoading(false)
      if (nextFailures >= 5) {
        setCooldownSeconds(60)
        setError('Too many failed attempts. Please wait 60 seconds before retrying.')
      } else {
        setError('Wrong PIN')
      }
      return
    }

    // Decryption succeeded, verify with GitHub
    setFailedAttempts(0)
    const res = await testGitHubConnection({
      owner,
      repo,
      token: decrypted,
    })

    setLoading(false)

    if (res.ok && res.canPush) {
      setAuthCached()
      onLoginSuccess()
    } else if (res.isNetworkError) {
      setIsOffline(true)
      onLoginSuccess()
    } else {
      // 401 / 404 / push false -> token revoked
      deleteEncryptedToken()
      setMode('modeB')
      setModeBStep('token')
      setPin('')
      setError('Access was revoked or the token expired. Log in with a new token.')
    }
  }

  // Mode B: Step 1 - Token verification
  const handleTokenSubmit = async (e) => {
    e?.preventDefault()
    if (!token.trim()) {
      setError('Please enter a GitHub token.')
      return
    }

    setLoading(true)
    setError('')

    const res = await testGitHubConnection({
      owner,
      repo,
      token: token.trim(),
    })

    setLoading(false)

    if (!res.ok || !res.canPush) {
      setError(res.error || 'Login failed. Please verify token permissions.')
      return
    }

    // Token valid: store in memory and advance to Set PIN
    setMemoryToken(token.trim())
    setModeBStep('setPin')
    setError('')
  }

  // Mode B: Step 2 - Set PIN and open editor
  const handleSetPinSubmit = async (e) => {
    e?.preventDefault()
    if (newPin.length < 8) {
      setError('PIN must be at least 8 characters.')
      return
    }
    if (newPin !== confirmPin) {
      setError('PINs do not match.')
      return
    }

    setLoading(true)
    setError('')

    const currentTok = getMemoryToken()
    if (!currentTok) {
      setModeBStep('token')
      setLoading(false)
      setError('Token missing. Please re-enter your GitHub token.')
      return
    }

    try {
      await encryptToken(currentTok, newPin)
      setAuthCached()

      // Prompt to load published timetable if local store is empty
      const currentState = useStore.getState()
      if (isStoreEmpty(currentState)) {
        const loadPublished = window.confirm('Load the published timetable to edit?')
        if (loadPublished) {
          try {
            const baseUrl = import.meta.env.BASE_URL || '/'
            const url = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}data.json`
            const fetchRes = await fetch(url, { cache: 'no-cache' })
            if (fetchRes.ok) {
              const data = await fetchRes.json()
              if (data && ((data.classes && data.classes.length > 0) || (data.faculty && data.faculty.length > 0))) {
                loadProject(data)
                toast('Published timetable loaded', 'ok')
              }
            }
          } catch {}
        }
      }

      setLoading(false)
      onLoginSuccess()
    } catch (err) {
      setLoading(false)
      setError(err.message || 'Failed to encrypt token.')
    }
  }

  const handleForgotPin = () => {
    const confirmed = window.confirm(
      'This removes the saved token from this browser. You will need the token to log in again.'
    )
    if (confirmed) {
      deleteEncryptedToken()
      setPin('')
      setError('')
      setMode('modeB')
      setModeBStep('token')
    }
  }

  const handleBackToPublic = () => {
    window.location.hash = ''
  }

  return (
    <div
      style={{
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 420,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          padding: '2rem',
        }}
      >
        <h2
          style={{
            fontSize: '1.4rem',
            fontWeight: 700,
            marginBottom: '.3rem',
            color: 'var(--ink)',
          }}
        >
          {mode === 'modeB' && modeBStep === 'setPin' ? 'Set a PIN for this computer' : 'Coordinator login'}
        </h2>

        <p style={{ fontSize: '.84rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
          {mode === 'modeA'
            ? 'Enter your coordinator PIN to unlock this session.'
            : modeBStep === 'setPin'
            ? 'Choose a PIN of at least 8 characters to encrypt your token on this browser.'
            : 'Enter your GitHub publishing token to set up this computer.'}
        </p>

        {error && (
          <div
            style={{
              padding: '.6rem .75rem',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--dangerbg)',
              color: 'var(--danger)',
              border: '1px solid var(--border)',
              fontSize: '.84rem',
              marginBottom: '1rem',
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        )}

        {/* ─── Mode A: PIN Unlock ─── */}
        {mode === 'modeA' && (
          <form onSubmit={handleUnlockPin}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '.82rem',
                  fontWeight: 600,
                  marginBottom: '.3rem',
                  color: 'var(--ink)',
                }}
              >
                PIN
              </label>
              <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter PIN"
                  disabled={cooldownSeconds > 0}
                  autoFocus
                  style={{ flex: 1, fontFamily: showPin ? 'inherit' : 'monospace' }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowPin(!showPin)}
                >
                  {showPin ? 'Hide' : 'Show'}
                </button>
              </div>
              {cooldownSeconds > 0 && (
                <p style={{ fontSize: '.78rem', color: 'var(--danger)', marginTop: '.35rem' }}>
                  Locked for {cooldownSeconds}s
                </p>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || cooldownSeconds > 0 || !pin}
              style={{ width: '100%', marginBottom: '1rem' }}
            >
              {loading ? 'Verifying…' : 'Unlock'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '.8rem' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: 0, color: 'var(--accent)', textDecoration: 'underline' }}
                onClick={() => {
                  setMode('modeB')
                  setModeBStep('token')
                  setError('')
                }}
              >
                Use token instead
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: 0, color: 'var(--muted)', textDecoration: 'underline' }}
                onClick={handleForgotPin}
              >
                Forgot PIN?
              </button>
            </div>
          </form>
        )}

        {/* ─── Mode B, Step 1: Token Input ─── */}
        {mode === 'modeB' && modeBStep === 'token' && (
          <form onSubmit={handleTokenSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '.82rem',
                  fontWeight: 600,
                  marginBottom: '.3rem',
                  color: 'var(--ink)',
                }}
              >
                GitHub token
              </label>
              <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="github_pat_..."
                  autoFocus
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </div>
              <p
                style={{
                  fontSize: '.78rem',
                  color: 'var(--muted)',
                  marginTop: '.35rem',
                  lineHeight: 1.4,
                }}
              >
                You need the token only once per computer. After that, use your PIN.
              </p>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !token.trim()}
              style={{ width: '100%', marginBottom: '1rem' }}
            >
              {loading ? 'Checking token…' : 'Continue'}
            </button>

            {hasEncryptedToken() && (
              <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--accent)', textDecoration: 'underline', fontSize: '.8rem' }}
                  onClick={() => {
                    setMode('modeA')
                    setError('')
                  }}
                >
                  ← Back to PIN login
                </button>
              </div>
            )}
          </form>
        )}

        {/* ─── Mode B, Step 2: Set PIN ─── */}
        {mode === 'modeB' && modeBStep === 'setPin' && (
          <form onSubmit={handleSetPinSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '.82rem',
                  fontWeight: 600,
                  marginBottom: '.3rem',
                  color: 'var(--ink)',
                }}
              >
                Choose PIN
              </label>
              <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                <input
                  type={showNewPin ? 'text' : 'password'}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="At least 8 characters"
                  autoFocus
                  style={{ flex: 1, fontFamily: showNewPin ? 'inherit' : 'monospace' }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowNewPin(!showNewPin)}
                >
                  {showNewPin ? 'Hide' : 'Show'}
                </button>
              </div>
              <p
                style={{
                  fontSize: '.78rem',
                  color: 'var(--muted)',
                  marginTop: '.35rem',
                }}
              >
                Longer is safer. Letters + numbers recommended.
              </p>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '.82rem',
                  fontWeight: 600,
                  marginBottom: '.3rem',
                  color: 'var(--ink)',
                }}
              >
                Confirm PIN
              </label>
              <input
                type={showNewPin ? 'text' : 'password'}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="Re-enter PIN"
                style={{ width: '100%', fontFamily: showNewPin ? 'inherit' : 'monospace' }}
              />
              <p
                style={{
                  fontSize: '.78rem',
                  color: 'var(--muted)',
                  marginTop: '.35rem',
                }}
              >
                You need the token only once per computer. After that, use your PIN.
              </p>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !newPin || !confirmPin}
              style={{ width: '100%', marginBottom: '1rem' }}
            >
              {loading ? 'Encrypting & Saving…' : 'Save and open editor'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--muted)', fontSize: '.82rem' }}
            onClick={handleBackToPublic}
          >
            ← Back to public timetable
          </button>
        </div>
      </div>
    </div>
  )
}
