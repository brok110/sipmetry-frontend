import React, { createContext, useCallback, useContext, useRef, useState } from 'react'

export type LowStockAlertItem = {
  id: string
  name: string
  pct: number
}

type LowStockAlertContextType = {
  alert: LowStockAlertItem | null
  showAlert: (item: LowStockAlertItem) => void
  clearAlert: () => void
}

const LowStockAlertContext = createContext<LowStockAlertContextType | null>(null)

export function LowStockAlertProvider({ children }: { children: React.ReactNode }) {
  const [alert, setAlert] = useState<LowStockAlertItem | null>(null)
  // Track shown IDs so same item only banners once per session
  const shownThisSession = useRef(new Set<string>())

  const showAlert = useCallback((item: LowStockAlertItem) => {
    if (shownThisSession.current.has(item.id)) return
    shownThisSession.current.add(item.id)
    setAlert(item)
  }, [])

  const clearAlert = useCallback(() => {
    setAlert(null)
  }, [])

  return (
    <LowStockAlertContext.Provider value={{ alert, showAlert, clearAlert }}>
      {children}
    </LowStockAlertContext.Provider>
  )
}

export function useLowStockAlert() {
  const ctx = useContext(LowStockAlertContext)
  if (!ctx) throw new Error('useLowStockAlert must be used within LowStockAlertProvider')
  return ctx
}
