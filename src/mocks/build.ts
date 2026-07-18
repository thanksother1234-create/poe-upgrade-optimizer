import { Build, Equipment, Item } from "@/models";

const item = (id: string, name: string, baseType: string, modifiers: Item["modifiers"] = []): Item => ({ id, name, baseType, rarity: "rare", modifiers });
export const mockEquipment: Equipment = {
  weapon: item("eq-weapon", "Rift Bite", "Imbued Wand", [{ label: "82% increased spell damage", value: 82 }]),
  offhand: item("eq-offhand", "Fate Shelter", "Titanium Spirit Shield"),
  helmet: item("eq-helmet", "Gale Visage", "Hubris Circlet"), bodyArmour: item("eq-body", "Viper Mantle", "Vaal Regalia"),
  gloves: item("eq-gloves", "Rune Hold", "Sorcerer Gloves"), boots: item("eq-boots", "Bramble Pace", "Two-Toned Boots"),
  amulet: item("eq-amulet", "Doom Beads", "Citrine Amulet"), ring1: item("eq-ring1", "Storm Loop", "Amethyst Ring"),
  ring2: item("eq-ring2", "Havoc Circle", "Opal Ring"), belt: item("eq-belt", "Ghoul Tether", "Stygian Vise"),
};
export const mockBuild: Build = {
  id: "mock-hexblast-01",
  character: { name: "NyxThePatient", className: "Shadow", ascendancy: "Saboteur", level: 94, mainSkill: "Hexblast Mine", league: "Mercenaries" },
  equipment: mockEquipment,
  metrics: { totalDps: 12400000, effectiveHitPool: 68500, physicalMaxHit: 18200, elementalMaxHit: 44200, chaosMaxHit: 21400, life: 4218, energyShield: 612, armour: 13800, evasion: 21900, spellSuppression: 88, fireResistance: 75, coldResistance: 75, lightningResistance: 68, chaosResistance: 22 },
};
