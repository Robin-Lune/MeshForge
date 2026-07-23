// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Robin Lebon — La Forge Numérique
import { fileURLToPath } from "node:url";
import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  resolve: {
    // Aligne vitest sur les `paths` de tsconfig.json. Sans cet alias, `@/…`
    // ne fonctionne dans les tests que pour les imports de TYPE (effacés à la
    // compilation) : un import de VALEUR échoue à la résolution, ce qui obligeait
    // à écrire des chemins relatifs dans les modules testés.
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    // ENVIRONNEMENT NODE PAR DÉFAUT, et jsdom en opt-in fichier par fichier via
    // le commentaire `// @vitest-environment jsdom` en tête de fichier.
    // Volontaire : la très grande majorité des tests porte sur de la logique
    // pure, et les faire tourner dans un DOM simulé les ralentirait sans rien
    // apporter. Le coût du DOM n'est payé que par les tests qui en ont besoin.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // `exclude` REMPLACE la valeur par défaut : on repart donc de celle-ci.
    exclude: [...configDefaults.exclude, ".next/**", "_bmad/**", "coverage/**"],

    coverage: {
      // v8 plutôt qu'istanbul : depuis que le fournisseur v8 embarque
      // `ast-v8-to-istanbul`, il remappe la couverture via l'AST et détecte
      // exactement les mêmes branches qu'istanbul (vérifié sur ce dépôt : 43
      // fichiers comparés, aucun écart), sans le coût de l'instrumentation.
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "app/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
        "lib/**/*.{ts,tsx}",
        "src/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/*.test.*",
        "**/*.d.ts",
        // Fichiers de cadrage Next sans logique propre.
        "app/**/layout.tsx",
        "app/**/loading.tsx",
        "app/**/not-found.tsx",
      ],

      // PIÈGE À CONNAÎTRE : un fichier sans aucune branche affiche « 100 % de
      // branches » (0/0). Trois fichiers non testés du dépôt sont dans ce cas.
      // Un seuil qui ne porterait QUE sur les branches les laisserait donc
      // passer : le seuil sur les statements est celui qui mord vraiment.
      //
      // Valeurs posées en CLIQUET, légèrement sous le niveau mesuré à
      // l'introduction de cette configuration. Elles ne doivent que MONTER —
      // leur rôle est d'interdire la régression, pas d'attester une cible
      // atteinte. L'objectif de 100 % se construit module par module.
      // Historique du cliquet — ces valeurs ne doivent que MONTER :
      //   introduction de la configuration : 31,31 / 36,97 / 33,44 / 31,24
      //   couche de couverture testée      : 35,66 / 40,74 / 37,57 / 35,92
      thresholds: {
        statements: 34,
        branches: 39,
        functions: 36,
        lines: 34,
      },
    },
  },
});
