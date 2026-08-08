export function Header() {
  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <span className="text-lg font-semibold">OpsFlow</span>
        {/* Navigation placeholder: real sections (Alerts, Cases, ...) are
            business UI and are not part of the technical foundation stage. */}
        <nav aria-label="Primary" className="text-sm text-black/50 dark:text-white/50">
          Navigation placeholder
        </nav>
      </div>
    </header>
  );
}
