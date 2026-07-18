import { EquipmentSlot, Item } from "@/models";
import { getSupportedWeaponFamily } from "@/services/trade/weapon-compatibility";

const ITEM_CLASS_CATEGORIES: Record<string, string> = {
  wands: "weapon.wand",
  bows: "weapon.bow",
  claws: "weapon.claw",
  daggers: "weapon.dagger",
  "rune daggers": "weapon.runedagger",
  "one hand axes": "weapon.oneaxe",
  "one hand maces": "weapon.onemace",
  "one hand swords": "weapon.onesword",
  "thrusting one hand swords": "weapon.rapier",
  sceptres: "weapon.sceptre",
  staves: "weapon.staff",
  warstaves: "weapon.warstaff",
  "two hand axes": "weapon.twoaxe",
  "two hand maces": "weapon.twomace",
  "two hand swords": "weapon.twosword",
  "fishing rods": "weapon.rod",
  shields: "armour.shield",
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

  if (slot === "weapon") {
    const legacyFamily = getSupportedWeaponFamily(item.baseType);
    if (legacyFamily === "wand") return "weapon.wand";
    if (legacyFamily === "two-handed-sword") return "weapon.twosword";
  }

  return null;
}
