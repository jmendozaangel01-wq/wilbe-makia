"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BLESSED_NUMBERS, formatNumero } from "@/lib/constants";

interface BlessedNumberBroadcastPayload {
  numero: number;
  estado: "disponible" | "reservado" | "vendido";
  raffle_id: string | null;
  organization_id: string;
}

interface BlessedNumbersProps {
  /**
   * Server-resolved initial snapshot (design D8) -- the padded numero_display
   * strings that are already "vendido" at render time. Fetched by the parent
   * Server Component (app/page.tsx), which already resolved the tenant from
   * Host per D6. This component no longer makes its own client-side anon
   * PostgREST read, so there's no client-controlled tenant filter to spoof.
   */
  initialTaken: string[];
  /**
   * Server-resolved tenant id (design D6), passed down as a prop -- never
   * re-derived or accepted from a query string or client override. Null when
   * upstream Host resolution failed; the component then renders the static
   * initial snapshot with no live subscription rather than guessing a
   * tenant's topic.
   */
  orgId: string | null;
}

export default function BlessedNumbers({ initialTaken, orgId }: BlessedNumbersProps) {
  const [taken, setTaken] = useState<Set<string>>(() => new Set(initialTaken));

  useEffect(() => {
    if (!orgId) return;

    const supabase = createClient();

    // Realtime Broadcast from Database (design D8, Round 2) -- replaces the
    // rejected db-pre-request GUC mechanism. Topic is scoped by the
    // server-resolved orgId prop above, never re-derived client-side.
    // Deliberately `.on("broadcast", ...)`, NOT `.on("postgres_changes", ...)`
    // -- see supabase/migrations/0013_blessed_numbers_broadcast.sql.
    const channel = supabase
      .channel(`org:${orgId}:blessed-numbers`)
      .on("broadcast", { event: "blessed_number_changed" }, ({ payload }) => {
        const row = payload as BlessedNumberBroadcastPayload;
        const numeroDisplay = formatNumero(row.numero);

        setTaken((prev) => {
          const next = new Set(prev);
          if (row.estado === "vendido") {
            next.add(numeroDisplay);
          } else {
            next.delete(numeroDisplay);
          }
          return next;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  return (
    <div className="px-6 py-20 sm:px-10 text-center bg-charcoal-soft">
      <h2 className="font-display text-[40px] text-gold tracking-wide">NÚMEROS BENDECIDOS</h2>
      <p className="max-w-[560px] mx-auto mt-4 mb-11 text-gray text-base leading-relaxed">
        Si alguno de tus números coincide con uno de estos, ganas{" "}
        <strong className="text-cream">$50.000 extra</strong>, además de tu chance en el sorteo
        principal.
      </p>
      <div className="flex flex-wrap gap-3.5 justify-center max-w-[900px] mx-auto">
        {BLESSED_NUMBERS.map((numero) => {
          const isTaken = taken.has(numero);
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
                      // solid base color so the pill never shows the dark page background
                      // through the gaps left by the oversized, animated shine gradient
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
