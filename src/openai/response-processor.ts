export function postProcessAnswer(answer: string): string {
  let sanitized = stripLatexSyntax(answer);
  sanitized = deduplicateParagraphs(sanitized);
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
    const key = paragraph.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(paragraph);
  }

  return deduped.join('\n\n');
}

