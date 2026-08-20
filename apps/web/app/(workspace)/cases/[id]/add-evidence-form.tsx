"use client";

import { useActionState } from "react";
import { addEvidenceAction, type CaseActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { FormError } from "@/components/ui/form-error";

const initialState: CaseActionState = {};

const EVIDENCE_TYPE_OPTIONS = ["LOG", "SCREENSHOT", "FILE", "URL", "COMMAND_OUTPUT", "OTHER"] as const;

export function AddEvidenceForm({ caseId }: { caseId: string }) {
  const [state, formAction, pending] = useActionState(addEvidenceAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="caseId" value={caseId} />
      <div className="space-y-1">
        <label htmlFor={`evidence-type-${caseId}`} className="block text-sm font-medium">
          Type
        </label>
        <select
          id={`evidence-type-${caseId}`}
          name="type"
          required
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        >
          <option value="">Select type</option>
          {EVIDENCE_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <TextField label="Source" name="source" required maxLength={200} />
      <div className="space-y-1">
        <label htmlFor={`evidence-content-${caseId}`} className="block text-sm font-medium">
          Content
        </label>
        <textarea
          id={`evidence-content-${caseId}`}
          name="content"
          required
          maxLength={10000}
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={`evidence-timestamp-${caseId}`} className="block text-sm font-medium">
          Observed at
        </label>
        <input
          id={`evidence-timestamp-${caseId}`}
          name="timestamp"
          type="datetime-local"
          required
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add evidence"}
      </Button>
    </form>
  );
}
