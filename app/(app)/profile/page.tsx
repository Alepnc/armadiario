import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { BUCKETS } from "@/lib/config";
import { requireUser } from "@/lib/security/auth";
import { signPaths } from "@/lib/storage";
import { getProfile } from "@/features/profile/queries";
import { ProfileForm } from "@/features/profile/components/profile-form";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Profilo" };

export default async function ProfilePage() {
  const { user, supabase } = await requireUser();
  const profile = await getProfile(supabase, user.id);
  if (!profile) notFound();
  const urls = await signPaths(supabase, BUCKETS.personal, [profile.avatar_path]);
  return (
    <>
      <PageHeader title="Il tuo profilo" description="Tutto è facoltativo. Le tue preferenze rendono le proposte più tue." />
      <div className="max-w-2xl">
        <ProfileForm profile={profile} email={user.email ?? ""} avatarUrl={profile.avatar_path ? (urls.get(profile.avatar_path) ?? null) : null} />
      </div>
    </>
  );
}
