"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BLESSED_NUMBERS, formatNumero } from "@/lib/constants";
import type { NumeroCounts } from "./AdminDashboard";

type NumeroEstado = "disponible" | "reservado" | "vendido";

interface NumeroRow {
  numero: number;
  estado: NumeroEstado;
  es_bendecido: boolean;
  reserva_id: string | null;
}

interface NumeroWithOwner extends NumeroRow {
  reservas: { nombre: string; apellido: string; correo: string } | null;
}

const STATE_STYLE: Record<NumeroEstado, { label: string; bg: string; color: string; cellBg: string }> = {
  disponible: { label: "Disponible", bg: "oklch(0.94 0.004 40)", color: "oklch(0.45 0.01 40)", cellBg: "oklch(0.94 0.004 40)" },
  reservado: { label: "Reservado", bg: "oklch(0.93 0.10 85)", color: "oklch(0.45 0.10 70)", cellBg: "oklch(0.80 0.14 85)" },
  vendido: { label: "Vendido", bg: "oklch(0.92 0.10 26)", color: "oklch(0.45 0.15 26)", cellBg: "oklch(0.52 0.21 26)" },
};

const RANGE_OPTIONS = Array.from({ length: 100 }, (_, i) => ({
  value: i,
  label: `${formatNumero(i * 1000)}–${formatNumero(i * 1000 + 999)}`,
}));

interface NumerosTabProps {
  initialCounts: NumeroCounts;
  changeTick: number;
  onViewReserva: (id: string) => void;
}

