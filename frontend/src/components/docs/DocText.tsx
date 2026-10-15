import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

/** **bold** inside a line; everything else is plain text (React escapes it). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "paragraph"; lines: string[] };

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of source.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];

    if (!line.trim()) {
      blocks.push({ kind: "paragraph", lines: [] });
    } else if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2] });
    } else if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const text = (bullet ?? numbered)![1];
      if (last?.kind === "list" && last.ordered === ordered) last.items.push(text);
      else blocks.push({ kind: "list", ordered, items: [text] });
    } else if (last?.kind === "paragraph") {
      last.lines.push(line);
    } else {
      blocks.push({ kind: "paragraph", lines: [line] });
    }
  }
  return blocks.filter((block) => block.kind !== "paragraph" || block.lines.length > 0);
}

const HEADING_VARIANT = { 1: "h5", 2: "h6", 3: "subtitle1" } as const;

/**
 * A design document's text with just enough formatting for a GDD: "# " titles,
 * "- " and "1. " lists, **bold**. Built as React elements, never as HTML, so
 * nothing anyone types can run in somebody else's browser.
 */
export default function DocText({ source }: { source: string }) {
  return (
    <Box sx={{ overflowWrap: "anywhere" }}>
      {parse(source).map((block, index) => {
        if (block.kind === "heading") {
          return (
            <Typography
              key={index}
              variant={HEADING_VARIANT[block.level]}
              sx={{ fontWeight: 800, mt: index ? 2.5 : 0, mb: 1 }}
            >
              {inline(block.text)}
            </Typography>
          );
        }
        if (block.kind === "list") {
          return (
            <Box key={index} component={block.ordered ? "ol" : "ul"} sx={{ pl: 3, my: 1 }}>
              {block.items.map((item, itemIndex) => (
                <Typography key={itemIndex} component="li" sx={{ mb: 0.25 }}>
                  {inline(item)}
                </Typography>
              ))}
            </Box>
          );
        }
        return (
          <Typography key={index} sx={{ my: 1, whiteSpace: "pre-wrap" }}>
            {inline(block.lines.join("\n"))}
          </Typography>
        );
      })}
    </Box>
  );
}
