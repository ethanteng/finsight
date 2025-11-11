export function postProcessAnswer(answer: string): string {
  let sanitized = stripLatexSyntax(answer);
  sanitized = deduplicateParagraphs(sanitized);
  sanitized = collapseDuplicateHalves(sanitized);
  return sanitized.trim();
}

function stripLatexSyntax(content: string): string {
  return content
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\$([\s\S]*?)\$/g, '$1')
    .replace(/\\\[([\s\S]*?)\\\]/g, '$1')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$1');
}

function deduplicateParagraphs(content: string): string {
  const paragraphs = content
    .split(/\n{2,}/)
    .map(segment => segment.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const paragraph of paragraphs) {
    const key = normalizeWhitespace(paragraph);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(paragraph);
  }

  return deduped.join('\n\n');
}

function normalizeWhitespace(content: string): string {
  return content
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function collapseDuplicateHalves(content: string): string {
  const normalized = content.trim();
  if (!normalized) {
    return normalized;
  }

  const candidateBreaks = new Set<number>();
  const half = Math.floor(normalized.length / 2);

  const forwardBreak = normalized.indexOf('\n', half);
  if (forwardBreak !== -1) {
    candidateBreaks.add(forwardBreak);
  }

  const backwardBreak = normalized.lastIndexOf('\n', half);
  if (backwardBreak !== -1) {
    candidateBreaks.add(backwardBreak);
  }

  for (const idx of candidateBreaks) {
    if (idx <= 0 || idx >= normalized.length - 1) {
      continue;
    }
    const first = normalized.slice(0, idx).trim();
    const second = normalized.slice(idx).trim();
    if (first && first === second) {
      return first;
    }
  }

  return normalized;
}

