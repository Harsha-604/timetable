import { isFacultyQualified } from './validator.js'
import { getBranchYearKey } from './helpers.js'

/**
 * Step A: Auto-assign teaching teams for selected classes.
 * - Theory: 1 faculty
 * - Lab / Project: subject.facultyReq (default 2 for Lab, 1 for Project/Theory)
 * - From qualified faculty only
 * - Balance load respecting faculty.max
 * - For a Lab whose code matches a theory subject (e.g. "BCT Lab" and "BCT"),
 *   include the theory teacher in the lab team when possible.
 */
export function autoAssignFaculty({ classes, subjects, faculty, existingAssignments = {}, lockedAssignments = {} }) {
  const assignments = JSON.parse(JSON.stringify(existingAssignments || {}))
  const facLoad = {}
  faculty.forEach((f) => {
    facLoad[f.id] = 0
  })

  // Count existing locked or manual assignments
  classes.forEach((c) => {
    const classAss = assignments[c.id] || {}
    const byKey = getBranchYearKey(c.branch, c.year)
    const subList = subjects[byKey] || []

    subList.forEach((s) => {
      const assigned = classAss[s.id]
      if (assigned && Array.isArray(assigned)) {
        assigned.forEach((fId) => {
          if (facLoad[fId] !== undefined) {
            facLoad[fId] += Number(s.periods) || 0
          }
        })
      }
    })
  })

  // Helper to find matching theory teacher for a lab
  function findMatchingTheoryTeacher(sub, classId, subList) {
    if (sub.type !== 'Lab') return null
    const baseCode = (sub.code || '').replace(/\s+Lab$/i, '').trim().toLowerCase()
    const baseName = (sub.name || '').replace(/\s+Lab$/i, '').trim().toLowerCase()

    const theorySub = subList.find(
      (s) =>
        s.type === 'Theory' &&
        ((s.code || '').trim().toLowerCase() === baseCode ||
          (s.name || '').trim().toLowerCase() === baseName)
    )

    if (!theorySub) return null
    const theoryAssigned = assignments[classId]?.[theorySub.id]
    if (theoryAssigned && theoryAssigned.length > 0) {
      return theoryAssigned[0]
    }
    return null
  }

  // Assign for each class
  classes.forEach((c) => {
    if (!assignments[c.id]) assignments[c.id] = {}
    const byKey = getBranchYearKey(c.branch, c.year)
    const subList = subjects[byKey] || []

    // Pass 1: Theory first so lab can inherit theory teacher
    const theorySubs = subList.filter((s) => s.type === 'Theory')
    const labSubs = subList.filter((s) => s.type !== 'Theory')

    const processSub = (s) => {
      const isLocked = lockedAssignments[c.id]?.[s.id]
      if (isLocked && assignments[c.id][s.id]?.length) {
        return // Keep locked
      }

      const reqCount = s.facultyReq ?? (s.type === 'Lab' ? 2 : 1)
      const qualified = faculty.filter((f) => isFacultyQualified(f, s, byKey))

      if (qualified.length === 0) {
        assignments[c.id][s.id] = []
        return
      }

      const team = []
      const teamSet = new Set()

      // If Lab, try to include theory teacher
      if (s.type === 'Lab') {
        const theoryFacId = findMatchingTheoryTeacher(s, c.id, subList)
        if (theoryFacId) {
          const facObj = faculty.find((f) => f.id === theoryFacId)
          if (facObj && isFacultyQualified(facObj, s, byKey)) {
            team.push(theoryFacId)
            teamSet.add(theoryFacId)
            facLoad[theoryFacId] += Number(s.periods) || 0
          }
        }
      }

      // Sort remaining qualified faculty by load vs max
      const remainingQualified = qualified.filter((f) => !teamSet.has(f.id))
      remainingQualified.sort((a, b) => {
        const loadA = facLoad[a.id] || 0
        const loadB = facLoad[b.id] || 0
        const maxA = Number(a.max) || 30
        const maxB = Number(b.max) || 30
        const overflowA = loadA >= maxA ? 1000 : 0
        const overflowB = loadB >= maxB ? 1000 : 0
        return overflowA + loadA - (overflowB + loadB)
      })

      for (const f of remainingQualified) {
        if (team.length >= reqCount) break
        team.push(f.id)
        teamSet.add(f.id)
        facLoad[f.id] = (facLoad[f.id] || 0) + (Number(s.periods) || 0)
      }

      assignments[c.id][s.id] = team
    }

    theorySubs.forEach(processSub)
    labSubs.forEach(processSub)
  })

  return assignments
}

