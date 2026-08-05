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

export function downloadCsv(filename, csvString) {
  const blob = new Blob(['﻿' + csvString], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
