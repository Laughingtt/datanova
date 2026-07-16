import nodejieba from "nodejieba";

// Lazy initialization — nodejieba loads its dictionary on first call
let initialized = false;
function ensureInit(): void {
  if (!initialized) {
    nodejieba.load();
    initialized = true;
  }
}

/**
 * Tokenize text for keyword matching.
 *
 * - Chinese segments: jieba precise-mode segmentation
 * - Non-Chinese segments: whitespace splitting
 * - Filters: single characters, pure punctuation, whitespace
 * - Strips leading/trailing punctuation from each token
 *
 * @example
 * tokenize("上个月销售额")        → ["上个月", "销售额"]
 * tokenize("每个地区的订单数量")   → ["每个", "地区", "订单", "数量"]
 * tokenize("top 10 customers")   → ["top", "10", "customers"]
 * tokenize("查询上个月的GMV:")    → ["查询", "上个月", "gmv"]
 */
export function tokenize(text: string): string[] {
  ensureInit();

  const lower = text.toLowerCase();

  // Split into alternating Chinese / non-Chinese segments
  const segments = lower.split(/([一-鿿]+)/);

  const tokens: string[] = [];
  for (const seg of segments) {
    if (/[一-鿿]/.test(seg)) {
      // Chinese segment → jieba precise cut
      tokens.push(...nodejieba.cut(seg));
    } else {
      // Non-Chinese segment → whitespace split
      tokens.push(...seg.split(/\s+/));
    }
  }

  // Strip leading/trailing punctuation, filter short/pure-punctuation tokens
  return tokens
    .map((t) => t.trim().replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, ""))
    .filter((t) => t.length > 1);
}
