import LoginForm from "@/components/admin/LoginForm";

export default function AdminLoginPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "oklch(0.97 0.003 40)",
        padding: "clamp(16px, 6vw, 24px)",
      }}
    >
      <LoginForm />
    </div>
  );
}
