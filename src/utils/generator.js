export function runsOf(periods) {
  const runs = [[]]
  for (const p of periods) {
    if (p.brk) { if (runs.at(-1).length) runs.push([]) }
    else runs.at(-1).push(p.id)
  }
  return runs.filter(r => r.length)
}

/**
 * Generate timetable for one class.
 * Mutates gFacOcc / gRoomOcc so subsequent classes see prior bookings.
 */
export function generateClass({ key, state, gFacOcc, gRoomOcc, autoFac, autoRoom }) {
  const { faculty, rooms, subjects, settings } = state
  const [branch] = key.split('_')
  const subs = subjects[key] || []
  const days = settings.days[key] || settings.days[branch] || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const runs = runsOf(settings.periods)

  // Expand subjects into tasks (one per block)
  const tasks = []
  for (const sub of subs) {
    const bs = sub.block || 1
    const total = Math.ceil(sub.periods / bs)
    for (let bi = 0; bi < total; bi++) tasks.push({ sub, bs })
  }

  const tt = {}
  days.forEach(d => (tt[d] = {}))

  // Local copies of global occupancy maps (Sets)
  const lFac = Object.fromEntries(Object.entries(gFacOcc).map(([k, v]) => [k, new Set(v)]))
  const lRoom = Object.fromEntries(Object.entries(gRoomOcc).map(([k, v]) => [k, new Set(v)]))

  const log = []
  let placed = 0
  let failed = 0

  for (const { sub, bs } of tasks) {
    // Faculty: use assigned, or pick least-busy
    let facId = sub.facultyId || ''
    if (!facId && autoFac && faculty.length) {
      facId = [...faculty].sort(
        (a, b) => (lFac[a.id]?.size || 0) - (lFac[b.id]?.size || 0)
      )[0].id
    }

    // Room pool by type — actual pick happens per-slot
    const needLab = sub.type === 'Lab'
    const roomPool =
      autoRoom && rooms.length
        ? (() => {
            const p = rooms.filter(r => (needLab ? r.type === 'Lab' : r.type !== 'Lab'))
            return p.length ? p : rooms
          })()
        : []

    const shuffledDays = [...days].sort(() => Math.random() - 0.5)
    let ok = false

    outer: for (const day of shuffledDays) {
      for (const run of runs) {
        for (let i = 0; i <= run.length - bs; i++) {
          const pids = run.slice(i, i + bs)

          // 1) Faculty free?
          if (facId) {
            const o = lFac[facId] || new Set()
            if (pids.some(p => o.has(`${day}|${p}`))) continue
          }
          // 2) Class slots free?
          if (pids.some(p => tt[day][p])) continue

          // 3) Find least-busy free room for this window
          let roomId = ''
          if (autoRoom && rooms.length) {
            const sorted = [...roomPool].sort((a, b) => (lRoom[a.id]?.size || 0) - (lRoom[b.id]?.size || 0))
            for (const rm of sorted) {
              const o = lRoom[rm.id] || new Set()
              if (!pids.some(p => o.has(`${day}|${p}`))) { roomId = rm.id; break }
            }
            if (!roomId) {
              const any = [...rooms].sort((a, b) => (lRoom[a.id]?.size || 0) - (lRoom[b.id]?.size || 0))
              for (const rm of any) {
                const o = lRoom[rm.id] || new Set()
                if (!pids.some(p => o.has(`${day}|${p}`))) { roomId = rm.id; break }
              }
            }
          }

          // 4) Place
          pids.forEach(p => (tt[day][p] = { subId: sub.id, facId, roomId, blockStart: pids[0], blockSize: bs }))
          if (facId) {
            lFac[facId] = lFac[facId] || new Set()
            pids.forEach(p => lFac[facId].add(`${day}|${p}`))
          }
          if (roomId) {
            lRoom[roomId] = lRoom[roomId] || new Set()
            pids.forEach(p => lRoom[roomId].add(`${day}|${p}`))
          }
          placed++
          ok = true
          break outer
        }
      }
    }

    if (!ok) {
      failed++
      log.push({ text: `⚠ Could not place: ${sub.name}`, kind: 'err' })
    }
  }

  const summary =
    failed === 0
      ? { text: `✓ All ${placed} blocks placed`, kind: 'ok' }
      : { text: `Placed ${placed}/${placed + failed} blocks`, kind: 'err' }

  // Write back into global maps so next class sees these bookings
  for (const [day, ps] of Object.entries(tt)) {
    for (const [pid, slot] of Object.entries(ps)) {
      const tag = `${day}|${pid}`
      if (slot.facId)  { gFacOcc[slot.facId]  ||= new Set(); gFacOcc[slot.facId].add(tag)  }
      if (slot.roomId) { gRoomOcc[slot.roomId] ||= new Set(); gRoomOcc[slot.roomId].add(tag) }
    }
  }

  return { tt, log, summary, placed, failed }
}
