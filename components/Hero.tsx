import Image from "next/image";
import { PRICE_PER_NUMBER, SORTEO_FECHA } from "@/lib/constants";

export default function Hero() {
  return (
    <div className="relative bg-charcoal px-6 py-16 sm:px-10 flex flex-col items-center gap-9">
      <div className="max-w-[640px] flex flex-col items-center gap-[18px] text-center">
        <div className="inline-flex items-center gap-2 text-gold font-bold text-[13px] tracking-[2px] uppercase">
          <span className="w-2 h-2 rounded-full bg-red inline-block animate-pulse-dot" />
          Rifa en vivo
        </div>

        <h1 className="font-display text-[42px] sm:text-[64px] leading-[0.95] tracking-[0.5px]">
          GÁNATE UNA <span className="text-red">XTZ 660</span> 0-KM
        </h1>

        <div className="flex items-center gap-7 flex-wrap justify-center mt-1.5">
          <div>
            <div className="text-xs tracking-[1.5px] text-gray uppercase">Sorteo</div>
            <div className="font-display text-[22px] text-gold">{SORTEO_FECHA}</div>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <div className="text-xs tracking-[1.5px] text-gray uppercase">Precio por número</div>
            <div className="font-display text-[22px] text-gold">${PRICE_PER_NUMBER}</div>
          </div>
        </div>

        <a
          href="#paquetes"
          className="mt-2.5 inline-flex items-center justify-center bg-red text-white font-extrabold text-base px-8 py-4 rounded-sm w-fit shadow-[0_8px_24px_oklch(0.52_0.21_26_/_0.4)] hover:brightness-110 transition"
        >
          Comprar números
        </a>
      </div>

      <div className="flex-none w-[680px] max-w-[90vw] h-[420px] sm:h-[600px] md:h-[760px] border-2 border-gold rounded-[10px] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative">
        <Image
          src="/moto-hero.jpg"
          alt="Moto que se está rifando"
          fill
          priority
          sizes="(max-width: 768px) 90vw, 680px"
          className="object-cover object-[center_30%]"
        />
        <div className="absolute inset-0 shadow-[inset_0_0_60px_oklch(0.15_0.014_40_/_0.35)]" />
      </div>
    </div>
  );
}
