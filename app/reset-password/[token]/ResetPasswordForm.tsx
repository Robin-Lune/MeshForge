"use client";

import { useState } from "react";

const inputCls =
  "w-full rounded border border-black/15 bg-transparent px-3 py-2 pr-11 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50";
const btnCls =
  "rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-black";

function EyeIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {visible ? (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M10.7 5.1A11.3 11.3 0 0 1 12 5c7 0 10 7 10 7a18 18 0 0 1-3.2 4.2" />
          <path d="M6.6 6.6A18 18 0 0 0 2 12s3 7 10 7a10.8 10.8 0 0 0 5.4-1.4" />
          <path d="M3 3l18 18" />
          <path d="M9.9 9.9A3 3 0 0 0 14.1 14.1" />
        </>
      )}
    </svg>
  );
}

function PasswordField({
  name,
  placeholder,
  visible,
}: {
  name: string;
  placeholder: string;
  visible: boolean;
}) {
  return (
    <input
      type={visible ? "text" : "password"}
      name={name}
      placeholder={placeholder}
      autoComplete="new-password"
      className={inputCls}
    />
  );
}

export default function ResetPasswordForm({
  action,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="relative">
        <PasswordField
          name="password"
          placeholder="Nouveau mot de passe"
          visible={visible}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Cacher le mot de passe" : "Afficher le mot de passe"}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-zinc-500 hover:text-foreground"
        >
          <EyeIcon visible={visible} />
        </button>
      </div>
      <div className="relative">
        <PasswordField name="confirm" placeholder="Confirmer" visible={visible} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Cacher le mot de passe" : "Afficher le mot de passe"}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-zinc-500 hover:text-foreground"
        >
          <EyeIcon visible={visible} />
        </button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button className={btnCls}>Enregistrer</button>
    </form>
  );
}
