import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { fmtTime } from './helpers'

function buildTTData(b, y, state) {
  const key = `${b}_${y}`
  const tt = state.timetable[key] || {}
  const days = state.settings.days[key] || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const periods = state.settings.periods.filter(p => !p.brk)
  const allSubs = Object.values(state.subjects).flat()

  const rows = [['Day', ...periods.map(p => `${p.label} (${fmtTime(p.start)}-${fmtTime(p.end)})`)]]
  for (const day of days) {
    const row = [day]
    for (const p of periods) {
      const slot = tt[day]?.[p.id]
      if (slot) {
        const sub  = allSubs.find(s => s.id === slot.subId)
        const fac  = state.faculty.find(f => f.id === slot.facId)
        const room = state.rooms.find(r => r.id === slot.roomId)
        row.push(`${sub?.name || '?'}\n${fac ? fac.short : ''} ${room ? '(' + room.name + ')' : ''}`.trim())
      } else row.push('')
    }
    rows.push(row)
  }
  return { rows, title: `${b} — Year ${y} Timetable` }
}

export function exportExcel(b, y, state) {
  const { rows } = buildTTData(b, y, state)
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 8 }, ...rows[0].slice(1).map(() => ({ wch: 24 }))]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Timetable')
  XLSX.writeFile(wb, `timetable_${b}_Y${y}.xlsx`)
}

export function exportAllExcel(state) {
  const wb = XLSX.utils.book_new()
  let added = 0
  ;['CIC', 'AIML', 'DS', 'CSIT'].forEach(b =>
    [2, 3, 4].forEach(y => {
      const key = `${b}_${y}`
      if (!state.timetable[key] || !Object.keys(state.timetable[key]).length) return
      const { rows } = buildTTData(b, y, state)
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ wch: 8 }, ...rows[0].slice(1).map(() => ({ wch: 22 }))]
      XLSX.utils.book_append_sheet(wb, ws, `${b}_Y${y}`)
      added++
    })
  )
  if (!added) return false
  XLSX.writeFile(wb, 'all_timetables.xlsx')
  return true
}

export function exportPDF(b, y, state) {
  const { rows, title } = buildTTData(b, y, state)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text(title, 14, 15)
  doc.setFontSize(9);  doc.setFont('helvetica', 'normal')
  doc.text(`Dept. of CSE Allied  |  ${new Date().toLocaleDateString('en-IN')}`, 14, 22)
  doc.autoTable({ head: [rows[0]], body: rows.slice(1), startY: 27,
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 37, 56], textColor: [228, 233, 245], fontStyle: 'bold' },
    margin: { left: 8, right: 8 } })
  doc.save(`timetable_${b}_Y${y}.pdf`)
}

export function exportAllPDF(state) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  let first = true
  ;['CIC', 'AIML', 'DS', 'CSIT'].forEach(b =>
    [2, 3, 4].forEach(y => {
      const key = `${b}_${y}`
      if (!state.timetable[key] || !Object.keys(state.timetable[key]).length) return
      if (!first) doc.addPage(); first = false
      const { rows, title } = buildTTData(b, y, state)
      doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text(title, 14, 15)
      doc.setFontSize(9);  doc.setFont('helvetica', 'normal')
      doc.text(`CSE Allied  |  ${new Date().toLocaleDateString('en-IN')}`, 14, 22)
      doc.autoTable({ head: [rows[0]], body: rows.slice(1), startY: 27,
        styles: { fontSize: 7, cellPadding: 2.5, overflow: 'linebreak' },
        headStyles: { fillColor: [30, 37, 56], textColor: [228, 233, 245], fontStyle: 'bold' },
        margin: { left: 8, right: 8 } })
    })
  )
  if (first) return false
  doc.save('all_timetables.pdf')
  return true
}

export function dlTemplate(type) {
  let ws, name
  if (type === 'faculty') {
    ws = XLSX.utils.aoa_to_sheet([['Name','Short','Department','Max Periods/Week'],['Dr. A. Vasanthi','AV','CSE(CIC)','30']])
    name = 'faculty_template.xlsx'
  } else if (type === 'rooms') {
    ws = XLSX.utils.aoa_to_sheet([['Name','Type','Capacity'],['CS-111','Classroom','60'],['LAB-5','Lab','30']])
    name = 'rooms_template.xlsx'
  } else {
    ws = XLSX.utils.aoa_to_sheet([['Branch','Year','Subject Name','Code','Type','Periods/Week','Block','Faculty Short'],
      ['CIC',2,'Data Structures','22PC201','Theory',4,1,'AV'],['AIML',3,'ML Lab','','Lab',4,2,'RT']])
    name = 'subjects_template.xlsx'
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, name)
}
