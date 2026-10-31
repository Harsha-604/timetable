import { BRANCHES } from './constants.js'
import { getBranchYearKey } from './helpers.js'

/**
 * Check if a faculty member is qualified to teach a given subject for a branch-year.
 */
export function isFacultyQualified(facultyMember, sub, branchYearKey) {
  if (!facultyMember || !sub) return false
  const subs = Array.isArray(facultyMember.subjects)
    ? facultyMember.subjects
    : String(facultyMember.subjects || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

  if (subs.length === 0) return false

  const targetCode = (sub.code || '').trim().toLowerCase()
  const targetName = (sub.name || '').trim().toLowerCase()
  const scopedCode = `${branchYearKey}:${sub.code}`.toLowerCase()
  const scopedName = `${branchYearKey}:${sub.name}`.toLowerCase()

  return subs.some((s) => {
    const str = String(s || '').trim().toLowerCase()
    return (
      str === targetCode ||
      str === targetName ||
      str === scopedCode ||
      str === scopedName
    )
  })
}

/**
 * Validates the entire state:
 * - unknown branch names, duplicate faculty short names
 * - Lab/Project subjects without a valid lab room
 * - per class: total required periods vs available slots
 * - subjects with no preset faculty AND no qualified faculty in faculty sheet (ERROR)
 * - faculty whose PRESET load exceeds Max Periods/Week (ERROR)
 * - two subjects in SAME class preset to a faculty > 30 periods (WARNING)
 * - importErrors if passed (e.g. unknown short name, missing section) (ERROR)
 */
export function validateState(state) {
  const {
    classes = [],
    faculty = [],
    rooms = [],
    subjects = {},
    settings = {},
    assignments = {},
    importErrors = [],
  } = state
  const errors = [...(importErrors || [])]
  const warnings = []

  // 1. Unknown branch names & Duplicate faculty short names
  const facultyShorts = new Set()
  faculty.forEach((f) => {
    const short = (f.short || '').trim().toUpperCase()
    if (!short) {
      errors.push(`Faculty "${f.name || f.id}" has no short code.`)
    } else if (facultyShorts.has(short)) {
      errors.push(`Duplicate faculty short name "${short}" found for "${f.name}".`)
    } else {
      facultyShorts.add(short)
    }
  })

  // Check unknown branch names in subjects
  Object.keys(subjects).forEach((byKey) => {
    const [branch] = byKey.split('-')
    if (!BRANCHES.includes(branch)) {
      errors.push(
        `Unknown branch name "${branch}" in subjects (${byKey}). Allowed branches: ${BRANCHES.join(', ')}.`
      )
    }
  })

  // Check unknown branch names in classes
  classes.forEach((c) => {
    if (!BRANCHES.includes(c.branch)) {
      errors.push(
        `Unknown branch name "${c.branch}" in class "${c.id}". Allowed branches: ${BRANCHES.join(', ')}.`
      )
    }
  })

  // 2. Validate subjects & faculty requirements per class
  const periodsConfig = settings.periods || []
  const teachingPeriodsCount = periodsConfig.filter((p) => !p.brk).length || 6

  // Validate lab rooms for all defined subjects
  Object.entries(subjects).forEach(([byKey, subList]) => {
    if (!Array.isArray(subList)) return
    subList.forEach((sub) => {
      if (sub.type === 'Lab' || sub.type === 'Project') {
        const hasValidRoom = rooms.some(
          (r) =>
            (r.roomNo && r.roomNo.toLowerCase() === (sub.labRoomId || '').toLowerCase()) ||
            (r.name && r.name.toLowerCase() === (sub.labRoomId || '').toLowerCase()) ||
            (r.id && r.id.toLowerCase() === (sub.labRoomId || '').toLowerCase())
        )
        if (!hasValidRoom) {
          errors.push(
            `Subject "${sub.code || sub.name}" (${byKey}) is ${sub.type} but has no valid Lab Room specified ("${sub.labRoomId || 'none'}").`
          )
        }
      }
    })
  })

  // Check qualified / preset faculty per class
  classes.forEach((c) => {
    const byKey = getBranchYearKey(c.branch, c.year)
    const subList = subjects[byKey] || []

    subList.forEach((sub) => {
      const facReq = sub.facultyReq ?? (sub.type === 'Lab' ? 2 : 1)
      const assigned = assignments[c.id]?.[sub.id] || []

      // If preset/assigned, no qualification check is required!
      if (assigned.length > 0) {
        if (assigned.length < facReq) {
          errors.push(
            `Subject "${sub.code || sub.name}" in class "${c.id}" requires ${facReq} faculty, but only ${assigned.length} assigned.`
          )
        }
        return
      }

      // If not preset, check qualified faculty in faculty list
      const qualified = faculty.filter((f) => isFacultyQualified(f, sub, byKey))
      if (qualified.length === 0) {
        errors.push(
          `Subject "${sub.code || sub.name}" in class "${c.id}" has no preset faculty AND no qualified faculty in the faculty sheet.`
        )
      } else if (qualified.length < facReq) {
        errors.push(
          `Subject "${sub.code || sub.name}" in class "${c.id}" requires ${facReq} faculty, but only ${qualified.length} qualified (${qualified.map((q) => q.short).join(', ')}).`
        )
      }
    })
  })

  // 3. Per class: total required periods vs available slots
  classes.forEach((c) => {
    const byKey = getBranchYearKey(c.branch, c.year)
    const subs = subjects[byKey] || []
    const totalRequired = subs.reduce((sum, s) => sum + (Number(s.periods) || 0), 0)

    const workingDays = c.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    const hasSat = workingDays.includes('Sat')
    const weekdayCount = workingDays.filter((d) => d !== 'Sat').length
    const satPeriods = hasSat ? Number(c.saturdayPeriods) || 4 : 0
    const availableSlots = weekdayCount * teachingPeriodsCount + satPeriods

    if (totalRequired > availableSlots) {
      errors.push(
        `Class ${c.id}: Total required periods (${totalRequired}) exceed available slots (${availableSlots}) based on working days.`
      )
    }
  })

  // 4. Preset faculty load check (ERROR)
  faculty.forEach((f) => {
    const maxLoad = Number(f.max) || 30
    let presetLoad = 0
    const presetSubjects = []

    classes.forEach((c) => {
      const byKey = getBranchYearKey(c.branch, c.year)
      const subs = subjects[byKey] || []
      subs.forEach((s) => {
        const team = assignments[c.id]?.[s.id] || []
        if (team.includes(f.id)) {
          const p = Number(s.periods) || 0
          presetLoad += p
          presetSubjects.push(`${c.id} ${s.code || s.name} (${p}p)`)
        }
      })
    })

    if (presetLoad > maxLoad) {
      errors.push(
        `Faculty ${f.short} (${f.name}) preset load (${presetLoad} periods/wk) exceeds Max Periods/Week (${maxLoad}). Subjects causing it: ${presetSubjects.join(', ')}.`
      )
    }
  })

  // 5. Check if two subjects in the SAME class preset to a faculty whose combined load in that class alone exceeds 30 (WARNING)
  classes.forEach((c) => {
    const byKey = getBranchYearKey(c.branch, c.year)
    const subs = subjects[byKey] || []

    faculty.forEach((f) => {
      let loadInClass = 0
      subs.forEach((s) => {
        const team = assignments[c.id]?.[s.id] || []
        if (team.includes(f.id)) {
          loadInClass += Number(s.periods) || 0
        }
      })

      if (loadInClass > 30) {
        warnings.push(
          `Faculty ${f.short} is preset to ${loadInClass} periods in class ${c.id} alone (exceeds 30 periods/week, unschedulable).`
        )
      }
    })
  })

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Audits the finished timetable for all classes against all HARD scheduling invariants.
 * Returns { isValid, hardViolations: [{ classId, day, period, type, rule, message }] }
 */
export function auditTimetableHardViolations(
  timetablesOrOptions = {},
  optionalState = null
) {
  let opts = timetablesOrOptions
  if (optionalState && typeof optionalState === 'object') {
    opts = {
      timetables: timetablesOrOptions,
      ...optionalState,
    }
  }
  const {
    timetables = {},
    classes = [],
    subjects = {},
    faculty = [],
    rooms = [],
    assignments = {},
    settings = {},
    unplaced = [],
  } = opts
  const hardViolations = []
  const facultyMap = Object.fromEntries(faculty.map((f) => [f.id, f]))
  const roomMap = Object.fromEntries(
    rooms.map((r) => [r.roomNo?.toLowerCase() || r.name?.toLowerCase() || r.id?.toLowerCase(), r])
  )
  const labWindows = settings.labWindows || [
    ['p1', 'p2'],
    ['p3', 'p4'],
    ['p5', 'p6'],
  ]
  const teachingPeriods = (settings.periods || []).filter((p) => !p.brk)
  const periodOrder = teachingPeriods.map((p) => p.id)

  // 1. Unplaced blocks
  if (Array.isArray(unplaced) && unplaced.length > 0) {
    unplaced.forEach((u) => {
      hardViolations.push({
        classId: u.classId,
        type: 'UNPLACED_BLOCK',
        rule: 'Unplaced Block',
        message: `${u.classId} ${u.sub?.code || u.sub?.name || 'Subject'}: ${u.reason || 'Could not be placed'}`,
      })
    })
  }

  // Track faculty occupancy: `${facId}|${day}|${pid}` -> [ entries ]
  // Track room occupancy: `${roomId.toLowerCase()}|${day}|${pid}` -> [ entries ]
  const facOccupancy = {}
  const roomOccupancy = {}
  const facTaughtLoad = {}
  faculty.forEach((f) => {
    facTaughtLoad[f.id] = 0
  })

  classes.forEach((c) => {
    const tt = timetables[c.id] || {}
    const byKey = getBranchYearKey(c.branch, c.year)
    const subList = subjects[byKey] || []
    const subMap = Object.fromEntries(subList.map((s) => [s.id, s]))
    const workingDays = c.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

    workingDays.forEach((day) => {
      const daySlots = tt[day] || {}

      periodOrder.forEach((pid) => {
        const slot = daySlots[pid]
        if (!slot) return

        const sub = subMap[slot.subId] || { id: slot.subId, code: slot.subCode, name: slot.subCode }
        const team = slot.facIds || (slot.facId ? [slot.facId] : [])
        const assignedTeam = assignments[c.id]?.[slot.subId] || []
        const expectedTeamSize = assignedTeam.length || sub.facultyReq || (sub.type === 'Lab' ? 2 : 1)

        // Check: Any cell with no faculty, or fewer faculty than subject's team size
        if (team.length === 0) {
          hardViolations.push({
            classId: c.id,
            day,
            period: pid,
            type: 'NO_FACULTY',
            rule: 'No Faculty in Cell',
            message: `${c.id} on ${day} ${pid} (${slot.subCode || sub.code}): No faculty assigned to cell`,
          })
        } else if (team.length < expectedTeamSize) {
          const names = team.map((id) => facultyMap[id]?.short || id).join(', ')
          hardViolations.push({
            classId: c.id,
            day,
            period: pid,
            type: 'FEWER_FACULTY',
            rule: 'Fewer Faculty Than Team Size',
            message: `${c.id} on ${day} ${pid} (${slot.subCode || sub.code}): Has ${team.length} faculty (${names}), expected ${expectedTeamSize}`,
          })
        }

        // Check: Cell whose faculty team differs from subject's assigned team for that class
        if (assignedTeam.length > 0) {
          const sortedTeam = [...team].sort().join(',')
          const sortedAssigned = [...assignedTeam].sort().join(',')
          if (sortedTeam !== sortedAssigned) {
            const teamNames = team.map((id) => facultyMap[id]?.short || id).join(', ')
            const assignedNames = assignedTeam.map((id) => facultyMap[id]?.short || id).join(', ')
            hardViolations.push({
              classId: c.id,
              day,
              period: pid,
              type: 'TEAM_MISMATCH',
              rule: 'Faculty Team Mismatch',
              message: `${c.id} on ${day} ${pid} (${slot.subCode || sub.code}): Faculty team (${teamNames}) differs from assigned team (${assignedNames})`,
            })
          }
        }

        // Tally taught periods for faculty
        team.forEach((fid) => {
          facTaughtLoad[fid] = (facTaughtLoad[fid] || 0) + 1
          const fKey = `${fid}|${day}|${pid}`
          if (!facOccupancy[fKey]) facOccupancy[fKey] = []
          facOccupancy[fKey].push({ classId: c.id, slot, day, pid, subCode: slot.subCode || sub.code })
        })

        // Tally room occupancy
        if (slot.roomId) {
          const rKey = slot.roomId.toLowerCase()
          const slotOccKey = `${rKey}|${day}|${pid}`
          if (!roomOccupancy[slotOccKey]) roomOccupancy[slotOccKey] = []
          roomOccupancy[slotOccKey].push({
            classId: c.id,
            slot,
            day,
            period: pid,
            roomId: slot.roomId,
            subCode: slot.subCode || sub.code,
          })
        }

        // Check: Lab/project blocks outside lab windows or outside Lab Room
        const isLabOrProj =
          sub.type === 'Lab' || sub.type === 'Project' || (slot.blockSize && slot.blockSize > 1)
        if (isLabOrProj && (slot.blockStart === pid || !slot.blockStart)) {
          const bSize = slot.blockSize || 2
          const pIdx = periodOrder.indexOf(pid)
          const blockPids = periodOrder.slice(pIdx, pIdx + bSize)

          if (bSize > 1) {
            const matchesWindow = labWindows.some(
              (w) => w.length === blockPids.length && w.every((p, idx) => p === blockPids[idx])
            )
            if (!matchesWindow) {
              hardViolations.push({
                classId: c.id,
                day,
                period: pid,
                type: 'INVALID_LAB_WINDOW',
                rule: 'Lab Outside Allowed Window',
                message: `${c.id} on ${day} ${pid} (${slot.subCode || sub.code}): Multi-period block (${blockPids.join('-')}) is outside configured lab windows`,
              })
            }
          }

          // Check Lab Room
          if (sub.labRoomId) {
            const reqRoom = sub.labRoomId.trim().toLowerCase()
            const actRoom = (slot.roomId || '').trim().toLowerCase()
            const reqObj = roomMap[reqRoom]
            const actObj = roomMap[actRoom]
            const match =
              reqRoom === actRoom ||
              (reqObj && actObj && (reqObj.id === actObj.id || reqObj.roomNo?.toLowerCase() === actObj.roomNo?.toLowerCase()))
            if (!match) {
              hardViolations.push({
                classId: c.id,
                day,
                period: pid,
                type: 'INVALID_LAB_ROOM',
                rule: 'Lab In Wrong Room',
                message: `${c.id} on ${day} ${pid} (${slot.subCode || sub.code}): Scheduled in room "${slot.roomId || 'none'}", expected Lab Room "${sub.labRoomId}"`,
              })
            }
          }
        }
      })
    })
  })

  // Check: Faculty clash across classes
  Object.entries(facOccupancy).forEach(([key, entries]) => {
    if (entries.length > 1) {
      const [fid, day, pid] = key.split('|')
      const fac = facultyMap[fid]
      const facName = fac ? `${fac.short} (${fac.name})` : fid
      const classList = entries.map((e) => `${e.classId} [${e.subCode}]`).join(' & ')
      hardViolations.push({
        facId: fid,
        day,
        period: pid,
        type: 'FACULTY_CLASH',
        rule: 'Faculty Double-Booked',
        message: `Faculty ${facName} in multiple classes on ${day} ${pid}: ${classList}`,
      })
    }
  })

  // Check: Room clash across classes
  Object.entries(roomOccupancy).forEach(([key, entries]) => {
    if (entries.length > 1) {
      const [rKey, day, pid] = key.split('|')
      const room = roomMap[rKey]
      const roomName = room ? `${room.roomNo || room.name}` : rKey
      const classList = entries.map((e) => `${e.classId} [${e.subCode}]`).join(' & ')
      hardViolations.push({
        roomId: rKey,
        day,
        period: pid,
        type: 'ROOM_CLASH',
        rule: 'Room Double-Booked',
        message: `Room "${roomName}" used by multiple classes on ${day} ${pid}: ${classList}`,
      })
    }
  })

  // Check: Faculty over Max Periods/Week
  faculty.forEach((f) => {
    const max = Number(f.max) || 30
    const taught = facTaughtLoad[f.id] || 0
    if (taught > max) {
      hardViolations.push({
        facId: f.id,
        type: 'FACULTY_OVERLOAD',
        rule: 'Faculty Exceeds Max Load',
        message: `Faculty ${f.short} (${f.name}) scheduled for ${taught} periods/week (exceeds max of ${f.max})`,
      })
    }
  })

  return {
    isValid: hardViolations.length === 0,
    hardViolations,
  }
}
