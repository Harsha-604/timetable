import { useState } from 'react'
import { useStore } from '../store/useStore'
import { testGitHubConnection, setStoredToken, setAuthCached } from '../utils/publisher'

export function isStoreEmpty(st) {
  if (!st) return true
  const facultyEmpty = !st.faculty || st.faculty.length === 0
  const roomsEmpty = !st.rooms || st.rooms.length === 0
  const subjectsEmpty = !st.subjects || Object.keys(st.subjects).length === 0
  const timetableEmpty = !st.timetable || Object.keys(st.timetable).length === 0
  return facultyEmpty && roomsEmpty && subjectsEmpty && timetableEmpty
}

export default function LoginScreen({ onLoginSuccess, initialError = '' }) {
  const settings = useStore((s) => s.settings)
  const updatePublishingSettings = useStore((s) => s.updatePublishingSettings)
  const loadProject = useStore((s) => s.loadProject)
  const toast = useStore((s) => s.toast)

  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [showRepoFields, setShowRepoFields] = useState(false)
  const [owner, setOwner] = useState(() => settings?.publishing?.owner || 'Harsha-604')
  const [repo, setRepo] = useState(() => settings?.publishing?.repo || 'timetable')
  const [branch, setBranch] = useState(() => settings?.publishing?.branch || 'master')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(initialError)

  const handleLogin = async (e) => {
    e?.preventDefault()
    if (!token.trim()) {
      setError('Please enter a GitHub token.')
      return
    }

    setLoading(true)
    setError('')

    const res = await testGitHubConnection({
      owner: owner.trim(),
      repo: repo.trim(),
      token: token.trim(),
    })

    if (!res.ok || !res.canPush) {
      setLoading(false)
      setError(res.error || 'Login failed. Please verify token permissions.')
      return
    }

    // Success
    setStoredToken(token.trim())
    updatePublishingSettings({
      owner: owner.trim(),
      repo: repo.trim(),
      branch: branch.trim(),
    })
    setAuthCached()

    // Data safety: If store is empty, offer to load published timetable
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
          maxWidth: 440,
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
          Coordinator login
        </h2>
        <p style={{ fontSize: '.84rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
          Enter your GitHub publishing token to manage and edit the college timetable.
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

        <form onSubmit={handleLogin}>
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
              Use the publishing token created for the timetable repository (fine-grained, only
              the timetable repo, Contents: Read and write).
            </p>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{
                padding: '0',
                fontSize: '.8rem',
                color: 'var(--accent)',
                textDecoration: 'underline',
              }}
              onClick={() => setShowRepoFields(!showRepoFields)}
            >
              {showRepoFields ? 'Hide repository settings' : 'Change repository'}
            </button>

            {showRepoFields && (
              <div
                style={{
                  marginTop: '.75rem',
                  padding: '.75rem',
                  background: 'var(--surface2)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '.6rem',
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 600 }}>
                    Repository owner
                  </label>
                  <input
                    type="text"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    style={{ width: '100%', fontSize: '.84rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 600 }}>
                    Repository name
                  </label>
                  <input
                    type="text"
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                    style={{ width: '100%', fontSize: '.84rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 600 }}>
                    Branch
                  </label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    style={{ width: '100%', fontSize: '.84rem' }}
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginBottom: '1rem' }}
          >
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>

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

