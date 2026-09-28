"use client";

import { useActionState, useRef, useState } from "react";
import { updateRaffleConfig, type RaffleConfigState } from "@/app/admin/config-actions";
import type { RaffleConfigField, RaffleConfigInput } from "@/lib/raffle-config/validate";

export interface RaffleConfigData {
  raffleName: string;
  maxNumero: number;
  precioPorNumero: string;
  sorteoFecha: string;
  nequiNumero: string;
  nequiNombre: string;
  numerosBendecidos: string;
}

interface ConfiguracionTabProps {
  raffle: RaffleConfigData | null;
  logoUrl: string | null;
  qrUrl: string | null;
}

// Visually hidden but still focusable/clickable by assistive tech and by the
// visible button next to it (which forwards the click via inputRef).
const visuallyHiddenInputStyle = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

const ACCENT = "oklch(0.52 0.21 26)";
const ERROR_COLOR = "oklch(0.45 0.21 26)";
const SUCCESS_COLOR = "oklch(0.45 0.14 145)";

const inputStyle = {
  border: "1px solid oklch(0.85 0.005 40)",
  borderRadius: "6px",
  padding: "10px 12px",
  minHeight: "42px",
  fontSize: "15px",
  width: "100%",
} as const;

const labelStyle = { display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", fontWeight: 600 } as const;

interface FieldProps {
  name: RaffleConfigField;
  label: string;
  hint?: string;
  defaultValue: string;
  error?: string;
  inputMode?: "numeric" | "text";
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
}

function Field({ name, label, hint, defaultValue, error, inputMode, placeholder, maxLength, required = true }: FieldProps) {
  const hintId = `${name}-hint`;
  const errorId = `${name}-error`;
  return (
    <label style={labelStyle}>
      {label}
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        inputMode={inputMode}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined}
        style={{ ...inputStyle, borderColor: error ? ERROR_COLOR : inputStyle.border }}
      />
      {hint && (
        <span id={hintId} style={{ fontSize: "12px", fontWeight: 400, color: "oklch(0.45 0.01 40)" }}>
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} role="alert" style={{ fontSize: "13px", color: ERROR_COLOR }}>
          {error}
        </span>
      )}
    </label>
  );
}

interface ImageUploadFieldProps {
  name: "logo" | "qr";
  label: string;
  hint?: string;
  currentUrl: string | null;
  emptyLabel: string;
  buttonLabel: string;
  previewAlt: string;
  onFileChange: (file: File | null) => void;
}

/**
 * A raw `<input type="file">` reads as "Choose File"/"Elegir archivo" with no
 * hint that it's where you pick the logo/QR (Jairo's feedback on the first
 * version of this form). Same accessible pattern as the buyer-facing
 * dropzone in components/rifa/ReservationForm.tsx: a real, obviously-clickable
 * button drives a visually-hidden file input via a ref, and shows the picked
 * filename or the current image as feedback.
 */
function ImageUploadField({ name, label, hint, currentUrl, emptyLabel, buttonLabel, previewAlt, onFileChange }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <label style={labelStyle}>
      {label}
      <span style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
        {currentUrl ? (
          // Plain <img>, not next/image: storage-hosted, matches Hero.tsx's
          // own convention for the same value.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt={previewAlt}
            style={{
              height: "48px",
              width: "48px",
              objectFit: "contain",
              borderRadius: "4px",
              border: "1px solid oklch(0.85 0.005 40)",
              background: "white",
            }}
          />
        ) : (
          <span style={{ fontSize: "13px", color: "oklch(0.55 0.01 40)" }}>{emptyLabel}</span>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            background: "oklch(0.96 0.003 40)",
            border: "1px solid oklch(0.85 0.005 40)",
            borderRadius: "6px",
            padding: "9px 14px",
            fontSize: "13px",
            fontWeight: 700,
            cursor: "pointer",
            color: "oklch(0.32 0.01 40)",
          }}
        >
          {fileName ? `📎 ${fileName}` : buttonLabel}
        </button>
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept="image/png,image/jpeg,image/webp"
          style={visuallyHiddenInputStyle}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            setFileName(file ? file.name : null);
            onFileChange(file);
          }}
        />
      </span>
      {hint && (
        <span style={{ fontSize: "12px", fontWeight: 400, color: "oklch(0.45 0.01 40)" }}>{hint}</span>
      )}
    </label>
  );
}

const INITIAL_STATE: RaffleConfigState = { status: "idle" };

