import { useStore } from '../store/useStore'
import { BRANCHES, YEARS } from '../utils/constants'

export default function Dashboard({ onNavigate }) {
  const { faculty, rooms, subjects, timetable } = useStore()
  const totalSubs  = Object.values(subjects).reduce((a, b) => a + b.length, 0)
  const totalTT    = Object.keys(timetable).length
  const needsSetup = !faculty.length || !rooms.length || !totalSubs

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <div><h2>Dashboard</h2><p>CSE Allied Timetable Coordinator — A.Y. 2026-27</p></div>
        </div>
      </div>

      <div className="stats-row">
        {[
          { icon: '👥', num: faculty.length, label: 'Faculty Members',      cls: 'blue'   },
          { icon: '🏛️', num: rooms.length,   label: 'Rooms & Labs',         cls: 'green'  },
          { icon: '📚', num: totalSubs,       label: 'Subjects Entered',     cls: 'yellow' },
          { icon: '📋', num: totalTT,         label: 'Classes with Timetable', cls: 'purple' },
        ].map(c => (
          <div key={c.label} className={`stat-card ${c.cls}`}>
            <div className="icon">{c.icon}</div>
            <div className="num">{c.num}</div>
            <div className="label">{c.label}</div>
          </div>
        ))}
      </div>

      {needsSetup && (
        <div className="card" style={{ borderColor: 'var(--accent)', background: 'var(--accentbg)' }}>
          <div className="card-header"><h3>🚀 Getting Started</h3></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: '.75rem', marginBottom: '1rem' }}>
            {[
              { step: 1, icon: '👥', text: 'Add Faculty list',    view: 'faculty'   },
              { step: 2, icon: '🏛️', text: 'Add Rooms & labs',   view: 'rooms'     },
              { step: 3, icon: '📚', text: 'Add Subjects',        view: 'subjects'  },
              { step: 4, icon: '⚡', text: 'Generate timetable',  view: 'generate'  },
              { step: 5, icon: '✏️', text: 'Edit if needed',      view: 'view-tt'   },
              { step: 6, icon: '📤', text: 'Export Excel/PDF',    view: 'export'    },
            ].map(s => (
              <div
                key={s.step}
                className="card"
                style={{ margin: 0, cursor: 'pointer' }}
                onClick={() => onNavigate(s.view)}
              >
                <div style={{ fontSize: '.65rem', fontWeight: 800, letterSpacing: '.08em', color: 'var(--accent2)' }}>STEP {s.step}</div>
                <div style={{ fontSize: '1.3rem', margin: '.3rem 0' }}>{s.icon}</div>
                <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><h3>Class Coverage</h3></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: '.75rem' }}>
          {BRANCHES.flatMap(b => YEARS.map(y => {
            const key  = `${b}_${y}`
            const subs = subjects[key] || []
            const tt   = timetable[key]
            const placed = tt ? Object.values(tt).reduce((a, d) => a + Object.values(d).length, 0) : 0
            const needed = subs.reduce((a, s) => a + s.periods, 0)
            const pct    = needed ? Math.round(placed / needed * 100) : 0
            const col    = pct === 100 ? 'var(--green)' : pct > 0 ? 'var(--yellow)' : 'var(--red)'
            return (
              <div
                key={key}
                className="card"
                style={{ margin: 0, cursor: 'pointer' }}
                onClick={() => onNavigate('view-tt')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.4rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '.88rem' }}>{b} Year {y}</span>
                  <span className={`tag ${pct === 100 ? 'green' : pct > 0 ? 'yellow' : 'red'}`}>
                    {pct === 100 ? '✓ Done' : pct > 0 ? pct + '%' : 'Not set'}
                  </span>
                </div>
                <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{subs.length} subjects · {placed}/{needed} periods</div>
                <div className="progress-bar" style={{ marginTop: '.5rem' }}>
                  <i style={{ width: pct + '%', background: col }} />
                </div>
              </div>
            )
          }))}
        </div>
      </div>
    </div>
  )
}
