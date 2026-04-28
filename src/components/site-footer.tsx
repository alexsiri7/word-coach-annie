import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface py-6 text-center text-xs text-text-muted">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-center gap-3">
        <Link href="/privacy" className="hover:text-text-primary transition-colors">
          Privacy
        </Link>
        <span aria-hidden="true">&middot;</span>
        <Link href="/terms" className="hover:text-text-primary transition-colors">
          Terms
        </Link>
      </div>
    </footer>
  );
}
