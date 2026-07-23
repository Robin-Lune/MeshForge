// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapFilters } from "@/components/map/MapFilters";

const props = (over: Partial<Parameters<typeof MapFilters>[0]> = {}) => ({
  search: "",
  role: "",
  roleOptions: ["CLIENT", "ROUTER"],
  sinceH: 0,
  hopFilter: "all" as const,
  coverage: "off" as const,
  onSearchChange: () => {},
  onRoleChange: () => {},
  onSinceHChange: () => {},
  onHopFilterChange: () => {},
  onCoverageChange: () => {},
  ...over,
});

describe("MapFilters", () => {
  it("remonte la saisie de recherche", async () => {
    const onSearchChange = vi.fn();
    render(<MapFilters {...props({ onSearchChange })} />);
    await userEvent.type(screen.getByPlaceholderText(/Rechercher/), "abc");
    expect(onSearchChange).toHaveBeenCalledTimes(3);
    expect(onSearchChange).toHaveBeenLastCalledWith("c");
  });

  it("réserve une ligne lisible à la recherche sur mobile", () => {
    render(<MapFilters {...props()} />);
    expect(screen.getByPlaceholderText(/Rechercher/)).toHaveClass("w-full");
  });

  it("propose les rôles fournis, dans les deux variantes d'affichage", () => {
    render(<MapFilters {...props()} />);
    // Le composant duplique chaque select (mobile / desktop) via des classes
    // Tailwind : jsdom n'applique pas les media queries, les deux sont dans le
    // DOM. C'est attendu.
    expect(screen.getAllByRole("option", { name: "CLIENT" })).toHaveLength(2);
    expect(screen.getAllByRole("option", { name: "ROUTER" })).toHaveLength(2);
  });

  it("remonte le changement de rôle", async () => {
    const onRoleChange = vi.fn();
    render(<MapFilters {...props({ onRoleChange })} />);
    await userEvent.selectOptions(
      screen.getAllByRole("combobox")[0],
      "ROUTER",
    );
    expect(onRoleChange).toHaveBeenCalledWith("ROUTER");
  });

  it("convertit la fenêtre « vus depuis » en nombre", async () => {
    const onSinceHChange = vi.fn();
    render(<MapFilters {...props({ onSinceHChange })} />);
    const selects = screen.getAllByRole("combobox");
    await userEvent.selectOptions(selects[2], "168");
    expect(onSinceHChange).toHaveBeenCalledWith(168);
  });

  it("garde le select de couverture dans la variante desktop", () => {
    render(<MapFilters {...props()} />);
    const couverture = screen.getAllByLabelText("Couche de couverture");
    expect(couverture).toHaveLength(1);
    expect((couverture[0] as HTMLSelectElement).value).toBe("off");
    expect(couverture[0]).toHaveClass("hidden", "lg:block");
  });

  it("place le contrôle mobile et tablette sous les filtres sur toute la largeur", () => {
    render(<MapFilters {...props()} />);
    const filters = screen.getByRole("group", { name: "Filtres de nodes" });
    const responsiveCoverage = screen.getByLabelText(
      "Couche de couverture mobile et tablette",
    );

    expect(filters).not.toContainElement(responsiveCoverage);
    expect(responsiveCoverage).toHaveClass("w-full", "appearance-none");
    expect(responsiveCoverage.parentElement).toHaveClass(
      "w-full",
      "lg:hidden",
    );
  });

  it("applique directement le choix du dropdown mobile et tablette", async () => {
    const onCoverageChange = vi.fn();
    render(<MapFilters {...props({ onCoverageChange })} />);

    await userEvent.selectOptions(
      screen.getByLabelText("Couche de couverture mobile et tablette"),
      "snr",
    );

    expect(onCoverageChange).toHaveBeenCalledWith("snr");
  });

  it("reflète et signale visuellement la métrique mobile active", () => {
    render(<MapFilters {...props({ coverage: "gateways" })} />);
    const mobileCoverage = screen.getByLabelText(
      "Couche de couverture mobile et tablette",
    ) as HTMLSelectElement;
    expect(mobileCoverage.value).toBe("gateways");
    expect(mobileCoverage).toHaveClass(
      "border-emerald-400/60",
      "bg-emerald-800/95",
    );
  });

  it("remonte aussi le choix de métrique depuis le select desktop", async () => {
    const onCoverageChange = vi.fn();
    render(<MapFilters {...props({ onCoverageChange })} />);
    await userEvent.selectOptions(
      screen.getByLabelText("Couche de couverture"),
      "gateways",
    );
    expect(onCoverageChange).toHaveBeenCalledWith("gateways");
  });

  it("reflète la métrique active", () => {
    render(<MapFilters {...props({ coverage: "nodes" })} />);
    const sel = screen.getByLabelText(
      "Couche de couverture",
    ) as HTMLSelectElement;
    expect(sel.value).toBe("nodes");
  });

  it("câble AUSSI la variante desktop de chaque sélecteur", async () => {
    // Les trois filtres de nodes ont une variante mobile et desktop. La
    // couverture garde le select desktop et un contrôle mobile séparé.
    const onRoleChange = vi.fn();
    const onSinceHChange = vi.fn();
    const onHopFilterChange = vi.fn();
    const onCoverageChange = vi.fn();
    render(
      <MapFilters
        {...props({
          onRoleChange,
          onSinceHChange,
          onHopFilterChange,
          onCoverageChange,
        })}
      />,
    );
    const selects = screen.getAllByRole("combobox");
    await userEvent.selectOptions(selects[1], "CLIENT"); // rôle, desktop
    await userEvent.selectOptions(selects[3], "24"); // vus depuis, desktop
    await userEvent.selectOptions(selects[5], "2"); // hops, desktop
    await userEvent.selectOptions(
      screen.getByLabelText("Couche de couverture"),
      "snr",
    );
    expect(onRoleChange).toHaveBeenCalledWith("CLIENT");
    expect(onSinceHChange).toHaveBeenCalledWith(24);
    expect(onHopFilterChange).toHaveBeenCalledWith("2");
    expect(onCoverageChange).toHaveBeenCalledWith("snr");
  });

  it("remonte le filtre de hops", async () => {
    const onHopFilterChange = vi.fn();
    render(<MapFilters {...props({ onHopFilterChange })} />);
    const selects = screen.getAllByRole("combobox");
    await userEvent.selectOptions(selects[4], "3plus");
    expect(onHopFilterChange).toHaveBeenCalledWith("3plus");
  });
});
