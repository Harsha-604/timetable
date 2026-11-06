import { useState, useEffect } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { useStore } from './store/useStore'
import { auth, googleProvider } from './firebase'
import { useCloudProjectSync } from './hooks/useCloudProjectSync'
import Sidebar from './components/Sidebar'
import Toast from './components/Toast'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Faculty from './pages/Faculty'
import Rooms from './pages/Rooms'
import Subjects from './pages/Subjects'
import Generate from './pages/Generate'
import TimetableView from './pages/TimetableView'
import FacultyView from './pages/FacultyView'
import RoomView from './pages/RoomView'
import Export from './pages/Export'
import Invigilation from './pages/Invigilation'

const PAGES = {
  home: Dashboard,
  settings: Settings,
  faculty: Faculty,
  rooms: Rooms,
  subjects: Subjects,
  generate: Generate,
  'view-tt': TimetableView,
  'faculty-view': FacultyView,
  'room-view': RoomView,
  export: Export,
  invigilation: Invigilation,
}

export default function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [page, setPage] = useState('home')
  const [navClassId, setNavClassId] = useState(null)
  const navigate = (nextPage, classId = null) => {
    setNavClassId(classId)
    setPage(nextPage)
  }
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const cloudSync = useCloudProjectSync(user)

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser)
    setAuthLoading(false)
    setAuthError('')
  }), [])

  useEffect(() => {
    // Remove credentials left behind by older login versions.
    for (const key of ['tt_publish_token', 'tt_publish_token_enc', 'tt_vault_k', 'tt_oauth_access_token', 'tt_oauth_refresh_token', 'tt_oauth_expires_at', 'tt_oauth_username', 'tt_auth_verified_at', 'tt_editor_pin', 'tt_pin_unlocked']) {
      try {
        localStorage.removeItem(key)
        sessionStorage.removeItem(key)
      } catch {}
    }
  }, [])

  const handleGoogleSignIn = async () => {
    setSigningIn(true)
    setAuthError('')
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (error) {
      setAuthError(error?.message || 'Google sign-in failed. Please try again.')
    } finally {
      setSigningIn(false)
    }
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    setAuthError('')
    try {
      await signOut(auth)
    } catch (error) {
      setAuthError(error?.message || 'Could not sign out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }

  if (authLoading) {
    return <div style={screenStyle}><div style={messageCardStyle}>Checking your sign-in…</div></div>
  }

  if (!user) {
    return (
      <div style={screenStyle}>
        <section style={messageCardStyle}>
          <h1 style={{ marginTop: 0 }}>CSE Allied Timetable</h1>
          <p>Sign in with an approved Google account to open the shared timetable.</p>
          {authError && <p role="alert" style={{ color: 'var(--danger)' }}>{authError}</p>}
          <button className="btn btn-primary" onClick={handleGoogleSignIn} disabled={signingIn}>
            {signingIn ? 'Opening Google sign-in…' : 'Sign in with Google'}
          </button>
        </section>
      </div>
    )
  }

  if (!cloudSync.ready) {
    return (
      <div style={screenStyle}>
        <section style={messageCardStyle}>
          <h1 style={{ marginTop: 0 }}>CSE Allied Timetable</h1>
          {cloudSync.error ? (
            <>
              <p role="alert" style={{ color: 'var(--danger)' }}>{cloudSync.error}</p>
              <p>Signed in as {user.email}</p>
              {authError && <p role="alert" style={{ color: 'var(--danger)' }}>{authError}</p>}
              <button className="btn btn-secondary" onClick={handleSignOut} disabled={signingOut}>
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </>
          ) : (
            <p>Connecting to the shared timetable…</p>
          )}
        </section>
      </div>
    )
  }

  const Page = PAGES[page] || Dashboard

  return (
    <div className="app">
      <Sidebar currentPage={page} onNavigate={navigate} />
      <main className="main" id="mainContent">
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1.25rem', marginBottom: '.75rem' }}>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            {cloudSync.status === 'saving' ? 'Saving to cloud…' : cloudSync.status === 'error' ? 'Cloud sync issue' : 'Synced to cloud'}
          </span>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{user.email}</span>
          <button className="btn btn-ghost btn-sm" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
          <label className="theme-switch" title="Toggle dark mode">
            <span>Dark mode</span>
            <input type="checkbox" checked={theme === 'dark'} onChange={toggleTheme} />
            <span className="theme-switch-slider" />
          </label>
        </div>
        {cloudSync.error && (
          <div role="alert" style={{ marginBottom: '.75rem', color: 'var(--danger)' }}>
            Cloud sync issue: {cloudSync.error} Your changes may not be saved to the shared timetable.
          </div>
        )}
        <Page key={page + (navClassId || '')} onNavigate={navigate} initialClassId={navClassId} />
      </main>
      <Toast />
    </div>
  )
}

const screenStyle = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: '1.5rem',
  background: 'var(--bg)',
  color: 'var(--ink)',
}

const messageCardStyle = {
  width: 'min(100%, 440px)',
  padding: '2rem',
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--surface)',
  boxShadow: 'var(--shadow)',
}
