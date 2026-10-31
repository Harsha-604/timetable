import { useState, useRef } from 'react'
import { useStore } from '../store/useStore'
import Modal from '../components/Modal'
import { uid } from '../utils/helpers'
import { importFacultyFromFile } from '../utils/importer'
import { dlTemplate } from '../utils/exporter'

export default function Faculty() {
  const { faculty, addFaculty, updateFaculty, deleteFaculty, clearFaculty, setFaculty, replaceFacultyList, toast } = useStore()
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const fileInputRef = useRef(null)

  const filtered = search
    ? faculty.filter(
      (f) =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        f.short.toLowerCase().includes(search.toLowerCase()) ||
        (f.subjects && f.subjects.join(', ').toLowerCase().includes(search.toLowerCase()))
    )
    : faculty

  const openAdd = () => {
    setForm({ name: '', short: '', desg: '', dept: '', max: 30, subjects: '' })
    setModal({})
  }

  const openEdit = (f) => {
    setForm({
      ...f,
      subjects: Array.isArray(f.subjects) ? f.subjects.join(', ') : f.subjects || '',
      desg: f.desg || '',
      dept: f.dept || '',
      max: f.max ?? 30,
    })
    setModal(f)
  }

  const closeModal = () => setModal(null)

  const save = () => {
    const { name, short } = form
    if (!name?.trim() || !short?.trim()) {
      toast('Name and Short required', 'err')
      return
    }
    const subjectList = (form.subjects || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const data = {
      name: name.trim(),
      short: short.trim().toUpperCase(),
      desg: form.desg?.trim() || '',
      dept: form.dept?.trim() || '',
      max: parseInt(form.max, 10) || 30,
      subjects: subjectList,
    }

    if (modal?.id) {
      updateFaculty(modal.id, data)
      toast('Updated faculty', 'ok')
    } else {
      if (faculty.some((f) => f.short === data.short)) {
        toast('Short code already exists', 'err')
        return
      }
      addFaculty({ id: uid('f'), ...data })
      toast('Added faculty', 'ok')
    }
    closeModal()
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { list, added, updated, skipped, duplicates } = await importFacultyFromFile(file, faculty)
      replaceFacultyList(list)
      const msg = `Faculty: ${added} added, ${updated} updated${skipped ? `, ${skipped} skipped` : ''}`
      if (duplicates.length) toast(`${msg}. Duplicate Short Name in sheet (first row kept): ${duplicates.join(', ')}`, 'err')
      else toast(msg, 'ok')
    } catch (err) {
      toast('Import failed: ' + err.message, 'err')
    } finally {
      if (e.target) e.target.value = ''
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <div>
            <h2>Faculty</h2>
            <p>Add or upload faculty members, teaching limits, and subject qualifications.</p>
          </div>
          <div className="actions">
            <button
              className="btn btn-secondary filebtn"
              onClick={() => fileInputRef.current?.click()}
            >
              Import Excel/CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
            <button className="btn btn-secondary" onClick={() => dlTemplate('faculty')}>
              Download Template
            </button>
            {faculty.length > 0 && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (confirm(`Delete all ${faculty.length} faculty?`)) {
                    clearFaculty()
                    toast('Cleared', 'ok')
                  }
                }}
              >
                Clear All
              </button>
            )}
            <button className="btn btn-primary" onClick={openAdd}>
              + Add Faculty
            </button>
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{
          background: 'var(--surface2)',
          fontSize: '.8rem',
          color: 'var(--muted)',
          padding: '.75rem 1rem',
        }}
      >
        <b>Excel columns:</b> <code>Faculty Name</code>, <code>Short Name</code>, <code>Designation</code>,{' '}
        <code>Department</code>, <code>Max Periods/Week</code>, <code>Subjects</code> (comma-separated codes, e.g. BCT, DevOps Lab or scoped CIC-4:BCT)
      </div>

      <div className="card">
        <div className="toolbar">
          <input
            type="search"
            placeholder="Search faculty or subject…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '.4rem .7rem',
              color: 'var(--ink)',
              width: 250,
            }}
          />
          <span className="spacer" />
          <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
            {faculty.length} members
          </span>
        </div>

        {!filtered.length ? (
          <div className="empty-state">
            
            <p>{search ? 'No matching faculty found' : 'No faculty added yet.'}</p>
            {!search && (
              <button className="btn btn-primary" onClick={openAdd}>
                + Add Faculty
              </button>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Faculty Name</th>
                  <th>Short</th>
                  <th>Designation</th>
                  <th>Department</th>
                  <th style={{ textAlign: 'right' }}>Max/Wk</th>
                  <th>Qualified Subjects</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((f, i) => (
                  <tr key={f.id}>
                    <td style={{ textAlign: 'right' }}>{i + 1}</td>
                    <td>
                      <b>{f.name}</b>
                    </td>
                    <td>
                      <span className="tag">{f.short}</span>
                    </td>
                    <td>{f.desg || '—'}</td>
                    <td>{f.dept || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{f.max || '30'}</td>
                    <td style={{ maxWidth: 300 }}>
                      {Array.isArray(f.subjects) && f.subjects.length > 0 ? (
                        <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap' }}>
                          {f.subjects.map((sub, sIdx) => (
                            <span key={sIdx} className="tag" style={{ fontSize: '.68rem' }}>
                              {sub}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>Any / Unspecified</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(f)}>
                        Edit
                      </button>{' '}
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => {
                          if (confirm(`Delete ${f.name}?`)) {
                            deleteFaculty(f.id)
                            toast('Deleted', 'ok')
                          }
                        }}
                      >
                        Delete
                      </button>
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
          actions={
            <>
              <button className="btn btn-ghost" onClick={closeModal}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={save}>
                Save
              </button>
            </>
          }
        >
          <div className="field field-full">
            <label>Faculty Full Name *</label>
            <input
              value={form.name || ''}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Dr. A. Vasanthi"
            />
          </div>
          <div className="field">
            <label>Short Code *</label>
            <input
              value={form.short || ''}
              onChange={(e) => setForm((f) => ({ ...f, short: e.target.value.toUpperCase() }))}
              placeholder="e.g. AV"
            />
          </div>
          <div className="field">
            <label>Designation</label>
            <input
              value={form.desg || ''}
              onChange={(e) => setForm((f) => ({ ...f, desg: e.target.value }))}
              placeholder="e.g. Assoc Professor"
            />
          </div>
          <div className="field">
            <label>Department</label>
            <input
              value={form.dept || ''}
              onChange={(e) => setForm((f) => ({ ...f, dept: e.target.value }))}
              placeholder="e.g. CSE(CIC)"
            />
          </div>
          <div className="field">
            <label>Max Periods / Week</label>
            <input
              type="number"
              min="1"
              max="45"
              value={form.max ?? 30}
              onChange={(e) => setForm((f) => ({ ...f, max: e.target.value }))}
              placeholder="30"
            />
          </div>
          <div className="field field-full">
            <label>Qualified Subjects (comma-separated codes)</label>
            <textarea
              rows={3}
              value={form.subjects || ''}
              onChange={(e) => setForm((f) => ({ ...f, subjects: e.target.value }))}
              placeholder="e.g. BCT, DevOps Lab, PE-IV:SPSM or scoped CIC-4:BCT"
            />
            <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
              Faculty can teach across branches. Unscoped code matches all branch-years with that code.
            </span>
          </div>
        </Modal>
      )}
    </div>
  )
}
