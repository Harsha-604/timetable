import { useState } from 'react'
import { useStore } from '../store/useStore'
import Modal from '../components/Modal'
import { uid } from '../utils/helpers'
import { importFacultyFromFile } from '../utils/importer'
import { dlTemplate } from '../utils/exporter'


export default function Faculty() {
  const { faculty, addFaculty, updateFaculty, deleteFaculty, clearFaculty, setFaculty, toast } = useStore()
  const [search, setSearch]   = useState('')
  const [modal, setModal]     = useState(null) // null | { id?, name, short, dept, max }
  const [form, setForm]       = useState({})

  const filtered = search
    ? faculty.filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || f.short.toLowerCase().includes(search.toLowerCase()))
    : faculty

  const openAdd  = () => { setForm({ name: '', short: '', dept: '', max: '' }); setModal({}) }
  const openEdit = (f) => { setForm({ ...f }); setModal(f) }
  const closeModal = () => setModal(null)

  const save = () => {
    const { name, short } = form
    if (!name?.trim() || !short?.trim()) { toast('Name and Short required', 'err'); return }
    const data = { name: name.trim(), short: short.trim().toUpperCase(), dept: form.dept?.trim() || '', max: form.max || '' }
    if (modal?.id) { updateFaculty(modal.id, data); toast('Updated', 'ok') }
    else {
      if (faculty.some(f => f.short === data.short)) { toast('Short code already exists', 'err'); return }
      addFaculty({ id: uid('f'), ...data }); toast('Added', 'ok')
    }
    closeModal()
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return
    try {
      const { imported, skipped } = await importFacultyFromFile(file, faculty)
      setFaculty(imported)
      toast(`Imported ${imported.length} faculty${skipped ? ` (${skipped} skipped)` : ''}`, 'ok')
    } catch (err) { toast('Import failed: ' + err.message, 'err') }
    e.target.value = ''
  }

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <div><h2>Faculty</h2><p>Add or upload all faculty members.</p></div>
          <div className="actions">
            <label className="filebtn">📊 Import Excel/CSV <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} hidden /></label>
            <button className="btn btn-secondary" onClick={() => dlTemplate('faculty')}>⬇ Template</button>
            {faculty.length > 0 && (
              <button className="btn btn-danger btn-sm" onClick={() => { if (confirm(`Delete all ${faculty.length} faculty?`)) { clearFaculty(); toast('Cleared', 'ok') } }}>🗑 Clear All</button>
            )}
            <button className="btn btn-primary" onClick={openAdd}>+ Add Faculty</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--surface2)', fontSize: '.8rem', color: 'var(--muted)', padding: '.75rem 1rem' }}>
        <b>Excel columns accepted:</b> <code>Name</code>, <code>Short</code> (optional — auto from initials), <code>Department</code> or <code>Course</code>, <code>Designation</code>, <code>Max Periods/Week</code>
        <span style={{ display: 'block', marginTop: '.3rem' }}>ℹ️ Header row auto-detected — skips college title rows.</span>
      </div>

      <div className="card">
        <div className="toolbar">
          <input type="search" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '.4rem .7rem', color: 'var(--ink)', width: 200 }} />
          <span className="spacer" />
          <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{faculty.length} members</span>
        </div>

        {!filtered.length ? (
          <div className="empty-state">
            <div className="icon">👥</div>
            <p>{search ? 'No results' : 'No faculty added yet.'}</p>
            {!search && <button className="btn btn-primary" onClick={openAdd}>+ Add Faculty</button>}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Name</th><th>Short</th><th>Dept</th><th>Max/Wk</th><th /></tr></thead>
              <tbody>
                {filtered.map((f, i) => (
                  <tr key={f.id}>
                    <td style={{ textAlign: 'right' }}>{i + 1}</td>
                    <td><b>{f.name}</b></td>
                    <td><span className="tag">{f.short}</span></td>
                    <td>{f.dept || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{f.max || '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(f)}>✏️</button>{' '}
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => { if (confirm('Delete?')) { deleteFaculty(f.id); toast('Deleted', 'ok') } }}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal !== null && (
        <Modal
          title={modal.id ? 'Edit Faculty' : 'Add Faculty'}
          onClose={closeModal}
          actions={<><button className="btn btn-ghost" onClick={closeModal}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}
        >
          <div className="field field-full"><label>Full Name *</label><input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Dr. A. Vasanthi" /></div>
          <div className="field"><label>Short Code *</label><input value={form.short || ''} onChange={e => setForm(f => ({ ...f, short: e.target.value.toUpperCase() }))} placeholder="AV" /></div>
          <div className="field"><label>Department</label><input value={form.dept || ''} onChange={e => setForm(f => ({ ...f, dept: e.target.value }))} placeholder="CSE(CIC)" /></div>
          <div className="field"><label>Max Periods/Week</label><input type="number" min="1" max="40" value={form.max || ''} onChange={e => setForm(f => ({ ...f, max: e.target.value }))} placeholder="30" /></div>
        </Modal>
      )}
    </div>
  )
}
