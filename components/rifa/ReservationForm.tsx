"use client";

import { useRef, useState } from "react";
import { NEQUI_NOMBRE, NEQUI_NUMERO, formatCOP, type PaqueteTipo } from "@/lib/constants";
import type { ReservationState } from "@/app/actions";

interface ReservationFormProps {
  selection: { qty: number; price: number; tipo: PaqueteTipo };
  state: ReservationState;
  formAction: (formData: FormData) => void;
  isPending: boolean;
}

const inputClass =
  "w-full bg-charcoal border border-border text-white text-[15px] px-4 py-3 rounded placeholder:text-gray focus:outline-none focus:border-gold transition";

export default function ReservationForm({ selection, state, formAction, isPending }: ReservationFormProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (state.status === "success") {
    return (
      <div className="max-w-[480px] mx-auto text-center py-10">
        <div className="w-[70px] h-[70px] rounded-full bg-gold flex items-center justify-center mx-auto mb-6 text-[32px] text-charcoal">
          ✓
        </div>
        <h3 className="font-display text-[30px] text-gold">PAGO EN VERIFICACIÓN</h3>
        <p className="text-gray mt-3.5 leading-relaxed">
          Tu comprobante fue recibido. Estamos verificando tu pago y te avisaremos por correo
          cuando tus {state.cantidad} números queden confirmados.
        </p>
      </div>
    );
  }

  function pickFile(file: File | null) {
    setFileName(file ? file.name : null);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && fileInputRef.current) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInputRef.current.files = dataTransfer.files;
      pickFile(file);
    }
  }

  return (
    <div className="max-w-[640px] mx-auto">
      <div className="bg-charcoal-card-alt border-[1.5px] border-gold rounded-lg px-7 py-[22px] text-center mb-9">
        <div className="text-[13px] tracking-[1.5px] text-gray uppercase">Reserva en curso</div>
        <div className="font-display text-[32px] text-gold mt-1.5">
          Tienes {selection.qty} números reservados
        </div>
        <div className="text-[13px] text-gray mt-1.5">
          Te los revelamos al confirmar tu pago
        </div>
      </div>

      <form
        key={`${selection.tipo}-${selection.qty}`}
        action={formAction}
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="paqueteTipo" defaultValue={selection.tipo} />
        <input type="hidden" name="cantidad" defaultValue={selection.qty} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input required name="nombre" placeholder="Nombre" className={inputClass} />
          <input required name="apellido" placeholder="Apellido" className={inputClass} />
        </div>
        <input required type="email" name="correo" placeholder="Correo electrónico" className={inputClass} />
        <input required name="whatsapp" placeholder="WhatsApp" className={inputClass} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input required name="direccion" placeholder="Dirección" className={inputClass} />
          <input required name="ciudad" placeholder="Ciudad" className={inputClass} />
        </div>

        <div className="mt-5 bg-charcoal-card-alt rounded-lg p-6 flex gap-6 items-center flex-wrap">
          <div
            className="w-[130px] h-[130px] flex-none border border-dashed border-gold/60 rounded flex items-center justify-center text-center font-mono text-[11px] text-gray"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, oklch(0.24 0.018 40) 0 8px, oklch(0.20 0.016 40) 8px 16px)",
            }}
          >
            [ QR NEQUI ]
          </div>
          <div>
            <div className="font-extrabold text-[15px]">Paga por Nequi</div>
            <div className="text-gray text-sm mt-1">
              Número: <strong className="text-cream tracking-wide">{NEQUI_NUMERO}</strong>
            </div>
            <div className="text-gray text-sm">A nombre de: {NEQUI_NOMBRE}</div>
            <div className="text-gold text-[13px] mt-1.5">
              Monto a pagar: ${formatCOP(selection.price)}
            </div>
          </div>
        </div>

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`mt-2 border-2 border-dashed rounded-lg p-7 text-center cursor-pointer bg-charcoal-card transition ${
            dragActive ? "border-gold" : "border-gold/60"
          }`}
        >
          <input
            ref={fileInputRef}
            required
            type="file"
            name="comprobante"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {fileName ? (
            <div className="text-gold font-bold">📎 {fileName}</div>
          ) : (
            <div className="text-gray">
              Arrastra tu comprobante aquí o haz clic para subir una imagen
            </div>
          )}
        </div>

        {state.status === "error" && (
          <div className="text-red text-sm text-center -mt-1">{state.error}</div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="mt-3 bg-red text-white border-none font-extrabold text-base py-[18px] rounded cursor-pointer hover:brightness-110 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? "Enviando..." : "Enviar comprobante"}
        </button>
      </form>
    </div>
  );
}
