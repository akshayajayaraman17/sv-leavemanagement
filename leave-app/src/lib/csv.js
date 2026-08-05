// Minimal CSV export — no dependency needed for the shapes this app exports.

function escapeCsvField(value) {
  const str = value === null || value === undefined ? '' : String(value)
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

// columns: [{ key: 'full_name', label: 'Name' }, ...] — key may be a dotted
// path for nested values (e.g. 'employee.full_name').
export function rowsToCsv(rows, columns) {
  const getValue = (row, key) => key.split('.').reduce((v, k) => v?.[k], row)
  const header = columns.map(c => escapeCsvField(c.label)).join(',')
  const lines = rows.map(row => columns.map(c => escapeCsvField(getValue(row, c.key))).join(','))
  return [header, ...lines].join('\r\n')
}

// Parses CSV text (including quoted fields containing commas, quotes, or
// newlines) into an array of row objects keyed by the header row.
export function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  const pushField = () => { row.push(field); field = '' }
  const pushRow = () => { pushField(); rows.push(row); row = [] }

  // Normalize line endings and strip a leading UTF-8 BOM if present
  const s = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      pushField()
    } else if (c === '\n') {
      pushRow()
    } else {
      field += c
    }
  }
  if (field.length || row.length) pushRow()

  const nonEmptyRows = rows.filter(r => r.some(f => f.trim() !== ''))
  if (nonEmptyRows.length === 0) return []

  const headers = nonEmptyRows[0].map(h => h.trim())
  return nonEmptyRows.slice(1).map(r => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim() })
    return obj
  })
}

export function downloadCsv(filename, csvString) {
  const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
