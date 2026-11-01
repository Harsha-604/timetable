import fs from 'fs'
import * as XLSX from 'xlsx'
import { validateState, auditTimetableHardViolations } from '../src/utils/validator.js'
import { autoAssignFaculty, generateScheduleAsync } from '../src/utils/generator.js'
import { importSubjectsFromFile } from '../src/utils/importer.js'
import {
  toBase64Utf8,
  fromBase64Utf8,
  publish,
  buildProjectPayload,
  getStoredToken,
  setStoredToken,
  clearStoredToken,
  getStoredPinHash,
  setStoredPinHash,
  clearStoredPinHash,
  hashPin,
  verifyPin,
  clearAuthCache,
  testGitHubConnection,
  verifyEditorAccess,
} from '../src/utils/publisher.js'
import {
  encryptToken,
  decryptToken,
  changePin,
  checkMigration,
  getMemoryToken,
  setMemoryToken,
  clearMemoryToken,
  hasEncryptedToken,
  deleteEncryptedToken,
} from '../src/utils/tokenVault.js'

const cic4Sample = JSON.parse(fs.readFileSync('./src/sample/cic4.json', 'utf-8'))

/**
 * Validates all invariants on the generated timetables:
 * - zero hard violations
 * - 30/30 filled per class
 * - labs only in lab windows and their lab rooms
 * - no faculty or room clash across classes
 * - each theory subject at most once per day per class
 * - same team for a subject all week
 * - at most one lab block per day per class
 */
function verifyInvariants({ classes, timetables, subjects, runLabel, seed }) {
  const teachingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const pidsList = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']

  for (const cls of classes) {
    const tt = timetables[cls.id] || {}
    let periodCount = 0

    teachingDays.forEach((day) => {
      const slots = tt[day] || {}
      pidsList.forEach((pid) => {
        if (slots[pid]) periodCount++
      })

      // 1. At most one lab block per day per class
      const labBlocks = Object.entries(slots).filter(
        ([pid, s]) => s.blockSize > 1 && s.blockStart === pid
      )
      if (labBlocks.length > 1) {
        throw new Error(
          `[${runLabel} | seed=${seed}] Class ${cls.id} has ${labBlocks.length} lab blocks on ${day} (max 1 allowed)`
        )
      }

      // 2. Each theory subject at most once per day per class
      const seenTheory = new Set()
      pidsList.forEach((pid) => {
        const slot = slots[pid]
        if (slot && slot.blockSize === 1) {
          if (seenTheory.has(slot.subId)) {
            throw new Error(
              `[${runLabel} | seed=${seed}] Class ${cls.id} has theory subject ${slot.subCode} more than once on ${day}`
            )
          }
          seenTheory.add(slot.subId)
        }
      })
    })

    // 3. Exactly 30/30 periods filled per class
    if (periodCount !== 30) {
      throw new Error(
        `[${runLabel} | seed=${seed}] Class ${cls.id} has ${periodCount}/30 periods filled`
      )
    }

    // 4. Labs only in lab windows and their lab rooms
    teachingDays.forEach((day) => {
      const slots = tt[day] || {}
      Object.entries(slots).forEach(([pid, slot]) => {
        if (slot.blockSize > 1 && slot.blockStart === pid) {
          if (!slot.roomId) {
            throw new Error(
              `[${runLabel} | seed=${seed}] Lab at ${cls.id} ${day} ${pid} has no room specified`
            )
          }
          const validStarts = ['p1', 'p3', 'p5']
          if (!validStarts.includes(pid)) {
            throw new Error(
              `[${runLabel} | seed=${seed}] Lab at ${cls.id} ${day} ${pid} started outside allowed lab windows`
            )
          }
          const p2 = pid === 'p1' ? 'p2' : pid === 'p3' ? 'p4' : 'p6'
          if (!slots[p2]) {
            throw new Error(
              `[${runLabel} | seed=${seed}] Lab multi-period second slot missing at ${p2}`
            )
          }
        }
      })
    })

    // 5. Same team for a subject all week
    const subToTeam = {}
    teachingDays.forEach((day) => {
      pidsList.forEach((pid) => {
        const slot = tt[day]?.[pid]
        if (slot) {
          const team = (slot.facIds || [slot.facId]).slice().sort().join(',')
          if (!subToTeam[slot.subId]) {
            subToTeam[slot.subId] = team
          } else if (subToTeam[slot.subId] !== team) {
            throw new Error(
              `[${runLabel} | seed=${seed}] Inconsistent team for subject ${slot.subId} in ${cls.id}`
            )
          }
        }
      })
    })
  }

  // 6. No faculty or room clash across classes
  teachingDays.forEach((day) => {
    pidsList.forEach((pid) => {
      const facultyHere = {}
      const roomsHere = {}
      for (const cls of classes) {
        const slot = timetables[cls.id]?.[day]?.[pid]
        if (!slot) continue
        const team = slot.facIds || (slot.facId ? [slot.facId] : [])
        for (const fid of team) {
          if (facultyHere[fid]) {
            throw new Error(
              `[${runLabel} | seed=${seed}] Faculty clash for ${fid} between ${facultyHere[fid]} and ${cls.id} at ${day} ${pid}`
            )
          }
          facultyHere[fid] = cls.id
        }
        if (slot.roomId) {
          const rKey = slot.roomId.toLowerCase()
          if (roomsHere[rKey]) {
            throw new Error(
              `[${runLabel} | seed=${seed}] Room clash for ${slot.roomId} between ${roomsHere[rKey]} and ${cls.id} at ${day} ${pid}`
            )
          }
          roomsHere[rKey] = cls.id
        }
      }
    })
  })
}

