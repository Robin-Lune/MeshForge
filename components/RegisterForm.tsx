"use client";

import { useState } from "react";

interface Creds {
  username: string;
  password: string;
}

const inputCls =
  "rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50";

export default function RegisterForm() {
  const [relayName, setRelayName] = useState("");
  const [email, setEmail] = useState("");
  const [creds, setCreds] = useState<Creds | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, nodeName: relayName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Erreur.");
        return;
      }
      setCreds(data as Creds);
    } catch {
      setError("Réseau indisponible.");
    } finally {
      setLoading(false);
    }
  }

  if (creds) {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          ⚠️ Copie ces identifiants <strong>maintenant</strong> : le mot de passe
          ne sera <strong>plus jamais</strong> affiché.
        </p>
        <div className="rounded-lg border border-black/10 p-4 font-mono text-sm dark:border-white/15">
          <div className="text-zinc-500">MQTT username</div>
          <div className="mb-3 select-all break-all">{creds.username}</div>
          <div className="text-zinc-500">MQTT password</div>
          <div className="select-all break-all">{creds.password}</div>
        </div>
        <p className="text-sm text-zinc-500">
          Configure ces valeurs comme identifiants MQTT sur ton Heltec. En cas de
          perte, réinscris-toi (l’ancien compte restera révocable par un admin).
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input
        value={relayName}
        onChange={(e) => setRelayName(e.target.value)}
        placeholder="Nom de ton relais (ex : Relais Piton)"
        required
        className={inputCls}
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email (contact, jamais affiché)"
        required
        className={inputCls}
      />
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {loading ? "Création…" : "Obtenir mes identifiants MQTT"}
      </button>
    </form>
  );
}
