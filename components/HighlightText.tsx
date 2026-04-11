import { Text } from "react-native";

const HIGHLIGHT_BG = "rgba(250, 204, 21, 0.35)";

interface HighlightTextProps {
  text: string;
  highlight?: string | null;
  style?: any;
  numberOfLines?: number;
}

/**
 * Renders text with case-insensitive keyword highlighting.
 * The highlight uses a semi-transparent yellow that works in both light and dark mode.
 */
export function HighlightText({
  text,
  highlight,
  style,
  numberOfLines,
}: HighlightTextProps) {
  if (!highlight || !highlight.trim()) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  const query = highlight.trim();
  const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
  const parts = text.split(regex);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <Text
            key={i}
            style={{ backgroundColor: HIGHLIGHT_BG, borderRadius: 2 }}
          >
            {part}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
