const DEFAULT_SEPARATORS = ['\nclass ', '\ndef ', '\n\n', '\n', ' ', ''];

const LANGUAGE_SEPARATORS = {
  python: ['\nclass ', '\ndef ', '\n\n', '\n', ' ', ''],
  javascript: ['\nclass ', '\nfunction ', '\nconst ', '\nlet ', '\nvar ', '\n\n', '\n', ' ', ''],
  typescript: ['\nclass ', '\nfunction ', '\nconst ', '\nlet ', '\nvar ', '\n\n', '\n', ' ', ''],
  java: ['\nclass ', '\npublic ', '\nprotected ', '\nprivate ', '\n\n', '\n', ' ', ''],
  go: ['\nfunc ', '\ntype ', '\n\n', '\n', ' ', ''],
  rust: ['\nfn ', '\nstruct ', '\nenum ', '\nimpl ', '\n\n', '\n', ' ', ''],
};

function getSeparators(language) {
  if (!language) return DEFAULT_SEPARATORS;
  return LANGUAGE_SEPARATORS[language.toLowerCase()] || DEFAULT_SEPARATORS;
}

function splitBySizeSegment(segment, maxChars) {
  const pieces = [];
  for (let i = 0; i < segment.text.length; i += maxChars) {
    const text = segment.text.slice(i, i + maxChars);
    if (!text) continue;
    pieces.push({
      text,
      start: segment.start + i,
      end: segment.start + i + text.length,
    });
  }
  return pieces;
}

function splitWithSeparator(segment, separator) {
  const parts = segment.text.split(separator);
  if (parts.length === 1) return null;

  const pieces = [];
  let cursor = 0;

  for (let i = 0; i < parts.length; i += 1) {
    if (i === 0) {
      const text = parts[i];
      if (text) {
        pieces.push({
          text,
          start: segment.start + cursor,
          end: segment.start + cursor + text.length,
        });
      }
      cursor += text.length;
      continue;
    }

    const text = `${separator}${parts[i]}`;
    if (text) {
      pieces.push({
        text,
        start: segment.start + cursor,
        end: segment.start + cursor + text.length,
      });
    }
    cursor += separator.length + parts[i].length;
  }

  return pieces;
}

function recursiveSplitSegment(segment, separators, maxChars) {
  if (segment.text.length <= maxChars || separators.length === 0) {
    return [segment];
  }

  const separator = separators[0];
  if (separator === '') {
    return splitBySizeSegment(segment, maxChars);
  }

  const pieces = splitWithSeparator(segment, separator);
  if (!pieces) {
    return recursiveSplitSegment(segment, separators.slice(1), maxChars);
  }

  const result = [];
  for (const piece of pieces) {
    if (piece.text.length <= maxChars) {
      result.push(piece);
    } else if (separators.length > 1) {
      result.push(...recursiveSplitSegment(piece, separators.slice(1), maxChars));
    } else {
      result.push(...splitBySizeSegment(piece, maxChars));
    }
  }

  return result;
}

function mergeSegments(segments, maxChars) {
  const ranges = [];
  let currentStart = null;
  let currentEnd = null;
  let currentLength = 0;

  for (const segment of segments) {
    if (currentStart === null) {
      currentStart = segment.start;
      currentEnd = segment.end;
      currentLength = segment.text.length;
      continue;
    }

    if (currentLength + segment.text.length <= maxChars) {
      currentEnd = segment.end;
      currentLength += segment.text.length;
    } else {
      ranges.push({ start: currentStart, end: currentEnd });
      currentStart = segment.start;
      currentEnd = segment.end;
      currentLength = segment.text.length;
    }
  }

  if (currentStart !== null) {
    ranges.push({ start: currentStart, end: currentEnd });
  }

  return ranges;
}

function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

function lineNumberAt(lineStarts, index) {
  if (index <= 0) return 1;
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= index) {
      if (mid === lineStarts.length - 1 || lineStarts[mid + 1] > index) {
        return mid + 1;
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return lineStarts.length;
}

function chunkLines(text, maxChars, overlapChars, options = {}) {
  if (!text || !text.trim()) {
    return [];
  }

  const separators = getSeparators(options.language);
  const baseSegment = { text, start: 0, end: text.length };
  const segments = recursiveSplitSegment(baseSegment, separators, maxChars);
  const ranges = mergeSegments(segments, maxChars);
  const lineStarts = buildLineStarts(text);

  return ranges.map((range) => {
    const overlapStart = overlapChars > 0 ? Math.max(0, range.start - overlapChars) : range.start;
    const content = text.slice(overlapStart, range.end);
    const startLine = lineNumberAt(lineStarts, overlapStart);
    const endLine = lineNumberAt(lineStarts, Math.max(overlapStart, range.end - 1));
    return {
      content,
      startLine,
      endLine,
    };
  }).filter((chunk) => chunk.content.trim());
}

module.exports = {
  chunkLines,
};
