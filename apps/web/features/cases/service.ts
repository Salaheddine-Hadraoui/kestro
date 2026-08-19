import "server-only";
import { apiFetch } from "../../lib/server/api-client";
import type {
  CaseAction,
  CaseStatus,
  CaseWithAlerts,
  PaginatedCases,
  PaginatedTimelineEvents,
  Severity,
} from "../../lib/api/types";

export interface ListCasesFilters {
  status?: CaseStatus;
  severity?: Severity;
  assigneeId?: string;
  limit?: number;
  offset?: number;
}

export async function listCases(filters: ListCasesFilters): Promise<PaginatedCases> {
  const params = new URLSearchParams();
  if (filters.status !== undefined) params.set("status", filters.status);
  if (filters.severity !== undefined) params.set("severity", filters.severity);
  if (filters.assigneeId !== undefined) params.set("assigneeId", filters.assigneeId);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.offset !== undefined) params.set("offset", String(filters.offset));
  return apiFetch<PaginatedCases>(`/cases?${params.toString()}`);
}

export async function getCase(id: string): Promise<CaseWithAlerts> {
  return apiFetch<CaseWithAlerts>(`/cases/${id}`);
}

export interface CreateCaseInput {
  title: string;
  severity: Severity;
  assigneeId?: string;
}

export async function createCase(input: CreateCaseInput): Promise<CaseWithAlerts> {
  return apiFetch<CaseWithAlerts>("/cases", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function transitionCase(
  id: string,
  action: CaseAction,
  resolutionSummary?: string,
): Promise<CaseWithAlerts> {
  const body: { action: CaseAction; resolutionSummary?: string } = { action };
  if (resolutionSummary !== undefined) {
    body.resolutionSummary = resolutionSummary;
  }
  return apiFetch<CaseWithAlerts>(`/cases/${id}/transitions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function reassignCase(id: string, assigneeId: string): Promise<CaseWithAlerts> {
  return apiFetch<CaseWithAlerts>(`/cases/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ assigneeId }),
  });
}

export async function addNote(id: string, content: string): Promise<void> {
  await apiFetch(`/cases/${id}/notes`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export async function addComment(id: string, content: string): Promise<void> {
  await apiFetch(`/cases/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

// Fetches the case's timeline at the backend's max page size (100) rather
// than exposing any pagination UI -- product decision (b): a narrow,
// filtered read of the Timeline endpoint for Notes & Comments, not a
// Timeline UI feature. Callers filter the result with
// lib/case-notes.ts's extractHumanEntries().
export async function listCaseTimelineEntries(id: string): Promise<PaginatedTimelineEvents> {
  return apiFetch<PaginatedTimelineEvents>(`/cases/${id}/timeline?limit=100&offset=0`);
}
