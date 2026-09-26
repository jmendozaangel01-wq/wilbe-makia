import { ERROR_TEXT } from "./styles";

/** Form-level error, announced to screen readers when it appears. */
export default function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className={`${ERROR_TEXT} rounded-md border border-red/40 bg-red/10 px-3 py-2`}>
      {message}
    </p>
  );
}
