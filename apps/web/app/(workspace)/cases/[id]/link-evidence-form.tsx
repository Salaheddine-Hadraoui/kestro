"use client";

import { useActionState } from "react";
import { linkEvidenceAction, type CaseActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

const initialState: CaseActionState = {};

export function LinkEvidenceForm({
  caseId,
  hypothesisId,
  evidenceOptions,
}: {
  caseId: string;
  hypothesisId: string;
  evidenceOptions: { id: string; source: string; type: string; timestamp: string }[];
}) {
  const [state, formAction, pending] = useActionState(linkEvidenceAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="hypothesisId" value={hypothesisId} />
      <div className="space-y-1">
        <label htmlFor={`link-evidence-${hypothesisId}`} className="block text-sm font-medium">
          Link evidence
        </label>
        <select
          id={`link-evidence-${hypothesisId}`}
          name="evidenceId"
          required
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        >
          <option value="">Choose evidence</option>
          {evidenceOptions.map((evidence) => (
            <option key={evidence.id} value={evidence.id}>
              {evidence.source} · {evidence.type} · {new Date(evidence.timestamp).toLocaleString()}
            </option>
          ))}
        </select>
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" variant="secondary" disabled={pending || evidenceOptions.length === 0}>
        {pending ? "Linking…" : "Link evidence"}
      </Button>
    </form>
  );
}
