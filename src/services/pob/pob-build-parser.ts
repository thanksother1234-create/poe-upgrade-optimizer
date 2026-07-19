import { Build, BuildMetrics, Equipment, EquipmentSlot, Item, ItemModifier, ItemRarity, KalandrasTouchSetup, RingSlot, SkillGroup } from "@/models";

const SLOT_MAP: Record<string, EquipmentSlot> = {
  "Weapon 1": "weapon", "Weapon 2": "offhand", Helmet: "helmet", "Body Armour": "bodyArmour",
  Gloves: "gloves", Boots: "boots", Amulet: "amulet", "Ring 1": "ring1", "Ring 2": "ring2", Belt: "belt",
};

const EMPTY_ITEMS: Record<EquipmentSlot, [string, string]> = {
  weapon: ["Empty Weapon", "No item equipped"], offhand: ["Empty Offhand", "No item equipped"],
  helmet: ["Empty Helmet", "No item equipped"], bodyArmour: ["Empty Body Armour", "No item equipped"],
  gloves: ["Empty Gloves", "No item equipped"], boots: ["Empty Boots", "No item equipped"],
  amulet: ["Empty Amulet", "No item equipped"], ring1: ["Empty Ring", "No item equipped"],
  ring2: ["Empty Ring", "No item equipped"], belt: ["Empty Belt", "No item equipped"],
};

const decodeEntities = (value: string) => value
  .replaceAll("&apos;", "'").replaceAll("&quot;", '"').replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">").replaceAll("&amp;", "&");

const attributes = (source: string) => Object.fromEntries(
  [...source.matchAll(/([\w:.-]+)="([^"]*)"/g)].map((match) => [match[1], decodeEntities(match[2])]),
);

const number = (value: string | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

function extractStats(xml: string): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const match of xml.matchAll(/<PlayerStat\s+([^>]+?)\s*\/>/g)) {
    const attrs = attributes(match[1]);
    if (attrs.stat) stats[attrs.stat] = number(attrs.value);
  }
  return stats;
}

function parseModifiers(lines: string[]): ItemModifier[] {
  const implicitIndex = lines.findIndex((line) => line.startsWith("Implicits:"));
  if (implicitIndex < 0) return [];
  return lines.slice(implicitIndex + 1)
    .filter((line) => line && !line.startsWith("Selected Variant:") && !line.startsWith("Selected Alt Variant:"))
    .map((label) => ({ label: label.replace(/^\{[^}]+\}/, ""), value: number(label.match(/[+-]?\d+(?:\.\d+)?/)?.[0]) }));
}