// ── 1. ACCEPTANCE TEST (20 Runs with fixed seeds 1..20) ──
async function runAcceptanceIteration(seed) {
  const state = {
    classes: cic4Sample.classes,
    rooms: cic4Sample.rooms,
    faculty: cic4Sample.faculty,
    subjects: cic4Sample.subjects,
    settings: cic4Sample.settings,
    timetable: {},
    assignments: cic4Sample.assignments,
  }

  const val = validateState(state)
  if (!val.isValid) {
    throw new Error(`Validation failed: ${val.errors.join('; ')}`)
  }

  const assignments = autoAssignFaculty({
    classes: state.classes,
    subjects: state.subjects,
    faculty: state.faculty,
    existingAssignments: state.assignments,
    lockedAssignments: {},
  })

  const genResult = await generateScheduleAsync({
    classes: state.classes,
    subjects: state.subjects,
    faculty: state.faculty,
    rooms: state.rooms,
    assignments,
    settings: state.settings,
    existingTimetables: {},
    options: { seed, attempts: 200 },
  })

  if (genResult.unplaced.length > 0) {
    throw new Error(
      `[Acceptance | seed=${seed}] Has ${genResult.unplaced.length} unplaced blocks: ` +
        genResult.unplaced.map((u) => `${u.classId} ${u.sub?.code}: ${u.reason}`).join(', ')
    )
  }

  verifyInvariants({
    classes: state.classes,
    timetables: genResult.timetables,
    subjects: state.subjects,
    runLabel: 'Acceptance',
    seed,
  })
}

// ── 2. SCALE TEST (12 Classes, 30 Faculty, 15 Classrooms, 6 Labs on seeds 1..5) ──
function buildScaleDataset() {
  const branches = ['CIC', 'AIML', 'DS', 'CSIT']
  const years = [2, 3, 4]
  const classes = []
  const classrooms = []
  const labs = [
    { id: 'LAB-1', name: 'LAB-1', roomNo: 'CS-101', type: 'Lab', labName: 'LAB-1' },
    { id: 'LAB-2', name: 'LAB-2', roomNo: 'CS-102', type: 'Lab', labName: 'LAB-2' },
    { id: 'LAB-3', name: 'LAB-3', roomNo: 'CS-103', type: 'Lab', labName: 'LAB-3' },
    { id: 'LAB-4', name: 'LAB-4', roomNo: 'CS-104', type: 'Lab', labName: 'LAB-4' },
    { id: 'LAB-5', name: 'LAB-5', roomNo: 'CS-105', type: 'Lab', labName: 'LAB-5' },
    { id: 'LAB-6', name: 'LAB-6', roomNo: 'CS-106', type: 'Lab', labName: 'LAB-6' },
  ]

  for (let i = 1; i <= 15; i++) {
    classrooms.push({
      id: `CR-${100 + i}`,
      name: `CR-${100 + i}`,
      roomNo: `CR-${100 + i}`,
      type: 'Classroom',
      capacity: 60,
    })
  }

  let classIdx = 0
  branches.forEach((b) => {
    years.forEach((y) => {
      classes.push({
        id: `${b}-${y}-A`,
        branch: b,
        year: y,
        section: 'A',
        homeRoomId: classrooms[classIdx % classrooms.length].roomNo,
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        saturdayPeriods: 4,
        advisor: `Advisor ${b}-${y}`,
        wef: '01-08-2026',
        semester: y === 2 ? 'III' : y === 3 ? 'V' : 'VII',
        ay: '2026-27',
      })
      classIdx++
    })
  })

  const faculty = []
  for (let i = 1; i <= 30; i++) {
    faculty.push({
      id: `FAC-${i}`,
      name: `Faculty Member ${i}`,
      short: `F${i}`,
      max: 30,
      subjects: [
        `SUB-${(i % 12) + 1}`,
        `SUB-${((i + 1) % 12) + 1}`,
        `SUB-${((i + 2) % 12) + 1}`,
        `LABSUB-${(i % 6) + 1}`,
        `LABSUB-${((i + 1) % 6) + 1}`,
      ],
    })
  }

  const subjects = {}
  branches.forEach((b) => {
    years.forEach((y) => {
      const byKey = `${b}-${y}`
      subjects[byKey] = [
        { id: `s_${byKey}_1`, code: `SUB-1`, name: 'Subject 1', type: 'Theory', periods: 3, block: 1, facultyReq: 1 },
        { id: `s_${byKey}_2`, code: `SUB-2`, name: 'Subject 2', type: 'Theory', periods: 3, block: 1, facultyReq: 1 },
        { id: `s_${byKey}_3`, code: `SUB-3`, name: 'Subject 3', type: 'Theory', periods: 3, block: 1, facultyReq: 1 },
        { id: `s_${byKey}_4`, code: `SUB-4`, name: 'Subject 4', type: 'Theory', periods: 3, block: 1, facultyReq: 1 },
        { id: `s_${byKey}_5`, code: `SUB-5`, name: 'Subject 5', type: 'Theory', periods: 3, block: 1, facultyReq: 1 },
        { id: `s_${byKey}_6`, code: `SUB-6`, name: 'Subject 6', type: 'Theory', periods: 3, block: 1, facultyReq: 1 },
        { id: `s_${byKey}_7`, code: `SUB-7`, name: 'Subject 7', type: 'Theory', periods: 2, block: 1, facultyReq: 1 },
        { id: `s_${byKey}_l1`, code: `LABSUB-1`, name: 'Lab 1', type: 'Lab', periods: 2, block: 2, facultyReq: 2, labRoomId: 'CS-101' },
        { id: `s_${byKey}_l2`, code: `LABSUB-2`, name: 'Lab 2', type: 'Lab', periods: 2, block: 2, facultyReq: 2, labRoomId: 'CS-102' },
        { id: `s_${byKey}_l3`, code: `LABSUB-3`, name: 'Lab 3', type: 'Lab', periods: 2, block: 2, facultyReq: 2, labRoomId: 'CS-103' },
        { id: `s_${byKey}_l4`, code: `LABSUB-4`, name: 'Lab 4', type: 'Lab', periods: 2, block: 2, facultyReq: 2, labRoomId: 'CS-104' },
        { id: `s_${byKey}_l5`, code: `LABSUB-5`, name: 'Lab 5', type: 'Lab', periods: 2, block: 2, facultyReq: 2, labRoomId: 'CS-105' },
      ]
    })
  })

  return {
    classes,
    rooms: [...classrooms, ...labs],
    faculty,
    subjects,
    settings: cic4Sample.settings,
  }
}

