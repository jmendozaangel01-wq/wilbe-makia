const STEPS = [
  {
    title: "Crea tu rifa",
    body: "Regístrate con tu correo o con Google y llena dos pasos: el nombre de tu organización con su enlace, y los datos de tu rifa (precio, fecha del sorteo y tu Nequi).",
  },
  {
    title: "Comparte tu enlace",
    body: "Tu rifa vive en tu propia dirección, nombre.benditarifa.com. Pégala en tus estados, grupos y redes.",
  },
  {
    title: "Tus compradores reservan",
    body: "Eligen cuántos números quieren, pagan por Nequi y suben la foto del comprobante desde el celular.",
  },
  {
    title: "Tú confirmas el pago",
    body: "Revisas el comprobante en tu panel y confirmas. Al instante, el comprador recibe sus números por correo.",
  },
];

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-16 border-t border-border bg-charcoal-soft">
      <div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 lg:py-28">
        <h2 className="max-w-[16ch] font-display text-[clamp(34px,5.4vw,58px)] leading-[1] tracking-wide">
          DE CERO A RIFA ACTIVA EN CUATRO PASOS
        </h2>

        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="relative flex flex-col rounded-md bg-charcoal-card p-6 lg:rounded-none lg:first:rounded-l-md lg:last:rounded-r-md"
            >
              {/* Tear-off edge between stubs (desktop only) */}
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-4 left-0 hidden border-l-2 border-dashed border-border lg:block"
                />
              )}
              <span className="font-display text-[64px] leading-none text-red" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="mt-4 font-display text-[24px] leading-tight tracking-wide text-cream">
                {step.title.toUpperCase()}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-gray">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
