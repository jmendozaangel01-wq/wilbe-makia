"use client";

import { useActionState, useState } from "react";
import { submitReservation, type ReservationState } from "@/app/actions";
import { MIN_CUSTOM_QTY, PAQUETES, PRICE_PER_NUMBER, clampCustomQty, type Paquete, type PaqueteTipo } from "@/lib/constants";
import PackageCard from "@/components/rifa/PackageCard";
import CustomQtyPicker from "@/components/rifa/CustomQtyPicker";
import ReservationForm from "@/components/rifa/ReservationForm";
import DemoNotice from "@/components/rifa/DemoNotice";
import { pickReservationAction } from "@/lib/demo/simulate-reservation";

interface Selection {
  qty: number;
  price: number;
  tipo: PaqueteTipo;
}

const initialState: ReservationState = { status: "idle" };

interface RifaFlowProps {
  /**
   * Marketing-landing simulation: swaps the real server action for a local
   * fake, so nothing is saved, uploaded or emailed. Defaults to false, which
   * keeps tenant hosts on the real submitReservation.
   */
  demo?: boolean;
}

export default function RifaFlow({ demo = false }: RifaFlowProps) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [customQty, setCustomQty] = useState(MIN_CUSTOM_QTY);
  const [state, formAction, isPending] = useActionState(pickReservationAction(demo, submitReservation), initialState);

  function scrollToReserva() {
    document.getElementById("reserva")?.scrollIntoView({ behavior: "smooth" });
  }

  function selectPaquete(paquete: Paquete) {
    setSelection({ qty: paquete.qty, price: paquete.price, tipo: paquete.tipo });
    scrollToReserva();
  }

  function selectCustom() {
    setSelection({ qty: customQty, price: customQty * PRICE_PER_NUMBER, tipo: "custom" });
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
          {PAQUETES.map((paquete) => (
            <PackageCard key={paquete.tipo} paquete={paquete} onSelect={() => selectPaquete(paquete)} />
          ))}
        </div>

        <CustomQtyPicker qty={customQty} onQtyChange={handleCustomQtyChange} onSelect={selectCustom} />
      </div>

      {selection && (
        <div id="reserva" className="px-6 py-20 sm:px-10 bg-charcoal-soft border-t-2 border-gold/40">
          <ReservationForm
            selection={selection}
            state={state}
            formAction={formAction}
            isPending={isPending}
            demo={demo}
          />
        </div>
      )}
    </>
  );
}
