import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type UnitPreference = "ml" | "oz";

const STORAGE_KEY = "sipmetry:unit_preference";
const DEFAULT_UNIT: UnitPreference = "oz";

export function useUnitPreference() {
  const [unit, setUnitState] = useState<UnitPreference>(DEFAULT_UNIT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === "ml" || value === "oz") {
          setUnitState(value);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setUnit = useCallback((next: UnitPreference) => {
    setUnitState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  return { unit, setUnit, ready };
}
