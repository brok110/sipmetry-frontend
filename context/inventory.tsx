import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/context/auth";
import { useLowStockAlert } from "@/context/lowStockAlert";
import { checkAndNotify, scanAndNotifyAll } from "@/lib/lowStockNotifier";

export type InventoryItem = {
  id: string;
  ingredient_key: string;
  display_name: string;
  total_ml: number;
  remaining_pct: number;
  remaining_ml: number;
  remaining_volume: number;
  last_used_at: string | null;
  flavor_profile: string[];
  low_stock_notified_at: string | null;
  created_at: string;
  updated_at: string;
};

type InventoryPayload = {
  ingredient_key: string;
  display_name: string;
  total_ml: number;
  remaining_pct: number;
};

type InventoryUpdatePayload = {
  display_name: string;
  total_ml: number;
  remaining_pct: number;
};

type InventoryUsePayload = {
  recipe_id: string;
  made_at?: string;
  ingredients_used: Array<{
    ingredient_id: string;
    amount_ml: number;
  }>;
};

type RefreshOptions = {
  silent?: boolean;
  notifyLowStock?: boolean;
};

type InventoryContextValue = {
  inventory: InventoryItem[];
  inventoryById: Record<string, InventoryItem>;
  inventoryByIngredientKey: Record<string, InventoryItem>;
  availableIngredientKeys: string[];
  loading: boolean;
  refreshing: boolean;
  initialized: boolean;
  error: string | null;
  refreshInventory: (options?: RefreshOptions) => Promise<InventoryItem[]>;
  addInventoryItem: (payload: InventoryPayload) => Promise<InventoryItem>;
  updateInventoryItem: (id: string, updates: InventoryUpdatePayload) => Promise<InventoryItem>;
  deleteInventoryItem: (id: string) => Promise<void>;
  recordInventoryUse: (payload: InventoryUsePayload) => Promise<void>;
  replaceInventoryItem: (item: InventoryItem) => void;
};

const InventoryContext = createContext<InventoryContextValue | null>(null);

function normalizeInventoryItem(raw: any): InventoryItem | null {
  const id = String(raw?.id ?? "").trim();
  if (!id) return null;

  return {
    id,
    ingredient_key: String(raw?.ingredient_key ?? "").trim(),
    display_name: String(raw?.display_name ?? "").trim(),
    total_ml: Number(raw?.total_ml ?? 0),
    remaining_pct: Number(raw?.remaining_pct ?? 0),
    remaining_ml: Number(raw?.remaining_ml ?? 0),
    remaining_volume: Number(raw?.remaining_volume ?? 0),
    last_used_at: raw?.last_used_at ? String(raw.last_used_at) : null,
    flavor_profile: Array.isArray(raw?.flavor_profile)
      ? raw.flavor_profile.map((x: any) => String(x ?? "").trim()).filter(Boolean)
      : [],
    low_stock_notified_at: raw?.low_stock_notified_at ? String(raw.low_stock_notified_at) : null,
    created_at: String(raw?.created_at ?? ""),
    updated_at: String(raw?.updated_at ?? ""),
  };
}

