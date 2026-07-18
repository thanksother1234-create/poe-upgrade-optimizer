import { EquipmentSlot, Item } from "@/models";
import { getSupportedWeaponFamily } from "@/services/trade/weapon-compatibility";

const ITEM_CLASS_CATEGORIES: Record<string, string> = {
  wand: "weapon.wand",
  wands: "weapon.wand",
  bow: "weapon.bow",
  bows: "weapon.bow",
  claw: "weapon.claw",
  claws: "weapon.claw",
  dagger: "weapon.dagger",
  daggers: "weapon.dagger",
  "rune dagger": "weapon.runedagger",
  "rune daggers": "weapon.runedagger",
  "one hand axe": "weapon.oneaxe",
  "one hand axes": "weapon.oneaxe",
  "one hand mace": "weapon.onemace",
  "one hand maces": "weapon.onemace",
  "one hand sword": "weapon.onesword",
  "one hand swords": "weapon.onesword",
  "thrusting one hand sword": "weapon.rapier",
  "thrusting one hand swords": "weapon.rapier",
  sceptre: "weapon.sceptre",
  sceptres: "weapon.sceptre",
  staff: "weapon.staff",
  staves: "weapon.staff",
  warstaff: "weapon.warstaff",
  warstaves: "weapon.warstaff",
  "two hand axe": "weapon.twoaxe",
  "two hand axes": "weapon.twoaxe",
  "two hand mace": "weapon.twomace",
  "two hand maces": "weapon.twomace",
  "two hand sword": "weapon.twosword",
  "two hand swords": "weapon.twosword",
  "fishing rod": "weapon.rod",
  "fishing rods": "weapon.rod",
  shield: "armour.shield",
  shields: "armour.shield",
  quiver: "accessory.quiver",
  quivers: "accessory.quiver",
};

const SLOT_CATEGORIES: Partial<Record<EquipmentSlot, string>> = {
  helmet: "armour.helmet",
  bodyArmour: "armour.chest",
  gloves: "armour.gloves",
  boots: "armour.boots",
  amulet: "accessory.amulet",
  ring1: "accessory.ring",
  ring2: "accessory.ring",
  belt: "accessory.belt",
};

export function getTradeCategory(slot: EquipmentSlot, item: Item): string | null {
  const slotCategory = SLOT_CATEGORIES[slot];
  if (slotCategory) return slotCategory;

  const itemClass = item.itemClass?.trim().toLowerCase();
  if (itemClass && ITEM_CLASS_CATEGORIES[itemClass]) return ITEM_CLASS_CATEGORIES[itemClass];

  const baseType = item.baseType.trim().toLowerCase();
  if (slot === "offhand" && /\bshield\b/.test(baseType)) return "armour.shield";
  if (slot === "offhand" && /\bquiver\b/.test(baseType)) return "accessory.quiver";

  if (slot === "weapon") {
    const legacyFamily = getSupportedWeaponFamily(item.baseType);
    if (legacyFamily === "wand") return "weapon.wand";
    if (legacyFamily === "two-handed-sword") return "weapon.twosword";
  }

  return null;
}
