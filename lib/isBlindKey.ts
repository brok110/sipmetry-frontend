// INV-MODEL Batch B: a row is "blind" when its ingredient_key is unknown
// to the ingredient allowlist in every accepted form (raw, snake_case,
// spaced) — mirrors the K2 lesson that scanner keys arrive in mixed forms.
// Only label after the allowlist has loaded; never flash the label while
// it is still fetching.
export function isBlindKey(
  ingredientKey: string | null | undefined,
  data: { isLoaded: boolean },
  resolve: (input: string) => string | null,
): boolean {
  const rawKey = String(ingredientKey ?? '').trim()
  return (
    data.isLoaded &&
    rawKey.length > 0 &&
    resolve(rawKey) == null &&
    resolve(rawKey.replace(/\s+/g, '_')) == null &&
    resolve(rawKey.replace(/_+/g, ' ')) == null
  )
}
