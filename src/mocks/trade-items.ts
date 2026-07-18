import { TradeItem } from "@/models";

const trade = (id: string, slot: TradeItem["slot"], name: string, baseType: string, chaos: number, metricChanges: TradeItem["metricChanges"], labels: string[]): TradeItem => ({
  id, slot, name, baseType, rarity: "rare", price: { amount: chaos, currency: "chaos" }, metricChanges,
  modifiers: labels.map((label, index) => ({ label, value: index + 1 })),
});
export const mockTradeItems: TradeItem[] = [
  trade("w1", "weapon", "Tempest Needle", "Prophecy Wand", 720, { totalDps: 2480000, effectiveHitPool: 1200 }, ["+1 to all spell skill gems", "112% increased spell damage"]),
  trade("w2", "weapon", "Miracle Song", "Imbued Wand", 310, { totalDps: 2050000, chaosMaxHit: 700 }, ["+1 to chaos spell skill gems", "25% cast speed"]),
  trade("w3", "weapon", "Dusk Branch", "Opal Wand", 900, { totalDps: 1100000 }, ["86% spell damage", "19% cast speed"]),
  trade("w4", "weapon", "Ash Needle", "Imbued Wand", 80, { totalDps: -120000 }, ["Adds fire damage to spells"]),
  trade("r1", "ring1", "Loath Turn", "Amethyst Ring", 285, { totalDps: 460000, effectiveHitPool: 8800, lightningResistance: 9, chaosResistance: 24, life: 104 }, ["+24% chaos resistance", "+104 maximum life"]),
  trade("r2", "ring1", "Gloom Circle", "Opal Ring", 540, { totalDps: 1120000, effectiveHitPool: 2200, lightningResistance: 7 }, ["31% increased spell damage", "+7% lightning resistance"]),
  trade("r3", "ring2", "Phoenix Coil", "Amethyst Ring", 190, { totalDps: 350000, effectiveHitPool: 6400, chaosResistance: 18, life: 88 }, ["+88 maximum life", "+18% chaos resistance"]),
  trade("r4", "ring2", "Bitter Gyre", "Opal Ring", 760, { totalDps: 650000, effectiveHitPool: 600 }, ["22% increased spell damage"]),
  trade("b1", "boots", "Victory Pace", "Two-Toned Boots", 220, { effectiveHitPool: 10500, physicalMaxHit: 2400, lightningResistance: 12, spellSuppression: 12, life: 96 }, ["+12% spell suppression", "30% movement speed"]),
  trade("b2", "boots", "Dragon Track", "Sorcerer Boots", 610, { totalDps: 320000, effectiveHitPool: 6200, elementalMaxHit: 1800 }, ["Tailwind on critical strike", "+82 maximum life"]),
  trade("b3", "boots", "Foe Slippers", "Slink Boots", 45, { evasion: 300, lightningResistance: -8 }, ["15% movement speed"]),
  trade("a1", "amulet", "Rune Locket", "Citrine Amulet", 430, { totalDps: 1680000, effectiveHitPool: 3500, chaosResistance: 12 }, ["+1 to all chaos skill gems", "+12% chaos resistance"]),
  trade("a2", "amulet", "Pandemonium Charm", "Turquoise Amulet", 250, { totalDps: 1050000, effectiveHitPool: 6100, life: 76, lightningResistance: 10 }, ["+1 to all spell skill gems", "+76 maximum life"]),
  trade("a3", "amulet", "Dire Noose", "Onyx Amulet", 800, { totalDps: 900000, effectiveHitPool: 1500 }, ["Critical strike multiplier"]),
];
