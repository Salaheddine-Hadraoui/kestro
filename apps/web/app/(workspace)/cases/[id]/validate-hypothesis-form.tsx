"use client";

import { useActionState } from "react";
import { validateHypothesisAction, type CaseActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

const initialState: CaseActionState = {};

export function ValidateHypothesisForm({
  caseId,
  hypothesisId,
}: {
  caseId: string;
  hypothesisId: string;
}) {
  const [state, formAction, pending] = useActionState(validateHypothesisAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="hypothesisId" value={hypothesisId} />
      <div className="space-y-1">
        <label htmlFor={`conclusion-${hypothesisId}`} className="block text-sm font-medium">
          Conclusion
        </label>
        <textarea
          id={`conclusion-${hypothesisId}`}
          name="conclusionStatement"
          required
          maxLength={2000}
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" disabled={pending}>
        {pending ? "Validating…" : "Validate"}
      </Button>
    </form>
  );
}
