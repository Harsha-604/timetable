import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  BRANCHES,
  YEARS,
  DEFAULT_PERIODS,
  DEFAULT_LAB_WINDOWS,
  SEMESTER_MAP,
} from '../utils/constants'
import {
  makeClassId,
  getBranchYearKey,
  sectionLetter,
  normalizeKey,
} from '../utils/helpers'

export function defaultClasses() {
  const list = []
  BRANCHES.forEach((b) => {
    YEARS.forEach((y) => {
      list.push({
        id: makeClassId(b, y, 'A'),
        branch: b,
        year: y,
        section: 'A',
        homeRoomId: '',
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        saturdayPeriods: 4,
        advisor: '',
        wef: '01-08-2026',
        semesterFrom: 'Aug 2026',
        semesterTo: 'Dec 2026',
        semester: SEMESTER_MAP[y] || 'III',
        ay: '2026-27',
      })
    })
  })
  return list
}

export function makeEmpty() {
  return {
    classes: defaultClasses(),
    faculty: [],
    rooms: [],
    subjects: {}, // key: "CIC-4" -> array of subjects
    assignments: {}, // key: classId "CIC-4-A" -> { [subId]: [facId1, facId2] }
    lockedAssignments: {}, // key: classId -> { [subId]: boolean }
    subjectFacultyPresets: {}, // key: branchYearKey -> { [subCode]: { all: [], sections: { A: [] } } }
    importErrors: [],
    timetable: {}, // key: classId -> { [day]: { [pid]: slot } }
    settings: {
      periods: JSON.parse(JSON.stringify(DEFAULT_PERIODS)),
      labWindows: JSON.parse(JSON.stringify(DEFAULT_LAB_WINDOWS)),
      defaultSaturdayPeriods: 4,
    },
    validationReport: null,
  }
}

export function migrateState(state) {
  if (!state) return makeEmpty()
  const fresh = makeEmpty()

  // 1. Classes
  let migratedClasses = Array.isArray(state.classes) ? [...state.classes] : []
  if (!migratedClasses.length) {
    const oldDays = state.settings?.days || {}
    migratedClasses = []
    BRANCHES.forEach((b) => {
      YEARS.forEach((y) => {
        const oldKey1 = `${b}_${y}`
        const oldKey2 = `${b}-${y}`
        const days =
          oldDays[oldKey1] || oldDays[oldKey2] || oldDays[b] || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
        migratedClasses.push({
          id: makeClassId(b, y, 'A'),
          branch: b,
          year: y,
          section: 'A',
          homeRoomId: '',
          workingDays: Array.isArray(days) ? days : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
          saturdayPeriods: 4,
          advisor: '',
          wef: '01-08-2026',
          semesterFrom: 'Aug 2026',
          semesterTo: 'Dec 2026',
          semester: SEMESTER_MAP[y] || 'III',
          ay: '2026-27',
        })
      })
    })
  }

  // 2. Subjects: normalize keys to branch-year (e.g. CIC_4 -> CIC-4)
  const migratedSubjects = {}
  if (state.subjects && typeof state.subjects === 'object') {
    Object.entries(state.subjects).forEach(([key, list]) => {
      const normKey = normalizeKey(key)
      migratedSubjects[normKey] = Array.isArray(list) ? list : []
    })
  }

  // 3. Timetable: normalize old branch_year keys to branch-year-A
  const migratedTimetable = {}
  if (state.timetable && typeof state.timetable === 'object') {
    Object.entries(state.timetable).forEach(([key, dayMap]) => {
      let targetKey = key
      if (!key.includes('-') && key.includes('_')) {
        const [b, y] = key.split('_')
        targetKey = makeClassId(b, y, 'A')
      } else if (key.split('-').length === 2) {
        targetKey = `${key}-A`
      }
      migratedTimetable[targetKey] = dayMap
    })
  }

  // 4. Settings
  const periods =
    Array.isArray(state.settings?.periods) && state.settings.periods.length
      ? state.settings.periods
      : JSON.parse(JSON.stringify(DEFAULT_PERIODS))
  const labWindows =
    Array.isArray(state.settings?.labWindows) && state.settings.labWindows.length
      ? state.settings.labWindows
      : JSON.parse(JSON.stringify(DEFAULT_LAB_WINDOWS))

  return {
    ...fresh,
    ...state,
    classes: migratedClasses,
    subjects: migratedSubjects,
    timetable: migratedTimetable,
    assignments: state.assignments || {},
    lockedAssignments: state.lockedAssignments || {},
    subjectFacultyPresets: state.subjectFacultyPresets || {},
    importErrors: state.importErrors || [],
    settings: {
      ...fresh.settings,
      ...state.settings,
      periods,
      labWindows,
      defaultSaturdayPeriods: state.settings?.defaultSaturdayPeriods || 4,
    },
    faculty: Array.isArray(state.faculty) ? state.faculty : [],
    rooms: Array.isArray(state.rooms) ? state.rooms : [],
  }
}

