function chunkLines(text, maxChars, overlapChars) {
  if (!text.trim()) {
    return [];
  }

  const lines = text.split('\n');
  const chunks = [];

  let start = 0;

  while (start < lines.length) {
    let currentChars = 0;
    let end = start;

    while (end < lines.length && currentChars + lines[end].length <= maxChars) {
      currentChars += lines[end].length + 1; // include newline
      end += 1;
    }

    const chunkLines = lines.slice(start, end);
    const chunkText = chunkLines.join('\n').trim();
    if (chunkText) {
      chunks.push({
        content: chunkText,
        startLine: start + 1,
        endLine: end,
      });
    }

    if (end >= lines.length) {
      break;
    }

    if (overlapChars > 0) {
      let overlapLines = 0;
      let overlapCount = 0;
      while (overlapLines < end - start && overlapCount < overlapChars) {
        const line = lines[end - overlapLines - 1];
        overlapCount += line.length + 1;
        overlapLines += 1;
      }
      start = Math.max(end - overlapLines, start + 1);
    } else {
      start = end;
    }
  }

  return chunks;
}

module.exports = {
  chunkLines,
};
