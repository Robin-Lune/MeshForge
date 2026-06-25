"use client";

import { useState } from "react";
import Link from "next/link";
import type { ContributorAdminRow } from "@/lib/queries/contributors";

type ModalState =
  | { type: "edit"; contributor: ContributorAdminRow }
  | { type: "delete"; contributor: ContributorAdminRow }
  | { type: "reset"; contributor: ContributorAdminRow }
  | null;

const btnCls =
  "rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black";
const secondaryBtnCls =
  "rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20";
const dangerBtnCls =
  "rounded-lg border border-red-500/40 px-3 py-1.5 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400";
const inputCls =
  "mt-1 w-full rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/20";

async function adminRequest(
  id: number,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/admin/contributors/${id}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.error ?? "Action impossible."));
  return data;
}

function returnToPage(page: number) {
  window.location.assign(`/admin/contributeurs?page=${page}&ok=1`);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-lg border border-white/15 bg-background p-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded px-2 py-1 text-xl leading-none text-muted hover:text-foreground"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ResetPasswordModal({
  contributor,
  onClose,
}: {
  contributor: ContributorAdminRow;
  onClose: () => void;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  async function generateLink() {
    setPending(true);
    setError(null);
    try {
      const data = await adminRequest(contributor.id, { method: "POST" });
      setLink(String(data.link ?? ""));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    setCopied(false);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Copie impossible. Sélectionne le lien manuellement.");
    }
  }

  return (
    <ModalShell title="Lien mot de passe" onClose={onClose}>
      <p className="text-sm text-zinc-400">
        Génère un lien à usage unique pour{" "}
        <span className="font-mono text-foreground">{contributor.username}</span>.
      </p>

      {error && (
        <p className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {link ? (
        <div className="mt-3">
          <label className="block text-xs text-zinc-500">
            Lien valable 24 h
            <input
              readOnly
              value={link}
              className={`${inputCls} cursor-pointer font-mono`}
              onClick={(e) => {
                e.currentTarget.select();
                void copyLink();
              }}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">
              {copied ? "Copié." : "Clique sur le lien pour le copier."}
            </p>
            <button type="button" onClick={copyLink} className={secondaryBtnCls}>
              Copier
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtnCls}>
            Annuler
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={generateLink}
            className={btnCls}
          >
            Générer
          </button>
        </div>
      )}
    </ModalShell>
  );
}

function EditContributorModal({
  contributor,
  page,
  onClose,
}: {
  contributor: ContributorAdminRow;
  page: number;
  onClose: () => void;
}) {
  const [username, setUsername] = useState(contributor.username);
  const [nodeName, setNodeName] = useState(contributor.nodeName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setError(null);
    try {
      await adminRequest(contributor.id, {
        method: "PATCH",
        body: JSON.stringify({
          type: "profile",
          username,
          nodeName,
        }),
      });
      returnToPage(page);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <ModalShell title="Modifier le contributeur" onClose={onClose}>
      <div className="grid gap-3">
        <label className="text-xs text-zinc-500">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            className={`${inputCls} font-mono`}
          />
        </label>
        <label className="text-xs text-zinc-500">
          Node name
          <input
            value={nodeName}
            onChange={(e) => setNodeName(e.currentTarget.value)}
            className={inputCls}
          />
        </label>
        {error && (
          <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtnCls}>
            Annuler
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void save()}
            className={btnCls}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export default function ContributorsManager({
  contributors,
  page,
  pageCount,
  pageSize,
  total,
}: {
  contributors: ContributorAdminRow[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const start = (page - 1) * pageSize;

  async function toggleActive(contributor: ContributorAdminRow) {
    try {
      await adminRequest(contributor.id, {
        method: "PATCH",
        body: JSON.stringify({
          type: "active",
          isActive: !contributor.isActive,
        }),
      });
      returnToPage(page);
    } catch (e) {
      window.location.assign(
        `/admin/contributeurs?page=${page}&err=${encodeURIComponent(
          (e as Error).message,
        )}`,
      );
    }
  }

  async function remove(id: number) {
    try {
      await adminRequest(id, { method: "DELETE" });
      returnToPage(page);
    } catch (e) {
      window.location.assign(
        `/admin/contributeurs?page=${page}&err=${encodeURIComponent(
          (e as Error).message,
        )}`,
      );
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
        <span>
          {start + 1}-{Math.min(start + contributors.length, total)} sur {total}
        </span>
        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <Link
              aria-disabled={page === 1}
              href={`/admin/contributeurs?page=${Math.max(1, page - 1)}`}
              className={`${secondaryBtnCls} ${
                page === 1 ? "pointer-events-none opacity-40" : ""
              }`}
            >
              Précédent
            </Link>
            <span className="font-mono text-xs">
              {page}/{pageCount}
            </span>
            <Link
              aria-disabled={page === pageCount}
              href={`/admin/contributeurs?page=${Math.min(pageCount, page + 1)}`}
              className={`${secondaryBtnCls} ${
                page === pageCount ? "pointer-events-none opacity-40" : ""
              }`}
            >
              Suivant
            </Link>
          </div>
        )}
      </div>

      <div className="grid gap-3">
        {contributors.map((c) => {
          const editable = c.role !== "ADMIN";

          return (
            <article
              key={c.id}
              className="rounded-lg border border-black/10 p-3 dark:border-white/15"
            >
              <div className="grid gap-3 md:grid-cols-[1.1fr_1.1fr_0.6fr_0.6fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="text-xs text-zinc-500">Username</div>
                  <div className="break-all font-mono text-sm">{c.username}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-zinc-500">Node name</div>
                  <div className="break-words text-sm">
                    {c.nodeName || "Non renseigné"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Rôle</div>
                  <span
                    className={`mt-1 inline-flex rounded border px-2 py-1 font-mono text-xs ${
                      c.role === "ADMIN"
                        ? "border-accent/50 text-accent"
                        : "border-white/15 text-zinc-300"
                    }`}
                  >
                    {c.role}
                  </span>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">État</div>
                  <span
                    className={
                      c.isActive
                        ? "text-sm text-emerald-700 dark:text-emerald-400"
                        : "text-sm text-zinc-500"
                    }
                  >
                    {c.isActive ? "Actif" : "Inactif"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => setModal({ type: "edit", contributor: c })}
                    className={secondaryBtnCls}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => setModal({ type: "reset", contributor: c })}
                    className={secondaryBtnCls}
                  >
                    Mot de passe
                  </button>
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => setModal({ type: "delete", contributor: c })}
                    className={dangerBtnCls}
                  >
                    Supprimer
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3 text-xs text-zinc-500 dark:border-white/10">
                <span className="break-all">{c.email ?? "Email non renseigné"}</span>
                <span aria-hidden>·</span>
                <span>Créé le {formatDate(c.createdAt)}</span>
                {!editable && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="text-accent">Compte admin protégé</span>
                  </>
                )}
                <div className="ml-auto">
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => void toggleActive(c)}
                    className={secondaryBtnCls}
                  >
                    {c.isActive ? "Passer inactif" : "Réactiver"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {modal?.type === "edit" && (
        <EditContributorModal
          contributor={modal.contributor}
          page={page}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === "delete" && (
        <ModalShell title="Supprimer le contributeur" onClose={() => setModal(null)}>
          <p className="text-sm text-zinc-400">
            Le compte MQTT{" "}
            <span className="font-mono text-foreground">
              {modal.contributor.username}
            </span>{" "}
            sera supprimé.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModal(null)}
              className={secondaryBtnCls}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void remove(modal.contributor.id)}
              className={dangerBtnCls}
            >
              Supprimer
            </button>
          </div>
        </ModalShell>
      )}

      {modal?.type === "reset" && (
        <ResetPasswordModal
          contributor={modal.contributor}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
