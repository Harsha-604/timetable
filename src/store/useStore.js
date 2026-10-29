import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_PERIODS, BRANCHES, YEARS } from '../utils/constants'

function defaultDays() {
  const d = {}
  BRANCHES.forEach(b => YEARS.forEach(y => { d[`${b}_${y}`] = ['Mon','Tue','Wed','Thu','Fri','Sat'] }))
  return d
}

function makeEmpty() {
  return {
    faculty: [], rooms: [], subjects: {}, timetable: {},
    settings: { periods: JSON.parse(JSON.stringify(DEFAULT_PERIODS)), days: defaultDays() },
  }
}

export const useStore = create(
  persist(
    (set, get) => ({
      ...makeEmpty(),

      /* ── Faculty ── */
      addFaculty:    (f)      => set(s => ({ faculty: [...s.faculty, f] })),
      updateFaculty: (id, d)  => set(s => ({ faculty: s.faculty.map(f => f.id === id ? { ...f, ...d } : f) })),
      deleteFaculty: (id)     => set(s => ({ faculty: s.faculty.filter(f => f.id !== id) })),
      clearFaculty:  ()       => set({ faculty: [] }),
      setFaculty:    (list)   => set(s => ({ faculty: [...s.faculty, ...list] })),

      /* ── Rooms ── */
      addRoom:    (r)      => set(s => ({ rooms: [...s.rooms, r] })),
      updateRoom: (id, d)  => set(s => ({ rooms: s.rooms.map(r => r.id === id ? { ...r, ...d } : r) })),
      deleteRoom: (id)     => set(s => ({ rooms: s.rooms.filter(r => r.id !== id) })),
      clearRooms: ()       => set({ rooms: [] }),
      setRooms:   (list)   => set(s => ({ rooms: [...s.rooms, ...list] })),

      /* ── Subjects ── */
      addSubject:     (key, sub) => set(s => ({ subjects: { ...s.subjects, [key]: [...(s.subjects[key] || []), sub] } })),
      updateSubject:  (key, id, d) => set(s => ({
        subjects: { ...s.subjects, [key]: (s.subjects[key] || []).map(sub => sub.id === id ? { ...sub, ...d } : sub) }
      })),
      deleteSubject:  (key, id)  => set(s => ({ subjects: { ...s.subjects, [key]: (s.subjects[key] || []).filter(s => s.id !== id) } })),
      clearClass:     (key)      => set(s => ({ subjects: { ...s.subjects, [key]: [] } })),
      clearAllSubjects: ()       => set({ subjects: {} }),
      mergeSubjects:  (map)      => set(s => {
        const merged = { ...s.subjects }
        Object.entries(map).forEach(([k, arr]) => { merged[k] = [...(merged[k] || []), ...arr] })
        return { subjects: merged }
      }),

      /* ── Timetable ── */
      setTimetable: (key, tt) => set(s => ({ timetable: { ...s.timetable, [key]: tt } })),
      setSlot: (key, day, pid, slot) => set(s => {
        const tt = JSON.parse(JSON.stringify(s.timetable[key] || {}))
        if (!tt[day]) tt[day] = {}
        if (slot) tt[day][pid] = slot; else delete tt[day][pid]
        return { timetable: { ...s.timetable, [key]: tt } }
      }),

      /* ── Settings ── */
      toggleDay: (classKey, day, checked) => set(s => {
        const order = ['Mon','Tue','Wed','Thu','Fri','Sat']
        const cur = [...(s.settings.days[classKey] || [])]
        const updated = checked ? [...cur, day] : cur.filter(d => d !== day)
        const sorted = order.filter(d => updated.includes(d))
        return { settings: { ...s.settings, days: { ...s.settings.days, [classKey]: sorted } } }
      }),
      setPeriods:   (periods) => set(s => ({ settings: { ...s.settings, periods } })),
      resetPeriods: ()        => set(s => ({ settings: { ...s.settings, periods: JSON.parse(JSON.stringify(DEFAULT_PERIODS)) } })),

      /* ── Toast (lightweight) ── */
      _toast: null,
      toast: (msg, kind = 'ok') => {
        set({ _toast: { msg, kind, id: Date.now() } })
        setTimeout(() => set(s => s._toast?.msg === msg ? { _toast: null } : {}), 3500)
      },

      /* ── Project backup / restore ── */
      saveProject: () => {
        const { faculty, rooms, subjects, timetable, settings } = get()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([JSON.stringify({ faculty, rooms, subjects, timetable, settings }, null, 2)], { type: 'application/json' }))
        a.download = 'timetable_project.json'; a.click()
      },
      loadProject: (data) => set({ ...makeEmpty(), ...data }),
      resetAll: () => set(makeEmpty()),
    }),
    {
      name: 'tt_coord_v2',
      // Migrate old v1 per-branch days → per-class keys
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const d = state.settings?.days || {}
        const hasBranchKeys = BRANCHES.some(b => Array.isArray(d[b]))
        if (hasBranchKeys) {
          const migrated = defaultDays()
          BRANCHES.forEach(b => YEARS.forEach(y => {
            const key = `${b}_${y}`
            migrated[key] = d[key] || d[b] || migrated[key]
          }))
          state.settings = { ...state.settings, days: migrated }
        }
      },
    }
  )
)
