export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-black/15 px-6 py-10 text-center dark:border-white/15">
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">{description}</p>
      )}
    </div>
  );
}
