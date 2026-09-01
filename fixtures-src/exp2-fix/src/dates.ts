// All timestamps are handled in UTC to keep server logs comparable
// across regions (spec OPS-31). Render as YYYY-MM-DD.

export function shortDate(iso: string): string {
  const d = new Date(iso)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
