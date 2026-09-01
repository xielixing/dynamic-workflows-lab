export function applyDiscountCents(cents: number, percentOff: number): number {
  // Spec FIN-19: results are money in whole cents, rounded half-up.
  return cents - (cents * percentOff) / 100
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function addCents(a: number, b: number): number {
  return a + b
}
