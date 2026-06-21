import { randomInt } from "node:crypto";
import { pool } from "../db";

// Compte (USER ou ADMIN). `password` = bcrypt. Sert à l'auth web (role=ADMIN)
// et, via mosquitto-go-auth, à l'auth MQTT des nodes (role=USER).
export interface ContributorAuth {
  username: string;
  password: string; // bcrypt hash
  role: string;
  isActive: boolean;
}

export type Role = "ADMIN" | "USER";

// Autorisation : compte actif ET rôle requis (logique pure, testée). Volontaire-
// ment séparé de la requête : isAdmin() ET le login s'appuient dessus.
export function canLogin(row: ContributorAuth, requiredRole: Role): boolean {
  return row.isActive === true && row.role === requiredRole;
}

// Format username autorisé (anti-injection, réutilisé par create-admin et,
// plus tard, l'inscription). Alphanumérique + _ - , 3 à 32 caractères.
export function isValidUsername(s: string): boolean {
  return /^[A-Za-z0-9_-]{3,32}$/.test(s);
}

// Validation email basique (anti-format absurde, pas une vérif de délivrabilité).
export function isValidEmail(s: string): boolean {
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Slug d'un nom de relais : sans accents, minuscules, [a-z0-9] seulement, ≤ 20.
// NFD décompose "é" -> "e" + accent combinant ; le filtre [^a-z0-9] retire
// ensuite accents et tout caractère non alphanumérique.
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
}

const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";
function randomAlnum(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += ALNUM[randomInt(ALNUM.length)];
  return s;
}

// Identifiant MQTT : <slug du nom>_<6 alphanum>. Lisible + suffixe aléatoire
// pour l'unicité. Repli "relay" si le nom ne donne aucun caractère utilisable.
export function generateUsername(relayName: string): string {
  return `${slugify(relayName) || "relay"}_${randomAlnum(6)}`;
}

// Mot de passe MQTT : 3 syllabes prononçables + 2 chiffres séparés par '-'
// (ex. "tek-rab-mon-47"). Saisie MANUELLE facile sur l'app Meshtastic tout en
// gardant ~2^37 d'entropie. Affiché 1× ; seul son bcrypt est stocké.
const CONS = "bcdfghjkmnprstvz";
const VOW = "aeiou";
function syllable(): string {
  return (
    CONS[randomInt(CONS.length)] +
    VOW[randomInt(VOW.length)] +
    CONS[randomInt(CONS.length)]
  );
}
export function generatePassword(): string {
  return `${syllable()}-${syllable()}-${syllable()}-${10 + randomInt(90)}`;
}

// Lookup auth par username (paramétré). Ne filtre PAS is_active : c'est canLogin
// qui décide -> révocation vérifiée à CHAQUE requête, pas figée dans le cookie.
const SELECT_BY_USERNAME = `
  SELECT username, password, role, is_active AS "isActive"
  FROM contributors WHERE username = $1
`;

export async function getContributorByUsername(
  username: string,
): Promise<ContributorAuth | null> {
  const { rows } = await pool.query<ContributorAuth>(SELECT_BY_USERNAME, [
    username,
  ]);
  return rows[0] ?? null;
}

// Crée (ou réactive/réinitialise) un compte ADMIN. Le hash bcrypt est calculé
// par l'appelant (script create-admin) — cette couche ne touche jamais au clair.
const UPSERT_ADMIN = `
  INSERT INTO contributors (username, password, role, is_active)
  VALUES ($1, $2, 'ADMIN', TRUE)
  ON CONFLICT (username) DO UPDATE
    SET password = EXCLUDED.password, role = 'ADMIN', is_active = TRUE
`;

export async function upsertAdmin(
  username: string,
  passwordHash: string,
): Promise<void> {
  await pool.query(UPSERT_ADMIN, [username, passwordHash]);
}

// Inscription d'un relais (role=USER). `passwordHash` = bcrypt du token (calculé
// par l'appelant : cette couche ne voit jamais le clair). Username unique :
// collision -> l'INSERT jette (unique violation), géré côté route.
const INSERT_CONTRIBUTOR = `
  INSERT INTO contributors (username, password, email, node_name, role)
  VALUES ($1, $2, $3, $4, 'USER')
`;

export async function insertContributor(
  username: string,
  passwordHash: string,
  email: string,
  nodeName: string,
): Promise<void> {
  await pool.query(INSERT_CONTRIBUTOR, [username, passwordHash, email, nodeName]);
}
