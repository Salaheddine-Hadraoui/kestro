"use client";

import { useEffect, useState } from "react";
import { env } from "@/lib/env";

type HealthState =
  | { status: "checking" }
  | { status: "ok"; body: unknown }
  | { status: "error"; message: string };

export default function Home() {
  const [health, setHealth] = useState<HealthState>({ status: "checking" });

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${env.apiUrl}/health`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Health check responded with ${res.status}`);
        }
        setHealth({ status: "ok", body: await res.json() });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHealth({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      });

    return () => controller.abort();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Technical foundation</h1>
      <p className="text-black/60 dark:text-white/60">
        This is the application shell for OpsFlow. Business features
        (Alerts, Cases, Evidence, Timeline) are not implemented yet — see
        docs/ROADMAP.md.
      </p>

      <div className="rounded-lg border border-black/10 dark:border-white/10 p-4">
        <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
          Backend health check
        </h2>
        {health.status === "checking" && <p>Checking {env.apiUrl}/health…</p>}
        {health.status === "ok" && (
          <pre className="mt-2 text-sm text-green-700 dark:text-green-400">
            {JSON.stringify(health.body, null, 2)}
          </pre>
        )}
        {health.status === "error" && (
          <p className="mt-2 text-sm text-red-700 dark:text-red-400">
            Could not reach the API: {health.message}
          </p>
        )}
      </div>
    </div>
  );
}
