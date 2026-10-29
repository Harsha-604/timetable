import { useState } from 'react'
import { useStore } from '../store/useStore'
import { BRANCHES, YEARS, DEFAULT_PERIODS, DAYS_ORDER } from '../utils/constants'
import { uid } from '../utils/helpers'

export default function Settings() {
  const { settings, toggleDay, setPeriods, resetPeriods, toast } = useStore()
  const [periods, setPeriodState] = useState(() => JSON.parse(JSON.stringify(settings.periods)))

  const updatePeriod = (i, field, val) => {
    const p = [...periods]; p[i] = { ...p[i], [field]: field === 'brk' ? val : val }; setPeriodState(p)
  }
  const addPeriod = () => setPeriodState(p => [...p, { id: uid('p'), label: String(p.length), start: '', end: '', brk: false }])
  const removePeriod = (i) => setPeriodState(p => p.filter((_, j) => j !== i))
  const savePeriods = () => { setPeriods(periods); toast('Periods saved!', 'ok') }
  const doReset = () => { const d = JSON.parse(JSON.stringify(DEFAULT_PERIODS)); setPeriodState(d); resetPeriods(); toast('Reset to default', 'ok') }

  return (
    <div>
      <div className="page-header">
        <div className="row"><div><h2>Settings &amp; Periods</h2><p>Configure working days per class and the daily period schedule.</p></div></div>
      </div>

      {/* Working days table */}
      <div className="card">
        <div className="card-header">
          <h3>📅 Working Days per Branch &amp; Year</h3>
          <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Each class can have its own set of working days</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 600, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '.5rem .75rem', textAlign: 'left', fontSize: '.75rem', color: 'var(--muted)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>Branch / Year</th>
                {YEARS.map(y => (
                  <th key={y} style={{ padding: '.5rem .75rem', textAlign: 'center', fontSize: '.75rem', color: 'var(--muted)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>Year {y}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BRANCHES.map(b => (
                <tr key={b}>
                  <td style={{ padding: '.6rem .75rem', fontWeight: 700, fontSize: '.88rem', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>{b}</td>
                  {YEARS.map(y => {
                    const key = `${b}_${y}`
                    const cur = settings.days[key] || []
                    return (
                      <td key={y} style={{ padding: '.4rem .6rem', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
                          {DAYS_ORDER.map(d => (
                            <label key={d} style={{ display: 'flex', alignItems: 'center', gap: '.2rem', fontSize: '.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              <input type="checkbox" checked={cur.includes(d)} onChange={e => toggleDay(key, d, e.target.checked)} />
                              {d}
                            </label>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Period schedule */}
      <div className="card">
        <div className="card-header">
          <h3>⏰ Daily Period Schedule</h3>
          <button className="btn btn-secondary btn-sm" onClick={addPeriod}>+ Add Period</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {periods.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', gap: '.5rem', alignItems: 'center', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '.5rem .75rem' }}>
              <input value={p.label} onChange={e => updatePeriod(i, 'label', e.target.value)} style={{ width: 60 }} placeholder="Label" />
              <input type="time" value={p.start} onChange={e => updatePeriod(i, 'start', e.target.value)} style={{ width: 110 }} />
              <span style={{ color: 'var(--muted)' }}>→</span>
              <input type="time" value={p.end} onChange={e => updatePeriod(i, 'end', e.target.value)} style={{ width: 110 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '.3rem', fontSize: '.82rem', cursor: 'pointer', marginLeft: '.5rem' }}>
                <input type="checkbox" checked={!!p.brk} onChange={e => updatePeriod(i, 'brk', e.target.checked)} /> Break
              </label>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', color: 'var(--red)' }} onClick={() => removePeriod(i)}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '.75rem', display: 'flex', gap: '.5rem' }}>
          <button className="btn btn-primary" onClick={savePeriods}>Save Periods</button>
          <button className="btn btn-ghost" onClick={doReset}>Reset to Default</button>
        </div>
      </div>
    </div>
  )
}
