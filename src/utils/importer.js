import * as XLSX from 'xlsx'
import { uid, makeShort, getBranchYearKey, normalizeKey } from './helpers'
import { BRANCHES, YEARS } from './constants'

/**
 * Reads an Excel or CSV file as an ArrayBuffer and parses it with XLSX.read(..., {type: 'array'}).
 * Automatically detects the header row by searching for the row with non-empty cells.
 * Trims and lowercases headers for matching.
 */
export function readSheetArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const sheetName = wb.SheetNames[0]
        const ws = wb.Sheets[sheetName]
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        if (!raw.length) {
          resolve({ headers: [], dataRows: [] })
          return
        }

        // Auto-detect header row
        let hdrIdx = 0
        for (let i = 0; i < Math.min(raw.length, 15); i++) {
          const row = raw[i].map((x) => String(x || '').trim())
          const valid = row.filter(Boolean)
          if (valid.length >= 2) {
            hdrIdx = i
            break
          }
        }

        const headers = raw[hdrIdx].map((x) => String(x || '').trim())
        const dataRows = raw.slice(hdrIdx + 1).filter((r) => r.some((x) => String(x || '').trim()))

        resolve({ headers, dataRows })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = (err) => reject(err)
    reader.readAsArrayBuffer(file)
  })
}

