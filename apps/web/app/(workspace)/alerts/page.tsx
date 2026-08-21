import Link from "next/link";
import { listAlerts } from "@/features/alerts/service";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { ALERT_STATUS_BADGE_TONE, SEVERITY_BADGE_TONE } from "@/lib/badge-tones";
import type { AlertStatus, Severity } from "@/lib/api/types";

const STATUSES: AlertStatus[] = ["new", "linked", "dismissed"];
const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

// Same rationale as app/(workspace)/cases/page.tsx's identical helper:
// Next.js 16's searchParams type allows a repeated query param to arrive as
// a string[]; every filter here is single-valued, so only the first value
// is used.
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function buildPageHref(
  filters: { status?: AlertStatus; severity?: Severity; q?: string },
  offset: number,
): string {
  const params = new URLSearchParams();
  if (filters.status !== undefined) params.set("status", filters.status);
  if (filters.severity !== undefined) params.set("severity", filters.severity);
  if (filters.q !== undefined) params.set("q", filters.q);
  params.set("offset", String(offset));
  return `/alerts?${params.toString()}`;
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  const status = firstValue(params.status);
  const severity = firstValue(params.severity);
  const offset = firstValue(params.offset);

  const rawQ = firstValue(params.q);
  const trimmedQ = rawQ?.trim();
  const safeQ = trimmedQ && trimmedQ.length > 0 && trimmedQ.length <= 200 ? trimmedQ : undefined;

  const parsedOffset = offset !== undefined ? Number(offset) : 0;
  const safeOffset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

  const filters = {
    status: STATUSES.includes(status as AlertStatus) ? (status as AlertStatus) : undefined,
    severity: SEVERITIES.includes(severity as Severity) ? (severity as Severity) : undefined,
    q: safeQ,
    limit: 25,
    offset: safeOffset,
  };

  const { data: alerts, total } = await listAlerts(filters);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Alerts</h1>

      <form method="GET" className="flex flex-wrap items-end gap-4">
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={rawQ ?? ""}
            maxLength={200}
            placeholder="Source or summary..."
            className="rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
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
        <button type="submit" className="rounded-md border border-black/20 px-4 py-2 text-sm dark:border-white/20">
          Apply filters
        </button>
      </form>

      {alerts.length === 0 ? (
        <EmptyState title="No alerts match these filters" />
      ) : (
        // A plain GET form, not a Server Action: selecting alerts here is
        // navigation to the case-creation form, not a mutation -- the same
        // reasoning that already makes the filter form above a GET form.
        // Selection does not persist across pagination; that's an accepted
        // limitation, not a bug, given the current page size.
        <form method="GET" action="/cases/new">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/10">
                <th className="py-2 font-medium" />
                <th className="py-2 font-medium">Summary</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Severity</th>
                <th className="py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2">
                    {alert.status === "new" && (
                      <input
                        type="checkbox"
                        name="alertIds"
                        value={alert.id}
                        aria-label={`Select ${alert.summary}`}
                      />
                    )}
                  </td>
                  <td className="py-2">
                    <Link href={`/alerts/${alert.id}`} className="underline">
                      {alert.summary}
                    </Link>
                  </td>
                  <td className="py-2">
                    <Badge tone={ALERT_STATUS_BADGE_TONE[alert.status]}>{alert.status}</Badge>
                  </td>
                  <td className="py-2">
                    <Badge tone={SEVERITY_BADGE_TONE[alert.severity]}>{alert.severity}</Badge>
                  </td>
                  <td className="py-2">{alert.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pt-4">
            <button
              type="submit"
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
            >
              Create case from selected
            </button>
          </div>
        </form>
      )}

      <p className="text-sm text-black/60 dark:text-white/60">
        Showing {alerts.length} of {total} alert{total === 1 ? "" : "s"}.
      </p>

      <div className="flex items-center gap-4">
        {filters.offset > 0 && (
          <Link href={buildPageHref(filters, Math.max(0, filters.offset - filters.limit))} className="text-sm underline">
            Previous
          </Link>
        )}
        {filters.offset + alerts.length < total && (
          <Link href={buildPageHref(filters, filters.offset + filters.limit)} className="text-sm underline">
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
