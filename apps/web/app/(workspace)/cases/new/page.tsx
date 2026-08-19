import { verifySession } from "@/features/auth/dal";
import { listUsers } from "@/features/users/service";
import { CaseForm } from "./case-form";

export default async function NewCasePage() {
  const user = await verifySession();
  const users = user.role === "lead" ? await listUsers() : [];
  const activeUsers = users.filter((candidate) => !candidate.disabledAt);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">New case</h1>
      <CaseForm role={user.role} activeUsers={activeUsers} />
    </div>
  );
}
