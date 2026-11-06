import * as XLSX from 'xlsx'

// Common period timings
export const PERIODS = [
  { id: 1, start: '09:30', end: '10:30' },
  { id: 2, start: '10:30', end: '11:30' },
  { id: 3, start: '11:40', end: '12:40' },
  { id: 4, start: '12:40', end: '13:40' },
  { id: 5, start: '14:15', end: '15:15' },
  { id: 6, start: '15:15', end: '16:15' },
]

const DAY_NAMES = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
}

function normalize(value) {
  return String(value ?? '').trim().toUpperCase()
}

function normalizeDay(value) {
  const day = normalize(value).slice(0, 3)
  return DAY_NAMES[day] || null
}

function isPeriodHeader(value) {
  return normalize(value).startsWith('PERIOD')
}

function getPeriodNumber(value) {
  const text = normalize(value)

  if (typeof value === 'number' && Number.isInteger(value)) {
    return value >= 1 && value <= 6 ? value : null
  }

  const match = text.match(/^(?:PERIOD\s*)?P?([1-6])(?:\s|$)/)

  return match ? Number(match[1]) : null
}

function isEmptyActivity(value) {
  const text = normalize(value)

  return (
    !text ||
    text === 'NA' ||
    text === 'N/A' ||
    text === '-' ||
    text === 'NIL'
  )
}

function buildMergedCellMap(sheet) {
  const map = new Map()

  for (const range of sheet['!merges'] || []) {
    const anchor = XLSX.utils.encode_cell({
      r: range.s.r,
      c: range.s.c,
    })

    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        map.set(`${r},${c}`, anchor)
      }
    }
  }

  return map
}

function getCellValue(sheet, mergeMap, row, col) {
  const key = `${row},${col}`
  const address = mergeMap.get(key)

  if (address) {
    return sheet[address]?.v ?? ''
  }

  const cell = sheet[
    XLSX.utils.encode_cell({ r: row, c: col })
  ]

  return cell?.v ?? ''
}

// Find period columns dynamically from the Excel header.
function findPeriodColumns(sheet, row, startCol, mergeMap) {
  const columns = {}

  for (
    let col = startCol + 1;
    col <= Math.min(startCol + 8, sheet['!ref']
      ? XLSX.utils.decode_range(sheet['!ref']).e.c
      : startCol + 8);
    col++
  ) {
    const value = getCellValue(sheet, mergeMap, row, col)

    if (isPeriodHeader(value)) break

    const periodNumber = getPeriodNumber(value)

    if (periodNumber) {
      columns[periodNumber] = col
    }
  }

  return columns
}

// Detect all timetable blocks without relying on fixed worksheet names.
function parseSheet(sheet, sheetName) {
  const blocks = []
  const warnings = []
  const mergeMap = buildMergedCellMap(sheet)

  if (!sheet['!ref']) {
    return { blocks, warnings }
  }

  const range = XLSX.utils.decode_range(sheet['!ref'])

  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const value = getCellValue(sheet, mergeMap, row, col)

      if (!isPeriodHeader(value)) continue

      const periodColumns = findPeriodColumns(
        sheet,
        row,
        col,
        mergeMap
      )

      if (Object.keys(periodColumns).length === 0) {
        warnings.push(
          `${sheetName}: Period header found at row ${row + 1}, but period columns could not be identified.`
        )
        continue
      }

      const facultyName = String(
        getCellValue(sheet, mergeMap, row - 1, col)
      ).trim()

      if (!facultyName) {
        warnings.push(
          `${sheetName}: Faculty name missing above row ${row + 1}.`
        )
        continue
      }

      const occupiedSlots = []
      let daysFound = 0

      // Search below the header for weekday rows.
      for (
        let dataRow = row + 1;
        dataRow <= Math.min(row + 12, range.e.r);
        dataRow++
      ) {
        const dayValue = getCellValue(
          sheet,
          mergeMap,
          dataRow,
          col
        )

        if (isPeriodHeader(dayValue)) break

        const day = normalizeDay(dayValue)

        if (!day) continue

        daysFound++

        for (const period of PERIODS) {
          const periodCol = periodColumns[period.id]

          if (periodCol === undefined) continue

          const activity = String(
            getCellValue(
              sheet,
              mergeMap,
              dataRow,
              periodCol
            )
          ).trim()

          if (isEmptyActivity(activity)) continue

          occupiedSlots.push({
            day,
            period: period.id,
            start: period.start,
            end: period.end,
            activity,
            cell: XLSX.utils.encode_cell({
              r: dataRow,
              c: periodCol,
            }),
          })
        }

        if (daysFound === 7) break
      }

      if (daysFound === 0) {
        warnings.push(
          `${sheetName}: No weekday rows found for ${facultyName}.`
        )
        continue
      }

      blocks.push({
        facultyName,
        sheetName,
        headerRow: row + 1,
        occupiedSlots,
      })
    }
  }

  return { blocks, warnings }
}

