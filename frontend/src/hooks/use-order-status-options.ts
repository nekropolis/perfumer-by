"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchOrderStatuses,
  type OrderStatus,
} from "@/lib/admin-order-statuses-api";

export type OrderStatusOption = {
  value: string;
  label: string;
  color: string;
};

function toOptions(rows: OrderStatus[]): OrderStatusOption[] {
  return rows.map((row) => ({
    value: row.code,
    label: row.name,
    color: row.color,
  }));
}

export function useOrderStatusOptions(activeOnly = true): {
  options: OrderStatusOption[];
  byCode: Map<string, OrderStatusOption>;
  loading: boolean;
  reload: () => void;
} {
  const [rows, setRows] = useState<OrderStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void fetchOrderStatuses(activeOnly ? { active: true } : undefined)
      .then((res) => setRows(res.data))
      .catch((error) => {
        console.error(error);
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [activeOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const options = useMemo(() => toOptions(rows), [rows]);
  const byCode = useMemo(() => {
    const map = new Map<string, OrderStatusOption>();
    for (const option of options) {
      map.set(option.value, option);
    }
    return map;
  }, [options]);

  return { options, byCode, loading, reload: load };
}
