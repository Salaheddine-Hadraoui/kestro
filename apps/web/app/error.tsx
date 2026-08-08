"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="space-y-4 py-16 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <button
        onClick={() => retry()}
        className="rounded-md border border-black/10 dark:border-white/10 px-4 py-2 text-sm"
      >
        Try again
      </button>
    </div>
  );
}
