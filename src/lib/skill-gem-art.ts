import skillGemArt from "@/data/skill-gem-art.json";

interface SkillGemArtRecord { path: string; width: number; height: number }

export function getSkillGemArtwork(name: string, isSupport = false): string | undefined {
  const candidates = isSupport && !/ Support$/i.test(name) ? [name, `${name} Support`] : [name];
  const record = candidates
    .map((candidate) => skillGemArt[candidate as keyof typeof skillGemArt] as SkillGemArtRecord | undefined)
    .find(Boolean);
  if (!record) return undefined;
  const encodedPath = record.path.split("/").map(encodeURIComponent).join("/");
  return `https://web.poecdn.com/image/${encodedPath}?scale=1&w=${record.width}&h=${record.height}`;
}
