import * as XLSX from 'xlsx'
import { uid, makeShort } from './helpers'
import { BRANCHES, YEARS } from './constants'

// ─── Raw sheet reader (auto-detects header row) ───────────────────────────────
export function readSheetRaw(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary' })
        const preferred = ['Teaching-Staff', 'teaching-staff', 'Faculty', 'faculty', 'Staff', 'staff']
        const sheetName = preferred.find(n => wb.SheetNames.includes(n)) || wb.SheetNames[0]
        const ws = wb.Sheets[sheetName]
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        let hdrIdx = -1
        for (let i = 0; i < Math.min(raw.length, 15); i++) {
          const row = raw[i].map(x => String(x || '').trim().toLowerCase())
          if (row.filter(x => x).length >= 2 && row.some(x => x === 'name' || x === 'name ')) {
            hdrIdx = i; break
          }
        }
        if (hdrIdx < 0) {
          for (let i = 0; i < Math.min(raw.length, 10); i++) {
            if (raw[i].filter(x => String(x || '').trim()).length >= 2) { hdrIdx = i; break }
          }
        }
        if (hdrIdx < 0) { reject(new Error('Could not find header row in file')); return }

        const headers = raw[hdrIdx].map(x => String(x || '').trim())
        const dataRows = raw.slice(hdrIdx + 1).filter(r => r.some(x => String(x || '').trim()))
        resolve({ headers, dataRows })
      } catch (err) { reject(err) }
    }
    reader.readAsBinaryString(file)
  })
}

// ─── Simple reader (uses row 1 as headers) ───────────────────────────────────
export function readSheetSimple(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        resolve(XLSX.utils.sheet_to_json(ws, { defval: '' }))
      } catch (err) { reject(err) }
    }
    reader.readAsBinaryString(file)
  })
}

// ─── Faculty importer ─────────────────────────────────────────────────────────
export async function importFacultyFromFile(file, existingFaculty) {
  const { headers, dataRows } = await readSheetRaw(file)
  const h = headers.map(x => String(x || '').trim().toLowerCase())
  const col = (variants) => {
    for (const v of variants) { const i = h.findIndex(x => x === v || x.startsWith(v)); if (i >= 0) return i }
    return -1
  }

  const iName = col(['name'])
  const iShort = col(['short', 'code', 'initials', 'abbr'])
  const iDept  = col(['department', 'dept', 'course', 'branch', 'section'])
  const iDesg  = col(['designation', 'desg', 'post', 'title'])
  const iMax   = col(['max periods/week', 'max periods', 'max', 'periods/week'])

  const result = []
  let skipped = 0
  const pool = [...existingFaculty]

  dataRows.forEach(r => {
    const name = iName >= 0 ? String(r[iName] || '').trim() : ''
    if (!name || typeof r[iName] === 'number') return
    if (['name', 's.no.', ''].includes(name.toLowerCase())) return

    let short = iShort >= 0 ? String(r[iShort] || '').trim().toUpperCase() : ''
    if (!short) short = makeShort(name)
    if (!short) { skipped++; return }

    let finalShort = short, attempt = 1
    while (pool.some(x => x.short === finalShort)) finalShort = short + (++attempt)

    const dept = iDept >= 0 ? String(r[iDept] || '').trim() : ''
    const desg = iDesg >= 0 ? String(r[iDesg] || '').trim() : ''
    const max  = iMax  >= 0 ? String(r[iMax]  || '').trim() : ''
    const entry = { id: uid('f'), name, short: finalShort, dept: dept || desg, max }
    pool.push(entry)
    result.push(entry)
  })

  return { imported: result, skipped }
}

// ─── Rooms importer ───────────────────────────────────────────────────────────
export async function importRoomsFromFile(file, existingRooms) {
  const rows = await readSheetSimple(file)
  const result = []
  rows.forEach(r => {
    const name = (r.Name || r.name || r[0] || '').toString().trim()
    if (!name || existingRooms.some(x => x.name === name)) return
    result.push({
      id: uid('r'),
      name,
      type: (r.Type || r.type || r[1] || 'Classroom').toString().trim(),
      capacity: (r.Capacity || r.capacity || r[2] || '').toString().trim(),
    })
  })
  return result
}

// ─── Subjects importer ────────────────────────────────────────────────────────
export async function importSubjectsFromFile(file, existingSubjects, faculty) {
  const rows = await readSheetSimple(file)
  const result = {}
  rows.forEach(r => {
    const branch = (r.Branch || r.branch || r[0] || '').toString().trim()
    const year   = parseInt((r.Year   || r.year   || r[1] || 0).toString())
    const name   = (r['Subject Name'] || r.name   || r[2] || '').toString().trim()
    if (!branch || !year || !name || !BRANCHES.includes(branch) || !YEARS.includes(year)) return
    const key = `${branch}_${year}`
    if (!result[key]) result[key] = []
    if ((existingSubjects[key] || []).some(x => x.name === name) || result[key].some(x => x.name === name)) return
    const fShort = (r['Faculty Short'] || r.faculty || r[7] || '').toString().trim()
    const fac = faculty.find(f => f.short === fShort) || null
    result[key].push({
      id: uid('s'), name,
      code:      (r.Code            || r.code      || r[3] || '').toString().trim(),
      type:      (r.Type            || r.type      || r[4] || 'Theory').toString().trim(),
      periods:   parseInt((r['Periods/Week'] || r.periods || r[5] || 3).toString()) || 3,
      block:     parseInt((r.Block  || r.block     || r[6] || 1).toString()) || 1,
      facultyId: fac ? fac.id : '',
    })
  })
  return result
}