export default function NumerosTab({ initialCounts, changeTick, onViewReserva }: NumerosTabProps) {
  const [counts, setCounts] = useState<NumeroCounts>(initialCounts);
  const [rangeIndex, setRangeIndex] = useState(0);
  const [gridRows, setGridRows] = useState<NumeroRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<NumeroWithOwner | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [modalInfo, setModalInfo] = useState<NumeroWithOwner | null>(null);
  const [blessedRows, setBlessedRows] = useState<NumeroRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("numeros")
      .select("numero, estado, es_bendecido, reserva_id")
      .in("numero", BLESSED_NUMBERS.map(Number))
      .order("numero")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[admin] failed to load blessed numeros", { error: error.message });
          return;
        }
        setBlessedRows((data as NumeroRow[]) ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [changeTick]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function loadCounts() {
      const [disponibles, reservados, vendidos] = await Promise.all([
        supabase.from("numeros").select("*", { count: "exact", head: true }).eq("estado", "disponible"),
        supabase.from("numeros").select("*", { count: "exact", head: true }).eq("estado", "reservado"),
        supabase.from("numeros").select("*", { count: "exact", head: true }).eq("estado", "vendido"),
      ]);
      if (cancelled) return;
      setCounts({
        disponibles: disponibles.count ?? 0,
        reservados: reservados.count ?? 0,
        vendidos: vendidos.count ?? 0,
      });
    }

    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [changeTick]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const start = rangeIndex * 1000;
    const end = start + 999;

    supabase
      .from("numeros")
      .select("numero, estado, es_bendecido, reserva_id")
      .gte("numero", start)
      .lte("numero", end)
      .order("numero")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[admin] failed to load numeros range", { rangeIndex, error: error.message });
          return;
        }
        setGridRows((data as NumeroRow[]) ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [rangeIndex, changeTick]);

  useEffect(() => {
    if (searchQuery.length !== 5) {
      setSearchResult(null);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    const supabase = createClient();

    supabase
      .from("numeros")
      .select("numero, estado, es_bendecido, reserva_id, reservas(nombre, apellido, correo)")
      .eq("numero", Number(searchQuery))
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        setSearchLoading(false);
        if (error) {
          console.error("[admin] search numero failed", { searchQuery, error: error.message });
          return;
        }
        setSearchResult(data as unknown as NumeroWithOwner | null);
      });

    return () => {
      cancelled = true;
    };
  }, [searchQuery, changeTick]);

  async function openModal(numero: number) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("numeros")
      .select("numero, estado, es_bendecido, reserva_id, reservas(nombre, apellido, correo)")
      .eq("numero", numero)
      .maybeSingle();

    if (error) {
      console.error("[admin] load numero detail failed", { numero, error: error.message });
      return;
    }

    setModalInfo(data as unknown as NumeroWithOwner);
  }

  const legend = useMemo(
    () => [
      { label: "Disponible", color: STATE_STYLE.disponible.cellBg },
      { label: "Reservado", color: STATE_STYLE.reservado.cellBg },
      { label: "Vendido", color: STATE_STYLE.vendido.cellBg },
    ],
    []
  );

  return (
    <div className="px-4 sm:px-8" style={{ flex: 1, overflow: "auto", paddingTop: "28px", paddingBottom: "60px" }}>
      <div style={{ maxWidth: "640px", margin: "0 auto 28px" }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value.replace(/\D/g, "").slice(0, 5))}
          placeholder="Buscar número (ej. 48213)"
          maxLength={5}
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontFamily: "monospace",
            fontSize: "20px",
            letterSpacing: "2px",
            padding: "16px 20px",
            border: "1.5px solid oklch(0.85 0.005 40)",
            borderRadius: "8px",
          }}
        />
        {searchQuery.length === 5 && !searchLoading && searchResult && (
          <SearchResultCard result={searchResult} onViewReserva={onViewReserva} />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: "16px", maxWidth: "820px", margin: "0 auto 32px" }}>
        <Counter value={counts.disponibles} label="Disponibles" color="oklch(0.40 0.01 40)" />
        <Counter value={counts.reservados} label="Reservados" color="oklch(0.60 0.13 75)" />
        <Counter value={counts.vendidos} label="Vendidos" color="oklch(0.52 0.21 26)" />
      </div>

      <div style={{ maxWidth: "820px", margin: "0 auto 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <span style={{ color: "oklch(0.70 0.14 80)" }}>★</span>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "oklch(0.40 0.01 40)" }}>
            Números bendecidos ({blessedRows.filter((r) => r.estado !== "disponible").length}/{blessedRows.length} tomados)
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: "10px",
            background: "white",
            border: "1px solid oklch(0.90 0.005 40)",
            borderRadius: "8px",
            padding: "16px",
          }}
        >
          {blessedRows.map((row) => (
            <div
              key={row.numero}
              onClick={() => openModal(row.numero)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid oklch(0.90 0.005 40)",
                cursor: "pointer",
              }}
            >
              <span style={{ fontFamily: "monospace", fontSize: "14px", fontWeight: 700 }}>{formatNumero(row.numero)}</span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: "20px",
                  background: STATE_STYLE[row.estado].bg,
                  color: STATE_STYLE[row.estado].color,
                }}
              >
                {STATE_STYLE[row.estado].label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: "820px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "oklch(0.40 0.01 40)" }}>Rango:</div>
          <select
            value={rangeIndex}
            onChange={(e) => setRangeIndex(Number(e.target.value))}
            style={{ fontFamily: "monospace", fontSize: "14px", padding: "8px 12px", border: "1px solid oklch(0.85 0.005 40)", borderRadius: "6px" }}
          >
            {RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto", fontSize: "12px", color: "oklch(0.55 0.01 40)" }}>
            {legend.map((item) => (
              <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "10px", height: "10px", background: item.color, display: "inline-block", borderRadius: "2px" }} />
                {item.label}
              </span>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(40,1fr)",
              gap: "3px",
              background: "white",
              border: "1px solid oklch(0.90 0.005 40)",
              borderRadius: "8px",
              padding: "14px",
              minWidth: "700px",
            }}
          >
            {gridRows.map((cell) => (
              <div
                key={cell.numero}
                onClick={() => openModal(cell.numero)}
                title={formatNumero(cell.numero)}
                style={{ position: "relative", aspectRatio: "1", background: STATE_STYLE[cell.estado].cellBg, borderRadius: "2px", cursor: "pointer" }}
              >
                {cell.es_bendecido && (
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "8px",
                      lineHeight: 1,
                      color: "oklch(0.35 0.15 90)",
                    }}
                  >
                    ★
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {modalInfo && (
        <div
          onClick={() => setModalInfo(null)}
          style={{ position: "fixed", inset: 0, background: "oklch(0.15 0.014 40 / 0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "white", borderRadius: "10px", padding: "26px 30px", width: "340px", maxWidth: "calc(100vw - 32px)", boxShadow: "0 20px 50px oklch(0 0 0 / 0.3)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <div style={{ fontFamily: "monospace", fontSize: "22px", fontWeight: 800 }}>{formatNumero(modalInfo.numero)}</div>
              {modalInfo.es_bendecido && <span title="Número bendecido" style={{ color: "oklch(0.70 0.14 80)" }}>★</span>}
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  padding: "5px 12px",
                  borderRadius: "20px",
                  background: STATE_STYLE[modalInfo.estado].bg,
                  color: STATE_STYLE[modalInfo.estado].color,
                }}
              >
                {STATE_STYLE[modalInfo.estado].label}
              </span>
            </div>
            {modalInfo.reservas && (
              <>
                <div style={{ fontWeight: 700, fontSize: "15px" }}>
                  {modalInfo.reservas.nombre} {modalInfo.reservas.apellido}
                </div>
                <div style={{ fontSize: "13px", color: "oklch(0.50 0.01 40)", marginTop: "2px" }}>{modalInfo.reservas.correo}</div>
                <button
                  onClick={() => {
                    if (modalInfo.reserva_id) onViewReserva(modalInfo.reserva_id);
                    setModalInfo(null);
                  }}
                  style={{ background: "none", border: "none", color: "oklch(0.50 0.19 26)", fontWeight: 700, fontSize: "13px", cursor: "pointer", padding: 0, marginTop: "10px" }}
                >
                  Ver reserva completa →
                </button>
              </>
            )}
            <button
              onClick={() => setModalInfo(null)}
              style={{ marginTop: "18px", width: "100%", background: "oklch(0.94 0.004 40)", border: "none", color: "oklch(0.35 0.01 40)", fontWeight: 700, fontSize: "13px", padding: "10px", borderRadius: "6px", cursor: "pointer" }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Counter({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ background: "white", border: "1px solid oklch(0.90 0.005 40)", borderRadius: "10px", padding: "20px", textAlign: "center" }}>
      <div style={{ fontSize: "36px", fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: "12px", letterSpacing: "0.5px", textTransform: "uppercase", color: "oklch(0.55 0.01 40)", marginTop: "4px" }}>{label}</div>
    </div>
  );
}

function SearchResultCard({ result, onViewReserva }: { result: NumeroWithOwner; onViewReserva: (id: string) => void }) {
  const style = STATE_STYLE[result.estado];
  return (
    <div
      style={{
        marginTop: "12px",
        background: "white",
        border: "1px solid oklch(0.90 0.005 40)",
        borderRadius: "8px",
        padding: "18px 22px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <div style={{ fontFamily: "monospace", fontSize: "20px", fontWeight: 800 }}>{formatNumero(result.numero)}</div>
        {result.es_bendecido && <span title="Número bendecido" style={{ color: "oklch(0.70 0.14 80)" }}>★</span>}
        <span style={{ fontSize: "12px", fontWeight: 700, padding: "5px 12px", borderRadius: "20px", background: style.bg, color: style.color }}>
          {style.label}
        </span>
      </div>
      {result.reservas && (
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: "14px" }}>
            {result.reservas.nombre} {result.reservas.apellido}
          </div>
          <div style={{ fontSize: "12px", color: "oklch(0.50 0.01 40)" }}>{result.reservas.correo}</div>
          <button
            onClick={() => result.reserva_id && onViewReserva(result.reserva_id)}
            style={{ background: "none", border: "none", color: "oklch(0.50 0.19 26)", fontWeight: 700, fontSize: "12px", cursor: "pointer", padding: 0, marginTop: "4px" }}
          >
            Ver reserva completa →
          </button>
        </div>
      )}
    </div>
  );
}