/**
 * Calculate soft score for a candidate timetable schedule across all classes.
 * Lower is better.
 */
export function calculateSoftScore({ timetables, classes, subjects, faculty, settings }) {
  let score = 0
  const violations = []
  const teachingPeriods = (settings.periods || []).filter((p) => !p.brk)
  const periodOrder = teachingPeriods.map((p) => p.id)

  classes.forEach((c) => {
    const tt = timetables[c.id] || {}
    const byKey = getBranchYearKey(c.branch, c.year)
    const subList = subjects[byKey] || []
    const subMap = Object.fromEntries(subList.map((s) => [s.id, s]))

    const days = c.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

    days.forEach((day) => {
      const daySlots = tt[day] || {}
      const placedTasks = []
      const occupiedPeriodIndices = []

      periodOrder.forEach((pid, pIdx) => {
        const slot = daySlots[pid]
        if (slot) {
          occupiedPeriodIndices.push(pIdx)
          if (slot.blockStart === pid || !slot.blockStart) {
            placedTasks.push({ pid, slot, sub: subMap[slot.subId] })
          }
        }
      })

      // Soft Rule A: A theory subject appears at most once per day per class
      const theorySubsOnDay = {}
      placedTasks.forEach((t) => {
        if (t.sub && t.sub.type === 'Theory') {
          theorySubsOnDay[t.sub.id] = (theorySubsOnDay[t.sub.id] || 0) + 1
          if (theorySubsOnDay[t.sub.id] > 1) {
            score += 50
            violations.push({
              classId: c.id,
              day,
              period: t.pid,
              rule: 'Theory subject twice on same day',
              text: `${t.sub.code || t.sub.name} appears multiple times on ${day}`,
            })
          }
        }
      })

      // Soft Rule B: At most one lab/project block per day per class
      const labBlocksOnDay = placedTasks.filter(
        (t) => t.sub && (t.sub.type === 'Lab' || t.sub.type === 'Project')
      )
      if (labBlocksOnDay.length > 1) {
        const extra = labBlocksOnDay.length - 1
        score += extra * 50
        violations.push({
          classId: c.id,
          day,
          rule: 'Multiple lab blocks on same day',
          text: `${labBlocksOnDay.length} labs scheduled on ${day}`,
        })
      }

      // Soft Rule D: No empty periods in the middle of a class's day
      if (occupiedPeriodIndices.length > 1) {
        const minP = occupiedPeriodIndices[0]
        const maxP = occupiedPeriodIndices[occupiedPeriodIndices.length - 1]
        for (let pIdx = minP; pIdx <= maxP; pIdx++) {
          const pid = periodOrder[pIdx]
          if (!daySlots[pid]) {
            score += 20
            violations.push({
              classId: c.id,
              day,
              period: pid,
              rule: 'Gap in class schedule',
              text: `Middle gap at period ${pid} on ${day}`,
            })
          }
        }
      }
    })

    // Soft Rule E: Spread each subject's periods across different days
    subList.forEach((sub) => {
      const daysWithSub = new Set()
      days.forEach((day) => {
        if (Object.values(tt[day] || {}).some((slot) => slot.subId === sub.id)) {
          daysWithSub.add(day)
        }
      })
      const expectedDays = Math.min(days.length, Math.ceil(sub.periods / (sub.block || 1)))
      if (daysWithSub.size < expectedDays) {
        const diff = expectedDays - daysWithSub.size
        score += diff * 15
      }
    })
  })

  // Soft Rule C: No faculty teaches more than 3 consecutive periods across classes
  const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  faculty.forEach((fac) => {
    allDays.forEach((day) => {
      let streak = 0
      periodOrder.forEach((pid) => {
        let isTeaching = false
        for (const cls of classes) {
          const slot = timetables[cls.id]?.[day]?.[pid]
          if (slot) {
            const team = slot.facIds || (slot.facId ? [slot.facId] : [])
            if (team.includes(fac.id)) {
              isTeaching = true
              break
            }
          }
        }
        if (isTeaching) {
          streak++
          if (streak > 3) {
            score += 30
            violations.push({
              facId: fac.id,
              day,
              period: pid,
              rule: 'Faculty consecutive limit',
              text: `${fac.short} teaches >3 consecutive periods on ${day} at ${pid}`,
            })
          }
        } else {
          streak = 0
        }
      })
    })
  })

  return { score, violations }
}

