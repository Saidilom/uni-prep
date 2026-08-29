// Russian plural forms depend on the last two digits, not just "1 vs rest" —
// "2 группы" and "5 групп" both fail a naive count === 1 check.
export function pluralizeRu(count: number, [one, few, many]: [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
