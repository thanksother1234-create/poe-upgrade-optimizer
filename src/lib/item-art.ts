import { Item } from "@/models";
import itemArt from "@/data/item-art.json";

const LOCAL_BASE_ART: Record<string, string> = {
  "Amethyst Ring": "/items/amethyst-ring.png",
  "Citrine Amulet": "/items/citrine-amulet.png",
  "Imbued Wand": "/items/imbued-wand.png",
  "Onyx Amulet": "/items/onyx-amulet.png",
  "Opal Ring": "/items/opal-ring.png",
  "Opal Wand": "/items/opal-wand.png",
  "Prophecy Wand": "/items/prophecy-wand.png",
  "Slink Boots": "/items/slink-boots.png",
  "Sorcerer Boots": "/items/sorcerer-boots.png",
  "Turquoise Amulet": "/items/turquoise-amulet.png",
  "Two-Toned Boots": "/items/two-toned-boots.png",
};

interface ItemArtRecord { path: string; width: number; height: number }
interface ItemArtworkOptions { magicFlaskBase?: boolean }

const FLASK_BASE_TYPES = Object.keys(itemArt.bases)
  .filter((baseType) => baseType.endsWith(" Flask"))
  .sort((left, right) => right.length - left.length);

function poeCdnUrl(record: ItemArtRecord | undefined) {
  if (!record) return undefined;
  const encodedPath = record.path.split("/").map(encodeURIComponent).join("/");
  return `https://web.poecdn.com/image/${encodedPath}?scale=1&w=${record.width}&h=${record.height}`;
}

export function getMagicFlaskBaseType(item: Item): string | undefined {
  if (item.rarity !== "magic") return undefined;
  if (item.baseType.endsWith(" Flask") && item.baseType in itemArt.bases) return item.baseType;
  const itemName = ` ${item.name.toLowerCase()} `;
  return FLASK_BASE_TYPES.find((baseType) => itemName.includes(` ${baseType.toLowerCase()} `));
}

export function getItemArtworkCandidates(item: Item, options: ItemArtworkOptions = {}): string[] {
  if (item.id.startsWith("empty-") || item.baseType === "No item equipped") return [];

  const magicFlaskBaseType = options.magicFlaskBase ? getMagicFlaskBaseType(item) : undefined;
  if (magicFlaskBaseType) {
    const record = itemArt.bases[magicFlaskBaseType as keyof typeof itemArt.bases];
    return [poeCdnUrl(record)].filter((candidate): candidate is string => Boolean(candidate));
  }

  const candidates = [item.imageUrl, LOCAL_BASE_ART[item.baseType]];
  if (item.rarity === "unique") candidates.push(poeCdnUrl(itemArt.uniques[item.name as keyof typeof itemArt.uniques]));
  candidates.push(poeCdnUrl(itemArt.bases[item.baseType as keyof typeof itemArt.bases]));

  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))];
}
