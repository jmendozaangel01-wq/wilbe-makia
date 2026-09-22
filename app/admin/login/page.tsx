import { headers } from "next/headers";
import LoginForm from "@/components/admin/LoginForm";
import { resolveOrganizationByHost, DEFAULT_ORG_NAME } from "@/lib/tenant/resolve";

export default async function AdminLoginPage() {
  const headerList = await headers();
  const host = headerList.get("host");
  const org = host ? await resolveOrganizationByHost(host) : null;
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
