import * as XLSX from 'xlsx'
import { uid, makeShort, getBranchYearKey, normalizeKey } from './helpers.js'
import { BRANCHES, YEARS } from './constants.js'

// ─── Normalization helpers ───────────────────────────────────────────────────
export const norm = (v) => String(v ?? '').trim()
export const lc = (v) => norm(v).toLowerCase()

/**
 * Normalizes branch strings, e.g. "CSE(CIC)", "CSE - AIML", "CIC", "B.E CIC".
 */
export function normalizeBranch(str) {
  if (!str) return ''
  const s = String(str).toUpperCase().trim()
  if (s.includes('CIC')) return 'CIC'
  if (s.includes('AIML') || s.includes('AI/ML') || s.includes('AI & ML') || s.includes('AI-ML')) return 'AIML'
  if (s.includes('CSIT') || s.includes('CS-IT') || s.includes('CS & IT')) return 'CSIT'
  if (s.includes('DS') || s.includes('DATA SCIENCE')) return 'DS'
  for (const b of BRANCHES) {
    if (s === b || s.includes(b)) return b
  }
  return s
}

/**
 * Normalizes year representations, e.g. "4", "IV", "4th", "4th Year", "Sem VII", "Year 4".
 */
export function normalizeYear(val) {
  if (val === undefined || val === null || val === '') return null
  const s = String(val).toUpperCase().trim()
  if (s === '2' || s === '3' || s === '4') return parseInt(s, 10)
  if (
    s === 'IV' ||
    s.includes('4TH') ||
    s.includes('YEAR 4') ||
    s.includes('4 YEAR') ||
    s.includes('VII') ||
    s.includes('VIII') ||
    s.includes('SEM 7') ||
    s.includes('SEM 8') ||
    s === '7' ||
    s === '8'
  ) {
    return 4
  }
  if (
    s === 'III' ||
    s.includes('3RD') ||
    s.includes('YEAR 3') ||
    s.includes('3 YEAR') ||
    s.includes('V') ||
    s.includes('VI') ||
    s.includes('SEM 5') ||
    s.includes('SEM 6') ||
    s === '5' ||
    s === '6'
  ) {
    return 3
  }
  if (
    s === 'II' ||
    s.includes('2ND') ||
    s.includes('YEAR 2') ||
    s.includes('2 YEAR') ||
    s.includes('SEM 3') ||
    s.includes('SEM 4') ||
    s === '3' ||
    s === '4'
  ) {
    return 2
  }
  const num = parseInt(s.replace(/\D/g, ''), 10)
  if (num >= 2 && num <= 4) return num
  if (num === 7 || num === 8) return 4
  if (num === 5 || num === 6) return 3
  if (num === 3 || num === 4) return 2
  return null
}

const GENERIC_HEADER_TERMS = [
  'name',
  'code',
  'type',
  'room',
  'faculty',
  'branch',
  'year',
  'dept',
  'department',
  'short',
  'capacity',
  'subject',
  'periods',
  'block',
  'designation',
  'desg',
  's.no',
  'sno',
  'sl.no',
  'sl no',
  'max',
]

/**
 * Calculates a confidence score for whether a row is a table header row.
 */
function scoreRowAsHeader(row) {
  if (!row || !row.length) return -1
  const valid = row.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
  if (valid.length < 2) return -1

  let score = 0
  valid.forEach((cell) => {
    // Exact or partial match with known header terms
    if (GENERIC_HEADER_TERMS.some((t) => cell === t || cell.includes(t))) {
      score += 2
    }
  })
  return score
}

/**
 * Detects the best header row index within raw sheet data.
 */
function detectHeaderRow(raw) {
  let bestIdx = 0
  let bestScore = -1

  const maxScan = Math.min(raw.length, 25)
  for (let i = 0; i < maxScan; i++) {
    const s = scoreRowAsHeader(raw[i])
    if (s > bestScore) {
      bestScore = s
      bestIdx = i
    }
  }

  // Fallback: if no row scored header keywords, find first row with at least 2 non-empty cells
  if (bestScore <= 0) {
    for (let i = 0; i < maxScan; i++) {
      const valid = (raw[i] || []).filter((x) => String(x || '').trim()).length
      if (valid >= 2) {
        return i
      }
    }
  }

  return bestIdx
}

/**
 * Reads an Excel or CSV file as an ArrayBuffer and parses it with XLSX.read(..., {type: 'array'}).
 * Automatically selects the appropriate sheet (matching entityType hint if multi-sheet).
 * Automatically detects the real header row by scoring candidate rows for header keywords.
 */
