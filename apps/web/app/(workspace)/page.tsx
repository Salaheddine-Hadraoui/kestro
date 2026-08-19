import { verifySession } from "@/features/auth/dal";

export default async function WorkspaceHomePage() {
  const user = await verifySession();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Signed in as {user.role}. Alerts, Cases, and the rest of the Operations
        Workspace land in later milestones (see docs/PROGRESS.md).
      </p>
    </div>
  );
}
