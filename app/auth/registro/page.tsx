import type { Metadata } from "next";
import SignUpForm from "@/components/auth/SignUpForm";

export const metadata: Metadata = {
  title: "Crea tu cuenta | Bendita Rifa",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return <SignUpForm />;
}
