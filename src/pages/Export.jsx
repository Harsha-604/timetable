import { useStore } from '../store/useStore'
import { exportExcel, exportAllExcel, exportPDF, exportAllPDF } from '../utils/exporter'

export default function Export() {
  const state = useStore()
  const { classes, timetable, toast } = state

  const hasTimetable = (classId) => {
    const tt = timetable[classId]
    return tt && Object.keys(tt).length > 0
  }

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <div>
            <h2>Export Timetables</h2>
            <p>Download official timetables in Excel or PDF format per class or for the entire department.</p>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        {classes.map((cls) => {
          const ready = hasTimetable(cls.id)
          return (
            <div key={cls.id} className="card" style={{ margin: 0 }}>
              <div className="card-header">
                <div>
                  <h3 style={{ margin: 0 }}>{cls.id}</h3>
                  <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>
                    {cls.branch} Year {cls.year} (Sem {cls.semester || 'VII'})
                  </span>
                </div>
                <span
                  className={`tag ${ready ? 'green' : 'red'}`}
                  style={{ marginLeft: 'auto' }}
                >
                  {ready ? 'Ready' : 'No timetable'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!ready}
                  onClick={() => {
                    exportExcel(cls.id, state)
                    toast(`Exported ${cls.id} to Excel`, 'ok')
                  }}
                >
                  Excel
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!ready}
                  onClick={() => {
                    exportPDF(cls.id, state)
                    toast(`Exported ${cls.id} to PDF`, 'ok')
                  }}
                >
                  PDF
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Batch Export (All Classes)</h3>
        </div>
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (exportAllExcel(state)) {
                toast('All timetables exported to Excel workbook!', 'ok')
              } else {
                toast('No timetables available to export', 'err')
              }
            }}
          >
            All Classes → Single Excel Workbook
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (exportAllPDF(state)) {
                toast('All timetables exported to multi-page PDF!', 'ok')
              } else {
                toast('No timetables available to export', 'err')
              }
            }}
          >
            All Classes → Multi-Page PDF
          </button>
        </div>
      </div>
    </div>
  )
}
