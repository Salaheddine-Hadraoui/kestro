"use server";

import { redirect } from "next/navigation";
import { dismissAlert } from "@/features/alerts/service";
import { linkAlertToCase } from "@/features/cases/service";
import { ApiError } from "@/lib/server/api-client";

export interface AlertActionState {
  error?: string;
}

export async function dismissAlertAction(
  _prevState: AlertActionState,
  formData: FormData,
): Promise<AlertActionState> {
  const alertId = String(formData.get("alertId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reason) {
    return { error: "A dismiss reason is required." };
  }

  try {
    await dismissAlert(alertId, reason);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/alerts/${alertId}`);
}

export async function linkAlertToCaseAction(
  _prevState: AlertActionState,
  formData: FormData,
): Promise<AlertActionState> {
  const alertId = String(formData.get("alertId") ?? "");
  const caseId = String(formData.get("caseId") ?? "");

  if (!caseId) {
    return { error: "Choose a case to link to." };
  }

  try {
    await linkAlertToCase(caseId, alertId);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/alerts/${alertId}`);
}
