import { describe, expect, it } from "vitest";
import { areWeaponBasesCompatible, getSupportedWeaponFamily } from "./weapon-compatibility";

describe("weapon compatibility", () => {
  it("classifies the attached build's Engraved Greatsword as a two-handed sword", () => {
    expect(getSupportedWeaponFamily("Engraved Greatsword")).toBe("two-handed-sword");
  });

  it("allows two-handed sword replacements and rejects wands", () => {
    expect(areWeaponBasesCompatible("Engraved Greatsword", "Exquisite Blade")).toBe(true);
    expect(areWeaponBasesCompatible("Engraved Greatsword", "Vaal Greatsword")).toBe(true);
    expect(areWeaponBasesCompatible("Engraved Greatsword", "Prophecy Wand")).toBe(false);
  });

  it("continues to allow wand-to-wand upgrades", () => {
    expect(areWeaponBasesCompatible("Imbued Wand", "Prophecy Wand")).toBe(true);
  });
});
