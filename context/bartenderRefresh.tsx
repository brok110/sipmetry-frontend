import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type BartenderRefreshValue = {
  // Bumped each time the masthead logo is pressed. BartenderScreen watches
  // this to refetch recommendations and reset to the first card.
  refreshNonce: number;
  requestBartenderRefresh: () => void;
};

const BartenderRefreshContext = createContext<BartenderRefreshValue | null>(null);

export function BartenderRefreshProvider({ children }: { children: React.ReactNode }) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const requestBartenderRefresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);
  const value = useMemo(
    () => ({ refreshNonce, requestBartenderRefresh }),
    [refreshNonce, requestBartenderRefresh],
  );
  return (
    <BartenderRefreshContext.Provider value={value}>
      {children}
    </BartenderRefreshContext.Provider>
  );
}

export function useBartenderRefresh(): BartenderRefreshValue {
  const ctx = useContext(BartenderRefreshContext);
  if (!ctx) {
    throw new Error("useBartenderRefresh must be used within BartenderRefreshProvider");
  }
  return ctx;
}
