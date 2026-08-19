import Link from "next/link";
import { verifySession } from "@/features/auth/dal";
import { listCases } from "@/features/cases/service";
import { listUsers } from "@/features/users/service";
import { buildUserNameMap, resolveUserName } from "@/lib/format-user";
import { EmptyState } from "@/components/ui/empty-state";
import type { CaseStatus, Severity } from "@/lib/api/types";

const STATUSES: CaseStatus[] = [
  "OPEN",
  "TRIAGING",
  "INVESTIGATING",
  "ESCALATED",
  "MITIGATING",
  "VERIFYING",
  "RESOLVED",
];
const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

// Next.js 16's searchParams type allows a repeated query param (e.g.
// "?status=OPEN&status=TRIAGING") to arrive as a string[] -- confirmed
// against this version's own bundled docs
// (node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md),
// not assumed from prior training data per apps/web/AGENTS.md's warning.
// Every filter here is single-valued, so only the first value is used.
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const user = await verifySession();

  const status = firstValue(params.status);
  const severity = firstValue(params.severity);
  const assigneeId = firstValue(params.assigneeId);
  const offset = firstValue(params.offset);

  const filters = {
    status: STATUSES.includes(status as CaseStatus) ? (status as CaseStatus) : undefined,
    severity: SEVERITIES.includes(severity as Severity) ? (severity as Severity) : undefined,
    // Only meaningful for a Lead -- the backend ignores this for an
    // Analyst and always scopes their list to themselves regardless
    // (apps/api/src/cases/cases.service.ts's findAll()).
    assigneeId: user.role === "lead" ? assigneeId : undefined,
    limit: 25,
    offset: offset && !Number.isNaN(Number(offset)) ? Number(offset) : 0,
  };

  const [{ data: cases, total }, users] = await Promise.all([listCases(filters), listUsers()]);
  const userNames = buildUserNameMap(users);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cases</h1>
        <Link
          href="/cases/new"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          New case
        </Link>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-4">
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Status</span>
          <select name="status" defaultValue={status ?? ""} className="rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent">
            <option value="">Any</option>
            {STATUSES.map((statusOption) => (
              <option key={statusOption} value={statusOption}>
                {statusOption}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Severity</span>
          <select name="severity" defaultValue={severity ?? ""} className="rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent">
            <option value="">Any</option>
            {SEVERITIES.map((severityOption) => (
              <option key={severityOption} value={severityOption}>
                {severityOption}
              </option>
            ))}
          </select>
        </label>
        {user.role === "lead" && (
          <label className="space-y-1 text-sm">
            <span className="block font-medium">Assignee</span>
            <select name="assigneeId" defaultValue={assigneeId ?? ""} className="rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent">
              <option value="">Anyone</option>
              {users.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="submit"
          className="rounded-md border border-black/20 px-4 py-2 text-sm dark:border-white/20"
        >
          Apply filters
        </button>
      </form>

      {cases.length === 0 ? (
        <EmptyState title="No cases match these filters" />
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              <th className="py-2 font-medium">Title</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Severity</th>
              <th className="py-2 font-medium">Assignee</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((kase) => (
              <tr key={kase.id} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2">
                  <Link href={`/cases/${kase.id}`} className="underline">
                    {kase.title}
                  </Link>
                </td>
                <td className="py-2">{kase.status}</td>
                <td className="py-2">{kase.severity}</td>
                <td className="py-2">{resolveUserName(userNames, kase.assigneeId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-sm text-black/60 dark:text-white/60">
        Showing {cases.length} of {total} case{total === 1 ? "" : "s"}.
      </p>
    </div>
  );
}
