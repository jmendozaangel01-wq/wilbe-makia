"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ReservasTab from "./ReservasTab";
import NumerosTab from "./NumerosTab";

export type ReservaEstado = "pendiente_pago" | "en_verificacion" | "confirmado" | "expirado" | "rechazado";

export interface Reserva {
  id: string;
  nombre: string;
  apellido: string;
  correo: string;
  whatsapp: string;
  direccion: string;
  ciudad: string;
  paquete_tipo: string;
  numeros_asignados: number[];
  comprobante_url: string | null;
  estado: ReservaEstado;
  creado_en: string;
  expira_en: string;
}

export interface NumeroCounts {
  disponibles: number;
  reservados: number;
  vendidos: number;
}

type Tab = "reservas" | "numeros";

interface AdminDashboardProps {
  initialReservas: Reserva[];
  initialCounts: NumeroCounts;
}

export default function AdminDashboard({ initialReservas, initialCounts }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>("reservas");
  const [reservas, setReservas] = useState<Reserva[]>(initialReservas);
  const [selectedReservaId, setSelectedReservaId] = useState<string | null>(null);
  const [changeTick, setChangeTick] = useState(0);

  const refetchReservas = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from("reservas").select("*").order("creado_en", { ascending: false });

    if (error) {
      console.error("[admin] refetch reservas failed", error.message);
      return;
    }

    setReservas((data as Reserva[]) ?? []);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // Realtime enforces RLS using the token passed to realtime.setAuth(), which
    // createBrowserClient only sets once the session resolves — subscribing
    // before that races ahead and joins as anon, so postgres_changes events
    // get silently dropped by the authenticated-only read policy (no error,
    // the channel just never fires). Wait for the session first.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel("admin-reservas-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "reservas" }, () => {
          refetchReservas();
          setChangeTick((t) => t + 1);
        })
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [refetchReservas]);

  function goToReserva(id: string) {
    setSelectedReservaId(id);
    setActiveTab("reservas");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 32px",
          background: "oklch(0.15 0.014 40)",
          borderBottom: "3px solid oklch(0.80 0.14 85)",
        }}
      >
        <div className="font-display" style={{ fontSize: "20px", color: "white", letterSpacing: "1px" }}>
          WILBER <span style={{ color: "oklch(0.80 0.14 85)" }}>MAKIA</span>{" "}
          <span
            className="font-body"
            style={{
              fontWeight: 600,
              fontSize: "13px",
              color: "oklch(0.72 0.01 40)",
              letterSpacing: "2px",
              marginLeft: "8px",
            }}
          >
            PANEL ADMIN
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "4px",
          padding: "0 32px",
          background: "white",
          borderBottom: "1px solid oklch(0.90 0.005 40)",
        }}
      >
        <button
          onClick={() => setActiveTab("reservas")}
          style={{
            background: "none",
            border: "none",
            padding: "14px 6px",
            fontWeight: 700,
            fontSize: "14px",
            cursor: "pointer",
            color: activeTab === "reservas" ? "oklch(0.25 0.02 40)" : "oklch(0.55 0.01 40)",
            borderBottom: `2px solid ${activeTab === "reservas" ? "oklch(0.52 0.21 26)" : "transparent"}`,
          }}
        >
          Reservas
        </button>
        <button
          onClick={() => setActiveTab("numeros")}
          style={{
            background: "none",
            border: "none",
            padding: "14px 6px",
            fontWeight: 700,
            fontSize: "14px",
            cursor: "pointer",
            color: activeTab === "numeros" ? "oklch(0.25 0.02 40)" : "oklch(0.55 0.01 40)",
            borderBottom: `2px solid ${activeTab === "numeros" ? "oklch(0.52 0.21 26)" : "transparent"}`,
            marginLeft: "20px",
          }}
        >
          Números
        </button>
      </div>

      {activeTab === "reservas" ? (
        <ReservasTab
          reservas={reservas}
          selectedReservaId={selectedReservaId}
          onSelectReserva={setSelectedReservaId}
          onCloseDetail={() => setSelectedReservaId(null)}
          onChanged={refetchReservas}
        />
      ) : (
        <NumerosTab initialCounts={initialCounts} changeTick={changeTick} onViewReserva={goToReserva} />
      )}
    </div>
  );
}
