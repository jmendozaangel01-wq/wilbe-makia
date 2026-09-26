import { DEMO_RAFFLE } from "@/lib/demo/demo-data";

/**
 * Hero of the marketing page's demo raffle. Purely static and fictional: no
 * tenant data, no real prize photo, no Supabase.
 */
export default function DemoHero() {
  const { organizerName, prizeName, drawDate, pricePerNumber, soldPercent } = DEMO_RAFFLE;

  return (
    <div className="relative bg-charcoal px-6 py-16 sm:px-10 flex flex-col items-center gap-9">
      <div className="max-w-[640px] flex flex-col items-center gap-[18px] text-center">
        <div className="text-xs tracking-[2px] text-gray uppercase font-bold">{organizerName}</div>

        <div className="inline-flex items-center gap-2 text-gold font-bold text-[13px] tracking-[2px] uppercase">
          <span className="w-2 h-2 rounded-full bg-red inline-block animate-pulse-dot" />
          Rifa de ejemplo
        </div>

        <h2 className="font-display text-[42px] sm:text-[64px] leading-[0.95] tracking-[0.5px]">
          GÁNATE UNA <span className="text-red">MOTO</span> <span className="whitespace-nowrap">0 KM</span>
          <span className="block mt-2 text-[22px] sm:text-[28px] tracking-[2px] text-gray">({prizeName.toUpperCase()})</span>
        </h2>

        <div className="flex items-center gap-7 flex-wrap justify-center mt-1.5">
          <div>
            <div className="text-xs tracking-[1.5px] text-gray uppercase">Sorteo</div>
            <div className="font-display text-[22px] text-gold">{drawDate}</div>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <div className="text-xs tracking-[1.5px] text-gray uppercase">Precio por número</div>
            <div className="font-display text-[22px] text-gold">${pricePerNumber}</div>
          </div>
        </div>

        <div className="w-full max-w-[360px]">
          <div className="flex justify-between text-xs tracking-[1.5px] text-gray uppercase">
            <span>Números vendidos</span>
            <span className="text-gold font-bold">{soldPercent}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={soldPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Números vendidos"
            className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-border"
          >
            <div className="h-full rounded-full bg-gold" style={{ width: `${soldPercent}%` }} />
          </div>
        </div>

        <a
          href="#paquetes"
          className="mt-2.5 inline-flex items-center justify-center bg-red text-white font-extrabold text-base px-8 py-4 rounded-sm w-fit shadow-[0_8px_24px_oklch(0.52_0.21_26_/_0.4)] hover:brightness-110 transition"
        >
          Comprar números
        </a>
      </div>

      <div
        role="img"
        aria-label="Ilustración genérica de un premio de ejemplo"
        className="flex-none w-[680px] max-w-[90vw] h-[260px] sm:h-[340px] border-2 border-dashed border-gold/60 rounded-[10px] overflow-hidden relative bg-charcoal-card flex flex-col items-center justify-center gap-3"
      >
        <svg viewBox="0 0 120 60" className="h-28 w-56 text-gold/70" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="24" cy="42" r="12" />
          <circle cx="96" cy="42" r="12" />
          <path d="M24 42 L44 20 H66 L78 32 H96" />
          <path d="M44 20 L38 12 H30" />
          <path d="M66 20 L84 14" />
        </svg>
        <div className="text-xs tracking-[2px] text-gray uppercase font-bold">Imagen de ejemplo</div>
      </div>
    </div>
  );
}
