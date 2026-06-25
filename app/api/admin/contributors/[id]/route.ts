import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentAdminUsername, isAdmin } from "@/lib/admin";
import { appBaseUrl, isSameOrigin } from "@/lib/security";
import {
  createContributorPasswordReset,
  deleteContributor,
  isValidNodeName,
  isValidUsername,
  passwordResetTokenHash,
  setContributorActive,
  updateContributorProfile,
} from "@/lib/queries/contributors";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function requireAdminResponse(): Promise<NextResponse | null> {
  return (await isAdmin())
    ? null
    : NextResponse.json({ error: "Non autorisé." }, { status: 401 });
}

function mutationError(e: unknown): string {
  const code = (e as { code?: string }).code;
  if (code === "23505") return "Ce username existe déjà.";
  return (e as Error).message || "Action impossible.";
}

function requireSameOrigin(req: Request): NextResponse | null {
  return isSameOrigin(req.headers)
    ? null
    : NextResponse.json({ error: "Origine refusée." }, { status: 403 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const badOrigin = requireSameOrigin(req);
  if (badOrigin) return badOrigin;

  const unauthorized = await requireAdminResponse();
  if (unauthorized) return unauthorized;

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID invalide." }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  try {
    if (b.type === "profile") {
      const username = String(b.username ?? "").trim();
      const nodeName = String(b.nodeName ?? "").trim();
      if (!isValidUsername(username)) {
        return NextResponse.json(
          { error: "Username invalide : 3 à 32 caractères, lettres/chiffres/_/-." },
          { status: 400 },
        );
      }
      if (!isValidNodeName(nodeName)) {
        return NextResponse.json(
          { error: "Nom de node invalide : 2 à 64 caractères." },
          { status: 400 },
        );
      }
      const updated = await updateContributorProfile(id, username, nodeName);
      return updated
        ? NextResponse.json({ ok: true })
        : NextResponse.json(
            { error: "Compte admin protégé ou introuvable." },
            { status: 403 },
          );
    }

    if (b.type === "active") {
      if (typeof b.isActive !== "boolean") {
        return NextResponse.json(
          { error: "État invalide." },
          { status: 400 },
        );
      }
      const updated = await setContributorActive(id, b.isActive);
      return updated
        ? NextResponse.json({ ok: true })
        : NextResponse.json(
            { error: "Compte admin protégé ou introuvable." },
            { status: 403 },
          );
    }
  } catch (e) {
    return NextResponse.json({ error: mutationError(e) }, { status: 400 });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const badOrigin = requireSameOrigin(req);
  if (badOrigin) return badOrigin;

  const adminUsername = await getCurrentAdminUsername();
  if (!adminUsername) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID invalide." }, { status: 400 });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    const created = await createContributorPasswordReset(
      id,
      passwordResetTokenHash(token),
      expiresAt,
      adminUsername,
    );
    if (!created) {
      return NextResponse.json(
        { error: "Compte admin protégé ou introuvable." },
        { status: 403 },
      );
    }
    return NextResponse.json({
      link: `${appBaseUrl()}/reset-password/${encodeURIComponent(token)}`,
    });
  } catch (e) {
    return NextResponse.json({ error: mutationError(e) }, { status: 400 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const badOrigin = requireSameOrigin(req);
  if (badOrigin) return badOrigin;

  const unauthorized = await requireAdminResponse();
  if (unauthorized) return unauthorized;

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "ID invalide." }, { status: 400 });

  try {
    const deleted = await deleteContributor(id);
    return deleted
      ? NextResponse.json({ ok: true })
      : NextResponse.json(
          { error: "Compte admin protégé ou introuvable." },
          { status: 403 },
        );
  } catch (e) {
    return NextResponse.json({ error: mutationError(e) }, { status: 400 });
  }
}