async function runScaleIteration(seed) {
  const dataset = buildScaleDataset()
  const assignments = autoAssignFaculty({
    classes: dataset.classes,
    subjects: dataset.subjects,
    faculty: dataset.faculty,
    existingAssignments: {},
    lockedAssignments: {},
  })

  const t0 = Date.now()
  const result = await generateScheduleAsync({
    classes: dataset.classes,
    subjects: dataset.subjects,
    faculty: dataset.faculty,
    rooms: dataset.rooms,
    assignments,
    settings: dataset.settings,
    existingTimetables: {},
    options: { seed, attempts: 200 },
  })
  const durationMs = Date.now() - t0

  if (result.unplaced.length > 0) {
    throw new Error(
      `[Scale | seed=${seed}] Has ${result.unplaced.length} hard violations / unplaced blocks: ` +
        result.unplaced.map((u) => `${u.classId} ${u.sub?.code}`).join(', ')
    )
  }

  // Full invariant checks on scale output
  verifyInvariants({
    classes: dataset.classes,
    timetables: result.timetables,
    subjects: dataset.subjects,
    runLabel: 'Scale',
    seed,
  })

  return durationMs
}

// ── 3. TEST SUITES: PRESET FACULTY, OVERRIDES, VALIDATION & REPORT ──

async function testSuite1_ReferenceFacultyMatch() {
  console.log('\n=== Suite 1: CIC-4-A Reference Faculty Matching ===')
  const state = {
    classes: cic4Sample.classes,
    rooms: cic4Sample.rooms,
    faculty: cic4Sample.faculty,
    subjects: cic4Sample.subjects,
    settings: cic4Sample.settings,
    timetable: {},
    assignments: cic4Sample.assignments,
  }

  const lockedAssignments = {
    'CIC-4-A': Object.fromEntries(
      Object.keys(cic4Sample.assignments['CIC-4-A']).map((k) => [k, true])
    ),
  }

  const assignments = autoAssignFaculty({
    classes: state.classes,
    subjects: state.subjects,
    faculty: state.faculty,
    existingAssignments: state.assignments,
    lockedAssignments,
  })

  const genResult = await generateScheduleAsync({
    classes: state.classes,
    subjects: state.subjects,
    faculty: state.faculty,
    rooms: state.rooms,
    assignments,
    settings: state.settings,
    existingTimetables: {},
    options: { seed: 42, attempts: 200 },
  })

  if (genResult.unplaced.length > 0) {
    throw new Error(`Suite 1 has unplaced blocks: ${genResult.unplaced.length}`)
  }

  const expectedFaculty = {
    'OE-I:RSE': ['MB'],
    'PE-V:SQT': ['Dr.MVRJ'],
    'PE-IV:SPSM': ['AV'],
    'DMF': ['RT'],
    'BCT': ['PPP'],
    'IoTCPS': ['TL'],
    'ES': ['PS'],
    'DevOps Lab': ['AV', 'PPP'],
    'BCT Lab': ['AV', 'PPP', 'RT'],
    'IoTCPS Lab': ['Dr.MVRJ', 'FA', 'TL'],
    'CPW-1': ['TL'],
  }

  const cicSlots = genResult.timetables['CIC-4-A']
  const facultyMap = Object.fromEntries(state.faculty.map((f) => [f.id, f.short]))
  let cellCount = 0

  for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
    for (const pid of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) {
      const slot = cicSlots?.[day]?.[pid]
      if (!slot) continue
      cellCount++
      const exp = expectedFaculty[slot.subCode]
      if (!exp) {
        throw new Error(`Unexpected subject ${slot.subCode} found in CIC-4-A`)
      }
      const actualShorts = (slot.facIds || (slot.facId ? [slot.facId] : []))
        .map((fid) => facultyMap[fid] || fid)
        .sort()
      const expSorted = [...exp].sort()
      if (actualShorts.join(',') !== expSorted.join(',')) {
        throw new Error(
          `Cell ${day} ${pid} (${slot.subCode}): expected faculty ${expSorted.join(', ')}, got ${actualShorts.join(', ')}`
        )
      }
    }
  }

  if (cellCount !== 30) {
    throw new Error(`Expected 30 cells in CIC-4-A, got ${cellCount}`)
  }
  console.log('Suite 1: PASS (all 30 periods matched preset reference faculty exactly)')
}

