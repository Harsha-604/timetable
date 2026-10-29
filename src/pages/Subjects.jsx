import { useState } from 'react'
import { useStore } from '../store/useStore'
import Modal from '../components/Modal'
import { BRANCHES, YEARS } from '../utils/constants'
import { uid } from '../utils/helpers'
import { importSubjectsFromFile } from '../utils/importer'
import { dlTemplate } from '../utils/exporter'

export default function Subjects() {
  const { faculty, subjects, addSubject, updateSubject, deleteSubject, clearClass, clearAllSubjects, mergeSubjects, toast } = useStore()
  const [branch, setBranch] = useState(BRANCHES[0])
  const [year, setYear]     = useState(YEARS[0])
  const [modal, setModal]   = useState(null)
  const [form, setForm]     = useState({})

  const key  = `${branch}_${year}`
  const subs = subjects[key] || []

  const openAdd  = () => { setForm({ name: '', code: '', type: 'Theory', periods: 3, block: 1, facultyId: '' }); setModal({}) }
  const openEdit = (s) => { setForm({ ...s }); setModal(s) }
  const closeModal = () => setModal(null)

  const save = () => {
    if (!form.name?.trim()) { toast('Subject name required', 'err'); return }
    const data = {
      name: form.name.trim(), code: form.code?.trim() || '',
      type: form.type || 'Theory', periods: parseInt(form.periods) || 1,
      block: parseInt(form.block) || 1, facultyId: form.facultyId || '',
    }
    if (modal?.id) { updateSubject(key, modal.id, data); toast('Updated', 'ok') }
    else { addSubject(key, { id: uid('s'), ...data }); toast('Added', 'ok') }
    closeModal()
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return
    try {
      const map = await importSubjectsFromFile(file, subjects, faculty)
      const total = Object.values(map).reduce((a, b) => a + b.length, 0)
      mergeSubjects(map)
      toast(`Imported ${total} subjects`, 'ok')
    } catch (err) { toast('Import failed: ' + err.message, 'err') }
    e.target.value = ''
  }

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <div><h2>Subjects</h2><p>Manage subjects per branch and year.</p></div>
          <div className="actions">
            <label className="filebtn">📊 Import Excel/CSV <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} hidden /></label>
            <button className="btn btn-secondary" onClick={() => dlTemplate('subjects')}>⬇ Template</button>
            {subs.length > 0 && (
              <button className="btn btn-danger btn-sm" onClick={() => { if (confirm(`Delete all ${subs.length} subjects for ${branch} Year ${year}?`)) { clearClass(key); toast('Cleared', 'ok') } }}>🗑 Clear This Class</button>
            )}
            {Object.values(subjects).some(a => a.length) && (
              <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Delete ALL subjects?')) { clearAllSubjects(); toast('All cleared', 'ok') } }}>🗑 Clear All</button>
            )}
            <button className="btn btn-primary" onClick={openAdd}>+ Add Subject</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--surface2)', fontSize: '.8rem', color: 'var(--muted)', padding: '.75rem 1rem' }}>
        <b>Excel columns:</b> <code>Branch</code>, <code>Year</code>, <code>Subject Name</code>, <code>Code</code>, <code>Type</code> (Theory/Lab/Project), <code>Periods/Week</code>, <code>Block</code> (1/2/3), <code>Faculty Short</code>
      </div>

      {/* Branch / Year selector */}
      <div className="toolbar">
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {BRANCHES.map(b => (
            <button key={b} className={`btn ${b === branch ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setBranch(b)}>{b}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginLeft: '.75rem' }}>
          {YEARS.map(y => (
            <button key={y} className={`btn ${y === year ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setYear(y)}>Year {y}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>{branch} — Year {year}</h3>
          <span className="tag">{subs.length} subjects · {subs.reduce((a, s) => a + s.periods, 0)} periods/wk</span>
        </div>
        {!subs.length ? (
          <div className="empty-state"><div className="icon">📚</div><p>No subjects for {branch} Year {year}.</p><button className="btn btn-primary" onClick={openAdd}>+ Add Subject</button></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Subject</th><th>Code</th><th>Type</th><th style={{ textAlign: 'right' }}>Periods</th><th style={{ textAlign: 'right' }}>Block</th><th>Faculty</th><th /></tr></thead>
              <tbody>
                {subs.map((s, i) => {
                  const fac = faculty.find(f => f.id === s.facultyId)
                  return (
                    <tr key={s.id}>
                      <td style={{ textAlign: 'right' }}>{i + 1}</td>
                      <td><b>{s.name}</b></td>
                      <td><code>{s.code || '—'}</code></td>
                      <td><span className={`tag ${s.type === 'Lab' ? 'green' : s.type === 'Project' ? 'purple' : ''}`}>{s.type}</span></td>
                      <td style={{ textAlign: 'right' }}>{s.periods}</td>
                      <td style={{ textAlign: 'right' }}>{s.block}</td>
                      <td>{fac ? <span className="tag">{fac.short}</span> : <span style={{ color: 'var(--muted)', fontSize: '.78rem' }}>—</span>}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>✏️</button>{' '}
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => { if (confirm('Delete?')) { deleteSubject(key, s.id); toast('Deleted', 'ok') } }}>🗑</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal !== null && (
        <Modal
          title={modal.id ? 'Edit Subject' : 'Add Subject'}
          onClose={closeModal}
          actions={<><button className="btn btn-ghost" onClick={closeModal}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}
        >
          <div className="field field-full"><label>Subject Name *</label><input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Blockchain Technologies" /></div>
          <div className="field"><label>Subject Code</label><input value={form.code || ''} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="22PC702CB" /></div>
          <div className="field">
            <label>Type</label>
            <select value={form.type || 'Theory'} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option>Theory</option><option>Lab</option><option>Project</option>
            </select>
          </div>
          <div className="field"><label>Periods / Week</label><input type="number" min="1" max="20" value={form.periods || 3} onChange={e => setForm(f => ({ ...f, periods: e.target.value }))} /></div>
          <div className="field">
            <label>Block Size</label>
            <select value={form.block || 1} onChange={e => setForm(f => ({ ...f, block: e.target.value }))}>
              <option value={1}>1 period</option><option value={2}>2 consecutive</option><option value={3}>3 consecutive</option>
            </select>
          </div>
          <div className="field field-full">
            <label>Assign Faculty (optional)</label>
            <select value={form.facultyId || ''} onChange={e => setForm(f => ({ ...f, facultyId: e.target.value }))}>
              <option value="">— Assign later —</option>
              {faculty.map(f => <option key={f.id} value={f.id}>{f.name} ({f.short})</option>)}
            </select>
          </div>
        </Modal>
      )}
    </div>
  )
}
