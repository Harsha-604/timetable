import { useState, useEffect, useRef } from 'react'
import { useStore } from './store/useStore'
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
import PublicViewer from './pages/PublicViewer'

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
  const loadProject = useStore((s) => s.loadProject)
  const seeded = useRef(false)

  // Listen to hash changes for #edit route
  useEffect(() => {
    const handleHashChange = () => {
      setIsEditor(window.location.hash.startsWith('#edit'))
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // In the editor (#edit), seed from data.json ONCE, and only if this browser has no data yet
  useEffect(() => {
    if (!isEditor || seeded.current) return
    seeded.current = true
    const isEmpty = (st) =>
      st.faculty.length === 0 &&
      st.rooms.length === 0 &&
      Object.keys(st.subjects || {}).length === 0 &&
      Object.keys(st.timetable || {}).length === 0
    if (!isEmpty(useStore.getState())) return
    fetch(`${import.meta.env.BASE_URL}data.json`, { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const hasContent = data && ((data.faculty || []).length > 0 || (data.classes || []).length > 0)
        // Never overwrite anything imported while the fetch was in flight
        if (hasContent && isEmpty(useStore.getState())) loadProject(data)
      })
      .catch(() => {})
  }, [isEditor, loadProject])

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

  const Page = PAGES[page] || Dashboard

  return (
    <div className="app">
      <Sidebar currentPage={page} onNavigate={navigate} onOpenViewer={openViewer} />
      <main className="main" id="mainContent">
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: '.75rem',
          }}
        >
          <button className="btn btn-ghost btn-sm" onClick={openViewer}>
            👁️ Switch to Read-Only Public Viewer
          </button>
        </div>
        <Page key={page + (navClassId || '')} onNavigate={navigate} initialClassId={navClassId} />
      </main>
      <Toast />
    </div>
  )
}
