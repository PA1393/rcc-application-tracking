// Shared by the DELETE API route and the confirmation UI so the phrase the
// reviewer must type can never drift from the phrase the server accepts.
export const DELETE_APPLICATION_PHRASE = "I consent to delete this application";

export function matchesDeletePhrase(input: unknown): boolean {
  if (typeof input !== "string") return false;
  return input.trim() === DELETE_APPLICATION_PHRASE;
}
