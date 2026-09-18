  /**
 * Math Notation Normalizer
 *
 * Pre-processes LLM Markdown responses to normalize LaTeX / MathJax notations
 * into standard KaTeX-compatible syntax ($...$ for inline, $$...$$ for block),
 * while carefully preserving code blocks and standard Markdown elements.
 */

export function normalizeMathNotation(content) {
  if (!content || typeof content !== "string") return "";

  // 1. Temporarily extract fenced code blocks and inline code to prevent altering code
  const codeBlocks = [];
  let processed = content.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // 2. Convert display math: \[ ... \] -> $$ ... $$
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (match, equation) => {
    return `\n$$\n${equation.trim()}\n$$\n`;
  });

  // 3. Convert inline math: \( ... \) -> $ ... $
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (match, equation) => {
    return `$${equation.trim()}$`;
  });

  // 4. Handle bracketed block equations emitted by some LLMs, e.g.:
  // [ \text{CV-score} = (1/k) \sum \text{score}_i ]
  // or [ E = mc^2 ]
  processed = processed.replace(
    /(?:^|\n)\s*\[\s*([\s\S]*?\\(?:text|frac|sum|prod|int|sqrt|alpha|beta|gamma|theta|sigma|mu|pm|times|div|leq|geq|neq|approx|mathbf|mathbb|mathrm|hat|bar|tilde|vec)[\s\S]*?)\s*\](?:\s*(?=\n|$))/g,
    (match, equation) => {
      return `\n\n$$\n${equation.trim()}\n$$\n\n`;
    }
  );

  // 5. Handle bracketed equations with obvious math operators (=, +, -, \times) and Greek/math tokens
  processed = processed.replace(
    /(?:^|\n)\s*\[\s*([A-Za-z0-9_ -]+\s*=\s*(?:1\/[a-zA-Z0-9]+|\([^\)]+\)|\d+)?[\s\S]*?(?:\\sum|Σ|∑|\+|\\times)[\s\S]*?)\s*\](?:\s*(?=\n|$))/g,
    (match, equation) => {
      // Replace raw unicode sigma with \sum if present
      const cleanEq = equation.replace(/[Σ∑]/g, "\\sum ");
      return `\n\n$$\n${cleanEq.trim()}\n$$\n\n`;
    }
  );

  // 6. Restore code blocks
  processed = processed.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
    return codeBlocks[parseInt(index, 10)] || match;
  });

  return processed;
}