// Confirmed faculty aliases.
// Add or edit entries here when future workbooks use different names.
const FACULTY_ALIAS_GROUPS = [
  {
    canonicalName: 'P. Shobhitha',
    aliases: ['PSH (P Shobhitha)', 'Shobhitha - AIML'],
  },
  {
    canonicalName: 'Joshi Priya',
    aliases: ['Joshi Priya(JP)', 'Joshi Priya (CSIT)'],
  },
  {
    canonicalName: 'B. Rachana',
    aliases: ['B. Rachana (BR)', 'B. Rachana (CIC)'],
  },
  {
    canonicalName: 'Kasam Teja',
    aliases: ['Kasam Teja(KT)', 'Kasam Teja (CSIT)'],
  },
  {
    canonicalName: 'G. Jayanthi Kumari',
    aliases: [
      'G. Jayanthi Kumari (GJK)',
      'G. Jayanthi Kumari (CIC)',
    ],
  },
  {
    canonicalName: 'M. Akhila',
    aliases: ['M.Akhila(MAL)', 'M. Akhila (CSIT)'],
  },
  {
    canonicalName: 'Likhitha',
    aliases: ['Likhitha', 'Likhitha (DS)'],
  },
  {
    canonicalName: 'Dr. Rajesh Kulkarni',
    aliases: [
      'Dr. Rajesh Kulkarni (Dr.RK) - ClassWork Load - (wef 12.10.2026)',
      'Dr.Rajesh kulkarni (Dr.RK)',
    ],
  },
]

function normalizeFacultyName(name) {
  return normalize(name)
    .replace(/\s*-\s*CLASSWORK LOAD.*$/i, '')
    .replace(/\s*\(WEF.*$/i, '')
    .replace(/[^A-Z0-9]/g, '')
}

function buildAliasMap() {
  const aliasMap = new Map()

  for (const group of FACULTY_ALIAS_GROUPS) {
    for (const alias of group.aliases) {
      aliasMap.set(normalizeFacultyName(alias), group.canonicalName)
    }

    aliasMap.set(
      normalizeFacultyName(group.canonicalName),
      group.canonicalName
    )
  }

  return aliasMap
}

function consolidateFaculty(blocks) {
  const facultyMap = new Map()
  const aliasMap = buildAliasMap()

  for (const block of blocks) {
    const normalizedName = normalizeFacultyName(block.facultyName)
    const canonicalName = aliasMap.get(normalizedName) || block.facultyName
    const key = normalizeFacultyName(canonicalName)

    if (!facultyMap.has(key)) {
      facultyMap.set(key, {
        facultyName: canonicalName,
        sourceBlocks: [],
        originalNames: [],
        occupiedSlots: [],
      })
    }

    const faculty = facultyMap.get(key)
    faculty.sourceBlocks.push({
      sheetName: block.sheetName,
      originalName: block.facultyName,
    })

    if (!faculty.originalNames.includes(block.facultyName)) {
      faculty.originalNames.push(block.facultyName)
    }

    faculty.occupiedSlots.push(...block.occupiedSlots)
  }

  return Array.from(facultyMap.values())
}

// Suggest possible aliases, but never merge uncertain names automatically.
function findPossibleMatches(facultyMembers) {
  const suggestions = []

  const ignoredWords = new Set([
    'DR', 'PROF', 'MR', 'MRS', 'MS',
    'AIML', 'CIC', 'CSIT', 'DS',
  ])

  function getTokens(name) {
    return normalize(name)
      .replace(/[^A-Z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(
        word =>
          word.length >= 2 &&
          !ignoredWords.has(word)
      )
  }

  for (let i = 0; i < facultyMembers.length; i++) {
    for (let j = i + 1; j < facultyMembers.length; j++) {
      const first = facultyMembers[i]
      const second = facultyMembers[j]

      const firstSheets = first.sourceBlocks.map(
        block => block.sheetName
      )

      const secondSheets = second.sourceBlocks.map(
        block => block.sheetName
      )

      // Only compare records coming from different worksheets.
      if (!firstSheets.some(sheet => !secondSheets.includes(sheet))) {
        continue
      }

      const firstTokens = getTokens(first.facultyName)
      const secondTokens = getTokens(second.facultyName)

      const sharedTokens = firstTokens.filter(
        token => secondTokens.includes(token)
      )

      if (
        sharedTokens.length >= 2 ||
        sharedTokens.some(token => token.length >= 7)
      ) {
        suggestions.push({
          firstName: first.facultyName,
          secondName: second.facultyName,
          sharedTokens,
        })
      }
    }
  }

  return suggestions
}

/**
 * Reads and analyses an uploaded faculty workbook.
 *
 * @param {ArrayBuffer} fileData Excel file contents
 */
export function parseFacultyWorkbook(fileData) {
  const workbook = XLSX.read(fileData, {
    type: 'array',
    cellDates: true,
  })

  const facultyBlocks = []
  const warnings = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]

    const result = parseSheet(sheet, sheetName)

    facultyBlocks.push(...result.blocks)
    warnings.push(...result.warnings)
  }

  const facultyMembers = consolidateFaculty(facultyBlocks)

  const possibleMatches = findPossibleMatches(
    facultyMembers
  )

  return {
    fileName: 'Faculty Timetable',
    sheetsProcessed: workbook.SheetNames.length,

    // Individual timetable blocks
    facultyCount: facultyBlocks.length,
    facultyBlocks,

    // Consolidated faculty records
    uniqueFacultyCount: facultyMembers.length,
    facultyMembers,

    // Possible duplicate identities requiring confirmation
    possibleMatches,

    warnings,
  }
}