function parseItems(xml: string): Map<string, Item> {
  const items = new Map<string, Item>();
  for (const match of xml.matchAll(/<Item\s+([^>]*\bid="[^"]+"[^>]*)>([\s\S]*?)<\/Item>/g)) {
    const id = attributes(match[1]).id;
    const rawText = decodeEntities(match[2].replace(/<[^>]+>/g, ""));
    const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const itemClass = lines.find((line) => line.startsWith("Item Class:"))?.slice("Item Class:".length).trim();
    const rarityIndex = lines.findIndex((line) => /^Rarity:\s*\w+/i.test(line));
    const rarityMatch = lines[rarityIndex]?.match(/^Rarity:\s*(\w+)/i);
    const rarity = (rarityMatch?.[1]?.toLowerCase() ?? "normal") as ItemRarity;
    const displayStart = rarityIndex >= 0 ? rarityIndex + 1 : 0;
    const displayLines = rarity === "normal" ? lines.slice(displayStart, displayStart + 1) : lines.slice(displayStart, displayStart + 2);
    const name = displayLines[0] ?? "Unknown Item";
    const baseType = displayLines[1] ?? displayLines[0] ?? "Unknown Base";
    items.set(id, { id: `pob-item-${id}`, name, baseType, itemClass, rarity, modifiers: parseModifiers(lines), rawText: rawText.trim() });
  }
  return items;
}

function activeItemSetXml(xml: string): string {
  const itemsTag = xml.match(/<Items\s+([^>]*)>/)?.[1] ?? "";
  const activeId = attributes(itemsTag).activeItemSet ?? "1";
  for (const match of xml.matchAll(/<ItemSet\s+([^>]*)>([\s\S]*?)<\/ItemSet>/g)) {
    if (attributes(match[1]).id === activeId) return match[2];
  }
  return "";
}

function parseEquipment(xml: string, items: Map<string, Item>): Equipment {
  const equipment = Object.fromEntries(Object.entries(EMPTY_ITEMS).map(([slot, [name, baseType]]) => [
    slot, { id: `empty-${slot}`, name, baseType, rarity: "normal", modifiers: [] },
  ])) as unknown as Equipment;
  const itemSet = activeItemSetXml(xml);
  for (const match of itemSet.matchAll(/<Slot\s+([^>]+?)\s*\/>/g)) {
    const attrs = attributes(match[1]);
    const slot = SLOT_MAP[attrs.name];
    const item = items.get(attrs.itemId);
    if (slot && item && attrs.itemId !== "0") equipment[slot] = item;
  }
  return equipment;
}

const isKalandrasTouch = (item: Item) => item.name.toLowerCase().replace(/[’']/g, "") === "kalandras touch";

function applyKalandrasTouchCopy(equipment: Equipment): KalandrasTouchSetup | undefined {
  const ringSlots: RingSlot[] = ["ring1", "ring2"];
  const touchSlot = ringSlots.find((slot) => isKalandrasTouch(equipment[slot]));
  if (!touchSlot) return undefined;

  const sourceSlot: RingSlot = touchSlot === "ring1" ? "ring2" : "ring1";
  const sourceRing = equipment[sourceSlot];
  if (sourceRing.id.startsWith("empty-") || isKalandrasTouch(sourceRing)) return undefined;

  equipment[touchSlot] = {
    ...sourceRing,
    id: `${sourceRing.id}-kalandras-copy-${touchSlot}`,
    modifiers: sourceRing.modifiers.map((modifier) => ({ ...modifier })),
  };
  return { touchSlot, sourceSlot };
}

function parseSkillGroups(xml: string, mainGroup: number): SkillGroup[] {
  const skillsTag = xml.match(/<Skills\s+([^>]*)>/)?.[1] ?? "";
  const activeSet = attributes(skillsTag).activeSkillSet ?? "1";
  const skillSet = [...xml.matchAll(/<SkillSet\s+([^>]*)>([\s\S]*?)<\/SkillSet>/g)]
    .find((match) => attributes(match[1]).id === activeSet)?.[2] ?? "";
  return [...skillSet.matchAll(/<Skill\b([^>]*)>([\s\S]*?)<\/Skill>/g)].map((match, index) => {
    const skillAttrs = attributes(match[1]);
    const gems = [...match[2].matchAll(/<Gem\s+([^>]*?(?:nameSpec|skillId)="[^"]+"[^>]*)\/>/g)].map((gemMatch) => {
      const gem = attributes(gemMatch[1]);
      const name = gem.nameSpec ?? gem.skillId ?? "Unknown gem";
      return {
        name,
        level: number(gem.level),
        quality: number(gem.quality),
        isSupport: /^Support/i.test(gem.skillId ?? "") || / Support$/i.test(name),
        enabled: gem.enabled !== "false",
      };
    }).filter((gem) => gem.enabled);
    const isMain = index === Math.max(0, mainGroup - 1);
    return {
      id: skillAttrs.uuid ?? `skill-group-${index + 1}`,
      label: skillAttrs.label || gems.find((gem) => !gem.isSupport)?.name || `Socket group ${index + 1}`,
      ...(skillAttrs.slot ? { slot: skillAttrs.slot } : {}),
      isMain,
      gems,
    };
  }).filter((group) => group.gems.length > 0 && attributes(skillSet).enabled !== "false");
}

function parseCharacterName(xml: string): string {
  const importAttrs = attributes(xml.match(/<Import\s+([^>]+?)\s*\/>/)?.[1] ?? "");
  if (!importAttrs.importLink) return "Imported Build";
  try {
    const segment = new URL(importAttrs.importLink).pathname.split("/").filter(Boolean).at(-1);
    return segment ? decodeURIComponent(segment) : "Imported Build";
  } catch { return "Imported Build"; }
}

export function parsePobXml(xml: string): Build {
  if (!xml.includes("<PathOfBuilding")) throw new Error("This does not appear to be a valid Path of Building export.");
  const buildAttrs = attributes(xml.match(/<Build\s+([^>]*)>/)?.[1] ?? "");
  const stats = extractStats(xml);
  const dpsMetric = stats.FullDPS > 0 ? "FullDPS" : stats.CombinedDPS > 0 ? "CombinedDPS" : "TotalDPS";
  const elementalHits = [stats.FireMaximumHitTaken, stats.ColdMaximumHitTaken, stats.LightningMaximumHitTaken].filter((value) => value > 0);
  const metrics: BuildMetrics = {
    totalDps: stats.FullDPS || stats.CombinedDPS || stats.TotalDPS || 0,
    effectiveHitPool: stats.TotalEHP || 0,
    physicalMaxHit: stats.PhysicalMaximumHitTaken || 0,
    elementalMaxHit: elementalHits.length ? Math.min(...elementalHits) : 0,
    chaosMaxHit: stats.ChaosMaximumHitTaken || 0,
    life: stats.Life || 0, energyShield: stats.EnergyShield || 0,
    armour: stats.Armour || 0, evasion: stats.Evasion || 0,
    spellSuppression: stats.SpellSuppressionChance || stats.SpellSuppression || 0,
    fireResistance: stats.FireResist || stats.FireResistance || 0,
    coldResistance: stats.ColdResist || stats.ColdResistance || 0,
    lightningResistance: stats.LightningResist || stats.LightningResistance || 0,
    chaosResistance: stats.ChaosResist || stats.ChaosResistance || 0,
  };
  const name = parseCharacterName(xml);
  const equipment = parseEquipment(xml, parseItems(xml));
  const kalandrasTouch = applyKalandrasTouchCopy(equipment);
  const mainSocketGroup = number(buildAttrs.mainSocketGroup) || 1;
  const skillGroups = parseSkillGroups(xml, mainSocketGroup);
  const mainSkill = skillGroups.find((group) => group.isMain)?.gems.find((gem) => !gem.isSupport)?.name
    ?? skillGroups[0]?.gems[0]?.name
    ?? "Unknown skill";
  return {
    id: `pob-${name}-${xml.length}`,
    character: {
      name, className: buildAttrs.className ?? "Unknown class", ascendancy: buildAttrs.ascendClassName ?? "",
      level: number(buildAttrs.level), mainSkill, league: "Imported PoB",
    },
    equipment, metrics, sourceXml: xml, dpsMetric, skillGroups,
    ...(kalandrasTouch ? { kalandrasTouch } : {}),
  };
}

export async function decodePobCode(code: string): Promise<string> {
  const cleaned = code.trim();
  if (cleaned.startsWith("<")) return cleaned;
  if (!/^[A-Za-z0-9_\-+/=\s]+$/.test(cleaned)) throw new Error("The PoB export code contains invalid characters.");
  const normalized = cleaned.replace(/\s/g, "").replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    return await new Response(stream).text();
  } catch {
    throw new Error("Unable to decode this PoB export. Confirm it was copied from Path of Building's Export tab.");
  }
}
