"use client";

import { useEffect, useState, useTransition } from "react";
import { BLESSED_NUMBERS, PRICE_PER_NUMBER, formatCOP, formatNumero } from "@/lib/constants";
import { confirmarPago, editarNumero, getComprobanteUrl, reasignarNumeros, rechazarReserva } from "@/app/admin/actions";
import type { Reserva, ReservaEstado } from "./AdminDashboard";

const STATUS_META: Record<ReservaEstado, { label: string; bg: string; color: string }> = {
  pendiente_pago: { label: "Pendiente", bg: "oklch(0.92 0.005 40)", color: "oklch(0.40 0.01 40)" },
  en_verificacion: { label: "Verificando", bg: "oklch(0.93 0.10 85)", color: "oklch(0.45 0.10 70)" },
  confirmado: { label: "Confirmado", bg: "oklch(0.92 0.10 145)", color: "oklch(0.40 0.12 145)" },
  rechazado: { label: "Rechazado", bg: "oklch(0.92 0.10 26)", color: "oklch(0.45 0.15 26)" },
  expirado: { label: "Expirado", bg: "oklch(0.90 0.005 40)", color: "oklch(0.50 0.01 40)" },
};

interface ReservasTabProps {
  reservas: Reserva[];
  selectedReservaId: string | null;
  onSelectReserva: (id: string) => void;
  onCloseDetail: () => void;
  onChanged: () => Promise<void>;
}

