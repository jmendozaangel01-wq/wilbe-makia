import { headers } from "next/headers";
import LoginForm from "@/components/admin/LoginForm";
import { resolveOrganizationByHost, DEFAULT_ORG_NAME } from "@/lib/tenant/resolve";

export default async function AdminLoginPage() {
  const headerList = await headers();
  const host = headerList.get("host");

  let org = null;
  if (host) {
    try {
      org = await resolveOrganizationByHost(host);
    } catch (err) {
      // Resolution failure here must not block the request -- fall back to
      // the generic default name, matching middleware.ts's fail-soft pattern
      // for this same lookup.
      console.error("[admin/login] tenant resolution failed", err);
    }
  }
  const orgName = org?.nombre ?? DEFAULT_ORG_NAME;

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
      <LoginForm orgName={orgName} />
    </div>
  );
}