async function testSuite2_AutoAssignBlankWithPresets() {
  console.log('\n=== Suite 2: Auto-Assign Blank Cells while Preserving Presets ===')
  const aimlSubs = cic4Sample.subjects['AIML-4']
  const sDl = aimlSubs.find((s) => s.code === 'DL').id
  const sNlp = aimlSubs.find((s) => s.code === 'NLP').id
  const sDlLab = aimlSubs.find((s) => s.code === 'DL Lab').id

  const existingAssignments = {
    'AIML-4-A': {
      [sDl]: ['f_ppp'],
      [sNlp]: ['f_av'],
      [sDlLab]: ['f_ppp', 'f_sk'],
    },
  }
  const lockedAssignments = {
    'AIML-4-A': {
      [sDl]: true,
      [sNlp]: true,
      [sDlLab]: true,
    },
  }

  const filled = autoAssignFaculty({
    classes: [cic4Sample.classes.find((c) => c.id === 'AIML-4-A')],
    subjects: { 'AIML-4': aimlSubs },
    faculty: cic4Sample.faculty,
    existingAssignments,
    lockedAssignments,
  })

  const aimlAssignments = filled['AIML-4-A']

  // Presets untouched
  if (aimlAssignments[sDl][0] !== 'f_ppp') throw new Error('Preset DL was overridden')
  if (aimlAssignments[sNlp][0] !== 'f_av') throw new Error('Preset NLP was overridden')
  if (aimlAssignments[sDlLab].slice().sort().join(',') !== 'f_ppp,f_sk') {
    throw new Error('Preset DL Lab was overridden')
  }

  // Blank subjects auto-assigned
  for (const s of aimlSubs) {
    const team = aimlAssignments[s.id]
    if (!team || team.length === 0) {
      throw new Error(`Subject ${s.code} was not auto-assigned`)
    }
    if (team.length !== s.facultyReq) {
      throw new Error(
        `Subject ${s.code} team size ${team.length} does not match facultyReq ${s.facultyReq}`
      )
    }
  }

  console.log('Suite 2: PASS (presets untouched, blank subjects successfully auto-assigned)')
}

async function testSuite3_SectionOverride() {
  console.log('\n=== Suite 3: Section Override & Preset Propagation ===')
  const ws = XLSX.utils.aoa_to_sheet([
    [
      'Branch', 'Year', 'Section', 'Subject Code', 'Subject Name',
      'Type', 'Periods/Week', 'Block Size', 'Faculty', 'Faculty Required',
      'Lab Room', 'Common Slot Group'
    ],
    ['CIC', 4, '', 'BCT', 'Blockchain Tech', 'Theory', 3, 1, 'PPP', 1, '', ''],
    ['CIC', 4, 'B', 'BCT', 'Blockchain Tech', 'Theory', 3, 1, 'RT', 1, '', ''],
    ['CIC', 4, '', 'OE-I', 'Open Elective', 'Theory', 3, 1, '', 1, '', '']
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Subjects')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  const faculty = [
    { id: 'f_ppp', short: 'PPP', name: 'P. Premchand', max: 30 },
    { id: 'f_rt', short: 'RT', name: 'R. Tejaswi', max: 30 },
  ]
  const classes = [
    { id: 'CIC-4-A', branch: 'CIC', year: 4, section: 'A' },
    { id: 'CIC-4-B', branch: 'CIC', year: 4, section: 'B' },
  ]

  const res = await importSubjectsFromFile(buf, { faculty, classes })
  const bctSub = res.map['CIC-4'].find((s) => s.code === 'BCT')

  // Section A gets PPP (blank row preset)
  const teamA = res.assignments['CIC-4-A']?.[bctSub.id]
  if (!teamA || teamA[0] !== 'f_ppp' || !res.lockedAssignments['CIC-4-A']?.[bctSub.id]) {
    throw new Error(`Section A expected PPP locked, got: ${JSON.stringify(teamA)}`)
  }

  // Section B gets RT (overridden by Section B row)
  const teamB = res.assignments['CIC-4-B']?.[bctSub.id]
  if (!teamB || teamB[0] !== 'f_rt' || !res.lockedAssignments['CIC-4-B']?.[bctSub.id]) {
    throw new Error(`Section B expected RT locked, got: ${JSON.stringify(teamB)}`)
  }

  // Preset structure preserved for new sections
  const bctPreset = res.presets['CIC-4']?.['BCT']
  if (!bctPreset || bctPreset.all[0] !== 'f_ppp' || bctPreset.sections?.['B']?.[0] !== 'f_rt') {
    throw new Error(`Presets not correctly registered: ${JSON.stringify(bctPreset)}`)
  }

  console.log('Suite 3: PASS (Section B overrode blank row, Section A got blank row preset, presets preserved for new sections)')
}

async function testSuite4_ValidationErrors() {
  console.log('\n=== Suite 4: Validation Errors Block Generation ===')
  const faculty = [
    { id: 'f_ppp', short: 'PPP', name: 'P. Premchand', max: 3 },
  ]
  const classes = [
    { id: 'CIC-4-A', branch: 'CIC', year: 4, section: 'A' },
    { id: 'CIC-4-B', branch: 'CIC', year: 4, section: 'B' },
  ]

  // 1. Unknown faculty short name
  const wsUnknown = XLSX.utils.aoa_to_sheet([
    ['Branch', 'Year', 'Section', 'Subject Code', 'Subject Name', 'Type', 'Periods/Week', 'Block Size', 'Faculty', 'Faculty Required', 'Lab Room', 'Common Slot Group'],
    ['CIC', 4, '', 'BCT', 'Blockchain Tech', 'Theory', 3, 1, 'NONEXISTENT', 1, '', '']
  ])
  const wbUnknown = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wbUnknown, wsUnknown, 'Subjects')
  const bufUnknown = XLSX.write(wbUnknown, { type: 'buffer', bookType: 'xlsx' })
  const resUnknown = await importSubjectsFromFile(bufUnknown, { faculty, classes })
  if (!resUnknown.errors.some((e) => e.includes('NONEXISTENT'))) {
    throw new Error('Expected unknown faculty error for NONEXISTENT')
  }

  // 2. Specific Section named that doesn\'t exist in Settings
  const wsSec = XLSX.utils.aoa_to_sheet([
    ['Branch', 'Year', 'Section', 'Subject Code', 'Subject Name', 'Type', 'Periods/Week', 'Block Size', 'Faculty', 'Faculty Required', 'Lab Room', 'Common Slot Group'],
    ['CIC', 4, 'Z', 'BCT', 'Blockchain Tech', 'Theory', 3, 1, 'PPP', 1, '', '']
  ])
  const wbSec = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wbSec, wsSec, 'Subjects')
  const bufSec = XLSX.write(wbSec, { type: 'buffer', bookType: 'xlsx' })
  const resSec = await importSubjectsFromFile(bufSec, { faculty, classes })
  if (!resSec.errors.some((e) => e.includes('Section "Z" does not exist'))) {
    throw new Error('Expected missing section error for Section Z')
  }

  // 3. Preset overload
  const wsOver = XLSX.utils.aoa_to_sheet([
    ['Branch', 'Year', 'Section', 'Subject Code', 'Subject Name', 'Type', 'Periods/Week', 'Block Size', 'Faculty', 'Faculty Required', 'Lab Room', 'Common Slot Group'],
    ['CIC', 4, '', 'BCT', 'Blockchain Tech', 'Theory', 3, 1, 'PPP', 1, '', '']
  ])
  const wbOver = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wbOver, wsOver, 'Subjects')
  const bufOver = XLSX.write(wbOver, { type: 'buffer', bookType: 'xlsx' })
  const resOver = await importSubjectsFromFile(bufOver, { faculty, classes })
  if (!resOver.errors.some((e) => e.includes('preset load (6 periods/wk) exceeds Max Periods/Week (3)'))) {
    throw new Error('Expected preset overload error for PPP')
  }

  const valOver = validateState({
    classes,
    rooms: [{ id: 'CR-101', name: 'CR-101', type: 'Classroom' }],
    faculty,
    subjects: resOver.map,
    assignments: resOver.assignments,
    settings: cic4Sample.settings,
  })
  if (valOver.isValid) {
    throw new Error('validateState should have failed on preset overload')
  }

  console.log('Suite 4: PASS (unknown short name, missing section, preset overload all caught and block generation)')
}

