import { useStore } from '../store/useStore'
import { BRANCHES, YEARS } from '../utils/constants'
import { exportExcel, exportAllExcel, exportPDF, exportAllPDF } from '../utils/exporter'

export default function Export() {
  const state = useStore()
  const { timetable, toast } = state

  const hasT = (b, y) => {
    const tt = timetable[`${b}_${y}`]
    return tt && Object.keys(tt).length > 0
  }

  return (
    <div>
      <div className="page-header">
        <div className="row"><div><h2>Export</h2><p>Download timetables as Excel or PDF.</p></div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {BRANCHES.flatMap(b => YEARS.map(y => {
          const has = hasT(b, y)
          return (
            <div key={`${b}_${y}`} className="card" style={{ margin: 0 }}>
              <div className="card-header">
                <h3>{b} — Year {y}</h3>
                <span className={`tag ${has ? 'green' : 'red'}`}>{has ? 'Ready' : 'No timetable'}</span>
              </div>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button className="btn btn-secondary btn-sm" disabled={!has} onClick={() => { exportExcel(b, y, state); toast('Downloaded', 'ok') }}>📊 Excel</button>
                <button className="btn btn-secondary btn-sm" disabled={!has} onClick={() => { exportPDF(b, y, state); toast('Downloaded', 'ok') }}>📄 PDF</button>
              </div>
            </div>
          )
        }))}
      </div>

      <div className="card">
        <div className="card-header"><h3>Export All</h3></div>
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => { if (exportAllExcel(state)) toast('All exported to Excel', 'ok'); else toast('No timetables to export', 'err') }}>
            📊 All Branches → Excel
          </button>
          <button className="btn btn-primary" onClick={() => { if (exportAllPDF(state)) toast('All exported to PDF', 'ok'); else toast('No timetables to export', 'err') }}>
            📄 All Branches → PDF
          </button>
        </div>
      </div>
    </div>
  )
}