export default function ConfiguracionTab({ raffle, logoUrl, qrUrl }: ConfiguracionTabProps) {
  const [state, formAction, pending] = useActionState(updateRaffleConfig, INITIAL_STATE);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);

  if (!raffle) {
    return (
      <div style={{ padding: "32px", maxWidth: "560px" }}>
        <p style={{ fontSize: "14px", color: "oklch(0.45 0.01 40)" }}>
          Esta organización no tiene una rifa activa para configurar.
        </p>
      </div>
    );
  }

  const values: RaffleConfigInput =
    state.status === "error" || state.status === "success"
      ? state.values
      : {
          raffleName: raffle.raffleName,
          precioPorNumero: raffle.precioPorNumero,
          sorteoFecha: raffle.sorteoFecha,
          nequiNumero: raffle.nequiNumero,
          nequiNombre: raffle.nequiNombre,
          numerosBendecidos: raffle.numerosBendecidos,
        };
  const errors = state.status === "error" ? state.fieldErrors : {};
  const displayedLogo = logoPreview ?? (state.status === "success" ? state.logoUrl : logoUrl);
  const displayedQr = qrPreview ?? (state.status === "success" ? state.qrUrl : qrUrl);

  function handleLogoChange(file: File | null) {
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  }

  function handleQrChange(file: File | null) {
    setQrPreview(file ? URL.createObjectURL(file) : null);
  }

  return (
    <form
      action={formAction}
      style={{
        padding: "24px",
        maxWidth: "560px",
        display: "flex",
        flexDirection: "column",
        gap: "18px",
      }}
    >
      <ImageUploadField
        name="logo"
        label="Logo de la rifa"
        emptyLabel="Sin logo"
        buttonLabel="Subir logo"
        previewAlt="Logo actual"
        currentUrl={displayedLogo}
        onFileChange={handleLogoChange}
      />

      <Field name="raffleName" label="Nombre de la rifa" defaultValue={values.raffleName} error={errors.raffleName} maxLength={80} />

      <label style={labelStyle}>
        Número máximo
        <input
          value={raffle.maxNumero}
          disabled
          readOnly
          style={{ ...inputStyle, background: "oklch(0.96 0.003 40)", color: "oklch(0.5 0.01 40)" }}
        />
        <span style={{ fontSize: "12px", fontWeight: 400, color: "oklch(0.45 0.01 40)" }}>
          No se puede cambiar después de crear la rifa.
        </span>
      </label>

      <Field
        name="precioPorNumero"
        label="Precio por número (COP)"
        defaultValue={values.precioPorNumero}
        error={errors.precioPorNumero}
        inputMode="numeric"
      />
      <Field
        name="sorteoFecha"
        label="Fecha del sorteo"
        defaultValue={values.sorteoFecha}
        error={errors.sorteoFecha}
        placeholder="15 OCT 2026"
        maxLength={40}
      />
      <Field
        name="nequiNumero"
        label="Número Nequi para recibir pagos"
        defaultValue={values.nequiNumero}
        error={errors.nequiNumero}
        inputMode="numeric"
        maxLength={10}
      />
      <Field name="nequiNombre" label="Titular de la cuenta Nequi" defaultValue={values.nequiNombre} error={errors.nequiNombre} maxLength={80} />

      <ImageUploadField
        name="qr"
        label="QR de Nequi (opcional)"
        hint="Súbelo si quieres que tus compradores vean tu código QR de pago en lugar de solo el número."
        emptyLabel="Sin QR"
        buttonLabel="Subir QR"
        previewAlt="QR de Nequi actual"
        currentUrl={displayedQr}
        onFileChange={handleQrChange}
      />

      <Field
        name="numerosBendecidos"
        label="Números bendecidos (opcional)"
        hint="Separados por comas. Ejemplo: 7, 42, 100"
        defaultValue={values.numerosBendecidos}
        error={errors.numerosBendecidos}
        required={false}
      />

      {state.status === "error" && state.error && (
        <div role="alert" style={{ color: ERROR_COLOR, fontSize: "13px", fontWeight: 600 }}>
          {state.error}
        </div>
      )}
      {state.status === "success" && (
        <div role="status" style={{ color: SUCCESS_COLOR, fontSize: "13px", fontWeight: 600 }}>
          Cambios guardados.
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          background: ACCENT,
          color: "white",
          border: "none",
          fontWeight: 700,
          fontSize: "15px",
          minHeight: "44px",
          padding: "12px",
          borderRadius: "6px",
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
