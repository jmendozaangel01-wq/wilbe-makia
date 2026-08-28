import { MAX_CUSTOM_QTY, MIN_CUSTOM_QTY, PRICE_PER_NUMBER, formatCOP } from "@/lib/constants";

interface CustomQtyPickerProps {
  qty: number;
  onQtyChange: (qty: number) => void;
  onSelect: () => void;
}

export default function CustomQtyPicker({ qty, onQtyChange, onSelect }: CustomQtyPickerProps) {
  const price = qty * PRICE_PER_NUMBER;

  return (
    <div className="max-w-[1000px] mx-auto bg-charcoal-card border border-dashed border-gold/50 rounded-lg px-7 py-6 flex items-center gap-6 flex-wrap">
      <div className="flex-1 min-w-[220px]">
        <div className="font-extrabold text-base text-cream">Elige tú mismo la cantidad</div>
        <div className="text-[13px] text-gray mt-1">
          Mínimo {MIN_CUSTOM_QTY}, máximo {MAX_CUSTOM_QTY} números · ${PRICE_PER_NUMBER} c/u
        </div>
      </div>

      <input
        type="number"
        min={MIN_CUSTOM_QTY}
        max={MAX_CUSTOM_QTY}
        value={qty}
        onChange={(e) => onQtyChange(Number(e.target.value))}
        onBlur={(e) => {
          const clamped = Math.min(MAX_CUSTOM_QTY, Math.max(MIN_CUSTOM_QTY, Number(e.target.value) || MIN_CUSTOM_QTY));
          onQtyChange(clamped);
        }}
        className="w-[100px] bg-charcoal border border-border text-white text-base p-2.5 rounded text-center"
      />

      <div className="font-display text-[22px] text-gold min-w-[110px] text-center">
        ${formatCOP(price)}
      </div>

      <button
        type="button"
        onClick={onSelect}
        className="bg-gold text-charcoal border-none font-extrabold text-sm px-5 py-3 rounded cursor-pointer hover:brightness-110 transition"
      >
        Elegir esta cantidad
      </button>
    </div>
  );
}
