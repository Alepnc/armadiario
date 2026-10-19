import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/security/auth";
import { getProfile } from "@/features/profile/queries";
import { SettingsPanel } from "@/features/profile/components/settings-panel";
import { logoutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Impostazioni e privacy" };

export default async function SettingsPage() {
  const { user, supabase } = await requireUser();
  const profile = await getProfile(supabase, user.id);
  return (
    <>
      <PageHeader title="Impostazioni e privacy" description="Decidi cosa può essere inviato ai servizi AI e gestisci i tuoi dati." />
      <SettingsPanel
        aiConsent={Boolean(profile?.ai_consent_at)}
        visionConsent={Boolean(profile?.ai_vision_consent_at)}
        tryonConsent={Boolean(profile?.tryon_consent_at)}
        hasTryOnPhoto={Boolean(profile?.tryon_photo_path)}
        accountDeletionEnabled={isAdminConfigured()}
      />
      <form action={logoutAction} className="mt-8 max-w-2xl">
        <Button type="submit" variant="secondary">Esci dall&apos;account</Button>
      </form>
    </>
  );
}
