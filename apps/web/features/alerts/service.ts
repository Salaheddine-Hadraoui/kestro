import "server-only";
import { apiFetch } from "../../lib/server/api-client";
import type { Alert, AlertStatus, PaginatedAlerts, Severity } from "../../lib/api/types";

export interface ListAlertsFilters {
  status?: AlertStatus;
  severity?: Severity;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listAlerts(filters: ListAlertsFilters): Promise<PaginatedAlerts> {
  const params = new URLSearchParams();
  if (filters.status !== undefined) params.set("status", filters.status);
  if (filters.severity !== undefined) params.set("severity", filters.severity);
  if (filters.q !== undefined) params.set("q", filters.q);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.offset !== undefined) params.set("offset", String(filters.offset));
  return apiFetch<PaginatedAlerts>(`/alerts?${params.toString()}`);
}

export async function getAlert(id: string): Promise<Alert> {
  return apiFetch<Alert>(`/alerts/${encodeURIComponent(id)}`);
}

export async function dismissAlert(id: string, reason: string): Promise<Alert> {
  return apiFetch<Alert>(`/alerts/${encodeURIComponent(id)}/dismiss`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
