import { describe, expect, it } from "vitest";
import { FURNITURE_DETAIL_BRIEF } from "@/app/design-preview/sample-brief";
import { statedLine, statedValue } from "@/components/detail-facts";

describe("sample detail facts", () => {
  it("shows Not stated when a fact was not given", () => {
    expect(statedValue(null)).toBe("Not stated");
    expect(statedValue("  ")).toBe("Not stated");
    expect(statedValue(undefined)).toBe("Not stated");
    expect(statedLine("Entry limit", null)).toBe("Entry limit: Not stated");
    expect(statedLine("Eligibility", "")).toBe("Eligibility: Not stated");
    expect(statedLine("How to enter", null)).toBe("How to enter: Not stated");
    expect(statedLine("Entry limit", "Once daily")).toBe("Entry limit: Once daily");
  });

  it("keeps the furniture preview brief synthetic and free of the closing date", () => {
    expect(statedLine("Entry limit", FURNITURE_DETAIL_BRIEF.entryLimit)).toBe("Entry limit: Once daily");
    expect(statedLine("Eligibility", FURNITURE_DETAIL_BRIEF.eligibility)).toBe("Eligibility: US residents, 21+; excludes NY");
    expect(FURNITURE_DETAIL_BRIEF.prizeHeading).toBe("The prize");
    expect(FURNITURE_DETAIL_BRIEF.howToEnter).toBe("Complete the form and confirm your email.");
    expect(FURNITURE_DETAIL_BRIEF.rulesHref).toBe("https://example.com/sample-rules");
    expect(FURNITURE_DETAIL_BRIEF.prizeBody).toContain("white oak dining table");
    expect(FURNITURE_DETAIL_BRIEF.prizeBody).not.toContain("01/26/2027");
    expect(FURNITURE_DETAIL_BRIEF.prizeBody).not.toContain("16 days left");
    expect(FURNITURE_DETAIL_BRIEF.prizeBody.split("white oak dining table")).toHaveLength(2);
  });
});