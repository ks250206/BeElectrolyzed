export const formulas = {
  Li: "Li",
  Li6: "⁶Li",
  S: "S",
  Ge: "Ge",
  Sn: "Sn",
  P: "P",
  Cl: "Cl",
  Br: "Br",
  Li2S: "Li₂S",
  GeS2: "GeS₂",
  SnS2: "SnS₂",
  P2S5: "P₂S₅",
  LiCl: "LiCl",
  LiBr: "LiBr",
  Li3PS4: "Li₃PS₄",
  Li4GeS4: "Li₄GeS₄",
  Li4SnS4: "Li₄SnS₄",
  LGPS: "Li₁₀GeP₂S₁₂",
  LSPS: "Li₁₀SnP₂S₁₂",
  LPSCl: "Li₆PS₅Cl",
  LPSBr: "Li₆PS₅Br",
  MixedX: "Li₆PS₅Cl₀.₅Br₀.₅",
  MixedM: "Li₁₀Ge₀.₅Sn₀.₅P₂S₁₂",
} as const;
export type Product = keyof typeof formulas;
export type Tier = 1 | 2 | 3 | 4;
export type Recipe = {
  product: Product;
  needs: Partial<Record<Product, number>>;
  count: number;
  tier: Tier;
  points: number;
};
function recipe(
  product: Product,
  needs: Recipe["needs"],
  tier: Tier,
  points: number,
  count = 1,
): Recipe {
  return { product, needs, tier, points, count };
}
export const recipes = [
  recipe("MixedX", { LPSCl: 1, LPSBr: 1 }, 4, 8000, 2),
  recipe("MixedM", { LGPS: 1, LSPS: 1 }, 4, 12000, 2),
  recipe("LGPS", { Li4GeS4: 1, Li3PS4: 2 }, 3, 1800),
  recipe("LSPS", { Li4SnS4: 1, Li3PS4: 2 }, 3, 1800),
  recipe("LPSCl", { Li3PS4: 1, Li2S: 1, LiCl: 1 }, 3, 1000),
  recipe("LPSBr", { Li3PS4: 1, Li2S: 1, LiBr: 1 }, 3, 1000),
  recipe("Li3PS4", { Li2S: 3, P2S5: 1 }, 2, 80, 2),
  recipe("Li4GeS4", { Li2S: 2, GeS2: 1 }, 2, 80),
  recipe("Li4SnS4", { Li2S: 2, SnS2: 1 }, 2, 80),
  recipe("P2S5", { P: 2, S: 5 }, 1, 20),
  recipe("GeS2", { Ge: 1, S: 2 }, 1, 20),
  recipe("SnS2", { Sn: 1, S: 2 }, 1, 20),
  recipe("LiCl", { Li: 1, Cl: 1 }, 1, 20),
  recipe("LiBr", { Li: 1, Br: 1 }, 1, 20),
  recipe("Li2S", { Li: 2, S: 1 }, 1, 20),
];
export const byProduct = new Map(recipes.map((r) => [r.product, r]));
export function collectible(k: Product) {
  return (byProduct.get(k)?.tier ?? 0) >= 3;
}
export function collectionValue(k: Product) {
  const r = byProduct.get(k);
  if (!r || r.tier < 3) return 0;
  if (r.tier === 3) return r.points;
  return (
    r.points +
    Object.entries(r.needs).reduce(
      (sum, [input, n]) => sum + n * byProduct.get(input as Product)!.points,
      0,
    )
  );
}
export const canonical = (k: Product) => (k === "Li6" ? "Li" : k);
export const equation = (r: Recipe) =>
  Object.entries(r.needs)
    .map(([k, n]) => (n === 1 ? "" : n + " ") + formulas[k as Product])
    .join(" + ") +
  " → " +
  (r.count > 1 ? r.count + " " : "") +
  formulas[r.product];
export const shape = (tier: Tier) => ["", "2×1", "2×2", "2×3", "3×3・4×2・2×4"][tier];
