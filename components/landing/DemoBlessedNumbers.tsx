import { DEMO_RAFFLE } from "@/lib/demo/demo-data";

/**
 * Static, fictional counterpart of BlessedNumbers for the marketing demo: no
 * snapshot query and no realtime subscription, so it can never touch tenant
 * data.
 */
export default function DemoBlessedNumbers() {
  const { blessedNumbers, soldBlessedNumbers, blessedPrize } = DEMO_RAFFLE;
  const sold = new Set<string>(soldBlessedNumbers);

  return (
    <div className="px-6 py-20 sm:px-10 text-center bg-charcoal-soft">
      <h2 className="font-display text-[40px] text-gold tracking-wide">NÚMEROS BENDECIDOS</h2>
      <p className="max-w-[560px] mx-auto mt-4 mb-11 text-gray text-base leading-relaxed">
        Si alguno de tus números coincide con uno de estos, ganas{" "}
        <strong className="text-cream">{blessedPrize} extra</strong>, además de tu chance en el sorteo principal.
      </p>
      <div className="flex flex-wrap gap-3.5 justify-center max-w-[900px] mx-auto">
        {blessedNumbers.map((numero) => {
          const isTaken = sold.has(numero);
          return (
            <div
              key={numero}
              title={isTaken ? "Ya fue vendido" : undefined}
              className={
                isTaken
                  ? "font-display text-2xl tracking-[2px] text-gray px-5 py-3.5 rounded"
                  : "animate-shine font-display text-2xl tracking-[2px] text-charcoal px-5 py-3.5 rounded shadow-[0_4px_14px_oklch(0.80_0.14_85_/_0.25)]"
              }
              style={
                isTaken
                  ? { backgroundColor: "oklch(0.32 0.008 40)" }
                  : {
                      backgroundColor: "oklch(0.85 0.13 85)",
                      backgroundImage:
                        "linear-gradient(135deg, oklch(0.85 0.13 85) 0%, oklch(0.85 0.13 85) 45%, oklch(0.98 0.06 95) 50%, oklch(0.85 0.13 85) 55%, oklch(0.85 0.13 85) 100%)",
                    }
              }
            >
              {numero}
            </div>
          );
        })}
      </div>
    </div>
  );
}
