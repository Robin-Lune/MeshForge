// @vitest-environment jsdom
//
// Gabarit des tests de composant du dépôt : environnement jsdom en opt-in par le
// commentaire ci-dessus, rendu Testing Library, matchers jest-dom, simulation
// d'interaction, et import par l'alias `@/` en VALEUR.
//
// Les tests de logique pure restent en environnement node : ne mettre ce
// commentaire qu'en tête des fichiers qui ont réellement besoin d'un DOM.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapLegend } from "@/components/map/MapLegend";
import { FRESHNESS_STEPS } from "@/lib/nodeColor";
import { ROLE_BADGES } from "@/lib/nodeRole";
import type { CoverageSelection } from "@/types";

const props = (over: Partial<Parameters<typeof MapLegend>[0]> = {}) => ({
  open: true,
  onToggle: () => {},
  coverage: "off" as CoverageSelection,
  coverageError: false,
  clusters: false,
  ...over,
});

describe("MapLegend — légende de base", () => {
  it("affiche les entrées quand elle est ouverte", () => {
    render(<MapLegend {...props()} />);
    expect(screen.getByText("Gateway /1h")).toBeInTheDocument();
    expect(screen.getByText("Direct 0-hop")).toBeInTheDocument();
  });

  it("masque les entrées quand elle est fermée", () => {
    render(<MapLegend {...props({ open: false })} />);
    expect(screen.queryByText("Gateway /1h")).not.toBeInTheDocument();
  });

  it("documente TOUS les paliers de fraîcheur", () => {
    // Itère la source de vérité : un palier ajouté sans entrée de légende fait
    // échouer la suite.
    render(<MapLegend {...props()} />);
    expect(screen.getByText("Dernière réception")).toBeInTheDocument();
    for (const step of FRESHNESS_STEPS) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    }
  });

  it("décrit TOUTES les lettres de capsule produites", () => {
    // Les capsules sont aria-hidden et sans infobulle : la légende est leur
    // seul canal d'explication.
    render(<MapLegend {...props()} />);
    for (const badge of ROLE_BADGES) {
      expect(screen.getByText(badge.short)).toBeInTheDocument();
    }
  });

  it("décrit le compteur des passerelles et l'anneau", () => {
    render(<MapLegend {...props()} />);
    expect(screen.getByText("Gateway /1h")).toBeInTheDocument();
    expect(screen.getByText("Capté par ≥ 2 gateways")).toBeInTheDocument();
  });

  it("ne décrit pas de « node visible » générique", () => {
    // La couleur d'une pastille dépend de la fraîcheur : une entrée décrivant
    // un node « normal » n'aurait aucune couleur à montrer.
    render(<MapLegend {...props()} />);
    expect(screen.queryByText("Node visible")).not.toBeInTheDocument();
  });

  it("libelle le bouton selon l'état et expose aria-expanded", () => {
    const { unmount } = render(<MapLegend {...props()} />);
    const ouvert = screen.getByRole("button", {
      name: "Masquer la légende",
    });
    expect(ouvert).toHaveTextContent("Masquer la légende");
    expect(ouvert).toHaveAttribute("aria-expanded", "true");
    unmount();

    render(<MapLegend {...props({ open: false })} />);
    const ferme = screen.getByRole("button", { name: "Légende" });
    expect(ferme).toHaveTextContent("Légende");
    expect(ferme).toHaveAttribute("aria-expanded", "false");
  });

  it("remonte le clic sur le bouton", async () => {
    const onToggle = vi.fn();
    render(<MapLegend {...props({ onToggle })} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Masquer la légende" }),
    );
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("repart d'un document propre entre deux tests", () => {
    // Vérifie le cleanup de vitest.setup.ts : sans lui, les rendus précédents
    // s'accumuleraient.
    render(<MapLegend {...props()} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});

describe("MapLegend — section regroupements", () => {
  it("reste absente tant qu'aucun rond n'est à l'écran", () => {
    // Décrire une marque que la carte n'affiche pas est du bruit.
    render(<MapLegend {...props({ clusters: false })} />);
    expect(screen.queryByText("Regroupements")).not.toBeInTheDocument();
    expect(screen.queryByText("Nodes groupés")).not.toBeInTheDocument();
  });

  it("apparaît avec les ronds et décrit leurs deux états", () => {
    render(<MapLegend {...props({ clusters: true })} />);
    expect(screen.getByText("Regroupements")).toBeInTheDocument();
    expect(screen.getByText("Nodes groupés")).toBeInTheDocument();
    expect(screen.getByText("Dont 1 gateway")).toBeInTheDocument();
  });
});

describe("MapLegend — section couverture", () => {
  it("reste absente quand la couche est éteinte", () => {
    render(<MapLegend {...props({ coverage: "off" })} />);
    expect(screen.queryByText("Couverture radio")).not.toBeInTheDocument();
    expect(screen.queryByText(/Non exploré/)).not.toBeInTheDocument();
  });

  it("affiche l'échelle SNR pour la métrique qualité", () => {
    render(<MapLegend {...props({ coverage: "snr" })} />);
    expect(screen.getByText("Couverture radio")).toBeInTheDocument();
    expect(screen.getByText(/Bon lien/)).toBeInTheDocument();
    expect(screen.getByText(/Mesure inexploitable/)).toBeInTheDocument();
  });

  it("affiche l'échelle de redondance, libellée « depuis un même point »", () => {
    // Le libellé porte l'invariant sémantique : la valeur est le max par
    // transmission, PAS l'union des relais de la tuile. Un libellé vague
    // reconduirait le contresens que le correctif a éliminé.
    render(<MapLegend {...props({ coverage: "gateways" })} />);
    expect(
      screen.getByText("3 relais ou plus depuis un même point"),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 seul relais/)).toBeInTheDocument();
  });

  it("affiche l'échelle des émetteurs distincts", () => {
    render(<MapLegend {...props({ coverage: "nodes" })} />);
    expect(screen.getByText("3 émetteurs ou plus")).toBeInTheDocument();
    expect(screen.getByText("1 seul émetteur")).toBeInTheDocument();
  });

  it("affiche TOUJOURS « non exploré » quand la couche est active", () => {
    // Entrée essentielle : sans elle, une zone blanche se lit « pas de réseau »
    // alors qu'elle veut dire « aucune mesure attribuable ».
    for (const m of ["snr", "gateways", "nodes"] as const) {
      const { unmount } = render(<MapLegend {...props({ coverage: m })} />);
      expect(screen.getByText(/Non exploré/)).toBeInTheDocument();
      unmount();
    }
  });

  it("remplace l'échelle par un avertissement en cas d'échec de chargement", () => {
    // Une carte vide sur erreur ne doit jamais se lire « aucune mesure ».
    render(<MapLegend {...props({ coverage: "snr", coverageError: true })} />);
    expect(screen.getByText(/Données indisponibles/)).toBeInTheDocument();
    expect(screen.queryByText(/Bon lien/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Non exploré/)).not.toBeInTheDocument();
  });

  it("n'affiche pas l'avertissement si la couche est éteinte", () => {
    render(<MapLegend {...props({ coverage: "off", coverageError: true })} />);
    expect(screen.queryByText(/Données indisponibles/)).not.toBeInTheDocument();
  });
});
