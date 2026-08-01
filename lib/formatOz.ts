// lib/formatOz.ts
// OZ-DISPLAY(2026-08-01 拍板,B 案):oz 顯示 snap 到 jigger 可量刻度。
// 集合 = ¼ 階 + ⅓/⅔ 入集;分數字元顯示;5ml 級向上保底 ¼(拍板接受)。
// 僅顯示層 — amount_ml 真值不動;serving 縮放後的 ml 才進本函式。
// 全 app 唯一 ml→oz 換算點,勿散裝。

const FRAC_CANDIDATES: Array<[number, string]> = [
  [0, ""],
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.5, "½"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
  [1, ""],
]

export function formatOz(ml: number): string {
  const oz = ml * 0.033814
  if (!Number.isFinite(oz) || oz <= 0) return "0 oz"

  const whole = Math.floor(oz)
  const frac = oz - whole

  let snapVal = 0
  let snapGlyph = ""
  let best = Infinity
  for (const [v, g] of FRAC_CANDIDATES) {
    const d = Math.abs(frac - v)
    if (d < best) {
      best = d
      snapVal = v
      snapGlyph = g
    }
  }

  let w = whole
  if (snapVal === 1) {
    w += 1
    snapGlyph = ""
  }
  const hasFrac = snapGlyph !== ""

  if (w === 0 && !hasFrac) return "¼ oz"
  if (w === 0) return `${snapGlyph} oz`
  if (!hasFrac) return `${w} oz`
  return `${w}${snapGlyph} oz`
}
