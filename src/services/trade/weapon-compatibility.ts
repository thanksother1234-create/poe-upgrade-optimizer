export type SupportedWeaponFamily = "wand" | "two-handed-sword";

const TWO_HANDED_SWORD_BASES = new Set([
  "banishing blade", "bastard sword", "blasting blade", "butcher sword", "corroded blade",
  "curved blade", "engraved greatsword", "etched greatsword", "exquisite blade", "ezomyte blade",
  "footman sword", "headman's sword", "highland blade", "infernal sword", "keyblade", "lion sword",
  "lithe blade", "longsword", "ornate sword", "reaver sword", "rebuking blade", "spectral sword",
  "tiger sword", "vaal greatsword", "wraith sword",
]);

const normalizeBaseType = (baseType: string) => baseType.trim().toLowerCase();

export function getSupportedWeaponFamily(baseType: string): SupportedWeaponFamily | null {
  const normalized = normalizeBaseType(baseType);
  if (/\bwand\b/.test(normalized)) return "wand";
  if (TWO_HANDED_SWORD_BASES.has(normalized)) return "two-handed-sword";
  return null;
}

export function areWeaponBasesCompatible(currentBaseType: string, candidateBaseType: string): boolean {
  const current = normalizeBaseType(currentBaseType);
  const candidate = normalizeBaseType(candidateBaseType);
  if (!current || !candidate) return false;
  if (current === candidate) return true;

  const currentFamily = getSupportedWeaponFamily(currentBaseType);
  const candidateFamily = getSupportedWeaponFamily(candidateBaseType);
  return currentFamily !== null && currentFamily === candidateFamily;
}
