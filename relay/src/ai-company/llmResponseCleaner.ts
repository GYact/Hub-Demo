/**
 * LLM Response Post-Processing Utilities
 *
 * Pattern borrowed from MiroFish (2026-03-05):
 * Reasoning models (MiniMax, GLM, etc.) emit <think>...</think> blocks
 * before the actual answer. Markdown code fences in JSON responses also
 * cause downstream parse failures. Strip both before use.
 */

/**
 * Strips <think>...</think> blocks emitted by chain-of-thought / reasoning models.
 * Handles nested whitespace and multiline content.
 */
export function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/**
 * Strips markdown code fence wrappers around JSON/code blocks.
 * e.g.  ```json\n{...}\n```  →  {...}
 */
export function stripMarkdownCodeFence(text: string): string {
  return text
    .replace(/^```(?:json|typescript|javascript|ts|js|text|plain)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

/**
 * Full pipeline: think tags → code fences → trim.
 * Apply to all LLM responses before surfacing to callers.
 */
export function cleanLlmResponse(text: string): string {
  return stripMarkdownCodeFence(stripThinkTags(text));
}
