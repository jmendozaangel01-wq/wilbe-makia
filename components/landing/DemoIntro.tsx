export default function DemoIntro() {
  return (
    <section id="demo" className="scroll-mt-16 border-t-2 border-gold/50 bg-charcoal-soft">
      <div className="mx-auto max-w-[1180px] px-5 pb-4 pt-20 text-center sm:px-8 lg:pt-28">
        <h2 className="font-display text-[clamp(34px,5.4vw,58px)] leading-[1] tracking-wide">
          MIRA UNA RIFA EN VIVO
        </h2>
        <p className="mx-auto mt-5 max-w-[56ch] text-[17px] leading-relaxed text-gray">
          Esta es una rifa de ejemplo: así la ven tus compradores. Puedes recorrer todo el proceso de compra,
          pero es una simulación y no se guarda ninguna reserva.
        </p>
        <div className="mx-auto mt-7 inline-flex items-center gap-2.5 rounded-sm border border-dashed border-gold/60 px-4 py-2 text-sm font-semibold text-gold">
          <span className="h-2 w-2 rounded-full bg-red animate-pulse-dot" aria-hidden="true" />
          Ejemplo ficticio: rifa de una moto 0 km
        </div>
      </div>
    </section>
  );
}
