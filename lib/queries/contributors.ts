// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { createHash, randomInt } from "node:crypto";
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

export interface ContributorAdminRow {
  id: number;
  username: string;
  email: string | null;
  nodeName: string | null;
  role: Role;
  isActive: boolean;
  createdAt: Date;
}

export interface ContributorsAdminPage {
  contributors: ContributorAdminRow[];
  total: number;
}

interface ContributorAdminPageRow extends ContributorAdminRow {
  totalCount: string;
}

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

// Validation email basique.
export function isValidEmail(s: string): boolean {
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function isValidNodeName(s: string): boolean {
  return s.trim().length >= 2 && s.trim().length <= 64;
}

export function isValidContributorPassword(s: string): boolean {
  return s.length >= 8 && s.length <= 128;
}

export function passwordResetTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function canMutateContributor(row: { role: string }): boolean {
  return row.role !== "ADMIN";
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
  await pool.query(INSERT_CONTRIBUTOR, [
    username,
    passwordHash,
    email,
    nodeName,
  ]);
}

const SELECT_ADMIN_PAGE = `
  SELECT
    id,
    username,
    email,
    node_name AS "nodeName",
    role,
    is_active AS "isActive",
    created_at AS "createdAt",
    COUNT(*) OVER() AS "totalCount"
  FROM contributors
  ORDER BY created_at DESC, id DESC
  LIMIT $1 OFFSET $2
`;

const COUNT_CONTRIBUTORS = `SELECT COUNT(*) AS count FROM contributors`;

export async function getContributorsAdminPage(
  limit: number,
  offset: number,
): Promise<ContributorsAdminPage> {
  const { rows } = await pool.query<ContributorAdminPageRow>(
    SELECT_ADMIN_PAGE,
    [limit, offset],
  );
  if (rows.length === 0) {
    const count = await pool.query<{ count: string }>(COUNT_CONTRIBUTORS);
    return { contributors: [], total: Number(count.rows[0]?.count ?? 0) };
  }
  return {
    contributors: rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
      nodeName: row.nodeName,
      role: row.role,
      isActive: row.isActive,
      createdAt: row.createdAt,
    })),
    total: Number(rows[0].totalCount),
  };
}

const UPDATE_CONTRIBUTOR_PROFILE = `
  UPDATE contributors
  SET username = $2, node_name = $3
  WHERE id = $1 AND role <> 'ADMIN'
`;

export async function updateContributorProfile(
  id: number,
  username: string,
  nodeName: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(UPDATE_CONTRIBUTOR_PROFILE, [
    id,
    username,
    nodeName,
  ]);
  return rowCount === 1;
}

const SET_CONTRIBUTOR_ACTIVE = `
  UPDATE contributors
  SET is_active = $2
  WHERE id = $1 AND role <> 'ADMIN'
`;

export async function setContributorActive(
  id: number,
  isActive: boolean,
): Promise<boolean> {
  const { rowCount } = await pool.query(SET_CONTRIBUTOR_ACTIVE, [
    id,
    isActive,
  ]);
  return rowCount === 1;
}

const DELETE_CONTRIBUTOR = `
  DELETE FROM contributors
  WHERE id = $1 AND role <> 'ADMIN'
`;

export async function deleteContributor(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(DELETE_CONTRIBUTOR, [id]);
  return rowCount === 1;
}

const INVALIDATE_PASSWORD_RESETS = `
  UPDATE contributor_password_resets
  SET used_at = NOW()
  WHERE contributor_id = $1 AND used_at IS NULL
`;

const INSERT_PASSWORD_RESET = `
  INSERT INTO contributor_password_resets (
    contributor_id,
    token_hash,
    expires_at,
    created_by
  )
  SELECT id, $2, $3, $4
  FROM contributors
  WHERE id = $1 AND role <> 'ADMIN'
`;

export async function createContributorPasswordReset(
  contributorId: number,
  tokenHash: string,
  expiresAt: Date,
  createdBy: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(INVALIDATE_PASSWORD_RESETS, [contributorId]);
    const { rowCount } = await client.query(INSERT_PASSWORD_RESET, [
      contributorId,
      tokenHash,
      expiresAt,
      createdBy,
    ]);
    await client.query("COMMIT");
    return rowCount === 1;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export interface PasswordResetTarget {
  username: string;
  nodeName: string | null;
}

const SELECT_PASSWORD_RESET_TARGET = `
  SELECT c.username, c.node_name AS "nodeName"
  FROM contributor_password_resets r
  JOIN contributors c ON c.id = r.contributor_id
  WHERE r.token_hash = $1
    AND r.used_at IS NULL
    AND r.expires_at > NOW()
    AND c.role <> 'ADMIN'
`;

export async function getPasswordResetTarget(
  tokenHash: string,
): Promise<PasswordResetTarget | null> {
  const { rows } = await pool.query<PasswordResetTarget>(
    SELECT_PASSWORD_RESET_TARGET,
    [tokenHash],
  );
  return rows[0] ?? null;
}

const SELECT_PASSWORD_RESET_FOR_UPDATE = `
  SELECT r.id, r.contributor_id
  FROM contributor_password_resets r
  JOIN contributors c ON c.id = r.contributor_id
  WHERE r.token_hash = $1
    AND r.used_at IS NULL
    AND r.expires_at > NOW()
    AND c.role <> 'ADMIN'
  FOR UPDATE
`;

export async function completeContributorPasswordReset(
  tokenHash: string,
  passwordHash: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{
      id: number;
      contributor_id: number;
    }>(SELECT_PASSWORD_RESET_FOR_UPDATE, [tokenHash]);
    const reset = rows[0];
    if (!reset) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("UPDATE contributors SET password = $1 WHERE id = $2", [
      passwordHash,
      reset.contributor_id,
    ]);
    await client.query(
      "UPDATE contributor_password_resets SET used_at = NOW() WHERE id = $1",
      [reset.id],
    );
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
