export function buildProjectPayload(state, savedAt = new Date().toISOString()) {
  const {
    classes = [],
    faculty = [],
    rooms = [],
    subjects = {},
    assignments = {},
    lockedAssignments = {},
    subjectFacultyPresets = {},
    timetable = {},
    settings = {},
  } = state || {}

  const safeSettings = JSON.parse(JSON.stringify(settings || {}))
  delete safeSettings.publishing
  delete safeSettings.pin
  delete safeSettings.pinHash

  return {
    savedAt,
    classes,
    faculty,
    rooms,
    subjects,
    assignments,
    lockedAssignments,
    subjectFacultyPresets,
    timetable,
    settings: safeSettings,
  }
}
