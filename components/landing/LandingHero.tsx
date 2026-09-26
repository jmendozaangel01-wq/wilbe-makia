import type { CSSProperties } from "react";
import Link from "next/link";
import { LOGIN_HREF, TRIAL_LABEL } from "./MarketingHeader";

const SAMPLE_NUMBER = "07734";
const STRIP = "01234567890123456789".split("");

/** One reel of the slot-style number: a 0-9 strip repeated twice, scrolled to land on `digit`. */
function Digit({ digit, index }: { digit: number; index: number }) {
  return (
    <span
      className="relative inline-block h-[1em] w-[0.74em] overflow-hidden rounded-[3px] bg-charcoal text-gold shadow-[inset_0_-10px_14px_-8px_oklch(0_0_0_/_0.6)]"
      aria-hidden="true"
    >
      <span
        className="mk-digit-strip flex flex-col"
        style={{ "--to": 10 + digit, "--delay": `${index * 0.14}s` } as CSSProperties}
      >
        {STRIP.map((d, i) => (
          <span key={i} className="block h-[1em] text-center leading-none">
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

function Ticket() {
  return (
    <div className="relative mx-auto w-full max-w-[520px] -rotate-2 transition-transform duration-500 hover:rotate-0 motion-reduce:transition-none">
      <div className="relative flex rounded-md bg-cream text-charcoal shadow-[0_30px_60px_oklch(0_0_0_/_0.55),0_0_0_1px_oklch(0.80_0.14_85_/_0.35)]">
        {/* Main body */}
        <div className="min-w-0 flex-1 px-5 py-6 sm:px-7 sm:py-8">
          <div className="flex items-center gap-2 text-[13px] font-bold">
            <span className="h-2 w-2 rounded-full bg-red animate-pulse-dot" />
            <span className="truncate">tu-rifa.benditarifa.com</span>
          </div>

          <div className="mt-5 font-display text-[15px] leading-none tracking-wide text-charcoal/70">
            NÚMERO BENDECIDO
          </div>

          <div
            className="mt-3 flex gap-1.5 font-display text-[clamp(40px,11vw,68px)] leading-none sm:gap-2"
            role="img"
            aria-label={`Número de ejemplo ${SAMPLE_NUMBER}`}
          >
            {SAMPLE_NUMBER.split("").map((d, i) => (
              <Digit key={i} digit={Number(d)} index={i} />
            ))}
          </div>

          <p className="mt-5 max-w-[30ch] text-[14px] leading-snug text-charcoal/80">
            Cada comprador recibe sus números por correo cuando confirmas su pago.
          </p>
        </div>

        {/* Perforation with notches */}
        <div className="relative w-0">
          <div className="ticket-perforation absolute inset-y-3 -left-px w-[2px]" />
          <span className="absolute -left-[11px] -top-[11px] h-[22px] w-[22px] rounded-full bg-charcoal" />
          <span className="absolute -bottom-[11px] -left-[11px] h-[22px] w-[22px] rounded-full bg-charcoal" />
        </div>

        {/* Stub */}
        <div className="relative flex w-[76px] flex-none items-center justify-center rounded-r-md bg-red text-white sm:w-[104px]">
          <div className="rotate-180 font-display text-[20px] tracking-[3px] [writing-mode:vertical-rl] sm:text-[26px]">
            Nº {SAMPLE_NUMBER}
          </div>
          <div className="mk-stamp absolute -left-[74px] bottom-5 rounded-sm border-[3px] border-white bg-red px-2.5 py-1 font-display text-[16px] leading-none tracking-wide text-white shadow-[0_4px_10px_oklch(0_0_0_/_0.35)] sm:-left-[90px] sm:text-[18px]">
            PAGO CONFIRMADO
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      {/* Soft spotlight behind the ticket */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 top-10 h-[620px] w-[620px] rounded-full opacity-60"
        style={{ background: "radial-gradient(closest-side, oklch(0.52 0.21 26 / 0.28), transparent)" }}
      />
      <div className="relative mx-auto grid max-w-[1180px] items-center gap-14 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:pb-28 lg:pt-24">
        <div>
          <h1 className="font-display text-[clamp(44px,8.6vw,88px)] leading-[0.95] tracking-[0.5px]">
            TU RIFA ONLINE,
            <br />
            LISTA EN <span className="text-red">MINUTOS.</span>
          </h1>
          <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-gray sm:text-lg">
            Crea tu organización y tu rifa, comparte tu propio enlace y deja que tus compradores reserven sus
            números y suban el comprobante de pago. Tú confirmas desde un panel y ellos reciben sus números por
            correo.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link
              href={LOGIN_HREF}
              className="inline-flex items-center justify-center rounded-sm bg-gold px-8 py-4 text-base font-extrabold text-charcoal! shadow-[0_10px_30px_oklch(0.80_0.14_85_/_0.28)] transition hover:bg-gold-light hover:text-charcoal!"
            >
              {TRIAL_LABEL}
            </Link>
            <a
              href="#demo"
              className="text-[15px] font-semibold text-cream! underline decoration-red decoration-2 underline-offset-[6px] hover:text-gold!"
            >
              Mira una rifa en vivo
            </a>
          </div>
          <p className="mt-4 text-sm text-gray">Entra con tu cuenta de Google y empieza en un par de pasos.</p>
        </div>

        <Ticket />
      </div>
    </section>
  );
}
