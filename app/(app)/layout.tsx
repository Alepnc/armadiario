import type { ReactNode } from "react";
import { DesktopNav, MobileNav } from "@/components/shell/app-nav";
import { APP_NAME } from "@/lib/config";
import { requireUser } from "@/lib/security/auth";
import { getProfile } from "@/features/profile/queries";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, supabase } = await requireUser();
  const profile = await getProfile(supabase, user.id);
  const name = profile?.display_name || user.email?.split("@")[0] || "Tu";
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <DesktopNav appName={APP_NAME} displayName={name} />
      <MobileNav appName={APP_NAME} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 md:px-6 md:pb-16 md:pt-10">{children}</main>
    </div>
  );
}
