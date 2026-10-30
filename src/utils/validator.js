import { BRANCHES } from './constants.js'
import { getBranchYearKey, parseClassId } from './helpers.js'

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
 * Validates the entire state according to Phase 2 requirements:
 * - subject codes with zero qualified faculty, or fewer than Faculty Required
 * - Lab/Project subjects without a valid lab room
 * - per class: total required periods vs available slots (working days x periods)
 * - faculty whose total possible load exceeds Max Periods/Week (warning only)
 * - unknown branch names, duplicate faculty short names
 */
export function validateState(state) {
  const { classes = [], faculty = [], rooms = [], subjects = {}, settings = {} } = state
  const errors = []
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
      errors.push(`Unknown branch name "${branch}" in subjects (${byKey}). Allowed branches: ${BRANCHES.join(', ')}.`)
    }
  })

  // Check unknown branch names in classes
  classes.forEach((c) => {
    if (!BRANCHES.includes(c.branch)) {
      errors.push(`Unknown branch name "${c.branch}" in class "${c.id}". Allowed branches: ${BRANCHES.join(', ')}.`)
    }
  })

  // 2. Validate subjects per branch-year
  const periodsConfig = settings.periods || []
  const teachingPeriodsCount = periodsConfig.filter((p) => !p.brk).length || 6

  Object.entries(subjects).forEach(([byKey, subList]) => {
    if (!Array.isArray(subList)) return

    subList.forEach((sub) => {
      const facReq = sub.facultyReq ?? (sub.type === 'Lab' ? 2 : 1)
      const qualified = faculty.filter((f) => isFacultyQualified(f, sub, byKey))

      if (qualified.length === 0) {
        errors.push(
          `Subject "${sub.code || sub.name}" (${byKey}) has 0 qualified faculty (requires ${facReq}).`
        )
      } else if (qualified.length < facReq) {
        errors.push(
          `Subject "${sub.code || sub.name}" (${byKey}) requires ${facReq} faculty, but only ${qualified.length} qualified (${qualified.map((q) => q.short).join(', ')}).`
        )
      }

      // Check Lab room
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

  // 3. Per class: total required periods vs available slots
  classes.forEach((c) => {
    const byKey = getBranchYearKey(c.branch, c.year)
    const subs = subjects[byKey] || []
    const totalRequired = subs.reduce((sum, s) => sum + (Number(s.periods) || 0), 0)

    const workingDays = c.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    const hasSat = workingDays.includes('Sat')
    const weekdayCount = workingDays.filter((d) => d !== 'Sat').length
    const satPeriods = hasSat ? (Number(c.saturdayPeriods) || 4) : 0
    const availableSlots = (weekdayCount * teachingPeriodsCount) + satPeriods

    if (totalRequired > availableSlots) {
      errors.push(
        `Class ${c.id}: Total required periods (${totalRequired}) exceed available slots (${availableSlots}) based on working days.`
      )
    }
  })

  // 4. Faculty total possible load (Warning only)
  faculty.forEach((f) => {
    const maxLoad = Number(f.max) || 30
    // Sum periods of all subjects this faculty is qualified to teach across active classes
    let potentialLoad = 0
    classes.forEach((c) => {
      const byKey = getBranchYearKey(c.branch, c.year)
      const subs = subjects[byKey] || []
      subs.forEach((s) => {
        if (isFacultyQualified(f, s, byKey)) {
          potentialLoad += Number(s.periods) || 0
        }
      })
    })

    if (potentialLoad > maxLoad) {
      warnings.push(
        `Faculty ${f.short} (${f.name}): Total qualified load across all classes (${potentialLoad} periods/wk) exceeds Max Periods/Week (${maxLoad}). Ensure manual or automatic balancing.`
      )
    }
  })

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}
