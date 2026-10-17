/**
 * CSV helpers — used by the contacts export endpoints.
 * Produces Excel-friendly CSV (UTF-8 with BOM, CRLF, quoted cells).
 */

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s: string
  if (value instanceof Date) {
    s = value.toISOString()
  } else if (typeof value === 'boolean') {
    s = value ? 'yes' : 'no'
  } else if (typeof value === 'bigint') {
    s = value.toString()
  } else if (typeof value === 'object') {
    s = JSON.stringify(value)
  } else {
    s = String(value)
  }
  // Persian digits and text flow through untouched — only RFC-4180 quoting.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines: string[] = [headers.map(csvEscape).join(',')]
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','))
  }
  // BOM so Excel detects UTF-8 (Persian names) correctly.
  return '\ufeff' + lines.join('\r\n')
}

export function csvFilename(prefix: string): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.csv`
}
