import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import {
  isValidEmail,
  generateUsername,
  generatePassword,
  insertContributor,
} from "@/lib/queries/contributors";
import { createRateLimiter, clientIp } from "@/lib/rate-limit";

// Anti-spam d'inscription : 5 relais par IP et par heure (singleton module).
const limiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

// Inscription publique d'un relais. Renvoie { username, token } UNE SEULE FOIS :
// le token n'est jamais stocké en clair (seul son bcrypt l'est). À configurer
// comme credentials MQTT sur le Heltec.
export async function POST(req: Request) {
  const ip = clientIp(
    req.headers.get("x-forwarded-for"),
    req.headers.get("x-real-ip"),
  );
  const rl = limiter.check(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie plus tard." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const email = String(b.email ?? "").trim();
  const nodeName = String(b.nodeName ?? "").trim();

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Email invalide." }, { status: 400 });
  }
  if (nodeName.length < 2 || nodeName.length > 64) {
    return NextResponse.json(
      { error: "Nom de relais invalide (2 à 64 caractères)." },
      { status: 400 },
    );
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);

  // Username = <nom du relais>_<suffixe> : on retente sur collision (rare) avec
  // un nouveau suffixe. Le hash est calculé une fois (le mot de passe est fixe).
  for (let attempt = 0; attempt < 3; attempt++) {
    const username = generateUsername(nodeName);
    try {
      await insertContributor(username, passwordHash, email, nodeName);
      return NextResponse.json({ username, password });
    } catch {
      // collision d'username -> nouveau suffixe ; abandon après 3 tentatives.
    }
  }
  return NextResponse.json(
    { error: "Inscription impossible, réessaie." },
    { status: 500 },
  );
}
