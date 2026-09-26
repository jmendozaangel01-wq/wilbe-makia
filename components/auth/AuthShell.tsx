import type { ReactNode } from "react";
import Link from "next/link";
import "./auth.css";

/** Ticket-shaped brand mark: red stub, gold initial, two notches. */
function LogoMark() {
  return (
    <Link
      href="/"
      aria-label="Bendita Rifa, inicio"
      className="inline-block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
    >
      <span className="relative flex h-12 w-14 items-center justify-center rounded-md bg-red shadow-[0_8px_24px_oklch(0.52_0.21_26_/_0.45)]">
        <span aria-hidden="true" className="absolute -left-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-charcoal" />
        <span aria-hidden="true" className="absolute -right-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-charcoal" />
        <span aria-hidden="true" className="font-display text-[28px] leading-none text-gold">
          B
        </span>
      </span>
    </Link>
  );
}

interface AuthShellProps {
  title: string;
  /** Short line under the title (may contain a link). */
  subtitle?: ReactNode;
  children: ReactNode;
  /** Show the terms/privacy note under the card. */
  legal?: boolean;
}

/**
 * Shared frame for every auth screen: dark stage with a warm glow, centred
 * logo mark, and a ticket card whose perforation separates the title from
 * the form.
 */
export default function AuthShell({ title, subtitle, children, legal = false }: AuthShellProps) {
  return (
    <main className="auth-stage flex min-h-dvh flex-col items-center justify-center px-4 py-10 sm:py-14">
      <div className="auth-enter w-full max-w-[400px]">
        <div className="mb-6 flex justify-center">
          <LogoMark />
        </div>

        <section className="auth-ticket" aria-labelledby="auth-title">
          <header className="px-6 pb-6 pt-7 text-center sm:px-8">
            <h1 id="auth-title" className="font-display text-balance text-[28px] leading-tight tracking-wide text-cream">
              {title}
            </h1>
            {subtitle ? <p className="mt-2 text-sm leading-relaxed text-gray">{subtitle}</p> : null}
          </header>
          <div className="auth-perforation" aria-hidden="true" />
          <div className="px-6 pb-7 pt-6 sm:px-8">{children}</div>
        </section>

        {legal ? (
          <p className="mt-6 px-2 text-center text-xs leading-relaxed text-gray-dim">
            Al continuar aceptas los Términos y la Política de privacidad
          </p>
        ) : null}
      </div>
    </main>
  );
}