export default function ReservasTab({
  reservas,
  selectedReservaId,
  onSelectReserva,
  onCloseDetail,
  onChanged,
}: ReservasTabProps) {
  const selected = reservas.find((r) => r.id === selectedReservaId) ?? null;

  if (!selected) {
    return (
      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
          <div style={{ fontSize: "20px", fontWeight: 800 }}>Reservas</div>
          <div style={{ fontSize: "13px", color: "oklch(0.50 0.01 40)" }}>{reservas.length} en total</div>
        </div>
        <div
          style={{
            background: "white",
            borderRadius: "8px",
            border: "1px solid oklch(0.90 0.005 40)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
              padding: "12px 20px",
              background: "oklch(0.94 0.004 40)",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              color: "oklch(0.45 0.01 40)",
            }}
          >
            <div>Cliente</div>
            <div>Paquete</div>
            <div>Hora</div>
            <div>Estado</div>
            <div></div>
          </div>
          {reservas.map((r) => {
            const meta = STATUS_META[r.estado];
            const hora = new Date(r.creado_en).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
            return (
              <div
                key={r.id}
                onClick={() => onSelectReserva(r.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
                  padding: "16px 20px",
                  borderTop: "1px solid oklch(0.92 0.005 40)",
                  cursor: "pointer",
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {r.nombre} {r.apellido}
                </div>
                <div style={{ color: "oklch(0.40 0.01 40)" }}>{r.numeros_asignados.length} números</div>
                <div style={{ color: "oklch(0.40 0.01 40)", fontSize: "13px" }}>{hora}</div>
                <div>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      padding: "5px 12px",
                      borderRadius: "20px",
                      background: meta.bg,
                      color: meta.color,
                    }}
                  >
                    {meta.label}
                  </span>
                </div>
                <div style={{ textAlign: "right", color: "oklch(0.60 0.01 40)" }}>›</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <ReservaDetail
      key={selected.id}
      reserva={selected}
      onCloseDetail={onCloseDetail}
      onChanged={onChanged}
    />
  );
}

interface ReservaDetailProps {
  reserva: Reserva;
  onCloseDetail: () => void;
  onChanged: () => Promise<void>;
}

function ReservaDetail({ reserva, onCloseDetail, onChanged }: ReservaDetailProps) {
  const meta = STATUS_META[reserva.estado];
  const qty = reserva.numeros_asignados.length;
  const price = qty * PRICE_PER_NUMBER;

  const [comprobanteUrl, setComprobanteUrl] = useState<string | null>(null);
  const [comprobanteError, setComprobanteError] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setComprobanteUrl(null);
    setComprobanteError(null);
    setEditingIndex(null);
    setActionError(null);

    if (!reserva.comprobante_url) return;

    let cancelled = false;
    getComprobanteUrl(reserva.comprobante_url).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setComprobanteUrl(result.url);
      } else {
        setComprobanteError(result.error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [reserva.id, reserva.comprobante_url]);

  const canEdit = reserva.estado === "pendiente_pago" || reserva.estado === "en_verificacion";
  const noComprobante = !reserva.comprobante_url;

  function saveSingle() {
    if (editingIndex === null) return;
    const numeroAnterior = reserva.numeros_asignados[editingIndex];
    const numeroNuevo = Number(editValue);

    if (!Number.isInteger(numeroNuevo) || numeroNuevo < 0 || numeroNuevo > 99999) {
      setActionError("Ingresa un número válido de 5 dígitos.");
      return;
    }

    setActionError(null);
    startTransition(async () => {
      const result = await editarNumero(reserva.id, numeroAnterior, numeroNuevo);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      setEditingIndex(null);
      await onChanged();
    });
  }

  function reassignAll() {
    setActionError(null);
    startTransition(async () => {
      const result = await reasignarNumeros(reserva.id);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      await onChanged();
    });
  }

  function reject() {
    setActionError(null);
    startTransition(async () => {
      const result = await rechazarReserva(reserva.id);
      if (!result.ok) {
        setActionError(result.error);
      }
      await onChanged();
    });
  }

  function confirm() {
    setActionError(null);
    startTransition(async () => {
      const result = await confirmarPago(reserva.id);
      if (!result.ok) {
        setActionError(result.error);
      }
      await onChanged();
    });
  }

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, overflow: "auto", padding: "28px 40px 100px", maxWidth: "920px", margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <button
          onClick={onCloseDetail}
          style={{
            background: "none",
            border: "none",
            color: "oklch(0.50 0.01 40)",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
            padding: 0,
            marginBottom: "20px",
          }}
        >
          ‹ Volver a reservas
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px", flexWrap: "wrap" }}>
          <div style={{ fontSize: "32px", fontWeight: 800 }}>
            {reserva.nombre} {reserva.apellido}
          </div>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 700,
              padding: "6px 14px",
              borderRadius: "20px",
              background: meta.bg,
              color: meta.color,
            }}
          >
            {meta.label}
          </span>
        </div>

        <div style={{ background: "white", border: "1px solid oklch(0.90 0.005 40)", borderRadius: "10px", padding: "24px 28px", marginBottom: "20px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: "oklch(0.50 0.01 40)", marginBottom: "16px" }}>
            Datos del cliente
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <Field label="Nombre completo" value={`${reserva.nombre} ${reserva.apellido}`} />
            <Field label="Correo" value={reserva.correo} />
            <Field label="WhatsApp" value={reserva.whatsapp} />
            <Field label="Dirección" value={reserva.direccion} />
            <Field label="Ciudad" value={reserva.ciudad} />
            <Field label="Paquete" value={`${qty} números — $${formatCOP(price)}`} />
          </div>
        </div>

        <div style={{ background: "white", border: "1px solid oklch(0.90 0.005 40)", borderRadius: "10px", padding: "24px 28px", marginBottom: "20px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: "oklch(0.50 0.01 40)", marginBottom: "16px" }}>
            Comprobante de pago
          </div>
          {noComprobante ? (
            <div
              style={{
                width: "100%",
                maxWidth: "420px",
                height: "120px",
                border: "1.5px dashed oklch(0.85 0.005 40)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "oklch(0.55 0.01 40)",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Esperando comprobante
            </div>
          ) : comprobanteError ? (
            <div style={{ color: "oklch(0.52 0.21 26)", fontSize: "13px" }}>{comprobanteError}</div>
          ) : comprobanteUrl ? (
            <a href={comprobanteUrl} target="_blank" rel="noreferrer">
              <img
                src={comprobanteUrl}
                alt="Comprobante de pago"
                style={{
                  width: "100%",
                  maxWidth: "420px",
                  maxHeight: "260px",
                  objectFit: "contain",
                  borderRadius: "8px",
                  border: "1px solid oklch(0.88 0.005 40)",
                  cursor: "zoom-in",
                }}
              />
            </a>
          ) : (
            <div style={{ fontSize: "13px", color: "oklch(0.55 0.01 40)" }}>Cargando comprobante…</div>
          )}
        </div>

        <div style={{ background: "white", border: "2px solid oklch(0.80 0.14 85)", borderRadius: "10px", padding: "24px 28px", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: "oklch(0.50 0.01 40)" }}>
              Números asignados
            </div>
            {canEdit && (
              <button
                onClick={reassignAll}
                disabled={isPending}
                style={{
                  background: "none",
                  border: "1px solid oklch(0.80 0.14 85)",
                  color: "oklch(0.45 0.10 70)",
                  fontWeight: 700,
                  fontSize: "12px",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  cursor: isPending ? "not-allowed" : "pointer",
                }}
              >
                ↻ Reasignar todos
              </button>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {reserva.numeros_asignados.map((n, i) => {
              const display = formatNumero(n);
              const blessed = BLESSED_NUMBERS.includes(display);
              return (
                <div
                  key={`${n}-${i}`}
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontFamily: "monospace",
                    fontSize: "16px",
                    fontWeight: 700,
                    background: blessed ? "oklch(0.97 0.05 85)" : "oklch(0.96 0.003 40)",
                    border: blessed ? "2px solid oklch(0.75 0.14 80)" : "1px solid oklch(0.88 0.005 40)",
                    color: "oklch(0.25 0.02 40)",
                    padding: "10px 12px 10px 14px",
                    borderRadius: "6px",
                  }}
                >
                  {blessed && <span title="Número bendecido">★</span>}
                  <span>{display}</span>
                  {canEdit && (
                    <button
                      onClick={() => {
                        setEditingIndex(i);
                        setEditValue(display);
                      }}
                      title="Editar"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(0.55 0.01 40)", fontSize: "13px", padding: 0 }}
                    >
                      ✎
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {editingIndex !== null && (
            <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "16px" }}>
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value.replace(/\D/g, "").slice(0, 5))}
                maxLength={5}
                style={{ fontFamily: "monospace", fontSize: "15px", border: "1px solid oklch(0.85 0.005 40)", borderRadius: "6px", padding: "8px 12px", width: "100px" }}
              />
              <button
                onClick={saveSingle}
                disabled={isPending}
                style={{ background: "oklch(0.52 0.21 26)", color: "white", border: "none", fontWeight: 700, fontSize: "13px", padding: "8px 16px", borderRadius: "6px", cursor: isPending ? "not-allowed" : "pointer" }}
              >
                Guardar
              </button>
              <button
                onClick={() => setEditingIndex(null)}
                style={{ background: "none", border: "none", color: "oklch(0.55 0.01 40)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        {actionError && <div style={{ color: "oklch(0.52 0.21 26)", fontSize: "13px", fontWeight: 600, marginBottom: "80px" }}>{actionError}</div>}
      </div>

      {canEdit && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "white",
            borderTop: "1px solid oklch(0.90 0.005 40)",
            padding: "16px 40px",
            display: "flex",
            justifyContent: "center",
            gap: "16px",
            boxShadow: "0 -4px 16px oklch(0 0 0 / 0.06)",
          }}
        >
          <button
            onClick={reject}
            disabled={isPending}
            style={{
              background: "white",
              border: "1.5px solid oklch(0.60 0.01 40)",
              color: "oklch(0.35 0.01 40)",
              fontWeight: 700,
              fontSize: "14px",
              padding: "14px 24px",
              borderRadius: "6px",
              cursor: isPending ? "not-allowed" : "pointer",
            }}
          >
            Rechazar / no válido
          </button>
          <button
            onClick={confirm}
            disabled={isPending || noComprobante}
            title={noComprobante ? "Falta el comprobante de pago" : ""}
            style={{
              background: noComprobante ? "oklch(0.75 0.02 40)" : "oklch(0.52 0.21 26)",
              color: "white",
              border: "none",
              fontWeight: 800,
              fontSize: "15px",
              padding: "14px 32px",
              borderRadius: "6px",
              cursor: isPending || noComprobante ? "not-allowed" : "pointer",
              minWidth: "280px",
            }}
          >
            Confirmar pago y enviar números
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "12px", color: "oklch(0.55 0.01 40)" }}>{label}</div>
      <div style={{ fontSize: "15px", fontWeight: 600, marginTop: "2px" }}>{value}</div>
    </div>
  );
}
