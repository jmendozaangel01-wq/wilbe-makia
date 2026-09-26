import Link from "next/link";
import { LOGIN_HREF, SIGNUP_HREF, TRIAL_LABEL } from "./MarketingHeader";

export default function MarketingFooter() {
  return (
    <footer className="mt-auto">
      <div className="border-t-2 border-gold/50 bg-red">
        <div className="mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-6 px-5 py-14 sm:px-8 md:flex-row md:items-center">
          <h2 className="max-w-[20ch] font-display text-[clamp(30px,4.6vw,48px)] leading-[1.02] tracking-wide text-white">
            ¿LISTO PARA LANZAR TU RIFA?
          </h2>
          <Link
            href={SIGNUP_HREF}
            className="inline-flex items-center justify-center rounded-sm bg-charcoal px-8 py-4 text-base font-extrabold text-gold! transition hover:bg-charcoal-soft hover:text-gold-light!"
          >
            {TRIAL_LABEL}
          </Link>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-6 text-[13px] text-gray sm:px-8">
        <span>Bendita Rifa © 2026</span>
        <Link href={LOGIN_HREF} className="font-semibold text-gray! hover:text-cream!">
          Iniciar sesión
        </Link>
      </div>
    </footer>
  );
}
