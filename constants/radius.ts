// UI-RADIUS(2026-07-31 A 案拍板):四階 + sheet 特例。
// 新代碼一律引用本檔;存量數值已正規化為同值,不回填 ref。
export const R = {
  pill: 999,    // 導航膠囊 / chips / 狀態與計數 pill / search bar
  panel: 14,    // 卡片 / 面板 / banner / toast / 主 CTA
  action: 12,   // 標準按鈕 / 輸入框
  control: 8,   // 方框工具鈕 / checkbox / 小 tag
  sheet: 20,    // bottom sheet 頂角(borderTopLeft/RightRadius)
} as const
