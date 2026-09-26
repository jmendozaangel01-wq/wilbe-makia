import Link from "next/link";

export const LOGIN_HREF = "/admin/login";
export const TRIAL_LABEL = "Prueba gratis 14 días";

export default function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-charcoal/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-5 py-3.5 sm:px-8">
        <Link href="/" className="whitespace-nowrap font-display text-[22px] leading-none tracking-wide text-cream! hover:text-cream!">
          BENDITA <span className="text-red">RIFA</span>
        </Link>

        <nav aria-label="Principal" className="flex items-center gap-2 sm:gap-5">
          <a href="#como-funciona" className="hidden text-sm font-semibold text-gray! hover:text-cream! md:inline">
            Cómo funciona
          </a>
          <a href="#demo" className="hidden text-sm font-semibold text-gray! hover:text-cream! md:inline">
            Rifa en vivo
          </a>
          <Link href={LOGIN_HREF} className="whitespace-nowrap px-2 py-2 text-sm font-semibold text-cream! hover:text-gold! sm:px-3">
            Iniciar sesión
          </Link>
          <Link
            href={LOGIN_HREF}
            className="whitespace-nowrap rounded-sm bg-gold px-3.5 py-2.5 text-[13px] font-extrabold text-charcoal! transition hover:bg-gold-light hover:text-charcoal! sm:px-5 sm:text-sm"
          >
            <span className="sm:hidden">Prueba gratis</span>
            <span className="hidden sm:inline">{TRIAL_LABEL}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
