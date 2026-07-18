import { describe, expect, it } from "vitest";
import { mockBuild } from "@/mocks/build";
import { mockTradeItems } from "@/mocks/trade-items";
import { Item } from "@/models";
import { estimateItemReplacement } from "./item-effect-estimator";

const modifier = (label: string) => ({ label, value: Number(label.match(/[+-]?\d+/)?.[0] ?? 0) });

const circleOfAnguish: Item = {
  id: "circle-of-anguish",
  name: "Circle of Anguish",
  baseType: "Ruby Ring",
  rarity: "unique",
  modifiers: [
    "14% increased Cold Damage",
    "+1 to Maximum Frenzy Charges",
    "+24 to Strength",
    "Adds 25 to 28 Fire Damage",
    "+22% to Fire Resistance",
    "+51% to Fire Resistance while affected by Herald of Ash",
    "Herald of Ash has 50% increased Buff Effect",
  ].map(modifier),
};

describe("item effect estimator", () => {
  it("does not treat spell damage as Flicker Strike damage", () => {
    const build = structuredClone(mockBuild);
    build.character.mainSkill = "Flicker Strike";
    build.metrics = { ...build.metrics, totalDps: 1_509_421, effectiveHitPool: 19_124, life: 2_936, energyShield: 0, armour: 3_733, evasion: 6_932, fireResistance: 75, coldResistance: 79, lightningResistance: 75, chaosResistance: 33 };
    build.equipment.ring1 = circleOfAnguish;
    const gloomCircle = mockTradeItems.find((item) => item.id === "r2");
    expect(gloomCircle).toBeDefined();

    const changes = estimateItemReplacement(build, "ring1", gloomCircle!);
    expect(changes.totalDps).toBeLessThan(0);
    expect(changes.effectiveHitPool / build.metrics.effectiveHitPool).toBeLessThan(0.03);
  });

  it("subtracts the equipped item's life before estimating defense", () => {
    const build = structuredClone(mockBuild);
    build.equipment.ring1 = { ...circleOfAnguish, modifiers: [modifier("+100 to maximum Life")] };
    const candidate = mockTradeItems.find((item) => item.id === "r2")!;
    const changes = estimateItemReplacement(build, "ring1", candidate);
    expect(changes.life).toBe(-49);
  });
});
