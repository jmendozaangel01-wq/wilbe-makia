"use client";

import { useState, type ReactNode } from "react";
import { ERROR_TEXT, INPUT, LABEL } from "./styles";

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  error?: string | null;
  /** Small element aligned to the label's right edge (e.g. the forgot link). */
  labelAction?: ReactNode;
  /** Helper text shown under the input. */
  hint?: string;
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error = null,
  labelAction,
  hint,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={LABEL}>
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${INPUT} pr-12`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-gray hover:text-cream focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold"
        >
          <EyeIcon off={visible} />
        </button>
      </div>
      {hint && !error ? (
        <p id={hintId} className="text-xs text-gray-dim">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className={ERROR_TEXT}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
