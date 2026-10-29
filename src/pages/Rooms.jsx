import { useState } from 'react'
import { useStore } from '../store/useStore'
import Modal from '../components/Modal'
import { uid } from '../utils/helpers'
import { importRoomsFromFile } from '../utils/importer'
import { dlTemplate } from '../utils/exporter'

export default function Rooms() {
  const { rooms, addRoom, updateRoom, deleteRoom, clearRooms, setRooms, toast } = useStore()
  const [modal, setModal] = useState(null)
  const [form, setForm]   = useState({})

  const openAdd  = () => { setForm({ name: '', type: 'Classroom', capacity: '' }); setModal({}) }
  const openEdit = (r) => { setForm({ ...r }); setModal(r) }
  const closeModal = () => setModal(null)

  const save = () => {
    if (!form.name?.trim()) { toast('Room name required', 'err'); return }
    const data = { name: form.name.trim(), type: form.type || 'Classroom', capacity: form.capacity || '' }
    if (modal?.id) { updateRoom(modal.id, data); toast('Updated', 'ok') }
    else { addRoom({ id: uid('r'), ...data }); toast('Added', 'ok') }
    closeModal()
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return
    try {
      const imported = await importRoomsFromFile(file, rooms)
      setRooms(imported)
      toast(`Imported ${imported.length} rooms`, 'ok')
    } catch (err) { toast('Import failed: ' + err.message, 'err') }
    e.target.value = ''
  }

  const byType = (type) => rooms.filter(r => r.type === type).length

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <div><h2>Rooms &amp; Labs</h2><p>Add all available classrooms and labs.</p></div>
          <div className="actions">
            <label className="filebtn">📊 Import Excel/CSV <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} hidden /></label>
            <button className="btn btn-secondary" onClick={() => dlTemplate('rooms')}>⬇ Template</button>
            {rooms.length > 0 && (
              <button className="btn btn-danger btn-sm" onClick={() => { if (confirm(`Delete all ${rooms.length} rooms?`)) { clearRooms(); toast('Cleared', 'ok') } }}>🗑 Clear All</button>
            )}
            <button className="btn btn-primary" onClick={openAdd}>+ Add Room</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--surface2)', fontSize: '.8rem', color: 'var(--muted)', padding: '.75rem 1rem' }}>
        <b>Excel columns:</b> <code>Name</code>, <code>Type</code> (Classroom / Lab / Seminar Hall), <code>Capacity</code>
      </div>

      {rooms.length > 0 && (
        <div className="stats-row" style={{ marginBottom: '1rem' }}>
          {[['Classroom','blue'],['Lab','green'],['Seminar Hall','yellow']].map(([t, c]) => (
            <div key={t} className={`stat-card ${c}`} style={{ padding: '.75rem 1rem' }}>
              <div className="num">{byType(t)}</div><div className="label">{t}s</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        {!rooms.length ? (
          <div className="empty-state"><div className="icon">🏛️</div><p>No rooms added yet.</p><button className="btn btn-primary" onClick={openAdd}>+ Add Room</button></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Room</th><th>Type</th><th>Capacity</th><th /></tr></thead>
              <tbody>
                {rooms.map((r, i) => (
                  <tr key={r.id}>
                    <td style={{ textAlign: 'right' }}>{i + 1}</td>
                    <td><b>{r.name}</b></td>
                    <td><span className={`tag ${r.type === 'Lab' ? 'green' : ''}`}>{r.type}</span></td>
                    <td style={{ textAlign: 'right' }}>{r.capacity || '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>✏️</button>{' '}
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => { if (confirm('Delete?')) { deleteRoom(r.id); toast('Deleted', 'ok') } }}>🗑</button>
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
          title={modal.id ? 'Edit Room' : 'Add Room'}
          onClose={closeModal}
          actions={<><button className="btn btn-ghost" onClick={closeModal}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}
        >
          <div className="field field-full"><label>Room Name *</label><input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="CS-111" /></div>
          <div className="field">
            <label>Type</label>
            <select value={form.type || 'Classroom'} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option>Classroom</option><option>Lab</option><option>Seminar Hall</option>
            </select>
          </div>
          <div className="field"><label>Capacity</label><input type="number" value={form.capacity || ''} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} placeholder="60" /></div>
        </Modal>
      )}
    </div>
  )
}
