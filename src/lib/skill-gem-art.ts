import skillGemArt from "@/data/skill-gem-art.json";

interface SkillGemArtRecord { path: string; width: number; height: number }

export function getSkillGemArtwork(name: string): string | undefined {
  const record = skillGemArt[name as keyof typeof skillGemArt] as SkillGemArtRecord | undefined;
  if (!record) return undefined;
  const encodedPath = record.path.split("/").map(encodeURIComponent).join("/");
  return `https://web.poecdn.com/image/${encodedPath}?scale=1&w=${record.width}&h=${record.height}`;
}
