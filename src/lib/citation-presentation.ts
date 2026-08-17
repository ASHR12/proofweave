const PROVIDER_CITATION_TOKEN =
  /([ \t]*)\[[ \t]*cite[ \t]*:[ \t]*\d+(?:[ \t]*,[ \t]*\d+)*[ \t]*\]([ \t]*)/gi;

const OPENING_DELIMITER = /[([{*_`]/;
const CLOSING_DELIMITER = /[,.;:!?%)\]}*_`]/;

export function stripProviderCitationTokens(value: string): string {
  return value.replace(
    PROVIDER_CITATION_TOKEN,
    (
      match,
      leadingWhitespace: string,
      trailingWhitespace: string,
      offset: number,
      source: string,
    ) => {
      const precedingCharacter = source[offset - 1] ?? "";
      const followingCharacter = source[offset + match.length] ?? "";
      const startsLine =
        !precedingCharacter || /[\r\n]/.test(precedingCharacter);
      const endsLine = !followingCharacter || /[\r\n]/.test(followingCharacter);

      if (startsLine) {
        return endsLine ? "" : leadingWhitespace;
      }
      if (endsLine) {
        return trailingWhitespace.length >= 2 ? "  " : "";
      }
      if (precedingCharacter === "|" || followingCharacter === "|") {
        return " ";
      }
      if (
        OPENING_DELIMITER.test(precedingCharacter) ||
        CLOSING_DELIMITER.test(followingCharacter)
      ) {
        return "";
      }

      return " ";
    },
  );
}
