
import fs from 'node:fs'
import { parseFacultyWorkbook } from '../src/utils/invigilation/excelParser.js'

const filePath = 'public/faculty-timetable.xlsx'

if (!fs.existsSync(filePath)) {
  console.error('Excel file not found:', filePath)
  process.exit(1)
}

console.log('\n===== INVIGILATION PARSER TEST =====\n')

try {
  const fileData = fs.readFileSync(filePath)
  const result = parseFacultyWorkbook(fileData)

  console.log('Worksheets processed:', result.sheetsProcessed)
  console.log('Total timetable blocks:', result.facultyCount)
  console.log('Unique faculty after consolidation:', result.uniqueFacultyCount)
  console.log('Possible alias matches:', result.possibleMatches.length)

  console.log('\n===== FACULTY BY WORKSHEET =====\n')

  const grouped = {}

  for (const faculty of result.facultyBlocks) {
    if (!grouped[faculty.sheetName]) {
      grouped[faculty.sheetName] = []
    }

    grouped[faculty.sheetName].push(faculty)
  }

  for (const [sheet, facultyList] of Object.entries(grouped)) {
    console.log(`\n${sheet}: ${facultyList.length} faculty`)

    for (const faculty of facultyList) {
      console.log(
        `  ${faculty.facultyName} | Occupied slots: ${faculty.occupiedSlots.length}`
      )
    }
  }

  console.log('\n===== WARNINGS =====\n')

  if (result.warnings.length) {
    console.log(result.warnings)
  } else {
    console.log('No warnings.')
  }

  console.log('\n===== CONSOLIDATED FACULTY =====\n')

  for (const faculty of result.facultyMembers) {
    console.log(
      `${faculty.facultyName} | Blocks: ${faculty.sourceBlocks.length} | Occupied slots: ${faculty.occupiedSlots.length}`
    )
  }

  console.log('\n===== POSSIBLE UNCONFIRMED MATCHES =====\n')
  console.log(result.possibleMatches)

  console.log('\n===== TEST COMPLETED =====\n')

} catch (error) {
  console.error('Parser failed:', error)
  process.exit(1)
}
