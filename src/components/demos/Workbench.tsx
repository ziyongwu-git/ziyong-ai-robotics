import type { ReactNode } from 'react';

/**
 * Shared pieces of a demo workbench.
 *
 * The three shipped demos keep their own state. These pieces only
 * keep the first experiment, the legend, and the raw JSON in the same places.
 */

export function FirstExperiment({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-accent bg-accent-soft px-4 py-4" aria-label="First experiment">
      <p className="font-mono text-xs tracking-[0.14em] text-accent uppercase">First experiment</p>
      <h4 className="mt-1 font-serif text-2xl leading-snug">{title}</h4>
      <div className="mt-2 max-w-[65ch] text-sm leading-6">{children}</div>
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}

export function Legend({ items }: { items: { swatch: ReactNode; label: string }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm leading-5 text-muted" aria-label="Legend">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span className="inline-flex shrink-0" aria-hidden="true">
            {item.swatch}
          </span>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function Swatch({ className }: { className: string }) {
  return <span className={`inline-block h-3.5 w-3.5 ${className}`} />;
}

export function TechnicalDetail({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="mt-4 rounded-2xl border border-line bg-paper">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{summary}</summary>
      <div className="border-t border-line px-4 py-3">{children}</div>
    </details>
  );
}

export function ResultPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="rounded-2xl border border-line bg-paper p-4" aria-live="polite">
      <h4 className="font-serif text-xl">{title}</h4>
      <div className="mt-2 space-y-3 text-sm leading-6">{children}</div>
    </aside>
  );
}
