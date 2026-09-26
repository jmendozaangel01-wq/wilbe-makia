import type { Metadata } from "next";
import LoginForm from "@/components/admin/LoginForm";
import { getLoginErrorMessage } from "@/lib/auth/login-errors";

export const metadata: Metadata = {
  title: "Inicia sesión | Bendita Rifa",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  // Only allowlisted codes render, as fixed messages -- never the raw value.
  const initialError = getLoginErrorMessage(typeof error === "string" ? error : null);

  return <LoginForm initialError={initialError} />;
}
