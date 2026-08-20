import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

// Deliberately does not call verifySession -- Next.js renders this for any
// unmatched route, authenticated or not, so it must not assume a session
// exists.
export default function NotFound() {
  return (
    <div className="space-y-4 py-16 text-center">
      <EmptyState
        title="Page not found"
        description="The page you're looking for doesn't exist or may have moved."
      />
      <Link href="/" className="text-sm underline">
        Back to Workspace
      </Link>
    </div>
  );
}
