export const uid = (prefix = 'x') =>
  prefix + Math.random().toString(36).slice(2, 8)

export const fmtTime = (t) => {
  if (!t) return ''
  let [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')}${ap}`
}

export const hue = (idx) => Math.round((idx * 137.508 + 20) % 360)

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
