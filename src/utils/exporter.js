import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { fmtTime, getBranchYearKey } from './helpers'
import { DAYS_ORDER } from './constants'

/**
 * Builds printable table data for a single class entity matching the reference format.
 */
export function buildClassTTData(classId, state) {
  const cls = state.classes.find((c) => c.id === classId) || {
    id: classId,
    branch: classId.split('-')[0] || '',
    year: classId.split('-')[1] || '',
    section: classId.split('-')[2] || 'A',
    homeRoomId: '',
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    advisor: '',
    wef: '01-08-2026',
    semester: 'VII',
    ay: '2026-27',
  }

  const tt = state.timetable[classId] || {}
  const days = cls.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const periods = state.settings.periods || []
  const byKey = getBranchYearKey(cls.branch, cls.year)
  const classSubs = state.subjects[byKey] || []
  const allSubs = Object.values(state.subjects).flat()

  const headerRow = [
    'Day',
    ...periods.map((p) =>
      p.brk ? p.label : `${p.label} (${fmtTime(p.start)}-${fmtTime(p.end)})`
    ),
  ]

  const rows = [headerRow]

  for (const day of days) {
    const row = [day]
    for (const p of periods) {
      if (p.brk) {
        row.push(p.label.toUpperCase())
        continue
      }
      const slot = tt[day]?.[p.id]
      if (slot) {
        const sub = allSubs.find((s) => s.id === slot.subId)
        const team = slot.facIds || (slot.facId ? [slot.facId] : [])
        const facShorts = state.faculty
          .filter((f) => team.includes(f.id))
          .map((f) => f.short)
          .join(',')
        const room = state.rooms.find(
          (r) =>
            r.id === slot.roomId ||
            r.roomNo === slot.roomId ||
            r.name === slot.roomId
        )
        const isLab = sub?.type === 'Lab' || sub?.type === 'Project'
        const labDisplay =
          room?.labName && room?.roomNo
            ? `(${room.labName}, ${room.roomNo})`
            : room?.name
            ? `(${room.name})`
            : ''

        let cellText = `${slot.subCode || sub?.code || sub?.name || '?'}`
        if (facShorts) cellText += `\n(${facShorts})`
        if (isLab && labDisplay) cellText += `\n${labDisplay}`
        row.push(cellText)
      } else {
        row.push('')
      }
    }
    rows.push(row)
  }

  const title = `Time-Table for B.E Semester-${cls.semester || 'VII'} (${cls.id})`
  const subtitle = `Branch: ${cls.branch} (Sec ${cls.section}) | Room: ${cls.homeRoomId || '—'} | A.Y.: ${cls.ay || '2026-27'} | w.e.f: ${cls.wef || '—'}`
  const advisor = `Class Advisor: ${cls.advisor || '—'}`

  const legend = classSubs.map((s) => {
    const assignedIds = state.assignments[cls.id]?.[s.id] || []
    const facNames = state.faculty
      .filter((f) => assignedIds.includes(f.id))
      .map((f) => `${f.name} (${f.short})`)
      .join(', ')
    return [s.code || s.name, s.name, s.type, facNames || '—']
  })

  return { rows, title, subtitle, advisor, legend, cls }
}

export function exportExcel(classId, state) {
  const { rows, title, subtitle, advisor, legend, cls } = buildClassTTData(classId, state)
  const aoa = [
    [title],
    [subtitle],
    [advisor],
    [],
    ...rows,
    [],
    ['Subject Code', 'Subject Name', 'Type', 'Faculty'],
    ...legend,
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 8 }, ...rows[0].slice(1).map(() => ({ wch: 22 }))]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, cls.id)
  XLSX.writeFile(wb, `timetable_${cls.id}.xlsx`)
}

export function exportAllExcel(state) {
  const wb = XLSX.utils.book_new()
  let added = 0

  state.classes.forEach((cls) => {
    const tt = state.timetable[cls.id]
    if (!tt || !Object.keys(tt).length) return

    const { rows, title, subtitle, advisor, legend } = buildClassTTData(cls.id, state)
    const aoa = [
      [title],
      [subtitle],
      [advisor],
      [],
      ...rows,
      [],
      ['Subject Code', 'Subject Name', 'Type', 'Faculty'],
      ...legend,
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 8 }, ...rows[0].slice(1).map(() => ({ wch: 22 }))]
    XLSX.utils.book_append_sheet(wb, ws, cls.id)
    added++
  })

  if (!added) return false
  XLSX.writeFile(wb, 'all_timetables.xlsx')
  return true
}