export function mulberry32(a) {
  let s = a >>> 0
  return function () {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Step B: Scheduling Engine
 * Randomized greedy with backtracking + Swap Repair pass
 */
export async function generateScheduleAsync({
  classes,
  subjects,
  faculty,
  rooms,
  assignments,
  settings,
  existingTimetables = {},
  options = {},
  onProgress,
}) {
  const seed =
    options.seed !== undefined && options.seed !== null
      ? Number(options.seed) >>> 0
      : Math.floor(Math.random() * 0xffffffff) >>> 0
  const rand = mulberry32(seed)

  const totalAttempts = options.attempts || 200
  const teachingPeriods = (settings.periods || []).filter((p) => !p.brk)
  const periodOrder = teachingPeriods.map((p) => p.id)
  const labWindows = settings.labWindows || [
    ['p1', 'p2'],
    ['p3', 'p4'],
    ['p5', 'p6'],
  ]

  // Pre-expand tasks per class
  const classTasks = []
  const commonGroupBlocks = {} // key: `${group}_${bi}` -> [task1, task2, ...]

  classes.forEach((c) => {
    const byKey = getBranchYearKey(c.branch, c.year)
    const subList = subjects[byKey] || []
    const homeRoom =
      rooms.find(
        (r) =>
          r.id === c.homeRoomId ||
          r.name === c.homeRoomId ||
          r.roomNo === c.homeRoomId
      ) ||
      rooms.find((r) => r.type === 'Classroom') ||
      rooms[0]

    subList.forEach((sub) => {
      const team = assignments[c.id]?.[sub.id] || []
      const bs = sub.block || 1
      const totalBlocks = Math.ceil(sub.periods / bs)

      let assignedLabRoom = null
      if (sub.type === 'Lab' || sub.type === 'Project') {
        assignedLabRoom =
          rooms.find(
            (r) =>
              r.roomNo === sub.labRoomId ||
              r.name === sub.labRoomId ||
              r.id === sub.labRoomId
          ) || rooms.find((r) => r.type === 'Lab')
      }

      for (let bi = 0; bi < totalBlocks; bi++) {
        const task = {
          id: `${c.id}_${sub.id}_${bi}`,
          classId: c.id,
          classObj: c,
          sub,
          blockSize: bs,
          blockIndex: bi,
          team,
          homeRoomId: homeRoom?.roomNo || homeRoom?.name || homeRoom?.id || '',
          labRoomId: assignedLabRoom?.roomNo || assignedLabRoom?.name || assignedLabRoom?.id || '',
          commonGroup: sub.commonGroup || '',
        }

        if (sub.commonGroup) {
          const gKey = `${sub.commonGroup}_${bi}`
          if (!commonGroupBlocks[gKey]) commonGroupBlocks[gKey] = []
          commonGroupBlocks[gKey].push(task)
        } else {
          classTasks.push(task)
        }
      }
    })
  })

  // Separate meta-tasks for common slot groups
  const commonMetaTasks = Object.entries(commonGroupBlocks).map(([gKey, tasks]) => ({
    groupKey: gKey,
    group: tasks[0]?.commonGroup || '',
    tasks,
    blockSize: tasks[0]?.blockSize || 1,
  }))

  let bestSolution = null
  let bestScore = Infinity
  let bestViolations = []
  let bestUnplaced = []

  const chunkSize = 20
  let attempt = 0

  while (attempt < totalAttempts) {
    const chunkLimit = Math.min(attempt + chunkSize, totalAttempts)

    for (; attempt < chunkLimit; attempt++) {
      const tt = {}
      classes.forEach((c) => {
        tt[c.id] = {}
        const days = c.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
        days.forEach((d) => (tt[c.id][d] = {}))
      })

      const facOccupancy = new Set()
      const roomOccupancy = new Set()
      const classOccupancy = new Set()

      // Place locked cells first (HARD RULE 9)
      classes.forEach((c) => {
        const existingTT = existingTimetables[c.id] || {}
        Object.entries(existingTT).forEach(([day, slots]) => {
          Object.entries(slots).forEach(([pid, slot]) => {
            if (slot.locked && tt[c.id][day]) {
              tt[c.id][day][pid] = { ...slot }
              classOccupancy.add(`${c.id}|${day}|${pid}`)
              if (slot.roomId) roomOccupancy.add(`${slot.roomId.toLowerCase()}|${day}|${pid}`)
              const team = slot.facIds || (slot.facId ? [slot.facId] : [])
              team.forEach((fid) => facOccupancy.add(`${fid}|${day}|${pid}`))
            }
          })
        })
      })

      const unplaced = []

      function canPlace(task, day, pids) {
        const { classId, classObj, sub, team, homeRoomId, labRoomId } = task
        const roomId = (sub.type === 'Lab' || sub.type === 'Project') ? labRoomId : homeRoomId

        // Saturday limit check (HARD RULE 7)
        if (day === 'Sat') {
          const satLimit = classObj.saturdayPeriods || 4
          for (const pid of pids) {
            const idx = periodOrder.indexOf(pid)
            if (idx >= satLimit) return false
          }
        }

        // Multi-period lab window check (HARD RULE 3)
        if (pids.length > 1) {
          const isAllowedWindow = labWindows.some(
            (w) => w.length === pids.length && w.every((p, i) => p === pids[i])
          )
          if (!isAllowedWindow) return false
        }

        // At most one lab block per day per class
        if (pids.length > 1 || sub.type === 'Lab' || sub.type === 'Project') {
          const labCount = Object.entries(tt[classId][day] || {}).filter(
            ([pid, s]) => s.blockSize > 1 && s.blockStart === pid
          ).length
          if (labCount >= 1) return false
        }

        // Each theory subject at most once per day per class
        if (sub.type !== 'Lab' && sub.type !== 'Project') {
          const hasSub = Object.values(tt[classId][day] || {}).some(
            (s) => s.subId === sub.id
          )
          if (hasSub) return false
        }

        // Class free?
        if (pids.some((p) => classOccupancy.has(`${classId}|${day}|${p}`))) return false

        // Room free?
        if (roomId && pids.some((p) => roomOccupancy.has(`${roomId.toLowerCase()}|${day}|${p}`))) {
          return false
        }

        // Faculty free?
        for (const fid of team) {
          if (pids.some((p) => facOccupancy.has(`${fid}|${day}|${p}`))) return false
        }

        return true
      }

      function placeTask(task, day, pids) {
        const { classId, sub, team, homeRoomId, labRoomId } = task
        const roomId = (sub.type === 'Lab' || sub.type === 'Project') ? labRoomId : homeRoomId

        pids.forEach((p) => {
          tt[classId][day][p] = {
            subId: sub.id,
            subCode: sub.code || sub.name,
            facIds: team,
            facId: team[0] || '',
            roomId,
            blockStart: pids[0],
            blockSize: pids.length,
            locked: false,
          }
          classOccupancy.add(`${classId}|${day}|${p}`)
          if (roomId) roomOccupancy.add(`${roomId.toLowerCase()}|${day}|${p}`)
          team.forEach((fid) => facOccupancy.add(`${fid}|${day}|${p}`))
        })
      }

      function unplaceTask(classId, day, pids) {
        const slot = tt[classId]?.[day]?.[pids[0]]
        if (!slot) return null
        const roomId = slot.roomId
        const team = slot.facIds || (slot.facId ? [slot.facId] : [])
        pids.forEach((p) => {
          delete tt[classId][day][p]
          classOccupancy.delete(`${classId}|${day}|${p}`)
          if (roomId) roomOccupancy.delete(`${roomId.toLowerCase()}|${day}|${p}`)
          team.forEach((fid) => facOccupancy.delete(`${fid}|${day}|${p}`))
        })
        return slot
      }

      function tryLabSwapOrEjection(task) {
        const { classId, classObj, team, labRoomId } = task
        const days = [...(classObj.workingDays || [])].sort(() => rand() - 0.5)

        // 1. Intra-class lab swap: try swapping with another lab block in the same class
        const existingLabsInClass = []
        days.forEach((d) => {
          Object.entries(tt[classId][d] || {}).forEach(([pid, slot]) => {
            if (slot.blockSize > 1 && slot.blockStart === pid && !slot.locked) {
              const win = labWindows.find((w) => w[0] === pid) || [pid]
              existingLabsInClass.push({ day: d, pids: win, slot })
            }
          })
        })

        for (const existing of existingLabsInClass) {
          unplaceTask(classId, existing.day, existing.pids)

          let placedTask = false
          let taskDay = null
          let taskWin = null

          const candidateDays = [existing.day, ...days.filter((d) => d !== existing.day)]
          for (const d of candidateDays) {
            for (const win of labWindows) {
              if (canPlace(task, d, win)) {
                placeTask(task, d, win)
                placedTask = true
                taskDay = d
                taskWin = win
                break
              }
            }
            if (placedTask) break
          }

          if (placedTask) {
            const existingSub = subjects[getBranchYearKey(classObj.branch, classObj.year)]?.find(
              (s) => s.id === existing.slot.subId
            ) || {
              id: existing.slot.subId,
              code: existing.slot.subCode,
              type: 'Lab',
              labRoomId: existing.slot.roomId,
            }
            const existingTaskObj = {
              classId,
              classObj,
              sub: existingSub,
              team: existing.slot.facIds || [existing.slot.facId],
              homeRoomId: task.homeRoomId,
              labRoomId: existing.slot.roomId,
            }

            let placedExisting = false
            for (const d of days) {
              for (const win of labWindows) {
                if (canPlace(existingTaskObj, d, win)) {
                  placeTask(existingTaskObj, d, win)
                  placedExisting = true
                  break
                }
              }
              if (placedExisting) break
            }

            if (placedExisting) {
              return true
            } else {
              unplaceTask(classId, taskDay, taskWin)
            }
          }

          const restoreTaskObj = {
            classId,
            sub: { id: existing.slot.subId, code: existing.slot.subCode, type: 'Lab' },
            team: existing.slot.facIds || [existing.slot.facId],
            homeRoomId: task.homeRoomId,
            labRoomId: existing.slot.roomId,
          }
          placeTask(restoreTaskObj, existing.day, existing.pids)
        }

        // 2. Inter-class lab ejection:
        for (const day of days) {
          const classHasLab = Object.values(tt[classId][day] || {}).some(
            (s) => s.blockSize > 1
          )
          if (classHasLab) continue

          for (const win of labWindows) {
            if (win.some((p) => classOccupancy.has(`${classId}|${day}|${p}`))) continue
            const teamFree = team.every((fid) => win.every((p) => !facOccupancy.has(`${fid}|${day}|${p}`)))
            if (!teamFree) continue

            let conflictingClass = null
            let conflictingSlot = null
            for (const otherCls of classes) {
              if (otherCls.id === classId) continue
              const s = tt[otherCls.id]?.[day]?.[win[0]]
              if (s && s.roomId?.toLowerCase() === labRoomId?.toLowerCase() && !s.locked) {
                conflictingClass = otherCls
                conflictingSlot = s
                break
              }
            }

            if (!conflictingClass) continue

            unplaceTask(conflictingClass.id, day, win)
            placeTask(task, day, win)

            const confSub = subjects[getBranchYearKey(conflictingClass.branch, conflictingClass.year)]?.find(
              (s) => s.id === conflictingSlot.subId
            ) || {
              id: conflictingSlot.subId,
              code: conflictingSlot.subCode,
              type: 'Lab',
              labRoomId: conflictingSlot.roomId,
            }
            const confTask = {
              classId: conflictingClass.id,
              classObj: conflictingClass,
              sub: confSub,
              team: conflictingSlot.facIds || [conflictingSlot.facId],
              homeRoomId: '',
              labRoomId: conflictingSlot.roomId,
            }

            let relocated = false
            const otherDays = [...(conflictingClass.workingDays || [])].sort(() => rand() - 0.5)
            for (const od of otherDays) {
              for (const ow of labWindows) {
                if (canPlace(confTask, od, ow)) {
                  placeTask(confTask, od, ow)
                  relocated = true
                  break
                }
              }
              if (relocated) break
            }

            if (relocated) {
              return true
            } else {
              unplaceTask(classId, day, win)
              placeTask(confTask, day, win)
            }
          }
        }

        return false
      }

      // Step 1: Place Common Slot Group Meta-Tasks (HARD RULE 8)
      // Shuffle meta-tasks
      const shuffledMeta = [...commonMetaTasks].sort(() => rand() - 0.5)

      for (const meta of shuffledMeta) {
        const { tasks, blockSize } = meta
        const candidateSlots = []

        const commonDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].filter((day) =>
          tasks.every((t) => (t.classObj.workingDays || []).includes(day))
        )

        commonDays.forEach((day) => {
          if (blockSize > 1) {
            labWindows.forEach((win) => {
              if (tasks.every((t) => canPlace(t, day, win))) {
                candidateSlots.push({ day, pids: win })
              }
            })
          } else {
            periodOrder.forEach((pid) => {
              if (tasks.every((t) => canPlace(t, day, [pid]))) {
                candidateSlots.push({ day, pids: [pid] })
              }
            })
          }
        })

        if (candidateSlots.length > 0) {
          // Sort candidate slots to prefer days where the common subject does not already appear
          candidateSlots.sort((s1, s2) => {
            const has1 = tasks.some((t) =>
              Object.values(tt[t.classId]?.[s1.day] || {}).some((slot) => slot.subId === t.sub.id)
            )
            const has2 = tasks.some((t) =>
              Object.values(tt[t.classId]?.[s2.day] || {}).some((slot) => slot.subId === t.sub.id)
            )
            return (has1 ? 1 : 0) - (has2 ? 1 : 0) || (rand() - 0.5)
          })

          const chosen = candidateSlots[0]
          tasks.forEach((t) => placeTask(t, chosen.day, chosen.pids))
        } else {
          tasks.forEach((t) =>
            unplaced.push({
              classId: t.classId,
              sub: t.sub,
              reason: 'No common free day/period matching all participating classes',
            })
          )
        }
      }

      // Step 2: Place Lab / Project blocks (most constrained first)
      const labTasks = classTasks.filter(
        (t) => t.sub.type === 'Lab' || t.sub.type === 'Project'
      )
      labTasks.sort((a, b) => b.blockSize - a.blockSize || rand() - 0.5)

      for (const task of labTasks) {
        const days = [...(task.classObj.workingDays || [])].sort(() => rand() - 0.5)
        let placed = false

        // Prefer days that do not already have a lab (Soft Rule B)
        days.sort((d1, d2) => {
          const count1 = Object.values(tt[task.classId]?.[d1] || {}).filter(
            (s) => s.blockSize > 1
          ).length
          const count2 = Object.values(tt[task.classId]?.[d2] || {}).filter(
            (s) => s.blockSize > 1
          ).length
          return count1 - count2
        })

        for (const day of days) {
          const windows = [...labWindows].sort(() => rand() - 0.5)
          for (const win of windows) {
            if (canPlace(task, day, win)) {
              placeTask(task, day, win)
              placed = true
              break
            }
          }
          if (placed) break
        }

        if (!placed) {
          placed = tryLabSwapOrEjection(task)
        }

        if (!placed) {
          unplaced.push({
            classId: task.classId,
            sub: task.sub,
            reason: 'Could not find free lab room or faculty inside allowed lab windows',
          })
        }
      }

      // Step 3: Place Theory blocks
      const theoryTasks = classTasks.filter(
        (t) => t.sub.type !== 'Lab' && t.sub.type !== 'Project'
      )
      theoryTasks.sort(() => rand() - 0.5)

      function tryEjectionPlacement(task) {
        const { classId, sub, team } = task
        const days = [...(task.classObj.workingDays || [])].sort(() => rand() - 0.5)

        for (const day of days) {
          if (Object.values(tt[classId][day] || {}).some((s) => s.subId === sub.id)) continue

          for (const pid of periodOrder) {
            const existingSlot = tt[classId][day]?.[pid]
            if (!existingSlot || existingSlot.locked || existingSlot.blockSize > 1) continue

            let teamFree = true
            for (const fid of team) {
              if (facOccupancy.has(`${fid}|${day}|${pid}`)) {
                teamFree = false
                break
              }
            }
            if (!teamFree) continue

            const displacedTeam = existingSlot.facIds || [existingSlot.facId]
            for (const d2 of days) {
              if (Object.values(tt[classId][d2] || {}).some((s) => s.subId === existingSlot.subId)) continue

              for (const p2 of periodOrder) {
                if (tt[classId][d2]?.[p2]) continue

                let dTeamFree = true
                for (const fid of displacedTeam) {
                  if (facOccupancy.has(`${fid}|${d2}|${p2}`)) {
                    dTeamFree = false
                    break
                  }
                }
                if (!dTeamFree) continue

                displacedTeam.forEach((fid) => facOccupancy.delete(`${fid}|${day}|${pid}`))
                tt[classId][d2][p2] = existingSlot
                classOccupancy.add(`${classId}|${d2}|${p2}`)
                displacedTeam.forEach((fid) => facOccupancy.add(`${fid}|${d2}|${p2}`))

                placeTask(task, day, [pid])
                return true
              }
            }
          }
        }
        return false
      }

      for (const task of theoryTasks) {
        const days = [...(task.classObj.workingDays || [])].sort(() => rand() - 0.5)
        let placed = false

        // Prefer days where this subject does not already appear (Soft Rule A)
        days.sort((d1, d2) => {
          const has1 = Object.values(tt[task.classId]?.[d1] || {}).some(
            (s) => s.subId === task.sub.id
          )
            ? 1
            : 0
          const has2 = Object.values(tt[task.classId]?.[d2] || {}).some(
            (s) => s.subId === task.sub.id
          )
            ? 1
            : 0
          return has1 - has2
        })

        for (const day of days) {
          const pids = [...periodOrder].sort(() => rand() - 0.5)
          for (const pid of pids) {
            if (canPlace(task, day, [pid])) {
              placeTask(task, day, [pid])
              placed = true
              break
            }
          }
          if (placed) break
        }

        if (!placed) {
          placed = tryEjectionPlacement(task)
        }

        if (!placed) {
          unplaced.push({
            classId: task.classId,
            sub: task.sub,
            reason: 'Class or faculty clash in all available periods',
          })
        }
      }

      // Evaluate attempt
      const { score, violations } = calculateSoftScore({
        timetables: tt,
        classes,
        subjects,
        faculty,
        settings,
      })

      const isBetter =
        !bestSolution ||
        unplaced.length < bestUnplaced.length ||
        (unplaced.length === bestUnplaced.length && score < bestScore)

      if (isBetter) {
        bestSolution = tt
        bestScore = score
        bestViolations = violations
        bestUnplaced = unplaced

        if (unplaced.length === 0 && score <= 10) {
          attempt = totalAttempts
          break
        }
      }
    }

    if (onProgress) {
      onProgress(Math.min(100, Math.round((attempt / totalAttempts) * 100)))
    }
    await new Promise((r) => setTimeout(r, 0))
  }

  // ─── Swap Repair Pass ───
  if (bestSolution && bestUnplaced.length === 0) {
    const repairedTT = JSON.parse(JSON.stringify(bestSolution))
    let currentScore = bestScore

    classes.forEach((c) => {
      const days = c.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
      let improved = true
      let iterations = 0

      while (improved && iterations < 30) {
        improved = false
        iterations++

        for (let d1Idx = 0; d1Idx < days.length; d1Idx++) {
          const d1 = days[d1Idx]
          for (let p1 of periodOrder) {
            const slot1 = repairedTT[c.id]?.[d1]?.[p1]
            if (!slot1 || slot1.locked || slot1.blockSize > 1) continue

            for (let d2Idx = d1Idx; d2Idx < days.length; d2Idx++) {
              const d2 = days[d2Idx]
              for (let p2 of periodOrder) {
                if (d1 === d2 && p1 === p2) continue
                const slot2 = repairedTT[c.id]?.[d2]?.[p2]
                if (!slot2 || slot2.locked || slot2.blockSize > 1) continue
                if (slot1.subId === slot2.subId) continue

                // Invariant: each theory subject at most once per day per class
                if (d1 !== d2) {
                  const d1HasSub2 = Object.entries(repairedTT[c.id]?.[d1] || {}).some(
                    ([p, s]) => p !== p1 && s.subId === slot2.subId
                  )
                  if (d1HasSub2) continue

                  const d2HasSub1 = Object.entries(repairedTT[c.id]?.[d2] || {}).some(
                    ([p, s]) => p !== p2 && s.subId === slot1.subId
                  )
                  if (d2HasSub1) continue
                }

                let clash = false
                const fac1 = slot1.facIds || [slot1.facId]
                const fac2 = slot2.facIds || [slot2.facId]

                for (const other of classes) {
                  if (other.id === c.id) continue
                  const otherSlot = repairedTT[other.id]?.[d2]?.[p2]
                  if (otherSlot) {
                    const otherTeam = otherSlot.facIds || [otherSlot.facId]
                    if (fac1.some((f) => otherTeam.includes(f))) {
                      clash = true
                      break
                    }
                  }
                }
                if (clash) continue

                for (const other of classes) {
                  if (other.id === c.id) continue
                  const otherSlot = repairedTT[other.id]?.[d1]?.[p1]
                  if (otherSlot) {
                    const otherTeam = otherSlot.facIds || [otherSlot.facId]
                    if (fac2.some((f) => otherTeam.includes(f))) {
                      clash = true
                      break
                    }
                  }
                }
                if (clash) continue

                repairedTT[c.id][d1][p1] = slot2
                repairedTT[c.id][d2][p2] = slot1

                const trial = calculateSoftScore({
                  timetables: repairedTT,
                  classes,
                  subjects,
                  faculty,
                  settings,
                })

                if (trial.score < currentScore) {
                  currentScore = trial.score
                  bestViolations = trial.violations
                  improved = true
                  break
                } else {
                  repairedTT[c.id][d1][p1] = slot1
                  repairedTT[c.id][d2][p2] = slot2
                }
              }
              if (improved) break
            }
            if (improved) break
          }
          if (improved) break
        }
      }
    })

    bestSolution = repairedTT
    bestScore = currentScore
  }

  return {
    timetables: bestSolution || {},
    unplaced: bestUnplaced,
    violations: bestViolations,
    score: bestScore,
  }
}
