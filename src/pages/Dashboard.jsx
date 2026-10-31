import { useStore } from '../store/useStore'
import { getBranchYearKey } from '../utils/helpers'

export default function Dashboard({ onNavigate }) {
  const { classes, faculty, rooms, subjects, timetable } = useStore()
  const totalSubs = Object.values(subjects).reduce((a, b) => a + (b?.length || 0), 0)
  const totalTT = Object.keys(timetable).filter((k) => Object.keys(timetable[k] || {}).length > 0).length
  const needsSetup = !faculty.length || !rooms.length || !totalSubs

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <div>
            <h2>Dashboard</h2>
            <p>CSE Allied Timetable Coordinator — A.Y. 2026-27</p>
          </div>
        </div>
      </div>

      <div className="stats-row">
        {[
          { num: faculty.length, label: 'Faculty Members' },
          { num: rooms.length, label: 'Rooms & Labs' },
          { num: totalSubs, label: 'Subjects Entered' },
          { num: totalTT, label: 'Classes with Timetable' },
        ].map((c) => (
          <div key={c.label} className="stat-card">
            <div className="num">{c.num}</div>
            <div className="label">{c.label}</div>
          </div>
        ))}
      </div>

      {needsSetup && (
        <div
          className="card"
          style={{ borderColor: 'var(--border2)', background: 'var(--surface2)' }}
        >
          <div className="card-header">
            <h3>Getting Started</h3>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: '.75rem',
              marginBottom: '1rem',
            }}
          >
            {[
              { step: 1, text: 'Configure Sections', view: 'settings' },
              { step: 2, text: 'Upload Faculty List', view: 'faculty' },
              { step: 3, text: 'Add Rooms & Labs', view: 'rooms' },
              { step: 4, text: 'Add Subjects', view: 'subjects' },
              { step: 5, text: 'Generate Timetable', view: 'generate' },
              { step: 6, text: 'View / Edit Timetable', view: 'view-tt' },
            ].map((s) => (
              <div
                key={s.step}
                className="card"
                style={{ margin: 0, cursor: 'pointer', background: 'var(--surface)' }}
                onClick={() => onNavigate(s.view)}
              >
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '.06em',
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  STEP {s.step}
                </div>
                <p style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '.35rem', fontWeight: 500 }}>
                  {s.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Class Coverage</h3>
          <span style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: 'auto' }}>
            {classes.length} active classes
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '.75rem',
          }}
        >
          {classes.map((cls) => {
            const byKey = getBranchYearKey(cls.branch, cls.year)
            const subs = subjects[byKey] || []
            const tt = timetable[cls.id]
            const placed = tt
              ? Object.values(tt).reduce((a, d) => a + Object.values(d).length, 0)
              : 0
            const needed = subs.reduce((a, s) => a + (Number(s.periods) || 0), 0)
            const pct = needed ? Math.min(100, Math.round((placed / needed) * 100)) : 0

            return (
              <div
                key={cls.id}
                className="card"
                style={{ margin: 0, cursor: 'pointer' }}
                onClick={() => onNavigate('view-tt', cls.id)}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.5rem',
                    marginBottom: '.4rem',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: '.9rem' }}>{cls.id}</span>
                  <span
                    className="tag"
                    style={{ marginLeft: 'auto' }}
                  >
                    {pct === 100 ? 'Done' : pct > 0 ? `${pct}%` : 'Not generated'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  {subs.length} subjects · {placed}/{needed} periods
                </div>
                <div className="progress-bar" style={{ marginTop: '.5rem' }}>
                  <i style={{ width: pct + '%' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
