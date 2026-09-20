import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Nav } from "@/components/nav";

/**
 * Every page under (app) is behind this guard. A page cannot be added to this
 * group and accidentally end up public.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <Nav name={user.name} isAdmin={user.role === "ADMIN"} />
      <main>{children}</main>
    </>
  );
}
