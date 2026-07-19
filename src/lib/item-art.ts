import { Item } from "@/models";

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

// Some experimented bases intentionally reuse another base's inventory artwork.
const WIKI_ART_ALIASES: Record<string, string> = {
  "Cogwork Ring": "Geodesic Ring",
  "Composite Ring": "Geodesic Ring",
  "Helical Ring": "Geodesic Ring",
  "Manifold Ring": "Geodesic Ring",
};

function wikiInventoryIconUrl(itemName: string) {
  const artName = WIKI_ART_ALIASES[itemName] ?? itemName;
  const filename = `${artName} inventory icon.png`.replaceAll(" ", "_");
  return `https://www.poewiki.net/wiki/Special:Redirect/file/${encodeURIComponent(filename).replaceAll("%2F", "/")}`;
}

export function getItemArtworkCandidates(item: Item): string[] {
  if (item.id.startsWith("empty-") || item.baseType === "No item equipped") return [];

  const candidates = [item.imageUrl, LOCAL_BASE_ART[item.baseType]];
  if (item.rarity === "unique") candidates.push(wikiInventoryIconUrl(item.name));
  candidates.push(wikiInventoryIconUrl(item.baseType));

  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))];
}
