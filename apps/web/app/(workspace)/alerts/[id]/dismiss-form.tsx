"use client";

import { useActionState } from "react";
import { dismissAlertAction, type AlertActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

const initialState: AlertActionState = {};

export function DismissForm({ alertId }: { alertId: string }) {
  const [state, formAction, pending] = useActionState(dismissAlertAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="alertId" value={alertId} />
      <div className="space-y-1">
        <label htmlFor={`dismiss-reason-${alertId}`} className="block text-sm font-medium">
          Dismiss reason
        </label>
        <textarea
          id={`dismiss-reason-${alertId}`}
          name="reason"
          required
          maxLength={500}
          className="w-full rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
      </div>
      {state.error && <FormError message={state.error} />}
      <Button type="submit" variant="warning" disabled={pending}>
        {pending ? "Dismissing…" : "Dismiss"}
      </Button>
    </form>
  );
}
