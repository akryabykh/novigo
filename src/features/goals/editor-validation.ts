/** Strict user-entered decimal, including the Russian decimal separator. */
export function parseWeight(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const parsed = /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : NaN;
}

export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
