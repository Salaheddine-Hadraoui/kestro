"use server";

import { redirect } from "next/navigation";
import { login, InvalidCredentialsError } from "@/features/auth/service";

export interface LoginFormState {
  error?: string;
}

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  try {
    await login(email, password);
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return { error: "Invalid email or password." };
    }
    return { error: "Something went wrong. Please try again." };
  }

  redirect("/");
}
