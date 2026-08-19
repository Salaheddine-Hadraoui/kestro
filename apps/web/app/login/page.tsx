import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/dal";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/");
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign in to Kestro</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          SOC Operations &amp; Investigation Platform
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
