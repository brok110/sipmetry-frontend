/**
 * SSoT for taste tag display across all screens.
 * Recipe vecs are 0–5 scale from backend.
 *
 * Threshold design:
 *   - Core flavors (sweet/sour/bitter/fruity/herbal/fizz): >= 2.5
 *   - Strong character notes (smoky/floral/spicy): >= 2.0 (lower because they stand out)
 *   - High-impact dims (alcoholStrength): >= 3.5 (only truly strong drinks)
 *   - Structural dims (body/aromaIntensity): >= 3.0 (need to be dominant)
 */

const TAG_CONFIG: Array<{
  key: string;
  label: string;
  threshold: number;
  priority: number;
}> = [
  { key: "alcoholStrength", label: "Strong",      threshold: 3.5, priority: 1 },
  { key: "sweetness",       label: "Sweet",       threshold: 2.5, priority: 2 },
  { key: "sourness",        label: "Sour",        threshold: 2.5, priority: 3 },
  { key: "bitterness",      label: "Bitter",      threshold: 2.5, priority: 4 },
  { key: "fruity",          label: "Fruity",      threshold: 2.5, priority: 5 },
  { key: "herbal",          label: "Herbal",      threshold: 2.5, priority: 6 },
  { key: "smoky",           label: "Smoky",       threshold: 2.0, priority: 7 },
  { key: "fizz",            label: "Fizzy",       threshold: 2.5, priority: 8 },
  { key: "body",            label: "Full-bodied", threshold: 3.0, priority: 9 },
  { key: "floral",          label: "Floral",      threshold: 2.0, priority: 10 },
  { key: "spicy",           label: "Spicy",       threshold: 2.0, priority: 11 },
  { key: "aromaIntensity",  label: "Aromatic",    threshold: 3.0, priority: 12 },
];

export function getTasteTags(
  vec: Record<string, number> | null | undefined,
  max = 3
): string[] {
  if (!vec) return [];
  return TAG_CONFIG
    .filter(t => Number(vec[t.key] ?? 0) >= t.threshold)
    .sort((a, b) => {
      const va = Number(vec[a.key] ?? 0);
      const vb = Number(vec[b.key] ?? 0);
      if (vb !== va) return vb - va;
      return a.priority - b.priority;
    })
    .slice(0, max)
    .map(t => t.label);
}
