"use client";

import { useActionState, useState } from "react";
import { submitReservation, type ReservationState } from "@/app/actions";
import { MAX_CUSTOM_QTY, MIN_CUSTOM_QTY, PAQUETES, PRICE_PER_NUMBER, type Paquete, type PaqueteTipo } from "@/lib/constants";
import PackageCard from "@/components/rifa/PackageCard";
import CustomQtyPicker from "@/components/rifa/CustomQtyPicker";
import ReservationForm from "@/components/rifa/ReservationForm";

interface Selection {
  qty: number;
  price: number;
  tipo: PaqueteTipo;
}

const initialState: ReservationState = { status: "idle" };

export default function RifaFlow() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [customQty, setCustomQty] = useState(MIN_CUSTOM_QTY);
  const [state, formAction, isPending] = useActionState(submitReservation, initialState);

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
    if (Number.isNaN(value)) return;
    setCustomQty(Math.min(MAX_CUSTOM_QTY, Math.max(MIN_CUSTOM_QTY, value)));
  }

  return (
    <>
      <div id="paquetes" className="px-6 py-20 sm:px-10 bg-charcoal">
        <div className="text-center mb-12">
          <h2 className="font-display text-[40px] tracking-wide">ELIGE TU PAQUETE</h2>
          <p className="text-gray mt-2.5">Más números, más chances de ganar.</p>
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
          />
        </div>
      )}
    </>
  );
}
