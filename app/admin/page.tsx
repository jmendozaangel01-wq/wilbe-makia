import { redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminDashboard, { type Reserva, type NumeroCounts } from "@/components/admin/AdminDashboard";

export default async function AdminPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const admin = createAdminClient();

  const [{ data: reservas, error: reservasError }, disponibles, reservados, vendidos] = await Promise.all([
    admin.from("reservas").select("*").order("creado_en", { ascending: false }),
    admin.from("numeros").select("*", { count: "exact", head: true }).eq("estado", "disponible"),
    admin.from("numeros").select("*", { count: "exact", head: true }).eq("estado", "reservado"),
    admin.from("numeros").select("*", { count: "exact", head: true }).eq("estado", "vendido"),
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
