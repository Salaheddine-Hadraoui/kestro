import "server-only";
import { apiFetch } from "../../lib/server/api-client";
import type { Evidence, Hypothesis } from "../../lib/api/types";

export async function listHypotheses(caseId: string): Promise<Hypothesis[]> {
  return apiFetch<Hypothesis[]>(`/cases/${encodeURIComponent(caseId)}/hypotheses`);
}

export async function proposeHypothesis(caseId: string, statement: string): Promise<Hypothesis> {
  return apiFetch<Hypothesis>(`/cases/${encodeURIComponent(caseId)}/hypotheses`, {
    method: "POST",
    body: JSON.stringify({ statement }),
  });
}

export async function validateHypothesis(
  caseId: string,
  hypothesisId: string,
  conclusionStatement: string,
): Promise<Hypothesis> {
  return apiFetch<Hypothesis>(
    `/cases/${encodeURIComponent(caseId)}/hypotheses/${encodeURIComponent(hypothesisId)}/validate`,
    { method: "POST", body: JSON.stringify({ conclusionStatement }) },
  );
}

export async function rejectHypothesis(caseId: string, hypothesisId: string): Promise<Hypothesis> {
  return apiFetch<Hypothesis>(
    `/cases/${encodeURIComponent(caseId)}/hypotheses/${encodeURIComponent(hypothesisId)}/reject`,
    { method: "POST" },
  );
}

export async function linkEvidenceToHypothesis(
  caseId: string,
  hypothesisId: string,
  evidenceId: string,
): Promise<Evidence> {
  return apiFetch<Evidence>(
    `/cases/${encodeURIComponent(caseId)}/hypotheses/${encodeURIComponent(hypothesisId)}/evidence`,
    { method: "POST", body: JSON.stringify({ evidenceId }) },
  );
}
