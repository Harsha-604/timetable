export const uid = (prefix = 'x') =>
  prefix + Math.random().toString(36).slice(2, 8)

export const fmtTime = (t) => {
  if (!t) return ''
  let [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')}${ap}`
}

export const makeShort = (name) => {
  const clean = name.replace(/^(Dr\.|Prof\.?|Mr\.|Mrs\.|Ms\.)/i, '').trim()
  const words = clean.split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  return words.map(w => w[0].toUpperCase()).join('').slice(0, 4)
}

export const downloadJSON = (obj, filename) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }))
  a.download = filename
  a.click()
}

export const sectionLetter = (i) => String.fromCharCode(65 + i)
export const sectionIndex = (char) => (char ? char.toUpperCase().charCodeAt(0) - 65 : 0)

export const getBranchYearKey = (branch, year) => `${branch}-${year}`

export const normalizeKey = (key) => {
  if (!key) return ''
  return key.replace('_', '-')
}

export const makeClassId = (branch, year, section) => `${branch}-${year}-${section}`

export const parseClassId = (id) => {
  if (!id) return { branch: '', year: 0, section: '' }
  const parts = id.split('-')
  if (parts.length >= 3) {
    return { branch: parts[0], year: parseInt(parts[1], 10), section: parts[2] }
  }
  // Fallback for branch_year
  const sub = id.split('_')
  return { branch: sub[0], year: parseInt(sub[1] || '0', 10), section: 'A' }
}
