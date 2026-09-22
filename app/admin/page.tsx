import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminContext, AdminContextError } from "@/lib/auth/admin-context";
import AdminDashboard, { type Reserva, type NumeroCounts } from "@/components/admin/AdminDashboard";

export default async function AdminPage() {
  let context;
  try {
    context = await requireAdminContext();
  } catch (err) {
    if (err instanceof AdminContextError) {
      redirect("/admin/login");
    }
    throw err;
  }

  const admin = createAdminClient();

  const [{ data: reservas, error: reservasError }, disponibles, reservados, vendidos] = await Promise.all([
    admin
      .from("reservas")
      .select("*")
      .eq("organization_id", context.organizationId)
      .order("creado_en", { ascending: false }),
    admin
      .from("numeros")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("estado", "disponible"),
    admin
      .from("numeros")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("estado", "reservado"),
    admin
      .from("numeros")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("estado", "vendido"),
  ]);

  if (reservasError) {
    console.error("[admin] failed to load reservas", { error: reservasError.message });
  }

  const counts: NumeroCounts = {
    disponibles: disponibles.count ?? 0,
    reservados: reservados.count ?? 0,
    vendidos: vendidos.count ?? 0,
  };

  return <AdminDashboard initialReservas={(reservas as Reserva[]) ?? []} initialCounts={counts} />;
}
