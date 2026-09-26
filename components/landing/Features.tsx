import type { ReactNode } from "react";

function Feature({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-md border border-border p-6 sm:p-8 ${className}`}>
      <h3 className="font-display text-[26px] leading-tight tracking-wide sm:text-[30px]">{title}</h3>
      <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-gray">{children}</p>
    </div>
  );
}

const BLESSED_SAMPLE = [
  { n: "07734", sold: true },
  { n: "12583", sold: false },
  { n: "29461", sold: true },
  { n: "33780", sold: false },
];

export default function Features() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 lg:py-28">
        <h2 className="max-w-[18ch] font-display text-[clamp(34px,5.4vw,58px)] leading-[1] tracking-wide">
          LO QUE NECESITAS PARA VENDER SIN DESORDEN
        </h2>

        <div className="mt-14 grid gap-5 lg:grid-cols-6">
          <Feature title="PAGOS POR NEQUI" className="bg-charcoal-card lg:col-span-4">
            Tus compradores pagan directo a tu Nequi, ven el código QR y el número al momento de reservar y
            adjuntan el comprobante. Sin pasarelas ni intermediarios de por medio.
          </Feature>

          <div className="flex flex-col justify-between rounded-md bg-red p-6 text-white sm:p-8 lg:col-span-2">
            <h3 className="font-display text-[26px] leading-tight tracking-wide sm:text-[30px]">TU PROPIO ENLACE</h3>
            <div className="mt-6 break-all rounded-sm bg-charcoal px-3 py-3 font-display text-[18px] tracking-wide text-gold">
              tu-rifa.benditarifa.com
            </div>
          </div>

          <Feature title="PANEL PARA CONFIRMAR" className="bg-charcoal-card-alt lg:col-span-3">
            Ves las reservas al momento, abres el comprobante, confirmas o rechazas el pago y, si hace falta,
            corriges o reasignas números.
          </Feature>

          <div className="rounded-md border border-gold/40 bg-charcoal-card p-6 sm:p-8 lg:col-span-3">
            <h3 className="font-display text-[26px] leading-tight tracking-wide sm:text-[30px]">
              NÚMEROS BENDECIDOS
            </h3>
            <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-gray">
              Elige los números con premio extra. Tu página muestra en vivo cuáles ya se vendieron.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="Ejemplo de números bendecidos">
              {BLESSED_SAMPLE.map(({ n, sold }) => (
                <li
                  key={n}
                  className={`rounded-sm px-3 py-1.5 font-display text-[18px] tracking-wider ${
                    sold ? "bg-border text-gray line-through" : "bg-gold text-charcoal"
                  }`}
                >
                  {n}
                  <span className="sr-only">{sold ? " vendido" : " disponible"}</span>
                </li>
              ))}
            </ul>
          </div>

          <Feature title="CORREOS AUTOMÁTICOS" className="lg:col-span-3">
            Tu comprador recibe un aviso cuando llega su comprobante, otro con sus números al confirmar el pago
            y otro si la reserva no procede.
          </Feature>

          <Feature title="NÚMEROS SIN REPETIRSE" className="lg:col-span-3">
            Cada número se asigna una sola vez, incluso cuando varias personas compran al mismo tiempo. Nadie
            se queda con el mismo boleto.
          </Feature>
        </div>
      </div>
    </section>
  );
}
