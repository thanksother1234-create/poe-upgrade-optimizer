import { TradeItem } from "@/models";

const itemImages: Record<string, string> = {
  "Prophecy Wand": "/items/prophecy-wand.png",
  "Imbued Wand": "/items/imbued-wand.png",
  "Opal Wand": "/items/opal-wand.png",
  "Amethyst Ring": "/items/amethyst-ring.png",
  "Opal Ring": "/items/opal-ring.png",
  "Two-Toned Boots": "/items/two-toned-boots.png",
  "Sorcerer Boots": "/items/sorcerer-boots.png",
  "Slink Boots": "/items/slink-boots.png",
  "Citrine Amulet": "/items/citrine-amulet.png",
  "Turquoise Amulet": "/items/turquoise-amulet.png",
  "Onyx Amulet": "/items/onyx-amulet.png",
};

const trade = (id: string, slot: TradeItem["slot"], name: string, baseType: string, chaos: number, metricChanges: TradeItem["metricChanges"], labels: string[]): TradeItem => ({
  id, slot, name, baseType, rarity: "rare", imageUrl: itemImages[baseType], price: { amount: chaos, currency: "chaos" }, metricChanges,
  modifiers: labels.map((label, index) => ({ label, value: index + 1 })),
});
export const mockTradeItems: TradeItem[] = [
  trade("w1", "weapon", "Tempest Needle", "Prophecy Wand", 720, { totalDps: 2480000, effectiveHitPool: 1200 }, ["38% increased Spell Damage", "+1 to Level of all Spell Skill Gems", "112% increased Spell Damage", "25% increased Cast Speed", "+35% to Global Critical Strike Multiplier", "Trigger a Socketed Spell when you Use a Skill"]),
  trade("w2", "weapon", "Miracle Song", "Imbued Wand", 310, { totalDps: 2050000, chaosMaxHit: 700 }, ["35% increased Spell Damage", "+1 to Level of all Chaos Spell Skill Gems", "91% increased Spell Damage", "25% increased Cast Speed", "+24% to Chaos Damage over Time Multiplier", "+31 to maximum Mana"]),
  trade("w3", "weapon", "Dusk Branch", "Opal Wand", 900, { totalDps: 1100000 }, ["Adds 18 to 44 Cold Damage to Spells and Attacks", "86% increased Spell Damage", "19% increased Cast Speed", "+29% to Global Critical Strike Multiplier", "Gain 14% of Non-Chaos Damage as extra Chaos Damage", "+33 to Intelligence"]),
  trade("w4", "weapon", "Ash Needle", "Imbued Wand", 80, { totalDps: -120000 }, ["34% increased Spell Damage", "Adds 42 to 78 Fire Damage to Spells", "12% increased Cast Speed", "+34 to maximum Mana"]),
  trade("r1", "ring1", "Loath Turn", "Amethyst Ring", 285, { totalDps: 460000, effectiveHitPool: 8800, lightningResistance: 9, chaosResistance: 24, life: 104 }, ["+23% to Chaos Resistance", "+104 to maximum Life", "+41% to Fire Resistance", "+38% to Cold Resistance", "+24% to Chaos Resistance", "17% increased Damage"]),
  trade("r2", "ring1", "Gloom Circle", "Opal Ring", 540, { totalDps: 1120000, effectiveHitPool: 2200, lightningResistance: 7 }, ["25% increased Elemental Damage", "31% increased Spell Damage", "+51 to maximum Life", "+42% to Cold Resistance", "+37% to Lightning Resistance", "Non-Channelling Skills have -7 to Total Mana Cost"]),
  trade("r3", "ring2", "Phoenix Coil", "Amethyst Ring", 190, { totalDps: 350000, effectiveHitPool: 6400, chaosResistance: 18, life: 88 }, ["+22% to Chaos Resistance", "+88 to maximum Life", "+43% to Fire Resistance", "+39% to Lightning Resistance", "+18% to Chaos Resistance", "15% increased Chaos Damage"]),
  trade("r4", "ring2", "Bitter Gyre", "Opal Ring", 760, { totalDps: 650000, effectiveHitPool: 600 }, ["24% increased Elemental Damage", "22% increased Spell Damage", "+46 to maximum Life", "+44% to Fire Resistance", "14% increased Cast Speed"]),
  trade("b1", "boots", "Victory Pace", "Two-Toned Boots", 220, { effectiveHitPool: 10500, physicalMaxHit: 2400, lightningResistance: 12, spellSuppression: 12, life: 96 }, ["+11% to Fire and Lightning Resistances", "+96 to maximum Life", "30% increased Movement Speed", "+12% chance to Suppress Spell Damage", "+39% to Cold Resistance", "+35% to Lightning Resistance"]),
  trade("b2", "boots", "Dragon Track", "Sorcerer Boots", 610, { totalDps: 320000, effectiveHitPool: 6200, elementalMaxHit: 1800 }, ["+152 to maximum Energy Shield", "+82 to maximum Life", "30% increased Movement Speed", "+41% to Fire Resistance", "+37% to Cold Resistance", "You have Tailwind if you have dealt a Critical Strike Recently"]),
  trade("b3", "boots", "Foe Slippers", "Slink Boots", 45, { evasion: 300, lightningResistance: -8 }, ["+238 to Evasion Rating", "+43 to maximum Life", "15% increased Movement Speed", "+27% to Fire Resistance"]),
  trade("a1", "amulet", "Rune Locket", "Citrine Amulet", 430, { totalDps: 1680000, effectiveHitPool: 3500, chaosResistance: 12 }, ["+24 to Strength and Dexterity", "+1 to Level of all Chaos Skill Gems", "+31% to Chaos Damage over Time Multiplier", "+74 to maximum Life", "+38% to Fire Resistance", "+12% to Chaos Resistance"]),
  trade("a2", "amulet", "Pandemonium Charm", "Turquoise Amulet", 250, { totalDps: 1050000, effectiveHitPool: 6100, life: 76, lightningResistance: 10 }, ["+22 to Dexterity and Intelligence", "+1 to Level of all Spell Skill Gems", "+76 to maximum Life", "+41% to Cold Resistance", "+40% to Lightning Resistance", "18% increased Cast Speed"]),
  trade("a3", "amulet", "Dire Noose", "Onyx Amulet", 800, { totalDps: 900000, effectiveHitPool: 1500 }, ["+16 to all Attributes", "+38% to Global Critical Strike Multiplier", "27% increased Spell Damage", "+65 to maximum Life", "+34% to Chaos Resistance"]),
];
