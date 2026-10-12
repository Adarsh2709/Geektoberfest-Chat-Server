const MENTION_PATTERN = /(?:^|[^\w@])@([\w.-]{1,24})/g;
const MAX_MENTIONS = 10;

// Display names can contain spaces, so a name is mentioned without them:
// "Harshavi Tank" is mentioned as @HarshaviTank. Matching ignores case.
export function normalizeName(name) {
  return String(name ?? '').replace(/\s+/g, '').toLowerCase();
}

export function extractMentions(text) {
  const mentions = new Set();
  for (const match of String(text ?? '').matchAll(MENTION_PATTERN)) {
    mentions.add(match[1].replace(/[.-]+$/, '').toLowerCase());
    if (mentions.size >= MAX_MENTIONS) break;
  }
  mentions.delete('');
  return [...mentions];
}