export async function readSheetArrayBuffer(file, entityType = '') {
  let buffer
  if (file && typeof file.arrayBuffer === 'function') {
    buffer = await file.arrayBuffer()
  } else {
    buffer = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = (err) => reject(err)
      reader.readAsArrayBuffer(file)
    })
  }

  const data = new Uint8Array(buffer)
  const wb = XLSX.read(data, { type: 'array' })
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    return { headers: [], dataRows: [], sheetName: '' }
  }

  // Choose sheet: match entityType hint if workbook has multiple sheets
  let chosenSheet = wb.SheetNames[0]
  if (entityType && wb.SheetNames.length > 1) {
    const hint = entityType.toLowerCase()
    const found = wb.SheetNames.find((s) => {
      const sn = s.toLowerCase()
      if (hint === 'faculty') return sn.includes('fac') || sn.includes('teach') || sn.includes('staff')
      if (hint === 'rooms') return sn.includes('room') || sn.includes('lab') || sn.includes('class')
      if (hint === 'subjects') return sn.includes('sub') || sn.includes('course') || sn.includes('syllabus')
      return sn.includes(hint)
    })
    if (found) chosenSheet = found
  }

  const ws = wb.Sheets[chosenSheet]
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  if (!raw.length) {
    return { headers: [], dataRows: [], sheetName: chosenSheet }
  }

  const hdrIdx = detectHeaderRow(raw)
  const headers = (raw[hdrIdx] || []).map((x) => String(x || '').trim())
  const dataRows = raw
    .slice(hdrIdx + 1)
    .filter((r) => r.some((x) => String(x || '').trim()))

  return { headers, dataRows, sheetName: chosenSheet }
}

/**
 * Finds column index by trying exact match, alphanumeric match, prefix match, and substring match.
 */
export function findColIdx(headers, variants) {
  const normHeaders = headers.map((h) => String(h || '').trim().toLowerCase())

  // 1. Exact match (case & symbols trimmed)
  for (const v of variants) {
    const target = v.toLowerCase()
    const cleanTarget = target.replace(/[^a-z0-9]/g, '')
    const idx = normHeaders.findIndex(
      (h) => h === target || (cleanTarget && h.replace(/[^a-z0-9]/g, '') === cleanTarget)
    )
    if (idx >= 0) return idx
  }

  // 2. Starts with target
  for (const v of variants) {
    const target = v.toLowerCase()
    const idx = normHeaders.findIndex((h) => h.startsWith(target))
    if (idx >= 0) return idx
  }

  // 3. Contains target (for multi-word variations)
  for (const v of variants) {
    const target = v.toLowerCase()
    if (target.length < 3) continue
    const idx = normHeaders.findIndex(
      (h) => h.includes(target) || (h.length >= 4 && target.includes(h))
    )
    if (idx >= 0) return idx
  }

  return -1
}

// ─── Faculty Importer ─────────────────────────────────────────────────────────
// Columns: Faculty Name | Short Name | Designation | Department | Max Periods/Week | Subjects
// Upsert by Short Name (case-insensitive). Existing faculty keep their id.
export async function importFacultyFromFile(file, existingFaculty = []) {
  const { headers, dataRows } = await readSheetArrayBuffer(file, 'faculty')

  const iName = findColIdx(headers, [
    'faculty name',
    'name',
    'faculty',
    'teacher name',
    'teacher',
    'staff name',
    'staff',
    'lecturer',
    'professor',
    'instructor',
  ])
  const iShort = findColIdx(headers, [
    'short name',
    'short',
    'code',
    'initials',
    'abbr',
    'abbreviation',
    'short code',
    'fac short',
    'fac code',
    'faculty short',
  ])
  const iDesg = findColIdx(headers, ['designation', 'desg', 'post', 'title', 'role', 'position'])
  const iDept = findColIdx(headers, ['department', 'dept', 'branch', 'course', 'stream'])
  const iMax = findColIdx(headers, [
    'max periods/week',
    'max periods',
    'max',
    'periods/week',
    'weekly load',
    'max load',
    'workload',
    'load limit',
    'max hours',
  ])
  const iSubs = findColIdx(headers, [
    'subjects',
    'subject codes',
    'courses',
    'subject',
    'subjects handled',
    'qualified subjects',
    'teaching subjects',
    'papers',
  ])

  if (iName < 0) {
    throw new Error(
      `Could not find "Faculty Name" column. Found columns: ${headers.filter(Boolean).join(', ') || 'none'}`
    )
  }

  const list = existingFaculty.map((f) => ({ ...f }))
  const seenInSheet = new Set()
  const duplicates = []
  let added = 0
  let updated = 0
  let skipped = 0

  dataRows.forEach((r) => {
    const name = norm(r[iName])
    if (!name || ['name', 's.no.', 'sno', 'sl.no', 'sl no'].includes(name.toLowerCase())) return

    const short = (iShort >= 0 ? norm(r[iShort]) : '') || makeShort(name)
    if (!short) {
      skipped++
      return
    }

    if (seenInSheet.has(short.toLowerCase())) {
      duplicates.push(short)
      return
    }
    seenInSheet.add(short.toLowerCase())

    const maxVal = iMax >= 0 ? parseInt(r[iMax], 10) : NaN
    const rawSubs = iSubs >= 0 ? norm(r[iSubs]) : ''
    const subjectList = rawSubs
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)

    const data = {
      name,
      short: short.toUpperCase(),
      desg: iDesg >= 0 ? norm(r[iDesg]) : '',
      dept: iDept >= 0 ? norm(r[iDept]) : '',
      max: Number.isFinite(maxVal) && maxVal > 0 ? maxVal : 30,
      subjects: subjectList,
    }

    const idx = list.findIndex((f) => lc(f.short) === short.toLowerCase())
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...data }
      updated++
    } else {
      list.push({ id: uid('f'), ...data })
      added++
    }
  })

  return { list, added, updated, skipped, duplicates }
}