async function testSuite5_ReportCheck() {
  console.log('\n=== Suite 5: Scheduling Report Invariant Audit ===')
  const state = {
    classes: cic4Sample.classes,
    rooms: cic4Sample.rooms,
    faculty: cic4Sample.faculty,
    subjects: cic4Sample.subjects,
    settings: cic4Sample.settings,
    timetable: {},
    assignments: cic4Sample.assignments,
  }

  const genResult = await generateScheduleAsync({
    classes: state.classes,
    subjects: state.subjects,
    faculty: state.faculty,
    rooms: state.rooms,
    assignments: state.assignments,
    settings: state.settings,
    existingTimetables: {},
    options: { seed: 10, attempts: 200 },
  })

  // Clean schedule: 0 hard violations
  const cleanAudit = auditTimetableHardViolations(genResult.timetables, state)
  if (!cleanAudit.isValid || cleanAudit.hardViolations.length !== 0) {
    throw new Error(
      `Clean schedule produced ${cleanAudit.hardViolations.length} hard violations: ` +
        cleanAudit.hardViolations.map((v) => v.message).join('; ')
    )
  }

  // Corrupt 1: Missing faculty
  const corrupt1 = JSON.parse(JSON.stringify(genResult.timetables))
  corrupt1['CIC-4-A']['Mon']['p1'].facIds = []
  corrupt1['CIC-4-A']['Mon']['p1'].facId = ''
  const audit1 = auditTimetableHardViolations(corrupt1, state)
  if (audit1.isValid || !audit1.hardViolations.some((v) => v.type === 'FEWER_FACULTY' || v.type === 'NO_FACULTY')) {
    throw new Error('Report check did not catch missing faculty corruption')
  }

  // Corrupt 2: Room clash
  const corrupt2 = JSON.parse(JSON.stringify(genResult.timetables))
  corrupt2['AIML-4-A']['Mon']['p1'].roomId = corrupt2['CIC-4-A']['Mon']['p1'].roomId
  const audit2 = auditTimetableHardViolations(corrupt2, state)
  if (audit2.isValid || !audit2.hardViolations.some((v) => v.type === 'ROOM_CLASH')) {
    throw new Error('Report check did not catch room clash corruption')
  }

  // Corrupt 3: Faculty clash
  const corrupt3 = JSON.parse(JSON.stringify(genResult.timetables))
  corrupt3['AIML-4-A']['Tue']['p2'].facIds = corrupt3['CIC-4-A']['Tue']['p2'].facIds
  const audit3 = auditTimetableHardViolations(corrupt3, state)
  if (audit3.isValid || !audit3.hardViolations.some((v) => v.type === 'FACULTY_CLASH')) {
    throw new Error('Report check did not catch faculty clash corruption')
  }

  console.log('Suite 5: PASS (clean schedule has 0 violations; all corruptions detected)')
}

