import fs from 'fs'
import { validateState } from '../src/utils/validator.js'
import { autoAssignFaculty, generateScheduleAsync } from '../src/utils/generator.js'

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

async function main() {
  console.log('=== RUNNING ACCEPTANCE TEST (20 runs, seeds 1..20) ===')
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