// ─── Rooms Importer ───────────────────────────────────────────────────────────
// Columns: Room No | Type (Classroom/Lab) | Lab Name | Capacity
// Upsert by Room No (case-insensitive).
export async function importRoomsFromFile(file, existingRooms = []) {
  const { headers, dataRows } = await readSheetArrayBuffer(file, 'rooms')

  const iRoom = findColIdx(headers, [
    'room no',
    'room number',
    'room #',
    'roomno',
    'room',
    'classroom',
    'class room',
    'lab no',
    'venue',
    'hall',
    'name',
  ])
  const iType = findColIdx(headers, ['type', 'room type', 'category', 'kind'])
  const iLab = findColIdx(headers, ['lab name', 'lab', 'labname', 'laboratory', 'lab code', 'description'])
  const iCap = findColIdx(headers, ['capacity', 'seats', 'cap', 'intake', 'strength', 'size'])

  if (iRoom < 0) {
    throw new Error(
      `Could not find "Room No" column. Found columns: ${headers.filter(Boolean).join(', ') || 'none'}`
    )
  }

  const list = existingRooms.map((r) => ({ ...r }))
  const seenInSheet = new Set()
  const duplicates = []
  let added = 0
  let updated = 0

  dataRows.forEach((r) => {
    const roomNo = norm(r[iRoom])
    if (!roomNo || ['room no', 's.no.', 'room', 'sl.no'].includes(roomNo.toLowerCase())) return

    if (seenInSheet.has(roomNo.toLowerCase())) {
      duplicates.push(roomNo)
      return
    }
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
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...data }
      updated++
    } else {
      list.push({ id: uid('r'), ...data })
      added++
    }
  })

  return { list, added, updated, duplicates }
}