export function exportPDF(classId, state) {
  const { rows, title, subtitle, advisor, legend, cls } = buildClassTTData(classId, state)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 14, 14)

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text(subtitle, 14, 20)

  doc.autoTable({
    head: [rows[0]],
    body: rows.slice(1),
    startY: 24,
    styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 37, 56], textColor: [228, 233, 245], fontStyle: 'bold' },
    margin: { left: 10, right: 10 },
  })

  let finalY = doc.lastAutoTable.finalY + 6
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(advisor, 14, finalY)

  if (legend.length > 0 && finalY < 170) {
    doc.autoTable({
      head: [['Subject Code', 'Subject Name', 'Type', 'Faculty In-Charge']],
      body: legend,
      startY: finalY + 4,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [45, 53, 83], textColor: [228, 233, 245], fontStyle: 'bold' },
      margin: { left: 10, right: 10 },
    })
  }

  doc.save(`timetable_${cls.id}.pdf`)
}

export function exportAllPDF(state) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  let first = true

  state.classes.forEach((cls) => {
    const tt = state.timetable[cls.id]
    if (!tt || !Object.keys(tt).length) return

    if (!first) doc.addPage()
    first = false

    const { rows, title, subtitle, advisor, legend } = buildClassTTData(cls.id, state)

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(title, 14, 14)

    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.text(subtitle, 14, 20)

    doc.autoTable({
      head: [rows[0]],
      body: rows.slice(1),
      startY: 24,
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 37, 56], textColor: [228, 233, 245], fontStyle: 'bold' },
      margin: { left: 10, right: 10 },
    })

    let finalY = doc.lastAutoTable.finalY + 6
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(advisor, 14, finalY)

    if (legend.length > 0 && finalY < 170) {
      doc.autoTable({
        head: [['Subject Code', 'Subject Name', 'Type', 'Faculty In-Charge']],
        body: legend,
        startY: finalY + 4,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [45, 53, 83], textColor: [228, 233, 245], fontStyle: 'bold' },
        margin: { left: 10, right: 10 },
      })
    }
  })

  if (first) return false
  doc.save('all_timetables.pdf')
  return true
}

export function dlTemplate(type) {
  let ws, name
  if (type === 'faculty') {
    ws = XLSX.utils.aoa_to_sheet([
      ['Faculty Name', 'Short Name', 'Designation', 'Department', 'Max Periods/Week', 'Subjects'],
      ['Dr. A. Vasanthi', 'AV', 'Assoc Professor', 'CSE(CIC)', 30, 'PE-IV:SPSM, DevOps Lab, BCT Lab'],
      ['P. Premchand', 'PPP', 'Assoc Professor', 'CSE(CIC)', 30, 'BCT, DevOps Lab, BCT Lab'],
      ['Dr. M. V. Ramana Rao', 'Dr.MVRJ', 'Professor', 'CSE(CIC)', 30, 'PE-V:SQT, IoTCPS Lab'],
      ['M. Bhanu', 'MB', 'Asst Professor', 'CSE(CIC)', 30, 'OE-I:RSE'],
    ])
    name = 'faculty_template.xlsx'
  } else if (type === 'rooms') {
    ws = XLSX.utils.aoa_to_sheet([
      ['Room No', 'Type', 'Lab Name', 'Capacity'],
      ['CS-111', 'Classroom', '', 60],
      ['CS-104', 'Lab', 'LAB-5', 30],
      ['CS-109', 'Lab', 'LAB-6', 30],
      ['CS-207', 'Lab', 'LAB-8', 30],
    ])
    name = 'rooms_template.xlsx'
  } else {
    ws = XLSX.utils.aoa_to_sheet([
      [
        'Branch',
        'Year',
        'Subject Code',
        'Subject Name',
        'Type',
        'Periods/Week',
        'Block Size',
        'Faculty Required',
        'Lab Room',
        'Common Slot Group',
      ],
      ['CIC', 4, 'BCT', 'Blockchain Technologies', 'Theory', 3, 1, 1, '', ''],
      ['CIC', 4, 'DevOps Lab', 'DevOps Lab', 'Lab', 4, 2, 2, 'CS-104', ''],
      ['CIC', 4, 'OE-I:RSE', 'Remote Sensing & Estimation', 'Theory', 3, 1, 1, '', 'OE-1'],
    ])
    name = 'subjects_template.xlsx'
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, name)
}
