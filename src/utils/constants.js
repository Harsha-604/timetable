export const BRANCHES = ['CIC', 'AIML', 'DS', 'CSIT']
export const YEARS = [2, 3, 4]
export const DAYS_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const DEFAULT_PERIODS = [
  { id: 'p1',    label: 'P1',    start: '09:30', end: '10:30', brk: false },
  { id: 'p2',    label: 'P2',    start: '10:30', end: '11:30', brk: false },
  { id: 'b1',    label: 'Break', start: '11:30', end: '11:40', brk: true  },
  { id: 'p3',    label: 'P3',    start: '11:40', end: '12:40', brk: false },
  { id: 'p4',    label: 'P4',    start: '12:40', end: '13:40', brk: false },
  { id: 'lunch', label: 'Lunch', start: '13:40', end: '14:15', brk: true  },
  { id: 'p5',    label: 'P5',    start: '14:15', end: '15:15', brk: false },
  { id: 'p6',    label: 'P6',    start: '15:15', end: '16:15', brk: false },
]

export const DEFAULT_LAB_WINDOWS = [
  ['p1', 'p2'],
  ['p3', 'p4'],
  ['p5', 'p6'],
]

export const SEMESTER_MAP = {
  2: 'III',
  3: 'V',
  4: 'VII',
}
