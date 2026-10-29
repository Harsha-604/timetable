import { useState } from 'react'
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
import Export from './pages/Export'

const PAGES = {
  home: Dashboard,
  settings: Settings,
  faculty: Faculty,
  rooms: Rooms,
  subjects: Subjects,
  generate: Generate,
  'view-tt': TimetableView,
  'faculty-view': FacultyView,
  export: Export,
}

export default function App() {
  const [page, setPage] = useState('home')
  const Page = PAGES[page] || Dashboard

  return (
    <div className="app">
      <Sidebar currentPage={page} onNavigate={setPage} />
      <main className="main" id="mainContent">
        <Page onNavigate={setPage} />
      </main>
      <Toast />
    </div>
  )
}
