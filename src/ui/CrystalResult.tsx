import { formulas, recipes } from "../game/chemistry";
import type { Game } from "../game/game";

export function CrystalResult({ made }: Pick<Game, "made">) {
  const total = Object.values(made).reduce((sum, n) => sum + n, 0);
  return (
    <section className="crystalResult" aria-label="結晶の合成結果">
      <h3>
        合成した結晶 <strong>{total.toLocaleString()}個</strong>
      </h3>
      {total > 0 && (
        <dl>
          {recipes
            .filter((r) => made[r.product])
            .map((r) => (
              <div key={r.product}>
                <dt>{formulas[r.product]}</dt>
                <dd>
                  {made[r.product]}
                  {r.tier === 4 ? "組" : "個"}
                </dd>
              </div>
            ))}
        </dl>
      )}
      {!!(made.MixedX || made.MixedM) && <small>混晶は2式量で1個に集計</small>}
    </section>
  );
}
