import "server-only";
import { apiFetch } from "../../lib/server/api-client";
import type { Evidence, EvidenceType } from "../../lib/api/types";

export async function listEvidence(caseId: string): Promise<Evidence[]> {
  return apiFetch<Evidence[]>(`/cases/${encodeURIComponent(caseId)}/evidence`);
}

export interface AddEvidenceInput {
  type: EvidenceType;
  source: string;
  content: string;
  timestamp: string;
}

export async function addEvidence(caseId: string, input: AddEvidenceInput): Promise<Evidence> {
  return apiFetch<Evidence>(`/cases/${encodeURIComponent(caseId)}/evidence`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