export const useStore = create(
  persist(
    (set, get) => ({
      ...makeEmpty(),

      /* ── Classes ── */
      addClass: (cls) =>
        set((s) => ({
          classes: [...s.classes.filter((c) => c.id !== cls.id), cls],
        })),

      updateClass: (id, patch) =>
        set((s) => ({
          classes: s.classes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      removeClass: (id) =>
        set((s) => {
          const newClasses = s.classes.filter((c) => c.id !== id)
          const newTimetable = { ...s.timetable }
          delete newTimetable[id]
          const newAssignments = { ...s.assignments }
          delete newAssignments[id]
          const newLocked = { ...s.lockedAssignments }
          delete newLocked[id]
          return {
            classes: newClasses,
            timetable: newTimetable,
            assignments: newAssignments,
            lockedAssignments: newLocked,
          }
        }),

      setSectionCount: (branch, year, targetCount) =>
        set((s) => {
          const current = s.classes.filter(
            (c) => c.branch === branch && Number(c.year) === Number(year)
          )
          const curCount = current.length
          if (targetCount === curCount) return {}

          if (targetCount > curCount) {
            const added = []
            const newAssignments = { ...s.assignments }
            const newLocked = { ...s.lockedAssignments }
            const byKey = getBranchYearKey(branch, year)
            const classSubs = s.subjects[byKey] || []
            const branchPresets = s.subjectFacultyPresets?.[byKey] || {}

            for (let i = curCount; i < targetCount; i++) {
              const sec = sectionLetter(i)
              const id = makeClassId(branch, year, sec)
              added.push({
                id,
                branch,
                year,
                section: sec,
                homeRoomId: current[0]?.homeRoomId || '',
                workingDays: current[0]?.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                saturdayPeriods: current[0]?.saturdayPeriods || 4,
                advisor: '',
                wef: current[0]?.wef || '01-08-2026',
                semesterFrom: current[0]?.semesterFrom || 'Aug 2026',
                semesterTo: current[0]?.semesterTo || 'Dec 2026',
                semester: current[0]?.semester || SEMESTER_MAP[year] || 'III',
                ay: current[0]?.ay || '2026-27',
              })

              // Apply presets: specific section preset or blank-section preset
              if (!newAssignments[id]) newAssignments[id] = {}
              if (!newLocked[id]) newLocked[id] = {}

              classSubs.forEach((sub) => {
                const p = branchPresets[sub.code]
                let team = null
                if (p?.sections?.[sec]) {
                  team = p.sections[sec]
                } else if (p?.all && p.all.length > 0) {
                  team = p.all
                }
                if (team && team.length > 0) {
                  newAssignments[id][sub.id] = team
                  newLocked[id][sub.id] = true
                }
              })
            }
            return {
              classes: [...s.classes, ...added],
              assignments: newAssignments,
              lockedAssignments: newLocked,
            }
          } else {
            // targetCount < curCount: remove excess sections
            const toKeep = current.slice(0, targetCount)
            const toRemove = current.slice(targetCount)
            const removeIds = new Set(toRemove.map((c) => c.id))

            const newTimetable = { ...s.timetable }
            const newAssignments = { ...s.assignments }
            const newLocked = { ...s.lockedAssignments }
            removeIds.forEach((id) => {
              delete newTimetable[id]
              delete newAssignments[id]
              delete newLocked[id]
            })

            return {
              classes: [
                ...s.classes.filter(
                  (c) => !(c.branch === branch && Number(c.year) === Number(year))
                ),
                ...toKeep,
              ],
              timetable: newTimetable,
              assignments: newAssignments,
              lockedAssignments: newLocked,
            }
          }
        }),

      /* ── Faculty ── */
      addFaculty: (f) => set((s) => ({ faculty: [...s.faculty, f] })),
      updateFaculty: (id, d) =>
        set((s) => ({ faculty: s.faculty.map((f) => (f.id === id ? { ...f, ...d } : f)) })),
      deleteFaculty: (id) =>
        set((s) => ({ faculty: s.faculty.filter((f) => f.id !== id) })),
      clearFaculty: () => set({ faculty: [] }),
      setFaculty: (list) => set((s) => ({ faculty: [...s.faculty, ...list] })),
      replaceFacultyList: (list) => set({ faculty: list }),

      /* ── Rooms ── */
      addRoom: (r) => set((s) => ({ rooms: [...s.rooms, r] })),
      updateRoom: (id, d) =>
        set((s) => ({ rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...d } : r)) })),
      deleteRoom: (id) => set((s) => ({ rooms: s.rooms.filter((r) => r.id !== id) })),
      clearRooms: () => set({ rooms: [] }),
      setRooms: (list) => set((s) => ({ rooms: [...s.rooms, ...list] })),
      replaceRoomsList: (list) => set({ rooms: list }),

      /* ── Subjects ── */
      addSubject: (key, sub) => {
        const normKey = normalizeKey(key)
        return set((s) => ({
          subjects: {
            ...s.subjects,
            [normKey]: [...(s.subjects[normKey] || []), sub],
          },
        }))
      },
      updateSubject: (key, id, d) => {
        const normKey = normalizeKey(key)
        return set((s) => ({
          subjects: {
            ...s.subjects,
            [normKey]: (s.subjects[normKey] || []).map((sub) =>
              sub.id === id ? { ...sub, ...d } : sub
            ),
          },
        }))
      },
      deleteSubject: (key, id) => {
        const normKey = normalizeKey(key)
        return set((s) => ({
          subjects: {
            ...s.subjects,
            [normKey]: (s.subjects[normKey] || []).filter((sub) => sub.id !== id),
          },
        }))
      },
      clearClassSubjects: (key) => {
        const normKey = normalizeKey(key)
        return set((s) => ({ subjects: { ...s.subjects, [normKey]: [] } }))
      },
      clearAllSubjects: () => set({ subjects: {} }),
      mergeSubjects: (map) =>
        set((s) => {
          const merged = { ...s.subjects }
          Object.entries(map).forEach(([k, arr]) => {
            const nk = normalizeKey(k)
            merged[nk] = [...(merged[nk] || []), ...arr]
          })
          return { subjects: merged }
        }),
      replaceSubjects: (map) => {
        const normMap = {}
        Object.entries(map).forEach(([k, arr]) => {
          normMap[normalizeKey(k)] = arr
        })
        return set({ subjects: normMap })
      },

      /* ── Assignments ── */
      setAssignment: (classId, subjectId, facIds) =>
        set((s) => ({
          assignments: {
            ...s.assignments,
            [classId]: {
              ...(s.assignments[classId] || {}),
              [subjectId]: Array.isArray(facIds) ? facIds : [facIds],
            },
          },
        })),
      setAssignmentsForClass: (classId, map) =>
        set((s) => ({
          assignments: {
            ...s.assignments,
            [classId]: { ...(s.assignments[classId] || {}), ...map },
          },
        })),
      setAllAssignments: (allAssignments) =>
        set((s) => ({
          assignments: { ...s.assignments, ...allAssignments },
        })),
      setLockedAssignments: (locked) =>
        set((s) => ({
          lockedAssignments: { ...s.lockedAssignments, ...locked },
        })),
      setSubjectFacultyPresets: (presets) =>
        set((s) => ({
          subjectFacultyPresets: { ...s.subjectFacultyPresets, ...presets },
        })),
      setImportErrors: (errs) => set({ importErrors: Array.isArray(errs) ? errs : [] }),
      toggleLockAssignment: (classId, subjectId) =>
        set((s) => {
          const cur = !!s.lockedAssignments?.[classId]?.[subjectId]
          return {
            lockedAssignments: {
              ...s.lockedAssignments,
              [classId]: {
                ...(s.lockedAssignments[classId] || {}),
                [subjectId]: !cur,
              },
            },
          }
        }),

      /* ── Timetable ── */
      setTimetable: (classId, tt) =>
        set((s) => ({ timetable: { ...s.timetable, [classId]: tt } })),
      setAllTimetables: (map) =>
        set((s) => ({ timetable: { ...s.timetable, ...map } })),
      setSlot: (classId, day, pid, slot) =>
        set((s) => {
          const tt = JSON.parse(JSON.stringify(s.timetable[classId] || {}))
          if (!tt[day]) tt[day] = {}
          if (slot) tt[day][pid] = slot
          else delete tt[day][pid]
          return { timetable: { ...s.timetable, [classId]: tt } }
        }),
      toggleCellLock: (classId, day, pid) =>
        set((s) => {
          const tt = JSON.parse(JSON.stringify(s.timetable[classId] || {}))
          if (tt[day]?.[pid]) {
            tt[day][pid].locked = !tt[day][pid].locked
          }
          return { timetable: { ...s.timetable, [classId]: tt } }
        }),
      swapSlots: (classId, day1, pid1, day2, pid2) =>
        set((s) => {
          const tt = JSON.parse(JSON.stringify(s.timetable[classId] || {}))
          if (!tt[day1]) tt[day1] = {}
          if (!tt[day2]) tt[day2] = {}
          const slot1 = tt[day1][pid1] || null
          const slot2 = tt[day2][pid2] || null
          if (slot2) tt[day1][pid1] = slot2
          else delete tt[day1][pid1]
          if (slot1) tt[day2][pid2] = slot1
          else delete tt[day2][pid2]
          return { timetable: { ...s.timetable, [classId]: tt } }
        }),

      /* ── Settings ── */
      setPeriods: (periods) => set((s) => ({ settings: { ...s.settings, periods } })),
      setLabWindows: (labWindows) =>
        set((s) => ({ settings: { ...s.settings, labWindows } })),
      resetPeriods: () =>
        set((s) => ({
          settings: {
            ...s.settings,
            periods: JSON.parse(JSON.stringify(DEFAULT_PERIODS)),
            labWindows: JSON.parse(JSON.stringify(DEFAULT_LAB_WINDOWS)),
          },
        })),

      /* ── Validation ── */
      setValidationReport: (report) => set({ validationReport: report }),

      /* ── Toast ── */
      _toast: null,
      toast: (msg, kind = 'ok') => {
        set({ _toast: { msg, kind, id: Date.now() } })
        setTimeout(() => set((s) => (s._toast?.msg === msg ? { _toast: null } : {})), 3500)
      },

      /* ── Project backup / restore ── */
      saveProject: () => {
        const {
          classes,
          faculty,
          rooms,
          subjects,
          assignments,
          lockedAssignments,
          timetable,
          settings,
        } = get()
        const data = {
          savedAt: new Date().toISOString(),
          classes,
          faculty,
          rooms,
          subjects,
          assignments,
          lockedAssignments,
          timetable,
          settings,
        }
        const a = document.createElement('a')
        a.href = URL.createObjectURL(
          new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        )
        a.download = 'data.json'
        a.click()
      },
      loadProject: (data) => set(migrateState(data)),
      resetAll: () => set(makeEmpty()),
    }),
    {
      name: 'tt_coord_v3',
      version: 3,
      migrate: (persistedState, version) => {
        return migrateState(persistedState)
      },
      onRehydrateStorage: () => (state) => {
        if (!state) {
          // Check if old v2 state is available in localStorage
          try {
            const v2 = localStorage.getItem('tt_coord_v2')
            if (v2) {
              const parsed = JSON.parse(v2)
              if (parsed?.state) {
                const migrated = migrateState(parsed.state)
                useStore.setState(migrated)
              }
            }
          } catch (e) {
            console.error('Error during fallback v2 migration:', e)
          }
        }
      },
    }
  )
)
