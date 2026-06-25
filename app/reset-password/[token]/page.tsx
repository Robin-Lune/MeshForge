import bcrypt from "bcrypt";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  completeContributorPasswordReset,
  getPasswordResetTarget,
  isValidContributorPassword,
  passwordResetTokenHash,
} from "@/lib/queries/contributors";
import { isSameOrigin } from "@/lib/security";
import SiteHeader from "@/components/SiteHeader";
import ResetPasswordForm from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

function done(token: string, error: string | null): never {
  redirect(
    error
      ? `/reset-password/${encodeURIComponent(token)}?err=${encodeURIComponent(error)}`
      : `/reset-password/${encodeURIComponent(token)}?ok=1`,
  );
}

async function resetPassword(token: string, formData: FormData) {
  "use server";
  if (!isSameOrigin(await headers())) {
    done(token, "Origine refusée.");
  }

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!isValidContributorPassword(password)) {
    done(token, "Mot de passe invalide : 8 à 128 caractères.");
  }
  if (password !== confirm) {
    done(token, "Les deux mots de passe ne correspondent pas.");
  }

  const tokenHash = passwordResetTokenHash(token);
  const target = await getPasswordResetTarget(tokenHash);
  if (!target) {
    done(token, "Lien expiré ou déjà utilisé.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await completeContributorPasswordReset(tokenHash, passwordHash);
  done(token, updated ? null : "Lien expiré ou déjà utilisé.");
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { token } = await params;
  const { ok, err } = await searchParams;

  if (ok) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 sm:px-6">
          <h1 className="mb-2 text-lg font-semibold">Mot de passe modifié</h1>
          <p className="text-sm text-zinc-500">
            Le nouveau mot de passe est actif. Le lien ne peut plus être réutilisé.
          </p>
        </main>
      </div>
    );
  }

  const target = await getPasswordResetTarget(passwordResetTokenHash(token));
  if (!target) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 sm:px-6">
          <h1 className="mb-2 text-lg font-semibold">Lien invalide</h1>
          <p className="text-sm text-zinc-500">
            Ce lien a expiré, a déjà été utilisé, ou ne correspond à aucun compte.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 sm:px-6">
        <h1 className="mb-1 text-lg font-semibold">Nouveau mot de passe</h1>
        <p className="mb-6 text-sm text-zinc-500">
          Compte{" "}
          <span className="font-mono text-foreground">{target.username}</span>
          {target.nodeName ? ` · ${target.nodeName}` : ""}
        </p>

        <ResetPasswordForm action={resetPassword.bind(null, token)} error={err} />
      </main>
    </div>
  );
}