function dedupeIngredientKeys(items: InventoryItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of items) {
    if (Number(item.remaining_pct ?? 0) <= 0) continue;
    const key = String(item.ingredient_key ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }

  return out;
}

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { showAlert } = useLowStockAlert();
  const accessToken = session?.access_token ?? null;
  const apiUrl = String(process.env.EXPO_PUBLIC_API_URL ?? "").trim();

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authVersionRef = useRef(0);

  useEffect(() => {
    authVersionRef.current += 1;
  }, [accessToken, apiUrl]);

  const refreshInventory = useCallback(
    async (options?: RefreshOptions): Promise<InventoryItem[]> => {
      const silent = options?.silent === true;
      const notifyLowStock = options?.notifyLowStock === true;
      const version = authVersionRef.current;

      if (!accessToken || !apiUrl) {
        setInventory([]);
        setError(null);
        setLoading(false);
        setRefreshing(false);
        setInitialized(true);
        return [];
      }

      if (silent) setRefreshing(true);
      else setLoading(true);

      setError(null);

      try {
        const res = await fetch(`${apiUrl}/inventory`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const items = Array.isArray(data.inventory)
          ? data.inventory.map(normalizeInventoryItem).filter(Boolean)
          : [];

        if (version !== authVersionRef.current) {
          throw new Error("Inventory auth changed during refresh");
        }

        setInventory(items as InventoryItem[]);
        setInitialized(true);

        if (notifyLowStock) {
          await scanAndNotifyAll(items as InventoryItem[], {
            showAlert,
            session,
            apiUrl,
          });
        }

        return items as InventoryItem[];
      } catch (e: any) {
        const message = e?.message ?? "Failed to load inventory";
        if (version === authVersionRef.current) {
          setError(message);
          setInitialized(true);
        }
        throw new Error(message);
      } finally {
        if (version === authVersionRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [accessToken, apiUrl, session, showAlert]
  );

  useEffect(() => {
    if (!accessToken || !apiUrl) {
      setInventory([]);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      setInitialized(true);
      return;
    }

    refreshInventory({ notifyLowStock: true }).catch(() => {});
  }, [accessToken, apiUrl, refreshInventory]);

  const addInventoryItem = useCallback(
    async (payload: InventoryPayload): Promise<InventoryItem> => {
      if (!accessToken || !apiUrl) throw new Error("Please sign in first");
      const version = authVersionRef.current;

      const res = await fetch(`${apiUrl}/inventory`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to add");
      }

      const data = await res.json().catch(() => ({}));
      const item = normalizeInventoryItem(data?.item);
      if (!item) throw new Error("Inventory add succeeded but returned no item");

      if (version !== authVersionRef.current) {
        throw new Error("Inventory auth changed during add");
      }

      setInventory((prev) => [item, ...prev.filter((x) => x.id !== item.id)]);
      setError(null);

      await checkAndNotify(item, { showAlert, session, apiUrl });
      return item;
    },
    [accessToken, apiUrl, session, showAlert]
  );

  const updateInventoryItem = useCallback(
    async (id: string, updates: InventoryUpdatePayload): Promise<InventoryItem> => {
      if (!accessToken || !apiUrl) throw new Error("Please sign in first");
      const version = authVersionRef.current;

      const res = await fetch(`${apiUrl}/inventory/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Update failed");
      }

      const data = await res.json().catch(() => ({}));
      const item = normalizeInventoryItem(data?.item);
      if (!item) throw new Error("Inventory update succeeded but returned no item");

      if (version !== authVersionRef.current) {
        throw new Error("Inventory auth changed during update");
      }

      setInventory((prev) => prev.map((x) => (x.id === id ? item : x)));
      setError(null);

      await checkAndNotify(item, { showAlert, session, apiUrl });
      return item;
    },
    [accessToken, apiUrl, session, showAlert]
  );

  const deleteInventoryItem = useCallback(
    async (id: string): Promise<void> => {
      if (!accessToken || !apiUrl) throw new Error("Please sign in first");
      const version = authVersionRef.current;

      const res = await fetch(`${apiUrl}/inventory/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Delete failed");

      if (version !== authVersionRef.current) {
        throw new Error("Inventory auth changed during delete");
      }

      setInventory((prev) => prev.filter((x) => x.id !== id));
      setError(null);
    },
    [accessToken, apiUrl]
  );

  const recordInventoryUse = useCallback(
    async (payload: InventoryUsePayload): Promise<void> => {
      if (!accessToken || !apiUrl) throw new Error("Please sign in first");
      const version = authVersionRef.current;

      const res = await fetch(`${apiUrl}/inventory/use`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to update inventory");
      }

      if (version !== authVersionRef.current) {
        throw new Error("Inventory auth changed during use");
      }

      await refreshInventory({ silent: true, notifyLowStock: true });
    },
    [accessToken, apiUrl, refreshInventory]
  );

  const replaceInventoryItem = useCallback((item: InventoryItem) => {
    setInventory((prev) => {
      const exists = prev.some((x) => x.id === item.id);
      if (!exists) return [item, ...prev];
      return prev.map((x) => (x.id === item.id ? item : x));
    });
  }, []);

  const inventoryById = useMemo(() => {
    const out: Record<string, InventoryItem> = {};
    for (const item of inventory) out[item.id] = item;
    return out;
  }, [inventory]);

  const inventoryByIngredientKey = useMemo(() => {
    const out: Record<string, InventoryItem> = {};
    for (const item of inventory) {
      const key = String(item.ingredient_key ?? "").trim();
      if (!key || out[key]) continue;
      out[key] = item;
    }
    return out;
  }, [inventory]);

  const availableIngredientKeys = useMemo(() => dedupeIngredientKeys(inventory), [inventory]);

  const value = useMemo(
    () => ({
      inventory,
      inventoryById,
      inventoryByIngredientKey,
      availableIngredientKeys,
      loading,
      refreshing,
      initialized,
      error,
      refreshInventory,
      addInventoryItem,
      updateInventoryItem,
      deleteInventoryItem,
      recordInventoryUse,
      replaceInventoryItem,
    }),
    [
      inventory,
      inventoryById,
      inventoryByIngredientKey,
      availableIngredientKeys,
      loading,
      refreshing,
      initialized,
      error,
      refreshInventory,
      addInventoryItem,
      updateInventoryItem,
      deleteInventoryItem,
      recordInventoryUse,
      replaceInventoryItem,
    ]
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error("useInventory must be used within <InventoryProvider />");
  return ctx;
}