function findColIdx(headers, variants) {
  const normHeaders = headers.map((h) => String(h || '').trim().toLowerCase())
  for (const v of variants) {
    const target = v.toLowerCase()
    const idx = normHeaders.findIndex(
      (h) => h === target || h.replace(/\s+/g, '') === target.replace(/\s+/g, '')
    )
    if (idx >= 0) return idx
  }
  for (const v of variants) {
    const target = v.toLowerCase()
    const idx = normHeaders.findIndex((h) => h.startsWith(target))
    if (idx >= 0) return idx
  }
  return -1
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
const norm = (v) => String(v ?? '').trim()
const lc = (v) => norm(v).toLowerCase()

// ─── Faculty Importer ─────────────────────────────────────────────────────────
// Columns: Faculty Name | Short Name | Designation | Department | Max Periods/Week | Subjects
// Upsert by Short Name (case-insensitive). Existing faculty keep their id, so
// assignments and timetables stay linked. Faculty not in the sheet are kept.
export async function importFacultyFromFile(file, existingFaculty = []) {
  const { headers, dataRows } = await readSheetArrayBuffer(file)

  const iName = findColIdx(headers, ['faculty name', 'name', 'faculty'])
  const iShort = findColIdx(headers, ['short name', 'short', 'code', 'initials', 'abbr'])
  const iDesg = findColIdx(headers, ['designation', 'desg', 'post', 'title'])
  const iDept = findColIdx(headers, ['department', 'dept', 'branch', 'course'])
  const iMax = findColIdx(headers, ['max periods/week', 'max periods', 'max', 'periods/week'])
  const iSubs = findColIdx(headers, ['subjects', 'subject codes', 'courses', 'subject'])
  if (iName < 0) throw new Error('No "Faculty Name" column found')

  const list = existingFaculty.map((f) => ({ ...f }))
  const seenInSheet = new Set()
  const duplicates = []
  let added = 0
  let updated = 0
  let skipped = 0

  dataRows.forEach((r) => {
    const name = norm(r[iName])
    if (!name || ['name', 's.no.', 'sno', 'sl.no'].includes(name.toLowerCase())) return

    const short = (iShort >= 0 ? norm(r[iShort]) : '') || makeShort(name)
    if (!short) { skipped++; return }

    if (seenInSheet.has(short.toLowerCase())) { duplicates.push(short); return }
    seenInSheet.add(short.toLowerCase())

    const maxVal = iMax >= 0 ? parseInt(r[iMax], 10) : NaN
    const data = {
      name,
      short,
      desg: iDesg >= 0 ? norm(r[iDesg]) : '',
      dept: iDept >= 0 ? norm(r[iDept]) : '',
      max: Number.isFinite(maxVal) && maxVal > 0 ? maxVal : 30,
      subjects: (iSubs >= 0 ? norm(r[iSubs]) : '').split(',').map((s) => s.trim()).filter(Boolean),
    }

    const idx = list.findIndex((f) => lc(f.short) === short.toLowerCase())
    if (idx >= 0) { list[idx] = { ...list[idx], ...data }; updated++ }
    else { list.push({ id: uid('f'), ...data }); added++ }
  })

  return { list, added, updated, skipped, duplicates }
}

// ─── Rooms Importer ───────────────────────────────────────────────────────────
// Columns: Room No | Type (Classroom/Lab) | Lab Name | Capacity
// Upsert by Room No (case-insensitive).
export async function importRoomsFromFile(file, existingRooms = []) {
  const { headers, dataRows } = await readSheetArrayBuffer(file)

  const iRoom = findColIdx(headers, ['room no', 'room', 'name', 'roomno'])
  const iType = findColIdx(headers, ['type', 'room type'])
  const iLab = findColIdx(headers, ['lab name', 'lab', 'labname'])
  const iCap = findColIdx(headers, ['capacity', 'seats', 'cap'])
  if (iRoom < 0) throw new Error('No "Room No" column found')

  const list = existingRooms.map((r) => ({ ...r }))
  const seenInSheet = new Set()
  const duplicates = []
  let added = 0
  let updated = 0

  dataRows.forEach((r) => {
    const roomNo = norm(r[iRoom])
    if (!roomNo || ['room no', 's.no.', 'room'].includes(roomNo.toLowerCase())) return

    if (seenInSheet.has(roomNo.toLowerCase())) { duplicates.push(roomNo); return }
    seenInSheet.add(roomNo.toLowerCase())

    const labName = iLab >= 0 ? norm(r[iLab]) : ''
    const rawType = iType >= 0 ? norm(r[iType]) : ''
    const data = {
      name: roomNo,
      roomNo,
      type: /lab/i.test(rawType) || labName ? 'Lab' : 'Classroom',
      labName,
      capacity: iCap >= 0 ? norm(r[iCap]) : '',
    }

    const idx = list.findIndex((x) => lc(x.roomNo || x.name) === roomNo.toLowerCase())
    if (idx >= 0) { list[idx] = { ...list[idx], ...data }; updated++ }
    else { list.push({ id: uid('r'), ...data }); added++ }
  })

  return { list, added, updated, duplicates }
}

// ─── Subjects Importer ────────────────────────────────────────────────────────
// Columns: Branch | Year | Subject Code | Subject Name | Type (Theory/Lab/Project) |
// Periods/Week | Block Size | Faculty Required | Lab Room | Common Slot Group
// Upsert by Branch-Year + Subject Code (case-insensitive). Existing subjects keep
// their id. Returns the full merged map; use replaceSubjects with it.
export async function importSubjectsFromFile(file, existingSubjects = {}) {
  const { headers, dataRows } = await readSheetArrayBuffer(file)

  const iBranch = findColIdx(headers, ['branch', 'dept'])
  const iYear = findColIdx(headers, ['year'])
  const iCode = findColIdx(headers, ['subject code', 'code', 'sub code', 'short'])
  const iName = findColIdx(headers, ['subject name', 'name', 'subject'])
  const iType = findColIdx(headers, ['type', 'sub type'])
  const iPeriods = findColIdx(headers, ['periods/week', 'periods', 'period'])
  const iBlock = findColIdx(headers, ['block size', 'block', 'blocksize'])
  const iFacReq = findColIdx(headers, ['faculty required', 'faculty req', 'teachers', 'fac req'])
  const iLabRoom = findColIdx(headers, ['lab room', 'lab room no', 'lab', 'room'])
  const iGroup = findColIdx(headers, ['common slot group', 'common slot', 'common group', 'group', 'slot group'])
  if (iBranch < 0 || iYear < 0) throw new Error('No "Branch" or "Year" column found')

  const map = {}
  Object.entries(existingSubjects).forEach(([k, arr]) => {
    map[normalizeKey(k)] = (arr || []).map((s) => ({ ...s }))
  })

  const seenInSheet = new Set()
  const duplicates = []
  const unknown = []
  let added = 0
  let updated = 0

  dataRows.forEach((r, i) => {
    const branch = norm(r[iBranch]).toUpperCase()
    const year = parseInt(norm(r[iYear]), 10)
    const name = iName >= 0 ? norm(r[iName]) : ''
    const code = (iCode >= 0 ? norm(r[iCode]) : '') || name
    if (!branch && !year && !code) return

    if (!BRANCHES.includes(branch) || !YEARS.includes(year) || !code) {
      unknown.push(`row ${i + 2}: ${branch || '?'} ${year || '?'} ${code || '?'}`)
      return
    }

    const byKey = getBranchYearKey(branch, year)
    const sheetKey = `${byKey}|${code.toLowerCase()}`
    if (seenInSheet.has(sheetKey)) { duplicates.push(`${byKey} ${code}`); return }
    seenInSheet.add(sheetKey)

    const rawType = iType >= 0 ? norm(r[iType]) : ''
    const type = /lab/i.test(rawType) ? 'Lab' : /proj/i.test(rawType) ? 'Project' : 'Theory'
    const defaultFacReq = type === 'Lab' ? 2 : 1
    const data = {
      name: name || code,
      code,
      type,
      periods: (iPeriods >= 0 && parseInt(r[iPeriods], 10)) || 3,
      block: (iBlock >= 0 && parseInt(r[iBlock], 10)) || 1,
      facultyReq: (iFacReq >= 0 && parseInt(r[iFacReq], 10)) || defaultFacReq,
      labRoomId: iLabRoom >= 0 ? norm(r[iLabRoom]) : '',
      commonGroup: iGroup >= 0 ? norm(r[iGroup]) : '',
    }

    const arr = (map[byKey] ||= [])
    const idx = arr.findIndex((s) => lc(s.code) === code.toLowerCase())
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...data }; updated++ }
    else { arr.push({ id: uid('s'), ...data }); added++ }
  })

  return { map, added, updated, duplicates, unknown }
}