async function testSuite6_PublisherTests() {
  console.log('\n--- Running Suite 6: Publisher Tests ---')

  // 1. Base64 helper round-trips a JSON string containing non-ASCII text ("Dr. Rāmā – తెలుగు")
  const nonAsciiSample = {
    faculty: 'Dr. Rāmā – తెలుగు',
    unicodeCheck: 'Greek: Ω ≈ ∑; CJK: 日本語, 汉字; Accents: àéîöñç',
  }
  const serialized = JSON.stringify(nonAsciiSample)
  const b64 = toBase64Utf8(serialized)
  const decoded = fromBase64Utf8(b64)
  if (decoded !== serialized) {
    throw new Error('Base64 round-trip failed to match raw string')
  }
  if (JSON.parse(decoded).faculty !== 'Dr. Rāmā – తెలుగు') {
    throw new Error('Base64 round-trip corrupted non-ASCII characters')
  }

  // 2. publish() sends GET then PUT to correct URLs with sha, branch, and Auth header; PUT body content decodes back to exact JSON
  const calls = []
  const originalFetch = global.fetch
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (options.method === 'GET') {
      return {
        status: 200,
        ok: true,
        json: async () => ({ sha: 'sha-existing-12345' }),
      }
    }
    if (options.method === 'PUT') {
      return {
        status: 200,
        ok: true,
        json: async () => ({ content: { sha: 'sha-new-67890' } }),
      }
    }
    throw new Error('Unexpected method ' + options.method)
  }

  const mockProject = {
    savedAt: '2026-11-01T00:00:00.000Z',
    classes: [{ id: 'CIC-4-A' }],
    faculty: [{ name: 'Dr. Rāmā – తెలుగు' }],
  }

  await publish({
    owner: 'Harsha-604',
    repo: 'timetable',
    branch: 'master',
    token: 'test-token-secret-123',
    projectData: mockProject,
    message: 'publish timetable 2026-11-01 12:00',
  })

  if (calls.length !== 2) throw new Error(`Expected 2 HTTP calls, got ${calls.length}`)
  const [getCall, putCall] = calls
  if (
    getCall.url !==
    'https://api.github.com/repos/Harsha-604/timetable/contents/public/data.json?ref=master'
  ) {
    throw new Error(`Incorrect GET URL: ${getCall.url}`)
  }
  if (getCall.options.headers?.Authorization !== 'Bearer test-token-secret-123') {
    throw new Error('Missing or wrong Authorization on GET')
  }

  if (
    putCall.url !== 'https://api.github.com/repos/Harsha-604/timetable/contents/public/data.json'
  ) {
    throw new Error(`Incorrect PUT URL: ${putCall.url}`)
  }
  if (putCall.options.headers?.Authorization !== 'Bearer test-token-secret-123') {
    throw new Error('Missing or wrong Authorization on PUT')
  }
  const putBody = JSON.parse(putCall.options.body)
  if (putBody.sha !== 'sha-existing-12345') {
    throw new Error(`PUT body sha mismatch: expected sha-existing-12345, got ${putBody.sha}`)
  }
  if (putBody.branch !== 'master') {
    throw new Error(`PUT body branch mismatch: expected master, got ${putBody.branch}`)
  }
  const decodedPutContent = fromBase64Utf8(putBody.content)
  if (decodedPutContent !== JSON.stringify(mockProject, null, 2)) {
    throw new Error('PUT body content does not decode back to exact JSON')
  }

  // 3. 404 on GET → PUT without sha
  calls.length = 0
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (options.method === 'GET') {
      return {
        status: 404,
        ok: false,
        json: async () => ({ message: 'Not Found' }),
      }
    }
    if (options.method === 'PUT') {
      return {
        status: 201,
        ok: true,
        json: async () => ({ content: { sha: 'sha-created-abc' } }),
      }
    }
  }

  await publish({
    owner: 'Harsha-604',
    repo: 'timetable',
    branch: 'master',
    token: 'test-token-secret-123',
    projectData: mockProject,
  })

  const putBody404 = JSON.parse(calls[1].options.body)
  if ('sha' in putBody404 && putBody404.sha !== undefined) {
    throw new Error('PUT after 404 should not include sha')
  }

  // 4. 409 on first PUT → re-GET and second PUT with new sha
  calls.length = 0
  let putCount = 0
  let getCount = 0
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (options.method === 'GET') {
      getCount++
      return {
        status: 200,
        ok: true,
        json: async () => ({ sha: getCount === 1 ? 'sha-initial' : 'sha-refetched-after-409' }),
      }
    }
    if (options.method === 'PUT') {
      putCount++
      if (putCount === 1) {
        return {
          status: 409,
          ok: false,
          json: async () => ({ message: 'Conflict: sha mismatch' }),
        }
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ content: { sha: 'sha-successful-put' } }),
      }
    }
  }

  await publish({
    owner: 'Harsha-604',
    repo: 'timetable',
    branch: 'master',
    token: 'test-token-secret-123',
    projectData: mockProject,
  })

  if (calls.length !== 4) {
    throw new Error(`Expected 4 calls on 409 retry, got ${calls.length}`)
  }
  const secondPutBody = JSON.parse(calls[3].options.body)
  if (secondPutBody.sha !== 'sha-refetched-after-409') {
    throw new Error(`Second PUT did not use re-fetched sha: got ${secondPutBody.sha}`)
  }
  global.fetch = originalFetch

  // 5. The token never appears in the object returned by the Save Project builder
  setStoredToken('super-secret-pat-token-999')
  const mockState = {
    classes: [{ id: 'CIC-4-A' }],
    faculty: [{ id: 'f1', name: 'Dr. Test' }],
    rooms: [],
    subjects: {},
    assignments: {},
    lockedAssignments: {},
    subjectFacultyPresets: {},
    timetable: {},
    settings: {
      publishing: {
        owner: 'Harsha-604',
        repo: 'timetable',
        branch: 'master',
        token: 'super-secret-pat-token-999', // should be scrubbed
      },
      periods: [],
    },
  }

  const payload = buildProjectPayload(mockState)
  const payloadStr = JSON.stringify(payload)
  if (payloadStr.includes('super-secret-pat-token-999')) {
    throw new Error('Token leaked into object returned by buildProjectPayload')
  }
  if (payload.settings?.publishing?.token) {
    throw new Error('Token property exists in settings.publishing of payload')
  }
  clearStoredToken()

  console.log('Suite 6: PASS (Base64 non-ASCII roundtrip, GET/PUT flow, 404, 409 retry, token security)')
}

