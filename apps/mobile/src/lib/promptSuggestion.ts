/**
 * The suggestion to insert on tap. The chip unmounts a render after typing
 * starts, so a late accept must not fill a draft that has text.
 */
export function promptSuggestionToAccept(suggestion: string | null, draft: string): string | null {
  return draft.length === 0 ? suggestion : null;
}
