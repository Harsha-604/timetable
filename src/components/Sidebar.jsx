import { useStore } from '../store/useStore'
import { BRANCHES, YEARS } from '../utils/constants'
import { usePublish } from '../utils/usePublish'
import { isPinSet } from '../utils/publisher'

const NAV = [
  { view: 'home',         label: 'Dashboard' },
  { view: 'settings',     label: 'Settings' },
  { section: 'Data' },
  { view: 'faculty',      label: 'Faculty',   badge: 'faculty' },
  { view: 'rooms',        label: 'Rooms',     badge: 'rooms' },
  { view: 'subjects',     label: 'Subjects',  badge: 'subjects' },
  { section: 'Timetable' },
  { view: 'generate',     label: 'Generate' },
  { view: 'view-tt',      label: 'Class Timetable' },
  { view: 'faculty-view', label: 'Faculty View' },
  { view: 'room-view',    label: 'Room View' },
  { view: 'export',       label: 'Export' },
]

export default function Sidebar({ currentPage, onNavigate, onOpenViewer, onLock, onLogout }) {
  const { faculty, rooms, subjects, saveProject, loadProject, resetAll, toast } = useStore()
  const { publishing, deployStatus, isOffline, handlePublish } = usePublish({ onNavigate })
  const totalSubs = Object.values(subjects).reduce((a, b) => a + b.length, 0)
  const hasPin = isPinSet()

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
      try { loadProject(JSON.parse(ev.target.result)); toast('Project loaded', 'ok') }
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
          className="btn btn-primary btn-sm"
          style={{ width: '100%', marginBottom: '.4rem' }}
          disabled={publishing || isOffline}
          onClick={handlePublish}
        >
          {publishing ? 'Publishing…' : 'Publish'}
        </button>

        {deployStatus && (
          <div
            style={{
              marginBottom: '.4rem',
              fontSize: '.75rem',
              textAlign: 'center',
              lineHeight: 1.3,
            }}
          >
            {deployStatus.state === 'failed' ? (
              <a
                href={deployStatus.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--danger)', textDecoration: 'underline' }}
              >
                Deploy failed, see Actions
              </a>
            ) : deployStatus.state === 'live' ? (
              <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Live</span>
            ) : (
              <span style={{ color: 'var(--muted)' }}>Deploying…</span>
            )}
          </div>
        )}

        <button
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', marginBottom: '.4rem', color: 'var(--accent)' }}
          onClick={onOpenViewer}
        >
          Public Viewer
        </button>
        <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginBottom: '.4rem' }} onClick={saveProject}>
          Save Project
        </button>
        <label className="btn btn-ghost btn-sm" style={{ width: '100%', marginBottom: '.4rem', textAlign: 'center', cursor: 'pointer' }}>
          Load Project
          <input type="file" accept=".json" onChange={handleLoadProject} hidden />
        </label>
        <button
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', color: 'var(--danger)', marginBottom: '.4rem' }}
          onClick={() => { if (confirm('Reset ALL data? This cannot be undone.')) { resetAll(); toast('All data reset', 'ok') } }}
        >
          Reset All
        </button>
        {hasPin && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', marginBottom: '.4rem' }}
            onClick={onLock}
          >
            Lock
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', color: 'var(--muted)' }}
          onClick={onLogout}
        >
          Log out
        </button>
      </div>
    </aside>
  )
}
