import { useState, useEffect, useRef } from 'react'
import { useStore } from './store/useStore'
import Sidebar from './components/Sidebar'
import Toast from './components/Toast'
import LoginScreen from './components/LoginScreen'
import PinScreen from './components/PinScreen'
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
import PublicViewer from './pages/PublicViewer'
import {
  getStoredToken,
  isAuthCached,
  isPinSet,
  isPinUnlocked,
  setPinUnlocked,
  verifyEditorAccess,
  logout,
  setIsOffline,
} from './utils/publisher'

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
}

export default function App() {
  const [page, setPage] = useState('home')
  const [navClassId, setNavClassId] = useState(null)
  const navigate = (p, classId = null) => {
    setNavClassId(classId)
    setPage(p)
  }
  const [isEditor, setIsEditor] = useState(() => window.location.hash.startsWith('#edit'))
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const settings = useStore((s) => s.settings)

  // Auth state
  const [authStep, setAuthStep] = useState(() => {
    const token = getStoredToken()
    if (!token) return 'login'
    if (isAuthCached()) {
      if (isPinSet() && !isPinUnlocked()) return 'pin'
      return 'editor'
    }
    return 'checking'
  })
  const [isOfflineState, setIsOfflineState] = useState(false)
  const [loginError, setLoginError] = useState('')

  // Listen to hash changes for #edit route
  useEffect(() => {
    const handleHashChange = () => {
      setIsEditor(window.location.hash.startsWith('#edit'))
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // Verify access on editor load
  useEffect(() => {
    if (!isEditor) return

    const token = getStoredToken()
    if (!token) {
      setAuthStep('login')
      return
    }

    if (isAuthCached()) {
      if (isPinSet() && !isPinUnlocked()) {
        setAuthStep('pin')
      } else {
        setAuthStep('editor')
      }
      return
    }

    setAuthStep('checking')
    const owner = settings?.publishing?.owner || 'Harsha-604'
    const repo = settings?.publishing?.repo || 'timetable'

    verifyEditorAccess({ owner, repo, token }).then((res) => {
      if (res.allowed) {
        if (res.isOffline) {
          setIsOfflineState(true)
          setIsOffline(true)
        } else {
          setIsOfflineState(false)
          setIsOffline(false)
        }
        if (isPinSet() && !isPinUnlocked()) {
          setAuthStep('pin')
        } else {
          setAuthStep('editor')
        }
      } else {
        setLoginError(res.error || 'Your access was revoked or the token expired. Log in again.')
        setIsOfflineState(false)
        setIsOffline(false)
        setAuthStep('login')
      }
    })
  }, [isEditor, settings?.publishing?.owner, settings?.publishing?.repo])

  // Inactivity timeout: 30 minutes without activity locks to PIN screen
  useEffect(() => {
    if (!isEditor || authStep !== 'editor' || !isPinSet()) return

    let timer
    const resetTimer = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        setPinUnlocked(false)
        setAuthStep('pin')
      }, 30 * 60 * 1000)
    }

    resetTimer()

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }))

    return () => {
      clearTimeout(timer)
      events.forEach((evt) => window.removeEventListener(evt, resetTimer))
    }
  }, [isEditor, authStep])

  const handleLoginSuccess = () => {
    setLoginError('')
    setIsOfflineState(false)
    setIsOffline(false)
    if (isPinSet() && !isPinUnlocked()) {
      setAuthStep('pin')
    } else {
      setAuthStep('editor')
    }
  }

  const handleLock = () => {
    if (isPinSet()) {
      setPinUnlocked(false)
      setAuthStep('pin')
    }
  }

  const handleLogout = () => {
    if (window.confirm('You will need the token to log in again. Make sure you have it saved.')) {
      logout()
      setIsOfflineState(false)
      setIsOffline(false)
      setLoginError('')
      setAuthStep('login')
    }
  }

  const openEditor = () => {
    window.location.hash = '#edit'
  }

  const openViewer = () => {
    window.location.hash = ''
  }

  if (!isEditor) {
    return (
      <div className="public-app">
        <PublicViewer onOpenEditor={openEditor} />
        <Toast />
      </div>
    )
  }

  // 1. Checking access on initial editor load
  if (authStep === 'checking') {
    return (
      <div
        style={{
          minHeight: '80vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <div
          className="card"
          style={{
            padding: '2rem 3rem',
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: '.9rem',
          }}
        >
          Checking access…
        </div>
        <Toast />
      </div>
    )
  }

  // 2. Login screen
  if (authStep === 'login') {
    return (
      <div className="public-app">
        <LoginScreen onLoginSuccess={handleLoginSuccess} initialError={loginError} />
        <Toast />
      </div>
    )
  }

  // 3. PIN prompt screen
  if (authStep === 'pin') {
    return (
      <div className="public-app">
        <PinScreen
          onUnlockSuccess={() => setAuthStep('editor')}
          onForgotPin={() => setAuthStep('login')}
        />
        <Toast />
      </div>
    )
  }

  // 4. Editor main view
  const Page = PAGES[page] || Dashboard

  return (
    <div className="app">
      <Sidebar
        currentPage={page}
        onNavigate={navigate}
        onOpenViewer={openViewer}
        onLock={handleLock}
        onLogout={handleLogout}
      />
      <main className="main" id="mainContent">
        {isOfflineState && (
          <div
            style={{
              padding: '.65rem 1rem',
              marginBottom: '1rem',
              background: 'var(--surface2)',
              borderLeft: '3px solid var(--border2)',
              color: 'var(--ink)',
              fontSize: '.84rem',
            }}
          >
            Offline: could not verify access. Publishing is disabled until you are back online.
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '1.25rem',
            marginBottom: '.75rem',
          }}
        >
          <label className="theme-switch" title="Toggle dark mode">
            <span>Dark mode</span>
            <input
              type="checkbox"
              checked={theme === 'dark'}
              onChange={toggleTheme}
            />
            <span className="theme-switch-slider" />
          </label>
          <button className="btn btn-ghost btn-sm" onClick={openViewer}>
            Switch to Read-Only Public Viewer
          </button>
        </div>
        <Page
          key={page + (navClassId || '')}
          onNavigate={navigate}
          initialClassId={navClassId}
          onLogout={handleLogout}
        />
      </main>
      <Toast />
    </div>
  )
}
