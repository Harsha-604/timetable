import { useState, useEffect } from 'react'
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
  const [isEditor, setIsEditor] = useState(() => window.location.hash.startsWith('#edit'))
  const { faculty, timetable, loadProject } = useStore()

  // Listen to hash changes for #edit route
  useEffect(() => {
    const handleHashChange = () => {
      setIsEditor(window.location.hash.startsWith('#edit'))
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // On load in editor route (#edit), if store is empty, fetch data.json from BASE_URL
  useEffect(() => {
    if (!isEditor) return // Never seed or touch persisted store in public viewer
    const hasData = faculty.length > 0 || Object.keys(timetable).length > 0
    if (!hasData) {
      const baseUrl = import.meta.env.BASE_URL || '/'
      const dataUrl = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}data.json`
      fetch(dataUrl, { cache: 'no-cache' })
        .then((res) => {
          if (!res.ok) return null
          return res.json()
        })
        .then((data) => {
          if (data && typeof data === 'object') {
            loadProject(data)
          }
        })
        .catch(() => {
          // Silent 404 handling as required
        })
    }
  }, [isEditor, faculty.length, timetable, loadProject])

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
      <Sidebar currentPage={page} onNavigate={setPage} onOpenViewer={openViewer} />
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
        <Page onNavigate={setPage} />
      </main>
      <Toast />
    </div>
  )
}
