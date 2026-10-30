import { useStore } from '../store/useStore'
import { BRANCHES, YEARS } from '../utils/constants'

const NAV = [
  { view: 'home',         icon: '🏠', label: 'Dashboard' },
  { view: 'settings',     icon: '⚙️',  label: 'Settings' },
  { section: 'Data' },
  { view: 'faculty',      icon: '👥', label: 'Faculty',   badge: 'faculty' },
  { view: 'rooms',        icon: '🏛️', label: 'Rooms',     badge: 'rooms' },
  { view: 'subjects',     icon: '📚', label: 'Subjects',  badge: 'subjects' },
  { section: 'Timetable' },
  { view: 'generate',     icon: '⚡', label: 'Generate' },
  { view: 'view-tt',      icon: '📋', label: 'Class Timetable' },
  { view: 'faculty-view', icon: '👤', label: 'Faculty View' },
  { view: 'room-view',    icon: '🏛️', label: 'Room View' },
  { view: 'export',       icon: '📤', label: 'Export' },
]

export default function Sidebar({ currentPage, onNavigate, onOpenViewer }) {
  const { faculty, rooms, subjects, saveProject, loadProject, resetAll, toast } = useStore()
  const totalSubs = Object.values(subjects).reduce((a, b) => a + b.length, 0)

  const badge = (key) => {
    if (key === 'faculty')  return faculty.length
    if (key === 'rooms')    return rooms.length
    if (key === 'subjects') return totalSubs
    return null
  }

  const handleLoadProject = (e) => {
    const f = e.target.files[0]; if (!f) return
    const r = new FileReader()
    r.onload = (ev) => {
      try { loadProject(JSON.parse(ev.target.result)); toast('Project loaded!', 'ok') }
      catch { toast('Invalid project file', 'err') }
    }
    r.readAsText(f); e.target.value = ''
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>CSE Allied<br />Timetable</h1>
        <p>Coordinator v2.0</p>
      </div>

      <nav className="nav">
        {NAV.map((item, i) =>
          item.section ? (
            <div key={i} className="nav-section">{item.section}</div>
          ) : (
            <button
              key={item.view}
              className={`nav-btn${currentPage === item.view ? ' active' : ''}`}
              onClick={() => onNavigate(item.view)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {item.badge && badge(item.badge) > 0 && (
                <span className="nav-badge">{badge(item.badge)}</span>
              )}
            </button>
          )
        )}
      </nav>

      <div className="sidebar-footer">
        <button
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', marginBottom: '.4rem', color: 'var(--accent2)' }}
          onClick={onOpenViewer}
        >
          👁️ Public Viewer
        </button>
        <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginBottom: '.4rem' }} onClick={saveProject}>
          💾 Save Project
        </button>
        <label className="btn btn-ghost btn-sm" style={{ width: '100%', marginBottom: '.4rem', textAlign: 'center', cursor: 'pointer' }}>
          📂 Load Project
          <input type="file" accept=".json" onChange={handleLoadProject} hidden />
        </label>
        <button
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', color: 'var(--red)' }}
          onClick={() => { if (confirm('Reset ALL data? This cannot be undone.')) { resetAll(); toast('All data reset', 'ok') } }}
        >
          🗑 Reset All
        </button>
      </div>
    </aside>
  )
}