// ─── Subjects Importer ────────────────────────────────────────────────────────
// Columns: Branch | Year | Subject Code | Subject Name | Type (Theory/Lab/Project) |
// Periods/Week | Block Size | Faculty Required | Lab Room | Common Slot Group
// Upsert by Branch-Year + Subject Code. Falls back to defaultBranch and defaultYear
// if Branch/Year columns are missing in the sheet.
export async function importSubjectsFromFile(
  file,
  existingSubjects = {},
  defaultBranch = 'CIC',
  defaultYear = 4
) {
  const { headers, dataRows } = await readSheetArrayBuffer(file, 'subjects')

  const iBranch = findColIdx(headers, ['branch', 'dept', 'department', 'stream', 'program', 'course'])
  const iYear = findColIdx(headers, ['year', 'yr', 'academic year', 'class year', 'semester', 'sem'])
  const iCode = findColIdx(headers, [
    'subject code',
    'sub code',
    'course code',
    'paper code',
    'code',
    'short',
    'abbr',
  ])
  const iName = findColIdx(headers, [
    'subject name',
    'sub name',
    'course name',
    'course title',
    'subject title',
    'paper name',
    'title',
    'subject',
    'name',
  ])
  const iType = findColIdx(headers, ['type', 'subject type', 'sub type', 'course type', 'category'])
  const iPeriods = findColIdx(headers, [
    'periods/week',
    'periods',
    'period',
    'hours/week',
    'hours',
    'weekly periods',
    'credits',
    'hrs',
    'lec',
  ])
  const iBlock = findColIdx(headers, ['block size', 'block', 'blocksize', 'duration', 'consecutive'])
  const iFacReq = findColIdx(headers, [
    'faculty required',
    'faculty req',
    'teachers',
    'fac req',
    'staff required',
    'no of faculty',
    'faculty count',
  ])
  const iLabRoom = findColIdx(headers, ['lab room', 'lab room no', 'lab room #', 'lab', 'lab no', 'room'])
  const iGroup = findColIdx(headers, [
    'common slot group',
    'common slot',
    'common group',
    'group',
    'slot group',
    'oe group',
    'elective group',
    'common',
  ])

  if (iCode < 0 && iName < 0) {
    throw new Error(
      `Could not find "Subject Code" or "Subject Name" column. Found: ${headers.filter(Boolean).join(', ') || 'none'}`
    )
  }

  const map = {}
  Object.entries(existingSubjects).forEach(([k, arr]) => {
    map[normalizeKey(k)] = (arr || []).map((s) => ({ ...s }))
  })

  const seenInSheet = new Set()
  const duplicates = []
  const unknown = []
  const affectedKeys = new Set()
  let added = 0
  let updated = 0

  dataRows.forEach((r, i) => {
    const rawBranch = iBranch >= 0 ? norm(r[iBranch]) : ''
    const rawYear = iYear >= 0 ? norm(r[iYear]) : ''

    const branch = normalizeBranch(rawBranch || defaultBranch)
    const year = normalizeYear(rawYear || defaultYear)

    const name = iName >= 0 ? norm(r[iName]) : ''
    const code = (iCode >= 0 ? norm(r[iCode]) : '') || name
    if (!code) return

    if (!BRANCHES.includes(branch) || !YEARS.includes(year)) {
      unknown.push(`row ${i + 2}: ${branch || rawBranch || '?'} ${year || rawYear || '?'} ${code}`)
      return
    }

    const byKey = getBranchYearKey(branch, year)
    affectedKeys.add(byKey)

    const sheetKey = `${byKey}|${code.toLowerCase()}`
    if (seenInSheet.has(sheetKey)) {
      duplicates.push(`${byKey} ${code}`)
      return
    }
    seenInSheet.add(sheetKey)

    const rawType = iType >= 0 ? norm(r[iType]) : ''
    const isLab = /lab|pract|pr\b/i.test(rawType)
    const isProject = /proj/i.test(rawType)
    const type = isLab ? 'Lab' : isProject ? 'Project' : 'Theory'

    const defaultBlock = type === 'Lab' || type === 'Project' ? 2 : 1
    const defaultFacReq = type === 'Lab' || type === 'Project' ? 2 : 1
    const parsedBlock = iBlock >= 0 ? parseInt(r[iBlock], 10) : NaN
    const parsedPeriods = iPeriods >= 0 ? parseInt(r[iPeriods], 10) : NaN
    const parsedFacReq = iFacReq >= 0 ? parseInt(r[iFacReq], 10) : NaN

    const block = Number.isFinite(parsedBlock) && parsedBlock > 0 ? parsedBlock : defaultBlock
    const periods =
      Number.isFinite(parsedPeriods) && parsedPeriods > 0
        ? parsedPeriods
        : type === 'Lab' || type === 'Project'
        ? Math.max(block, 2)
        : 3

    const data = {
      name: name || code,
      code,
      type,
      periods,
      block,
      facultyReq: Number.isFinite(parsedFacReq) && parsedFacReq > 0 ? parsedFacReq : defaultFacReq,
      labRoomId: iLabRoom >= 0 ? norm(r[iLabRoom]) : '',
      commonGroup: iGroup >= 0 ? norm(r[iGroup]) : '',
    }

    const arr = (map[byKey] ||= [])
    const idx = arr.findIndex((s) => lc(s.code) === code.toLowerCase())
    if (idx >= 0) {
      arr[idx] = { ...arr[idx], ...data }
      updated++
    } else {
      arr.push({ id: uid('s'), ...data })
      added++
    }
  })

  return {
    map,
    added,
    updated,
    duplicates,
    unknown,
    affectedKeys: Array.from(affectedKeys),
  }
}
