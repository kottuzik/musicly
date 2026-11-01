"use client";

import { useCallback, useState } from "react";

// Field errors from the last submit, kept in state so each one disappears as soon as its field changes.
export function useFieldErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clear = useCallback((...keys: string[]) => {
    setErrors((prev) =>
      keys.some((k) => k in prev) ? Object.fromEntries(Object.entries(prev).filter(([k]) => !keys.includes(k))) : prev,
    );
  }, []);
  return { errors, setErrors, clear };
}
