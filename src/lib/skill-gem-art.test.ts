import { describe, expect, it } from "vitest";
import { getSkillGemArtwork } from "@/lib/skill-gem-art";

describe("getSkillGemArtwork", () => {
  it("uses official CDN artwork for active skill gems", () => {
    expect(getSkillGemArtwork("Kinetic Blast")).toBe(
      "https://web.poecdn.com/image/Art/2DItems/Gems/ClusterBurst.png?scale=1&w=1&h=1",
    );
  });

  it("uses official CDN artwork for support gems", () => {
    expect(getSkillGemArtwork("Greater Multiple Projectiles Support")).toContain(
      "/Art/2DItems/Gems/Support/GreaterMultipleProjectiles.png",
    );
  });

  it("falls back when a gem is missing from the index", () => {
    expect(getSkillGemArtwork("Definitely Not A Gem")).toBeUndefined();
  });
});
