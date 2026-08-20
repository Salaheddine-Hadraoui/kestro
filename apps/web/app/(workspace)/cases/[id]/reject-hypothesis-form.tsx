"use client";

import { useActionState } from "react";
import { rejectHypothesisAction, type CaseActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

const initialState: CaseActionState = {};

export function RejectHypothesisForm({
  caseId,
  hypothesisId,
}: {
  caseId: string;
  hypothesisId: string;
}) {
  const [state, formAction, pending] = useActionState(rejectHypothesisAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="hypothesisId" value={hypothesisId} />
      {state.error && <FormError message={state.error} />}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Rejecting…" : "Reject"}
      </Button>
    </form>
  );
}