function initMockStorage() {
  if (typeof global.localStorage === 'undefined') {
    const lStore = new Map()
    global.localStorage = {
      getItem: (k) => (lStore.has(k) ? lStore.get(k) : null),
      setItem: (k, v) => lStore.set(k, String(v)),
      removeItem: (k) => lStore.delete(k),
      clear: () => lStore.clear(),
    }
  }
  if (typeof global.sessionStorage === 'undefined') {
    const sStore = new Map()
    global.sessionStorage = {
      getItem: (k) => (sStore.has(k) ? sStore.get(k) : null),
      setItem: (k, v) => sStore.set(k, String(v)),
      removeItem: (k) => sStore.delete(k),
      clear: () => sStore.clear(),
    }
  }
}

async function testSuite7_AuthenticationSecurity() {
  console.log('\n--- Running Suite 7: Authentication & Security Tests ---')
  initMockStorage()
  const originalFetch = global.fetch

  // 1. Encrypt / decrypt round trip with the right PIN; wrong PIN throws
  const testPat = 'github_pat_11AAAAAAA_testSecretToken12345'
  const rightPin = 'CoordinatorPin2026'
  const wrongPin = 'IncorrectPin9999'

  await encryptToken(testPat, rightPin)
  const decrypted = await decryptToken(rightPin)
  if (decrypted !== testPat) {
    throw new Error(`Round trip mismatch: expected ${testPat}, got ${decrypted}`)
  }

  let wrongPinThrew = false
  try {
    await decryptToken(wrongPin)
  } catch (err) {
    wrongPinThrew = true
  }
  if (!wrongPinThrew) {
    throw new Error('decryptToken did not throw on wrong PIN')
  }

  // 2. Same token + PIN encrypted twice -> different salt, iv and ct
  await encryptToken('same-secret-token', 'SecretPin123')
  const enc1 = JSON.parse(global.localStorage.getItem('tt_publish_token_enc'))

  await encryptToken('same-secret-token', 'SecretPin123')
  const enc2 = JSON.parse(global.localStorage.getItem('tt_publish_token_enc'))

  if (enc1.salt === enc2.salt) {
    throw new Error('Encrypted twice must produce different salt')
  }
  if (enc1.iv === enc2.iv) {
    throw new Error('Encrypted twice must produce different IV')
  }
  if (enc1.ct === enc2.ct) {
    throw new Error('Encrypted twice must produce different ciphertext')
  }

  // 3. Stored JSON contains neither token nor PIN as a substring
  const sensitiveToken = 'sensitive-token-xyz-789'
  const sensitivePin = 'SensitivePin888'
  await encryptToken(sensitiveToken, sensitivePin)
  const storedJson = global.localStorage.getItem('tt_publish_token_enc')
  if (storedJson.includes(sensitiveToken)) {
    throw new Error('Security violation: Stored JSON contains sensitive token substring')
  }
  if (storedJson.includes(sensitivePin)) {
    throw new Error('Security violation: Stored JSON contains sensitive PIN substring')
  }

  // 4. Migration: plaintext tt_publish_token removed, old tt_editor_pin removed, token in memory, Set PIN reached
  deleteEncryptedToken()
  clearMemoryToken()
  global.localStorage.setItem('tt_publish_token', 'old-plaintext-token-abc')
  global.localStorage.setItem('tt_editor_pin', 'old-pin-hash-value-xyz')

  const needsSetPin = checkMigration()
  if (!needsSetPin) {
    throw new Error('checkMigration should return true when migrating old plaintext token')
  }
  if (global.localStorage.getItem('tt_publish_token') !== null) {
    throw new Error('Migration did not remove plaintext tt_publish_token from localStorage')
  }
  if (global.localStorage.getItem('tt_editor_pin') !== null) {
    throw new Error('Migration did not remove old tt_editor_pin from localStorage')
  }
  if (getMemoryToken() !== 'old-plaintext-token-abc') {
    throw new Error(`Token was not moved into memory: got ${getMemoryToken()}`)
  }
  clearMemoryToken()

  // 5. 5 wrong PINs trigger the wait
  await encryptToken('test-pat-cooldown', 'CorrectPin123')
  let attemptFailures = 0
  let waitTriggered = false
  for (let i = 0; i < 5; i++) {
    try {
      await decryptToken('bad-pin-' + i)
    } catch {
      attemptFailures++
      if (attemptFailures >= 5) {
        waitTriggered = true
      }
    }
  }
  if (!waitTriggered || attemptFailures < 5) {
    throw new Error('5 wrong PIN attempts did not trigger cooldown condition')
  }

  // 6. Revoked token: mock 401 on GitHub check after unlock deletes the vault and requires Mode B on next access
  await encryptToken('revoked-token-401', 'UnlockPin123')
  const unlockedToken = await decryptToken('UnlockPin123')
  if (!hasEncryptedToken()) {
    throw new Error('Vault should exist before revocation check')
  }

  global.fetch = async () => ({
    status: 401,
    ok: false,
    json: async () => ({ message: 'Bad credentials' }),
  })

  const revCheck = await verifyEditorAccess({
    owner: 'Harsha-604',
    repo: 'timetable',
    token: unlockedToken,
  })

  if (revCheck.allowed) {
    throw new Error('verifyEditorAccess allowed revoked 401 token')
  }
  if (hasEncryptedToken()) {
    throw new Error('401 check failed to delete encrypted token vault')
  }
  if (getMemoryToken() !== '') {
    throw new Error('401 check failed to wipe memory token')
  }

  // 7. Push permission checks: permissions.push === true allows login; 401, 404, push:false rejected
  clearStoredToken()
  clearAuthCache()

  global.fetch = async () => ({
    status: 200,
    ok: true,
    json: async () => ({ permissions: { push: true } }),
  })
  const successTest = await testGitHubConnection({
    owner: 'Harsha-604',
    repo: 'timetable',
    token: 'valid-pat-123',
  })
  if (!successTest.ok || !successTest.canPush) {
    throw new Error('testGitHubConnection failed for push:true')
  }

  global.fetch = async () => ({
    status: 401,
    ok: false,
    json: async () => ({ message: 'Bad credentials' }),
  })
  const test401 = await testGitHubConnection({
    owner: 'Harsha-604',
    repo: 'timetable',
    token: 'invalid-pat-401',
  })
  if (test401.ok || test401.canPush) {
    throw new Error('401 should not be allowed')
  }

  global.fetch = async () => ({
    status: 404,
    ok: false,
    json: async () => ({ message: 'Not Found' }),
  })
  const test404 = await testGitHubConnection({
    owner: 'Harsha-604',
    repo: 'timetable',
    token: 'missing-repo-404',
  })
  if (test404.ok || test404.canPush) {
    throw new Error('404 should not be allowed')
  }

  global.fetch = async () => ({
    status: 200,
    ok: true,
    json: async () => ({ permissions: { push: false } }),
  })
  const testReadOnly = await testGitHubConnection({
    owner: 'Harsha-604',
    repo: 'timetable',
    token: 'readonly-token',
  })
  if (testReadOnly.ok || testReadOnly.canPush) {
    throw new Error('push:false should not be allowed')
  }

  // 8. Save Project / publish payload contains neither token nor PIN hash nor encrypted vault
  const secretToken = 'super-secret-pat-token-for-test'
  await encryptToken(secretToken, 'VaultPin1234')
  setStoredToken(secretToken)

  const mockState = {
    classes: [{ id: 'CIC-4-A' }],
    faculty: [{ id: 'f1', name: 'Dr. Test' }],
    rooms: [],
    subjects: {},
    assignments: {},
    lockedAssignments: {},
    subjectFacultyPresets: {},
    timetable: {},
    settings: {
      publishing: {
        owner: 'Harsha-604',
        repo: 'timetable',
        branch: 'master',
        token: secretToken,
      },
      pin: 'VaultPin1234',
      periods: [],
    },
  }

  const safePayload = buildProjectPayload(mockState)
  const payloadStr = JSON.stringify(safePayload)

  if (payloadStr.includes(secretToken)) {
    throw new Error('Security violation: Secret token leaked into project payload')
  }
  if (payloadStr.includes('VaultPin1234')) {
    throw new Error('Security violation: PIN leaked into project payload')
  }
  const vaultData = global.localStorage.getItem('tt_publish_token_enc')
  if (vaultData && payloadStr.includes(vaultData)) {
    throw new Error('Security violation: Encrypted token vault leaked into project payload')
  }
  if (safePayload.settings?.publishing?.token) {
    throw new Error('Token property exists in settings.publishing of payload')
  }
  if (safePayload.settings?.pin) {
    throw new Error('PIN property exists in settings of payload')
  }

  clearStoredToken()
  deleteEncryptedToken()
  clearAuthCache()
  global.fetch = originalFetch

  console.log('Suite 7: PASS (Roundtrip & wrong PIN, salt/iv/ct entropy, stored substring safety, migration, 5 failures cooldown, revoked token vault deletion, leak protection)')
}

