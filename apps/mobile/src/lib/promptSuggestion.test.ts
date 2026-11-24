import { describe, expect, test } from "vite-plus/test";

import { promptSuggestionToAccept } from "../lib/promptSuggestion";

describe("promptSuggestionToAccept", () => {
  test("accepts the suggestion into an empty draft", () => {
    expect(promptSuggestionToAccept("Follow up on tests", "")).toBe("Follow up on tests");
  });

  test("does not overwrite a draft with text", () => {
    expect(promptSuggestionToAccept("Follow up on tests", "typing")).toBeNull();
  });

  test("null suggestion stays null", () => {
    expect(promptSuggestionToAccept(null, "")).toBeNull();
  });
});
