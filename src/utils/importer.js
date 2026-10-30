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

// ─── Faculty Importer ─────────────────────────────────────────────────────────
// Columns: Faculty Name | Short Name | Designation | Department | Max Periods/Week | Subjects
export async function importFacultyFromFile(file, existingFaculty = []) {
  const { headers, dataRows } = await readSheetArrayBuffer(file)

  const iName = findColIdx(headers, ['faculty name', 'name', 'faculty'])
  const iShort = findColIdx(headers, ['short name', 'short', 'code', 'initials', 'abbr'])
  const iDesg = findColIdx(headers, ['designation', 'desg', 'post', 'title'])
  const iDept = findColIdx(headers, ['department', 'dept', 'branch', 'course'])
  const iMax = findColIdx(headers, ['max periods/week', 'max periods', 'max', 'periods/week'])
  const iSubs = findColIdx(headers, ['subjects', 'subject codes', 'courses', 'subject'])

  const result = []
  let skipped = 0
  const pool = [...existingFaculty]

  dataRows.forEach((r) => {
    const name = iName >= 0 ? String(r[iName] || '').trim() : ''
    if (!name || ['name', 's.no.', 'sno', 'sl.no'].includes(name.toLowerCase())) {
      return
    }

    let short = iShort >= 0 ? String(r[iShort] || '').trim().toUpperCase() : ''
    if (!short) short = makeShort(name)
    if (!short) {
      skipped++
      return
    }

    // Check duplicate short in existing pool or current batch
    if (pool.some((x) => x.short === short)) {
      // Keep duplicate short to trigger validation report or append number if unassigned
      let disambiguated = short
      let counter = 2
      while (pool.some((x) => x.short === disambiguated)) {
        disambiguated = `${short}${counter++}`
      }
      short = disambiguated
    }

    const desg = iDesg >= 0 ? String(r[iDesg] || '').trim() : ''
    const dept = iDept >= 0 ? String(r[iDept] || '').trim() : ''
    const maxVal = iMax >= 0 ? parseInt(r[iMax], 10) : 30
    const rawSubs = iSubs >= 0 ? String(r[iSubs] || '').trim() : ''

    const subjects = rawSubs
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const entry = {
      id: uid('f'),
      name,
      short,
      desg,
      dept,
      max: Number.isFinite(maxVal) && maxVal > 0 ? maxVal : 30,
      subjects,
    }

    pool.push(entry)
    result.push(entry)
  })

  return { imported: result, skipped }
}

// ─── Rooms Importer ───────────────────────────────────────────────────────────
// Columns: Room No | Type (Classroom/Lab) | Lab Name (e.g. LAB-5, blank for classrooms) | Capacity
export async function importRoomsFromFile(file, existingRooms = []) {
  const { headers, dataRows } = await readSheetArrayBuffer(file)

  const iRoom = findColIdx(headers, ['room no', 'room', 'name', 'roomno'])
  const iType = findColIdx(headers, ['type', 'room type'])
  const iLab = findColIdx(headers, ['lab name', 'lab', 'labname'])
  const iCap = findColIdx(headers, ['capacity', 'seats', 'cap'])

  const result = []

  dataRows.forEach((r) => {
    const roomNo = iRoom >= 0 ? String(r[iRoom] || '').trim() : ''
    if (!roomNo || ['room no', 's.no.', 'room'].includes(roomNo.toLowerCase())) return

    // Don't add duplicate room numbers
    if (existingRooms.some((x) => (x.roomNo || x.name) === roomNo) || result.some((x) => x.roomNo === roomNo)) {
      return
    }

    let rawType = iType >= 0 ? String(r[iType] || '').trim() : 'Classroom'
    const isLab = /lab/i.test(rawType) || (iLab >= 0 && Boolean(String(r[iLab] || '').trim()))
    const type = isLab ? 'Lab' : 'Classroom'
    const labName = iLab >= 0 ? String(r[iLab] || '').trim() : ''
    const cap = iCap >= 0 ? String(r[iCap] || '').trim() : ''

    result.push({
      id: uid('r'),
      name: roomNo,
      roomNo,
      type,
      labName,
      capacity: cap,
    })
  })

  return result
}

// ─── Subjects Importer ────────────────────────────────────────────────────────
// Columns: Branch | Year | Subject Code | Subject Name | Type (Theory/Lab/Project) |
// Periods/Week | Block Size | Faculty Required | Lab Room | Common Slot Group
export async function importSubjectsFromFile(file, existingSubjects = {}, rooms = []) {
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

  const result = {}

  dataRows.forEach((r) => {
    const branch = iBranch >= 0 ? String(r[iBranch] || '').trim().toUpperCase() : ''
    const year = iYear >= 0 ? parseInt(String(r[iYear] || '').trim(), 10) : 0
    const name = iName >= 0 ? String(r[iName] || '').trim() : ''
    let code = iCode >= 0 ? String(r[iCode] || '').trim() : ''
    if (!code && name) code = name

    if (!branch || !year || !name) return

    const byKey = getBranchYearKey(branch, year)
    if (!result[byKey]) result[byKey] = []

    const currentClassSubjects = existingSubjects[byKey] || []
    if (
      currentClassSubjects.some((s) => s.code === code || s.name === name) ||
      result[byKey].some((s) => s.code === code || s.name === name)
    ) {
      return
    }

    let type = iType >= 0 ? String(r[iType] || '').trim() : 'Theory'
    if (/lab/i.test(type)) type = 'Lab'
    else if (/proj/i.test(type)) type = 'Project'
    else type = 'Theory'

    const periods = iPeriods >= 0 ? parseInt(r[iPeriods], 10) || 3 : 3
    const block = iBlock >= 0 ? parseInt(r[iBlock], 10) || 1 : 1
    const defaultFacReq = type === 'Lab' ? 2 : 1
    const facultyReq = iFacReq >= 0 ? parseInt(r[iFacReq], 10) || defaultFacReq : defaultFacReq
    const labRoom = iLabRoom >= 0 ? String(r[iLabRoom] || '').trim() : ''
    const commonGroup = iGroup >= 0 ? String(r[iGroup] || '').trim() : ''

    result[byKey].push({
      id: uid('s'),
      name,
      code,
      type,
      periods,
      block,
      facultyReq,
      labRoomId: labRoom,
      commonGroup,
    })
  })

  return { map: result }
}
