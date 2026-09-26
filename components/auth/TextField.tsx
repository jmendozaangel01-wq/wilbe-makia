import type { InputHTMLAttributes } from "react";
import { ERROR_TEXT, INPUT, LABEL } from "./styles";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "onChange" | "value"> {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}

export default function TextField({ id, label, value, onChange, error = null, ...rest }: TextFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        {...rest}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={INPUT}
      />
      {error ? (
        <p id={errorId} role="alert" className={ERROR_TEXT}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
