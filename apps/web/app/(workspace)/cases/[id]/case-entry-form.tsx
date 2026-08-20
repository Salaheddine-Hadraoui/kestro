"use client";

import { useActionState } from "react";
import type { CaseActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

const initialState: CaseActionState = {};

const KIND_LABEL: Record<"note" | "comment", string> = {
  note: "Note",
  comment: "Comment",
};

export function CaseEntryForm({
  caseId,
  kind,
  action,
}: {
  caseId: string;
  kind: "note" | "comment";
  action: (prevState: CaseActionState, formData: FormData) => Promise<CaseActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const fieldId = `${kind}-content-${caseId}`;

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="caseId" value={caseId} />
      <div className="space-y-1">
        <label htmlFor={fieldId} className="block text-sm font-medium">
          {KIND_LABEL[kind]}
        </label>
        <textarea
          id={fieldId}
          name="content"
          required
          maxLength={2000}
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : `Add ${kind}`}
      </Button>
    </form>
  );
}
