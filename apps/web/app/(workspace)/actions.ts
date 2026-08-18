"use server";

import { redirect } from "next/navigation";
import { logout } from "@/features/auth/service";

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}
