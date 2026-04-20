import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import LoginForm from "./LoginForm";

export const runtime = "nodejs";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  if (await verifySessionToken(token)) {
    redirect(sp.from && sp.from.startsWith("/") ? sp.from : "/admin");
  }
  return <LoginForm redirectTo={sp.from ?? "/admin"} />;
}
