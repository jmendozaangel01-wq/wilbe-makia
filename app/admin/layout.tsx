import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-body"
      style={{
        minHeight: "100vh",
        background: "oklch(0.97 0.003 40)",
        color: "oklch(0.20 0.01 40)",
      }}
    >
      {children}
    </div>
  );
}