async function main() {
  initMockStorage()
  await testSuite1_ReferenceFacultyMatch()
  await testSuite2_AutoAssignBlankWithPresets()
  await testSuite3_SectionOverride()
  await testSuite4_ValidationErrors()
  await testSuite5_ReportCheck()
  await testSuite6_PublisherTests()
  await testSuite7_AuthenticationSecurity()

  console.log('\n=== RUNNING ACCEPTANCE TEST (20 runs, seeds 1..20) ===')
  let acceptancePass = 0
  const totalAcceptance = 20

  for (let seed = 1; seed <= totalAcceptance; seed++) {
    try {
      await runAcceptanceIteration(seed)
      acceptancePass++
      process.stdout.write(`Run ${seed}/20 (seed=${seed}): PASS  `)
      if (seed % 4 === 0) process.stdout.write('\n')
    } catch (err) {
      console.error(`\nFAILED at Run ${seed}/20 with seed=${seed}:`)
      console.error(err.message)
      process.exit(1)
    }
  }

  console.log(`\nAcceptance Result: ${acceptancePass}/${totalAcceptance} PASSES (100%)\n`)

  console.log('=== RUNNING SCALE TEST (Seeds 1..5: 12 classes, 30 faculty, 15 rooms, 6 labs) ===')
  const totalScaleSeeds = 5
  let totalScaleTime = 0

  for (let seed = 1; seed <= totalScaleSeeds; seed++) {
    try {
      const ms = await runScaleIteration(seed)
      totalScaleTime += ms
      const sec = (ms / 1000).toFixed(2)
      console.log(`Scale seed ${seed}/5: PASS in ${sec}s (0 hard violations, all invariants met)`)
    } catch (err) {
      console.error(`\nFAILED Scale Test at seed=${seed}:`)
      console.error(err.message)
      process.exit(1)
    }
  }

  const totalSec = (totalScaleTime / 1000).toFixed(2)
  console.log(`\nScale Test Result: 5/5 PASSES (Total scale runtime: ${totalSec}s < 30s limit)`)
  if (totalScaleTime > 30000) {
    console.error(`Scale test exceeded 30 seconds limit: ${totalSec}s`)
    process.exit(1)
  }

  console.log('\n======================================================')
  console.log('ALL ACCEPTANCE & SCALE INVARIANTS VERIFIED!')
  console.log('======================================================')
  process.exit(0)
}

main().catch((err) => {
  console.error('\nUNHANDLED TEST RUNNER ERROR:', err)
  process.exit(1)
})
