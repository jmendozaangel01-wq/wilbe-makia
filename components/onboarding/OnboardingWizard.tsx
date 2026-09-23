"use client";

import { useActionState, useRef, useState } from "react";
import { createOrganizationAction, type OnboardingState } from "@/app/onboarding/actions";
import type { OnboardingField, OnboardingInput } from "@/lib/onboarding/validate";

const INITIAL_STATE: OnboardingState = { status: "idle" };

const STEP_ONE_FIELDS: OnboardingField[] = ["orgName", "subdomain"];

const EMPTY_VALUES: OnboardingInput = {
  orgName: "",
  subdomain: "",
  raffleName: "",
  maxNumero: "999",
  precioPorNumero: "",
  sorteoFecha: "",
  nequiNumero: "",
  nequiNombre: "",
  numerosBendecidos: "",
};

const ACCENT = "oklch(0.52 0.21 26)";
const ERROR_COLOR = "oklch(0.45 0.21 26)";

const inputStyle = {
  border: "1px solid oklch(0.75 0.005 40)",
  borderRadius: "6px",
  padding: "12px",
  minHeight: "44px",
  fontSize: "16px",
  width: "100%",
} as const;

const labelStyle = { display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", fontWeight: 600 } as const;

interface FieldProps {
  name: OnboardingField;
  label: string;
  hint?: string;
  values: OnboardingInput;
  error?: string;
  inputMode?: "numeric" | "text";
  placeholder?: string;
  maxLength?: number;
  suffix?: string;
  required?: boolean;
}

function Field({ name, label, hint, values, error, inputMode, placeholder, maxLength, suffix, required = true }: FieldProps) {
  const hintId = `${name}-hint`;
  const errorId = `${name}-error`;
  return (
    <label style={labelStyle}>
      {label}
      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input
          name={name}
          defaultValue={values[name]}
          required={required}
          inputMode={inputMode}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined}
          style={{ ...inputStyle, borderColor: error ? ERROR_COLOR : inputStyle.border }}
        />
        {suffix && <span style={{ fontSize: "14px", color: "oklch(0.45 0.01 40)", whiteSpace: "nowrap" }}>{suffix}</span>}
      </span>
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

export default function OnboardingWizard({ apexDomain }: { apexDomain: string }) {
  const [state, formAction, pending] = useActionState(createOrganizationAction, INITIAL_STATE);
  const [step, setStep] = useState<1 | 2>(1);
  const [lastState, setLastState] = useState<OnboardingState>(state);
  const stepOneRef = useRef<HTMLFieldSetElement>(null);

  // Server-side errors: jump to the step that owns the first failing field.
  // Adjusting state during render (rather than in an effect) is the React-
  // recommended way to react to a new action result.
  if (state !== lastState) {
    setLastState(state);
    if (state.status === "error") {
      const failing = Object.keys(state.fieldErrors) as OnboardingField[];
      if (failing.length > 0) {
        setStep(failing.some((f) => STEP_ONE_FIELDS.includes(f)) ? 1 : 2);
      }
    }
  }

  const values = state.status === "error" ? state.values : EMPTY_VALUES;
  const errors = state.status === "error" ? state.fieldErrors : {};

  function goToStepTwo() {
    const inputs = stepOneRef.current?.querySelectorAll<HTMLInputElement>("input") ?? [];
    for (const input of inputs) {
      if (!input.reportValidity()) return;
    }
    setStep(2);
  }

  return (
    <form
      action={formAction}
      style={{
        background: "white",
        border: "1px solid oklch(0.90 0.005 40)",
        borderRadius: "10px",
        padding: "clamp(20px, 6vw, 32px)",
        width: "100%",
        maxWidth: "480px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      <div>
        <div className="font-display" style={{ fontSize: "20px", letterSpacing: "1px" }}>
          Crea tu organización
        </div>
        <p aria-live="polite" style={{ fontSize: "13px", color: "oklch(0.45 0.01 40)", marginTop: "4px" }}>
          Paso {step} de 2 · {step === 1 ? "Tu organización" : "Tu primera rifa"}
        </p>
      </div>

      <fieldset
        ref={stepOneRef}
        hidden={step !== 1}
        style={{ border: "none", padding: 0, margin: 0, display: step === 1 ? "flex" : "none", flexDirection: "column", gap: "16px" }}
      >
        <Field name="orgName" label="Nombre de la organización" values={values} error={errors.orgName} maxLength={60} />
        <Field
          name="subdomain"
          label="Subdominio"
          hint="Será la dirección pública de tu rifa. No podrás cambiarlo después."
          values={values}
          error={errors.subdomain}
          suffix={`.${apexDomain}`}
          maxLength={63}
          placeholder="mi-rifa"
        />
        <button type="button" onClick={goToStepTwo} style={primaryButton(false)}>
          Continuar
        </button>
      </fieldset>

      <fieldset
        hidden={step !== 2}
        style={{ border: "none", padding: 0, margin: 0, display: step === 2 ? "flex" : "none", flexDirection: "column", gap: "16px" }}
      >
        <Field name="raffleName" label="Nombre de la rifa" values={values} error={errors.raffleName} maxLength={80} />
        <Field
          name="maxNumero"
          label="Número máximo"
          hint="La rifa tendrá los números del 0 al máximo (por ejemplo 999 = 1.000 números)."
          values={values}
          error={errors.maxNumero}
          inputMode="numeric"
        />
        <Field
          name="precioPorNumero"
          label="Precio por número (COP)"
          values={values}
          error={errors.precioPorNumero}
          inputMode="numeric"
        />
        <Field
          name="sorteoFecha"
          label="Fecha del sorteo"
          values={values}
          error={errors.sorteoFecha}
          placeholder="15 OCT 2026"
          maxLength={40}
        />
        <Field
          name="nequiNumero"
          label="Número Nequi para recibir pagos"
          values={values}
          error={errors.nequiNumero}
          inputMode="numeric"
          maxLength={10}
        />
        <Field name="nequiNombre" label="Titular de la cuenta Nequi" values={values} error={errors.nequiNombre} maxLength={80} />
        <Field
          name="numerosBendecidos"
          label="Números bendecidos (opcional)"
          hint="Separados por comas. Ejemplo: 7, 42, 100"
          values={values}
          error={errors.numerosBendecidos}
          required={false}
        />

        {state.status === "error" && state.error && (
          <div role="alert" style={{ color: ERROR_COLOR, fontSize: "13px", fontWeight: 600 }}>
            {state.error}
          </div>
        )}

        <div style={{ display: "flex", gap: "12px" }}>
          <button type="button" onClick={() => setStep(1)} style={secondaryButton}>
            Atrás
          </button>
          <button type="submit" disabled={pending} style={{ ...primaryButton(pending), flex: 1 }}>
            {pending ? "Creando…" : "Crear organización"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function primaryButton(pending: boolean) {
  return {
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
  } as const;
}

const secondaryButton = {
  background: "white",
  color: "oklch(0.20 0.01 40)",
  border: "1px solid oklch(0.75 0.005 40)",
  fontWeight: 600,
  fontSize: "15px",
  minHeight: "44px",
  padding: "12px 16px",
  borderRadius: "6px",
  cursor: "pointer",
} as const;
