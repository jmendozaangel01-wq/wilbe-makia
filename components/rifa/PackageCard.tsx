import type { Paquete } from "@/lib/constants";

interface PackageCardProps {
  paquete: Paquete;
  onSelect: () => void;
}

export default function PackageCard({ paquete, onSelect }: PackageCardProps) {
  return (
    <div
      className={`relative bg-charcoal-card-alt rounded-lg px-7 py-9 flex flex-col items-center gap-3.5 text-center border-[1.5px] ${
        paquete.popular ? "border-gold" : "border-border"
      }`}
    >
      {paquete.popular && (
        <div className="absolute -top-[13px] bg-gold text-charcoal text-[11px] font-extrabold tracking-wide px-3.5 py-1.5 rounded-full uppercase">
          Más elegido
        </div>
      )}
      <div className="font-display text-5xl text-gold">{paquete.qty}</div>
      <div className="text-[13px] tracking-[2px] text-gray uppercase">números</div>
      <div className="font-display text-3xl mt-2">${paquete.priceLabel}</div>
      <button
        type="button"
        onClick={onSelect}
        className="mt-3.5 w-full bg-red text-white border-none font-extrabold text-[15px] py-3.5 rounded cursor-pointer hover:brightness-110 transition"
      >
        Elegir este paquete
      </button>
    </div>
  );
}
