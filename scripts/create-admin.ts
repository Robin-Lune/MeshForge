// IMPORTANT : en ESM les imports sont hoistés -> un config() dotenv en haut du
// fichier s'exécuterait APRÈS la création de la Pool (lib/db lit DATABASE_URL à
// l'évaluation du module). On charge donc l'env via un import à effet de bord
// placé EN PREMIER (même pattern que le worker), avant tout import de lib/db.
import "../src/worker/env";
import { createInterface } from "node:readline";
import bcrypt from "bcrypt";
import { pool } from "../lib/db";
import { upsertAdmin, isValidUsername } from "../lib/queries/contributors";

// Prompt terminal. `hidden` masque la saisie (mot de passe) : on intercepte
// l'écho stdout pendant la frappe.
function prompt(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  if (hidden) {
    // @ts-expect-error _writeToOutput n'est pas typé mais existe sur l'interface.
    rl._writeToOutput = (s: string) => {
      // Laisse passer la question, masque la frappe.
      if (s.includes(question)) process.stdout.write(s);
    };
  }
  return new Promise((resolve) =>
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(a);
    }),
  );
}

async function main(): Promise<void> {
  const username = (await prompt("Identifiant admin : ")).trim();
  if (!isValidUsername(username)) {
    throw new Error(
      "Identifiant invalide (alphanumérique, _ -, 3 à 32 caractères).",
    );
  }
  const password = await prompt("Mot de passe : ", true);
  if (password.length < 8) {
    throw new Error("Mot de passe trop court (8 caractères minimum).");
  }
  const confirm = await prompt("Confirmer le mot de passe : ", true);
  if (password !== confirm) throw new Error("Les mots de passe diffèrent.");

  const hash = await bcrypt.hash(password, 12);
  await upsertAdmin(username, hash);
  console.log(`✓ Admin « ${username} » créé / mis à jour (role=ADMIN, actif).`);
}

main()
  .catch((err: Error) => {
    console.error(`✗ ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
