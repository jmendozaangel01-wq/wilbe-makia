"use client";

import { useActionState, useState } from "react";
import { submitReservation, type ReservationState } from "@/app/actions";
import { MIN_CUSTOM_QTY, clampCustomQty, type Paquete, type PaqueteTipo } from "@/lib/constants";
import PackageCard from "@/components/rifa/PackageCard";
import CustomQtyPicker from "@/components/rifa/CustomQtyPicker";
import ReservationForm from "@/components/rifa/ReservationForm";
import DemoNotice from "@/components/rifa/DemoNotice";
import { pickReservationAction } from "@/lib/demo/simulate-reservation";
import { DEMO_RAFFLE } from "@/lib/demo/demo-data";

interface Selection {
  qty: number;
  price: number;
  tipo: PaqueteTipo;
}

const initialState: ReservationState = { status: "idle" };

/** The resolved tenant's own raffle data (product/tenant-admin-raffle-config) -- what app/page.tsx fetches from `raffles` and passes down, replacing the old hardcoded lib/constants.ts values for real (non-demo) tenants. */
export interface TenantRaffleForFlow {
  paquetes: Paquete[];
  pricePerNumber: number;
  nequiNumero: string;
  nequiNombre: string;
  qrUrl: string | null;
}

interface RifaFlowProps {
  /**
   * Marketing-landing simulation: swaps the real server action for a local
   * fake, so nothing is saved, uploaded or emailed. Defaults to false, which
   * keeps tenant hosts on the real submitReservation.
   */
  demo?: boolean;
  /**
   * Real tenant raffle data, ignored entirely when demo=true (the demo path
   * stays 100% DEMO_RAFFLE, per PR #10's fictional-apex guarantee). Null when
   * Host resolution found no active raffle, OR present with an empty
   * `paquetes` array -- both render the "unavailable" state below rather
   * than falling back to lib/constants.ts's values (a real tenant's buyer
   * must never see the platform owner's own Nequi account/pricing; see the
   * risk+resilience review findings this batch fixes).
   */
  raffle?: TenantRaffleForFlow | null;
}

export default function RifaFlow({ demo = false, raffle = null }: RifaFlowProps) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [customQty, setCustomQty] = useState(MIN_CUSTOM_QTY);
  const [state, formAction, isPending] = useActionState(pickReservationAction(demo, submitReservation), initialState);

  if (!demo && (!raffle || raffle.paquetes.length === 0)) {
    return (
      <div id="paquetes" className="px-6 py-20 sm:px-10 bg-charcoal text-center">
        <h2 className="font-display text-[40px] tracking-wide">ELIGE TU PAQUETE</h2>
        <p className="text-gray mt-4">Esta rifa no está disponible en este momento.</p>
      </div>
    );
  }

  const paquetes = demo ? DEMO_RAFFLE.packages : raffle!.paquetes;
  const pricePerNumber = demo ? DEMO_RAFFLE.pricePerNumber : raffle!.pricePerNumber;
  const nequiNumero = demo ? undefined : raffle!.nequiNumero;
  const nequiNombre = demo ? undefined : raffle!.nequiNombre;
  const qrUrl = demo ? null : raffle!.qrUrl;

  function scrollToReserva() {
    document.getElementById("reserva")?.scrollIntoView({ behavior: "smooth" });
  }

  function selectPaquete(paquete: Paquete) {
    setSelection({ qty: paquete.qty, price: paquete.price, tipo: paquete.tipo });
    scrollToReserva();
  }

  function selectCustom() {
    setSelection({ qty: customQty, price: customQty * pricePerNumber, tipo: "custom" });
    scrollToReserva();
  }

  function handleCustomQtyChange(value: number) {
    // preserve existing bail-out-on-NaN behavior: don't touch state on invalid input
    if (Number.isNaN(value)) return;
    setCustomQty(clampCustomQty(value));
  }

  return (
    <>
      <div id="paquetes" className="px-6 py-20 sm:px-10 bg-charcoal">
        <div className="text-center mb-12">
          <h2 className="font-display text-[40px] tracking-wide">ELIGE TU PAQUETE</h2>
          <p className="text-gray mt-2.5">Más números, más chances de ganar.</p>
          {demo && <DemoNotice className="mt-5" />}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-[1000px] mx-auto mb-7">
          {paquetes.map((paquete) => (
            <PackageCard key={paquete.tipo} paquete={paquete} onSelect={() => selectPaquete(paquete)} />
          ))}
        </div>

        <CustomQtyPicker qty={customQty} onQtyChange={handleCustomQtyChange} onSelect={selectCustom} pricePerNumber={pricePerNumber} />
      </div>

      {selection && (
        <div id="reserva" className="px-6 py-20 sm:px-10 bg-charcoal-soft border-t-2 border-gold/40">
          <ReservationForm
            selection={selection}
            state={state}
            formAction={formAction}
            isPending={isPending}
            demo={demo}
            nequiNumero={nequiNumero}
            nequiNombre={nequiNombre}
            qrUrl={qrUrl}
          />
        </div>
      )}
    </>
  );
}
