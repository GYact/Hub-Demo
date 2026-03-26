export type AiProvider =
  | "gemini"
  | "openai"
  | "anthropic"
  | "perplexity"
  | "claude-code";

export const AI_PROVIDER_OPTIONS: { value: AiProvider; label: string }[] = [
  { value: "gemini", label: "Gemini" },
  { value: "openai", label: "ChatGPT" },
  { value: "anthropic", label: "Claude" },
  { value: "perplexity", label: "Perplexity" },
  { value: "claude-code", label: "Claude Code" },
];

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: "gemini-2.5-pro",
  openai: "gpt-4o",
  anthropic: "claude-opus-4-6",
  perplexity: "sonar-reasoning-pro",
  "claude-code": "claude-code-local",
};

export const getModelForProvider = (provider: AiProvider): string => {
  if (provider === "gemini") {
    return import.meta.env.VITE_GEMINI_MODEL?.trim() || DEFAULT_MODELS.gemini;
  }
  if (provider === "openai") {
    return import.meta.env.VITE_OPENAI_MODEL?.trim() || DEFAULT_MODELS.openai;
  }
  if (provider === "anthropic") {
    return (
      import.meta.env.VITE_ANTHROPIC_MODEL?.trim() || DEFAULT_MODELS.anthropic
    );
  }
  if (provider === "perplexity") {
    return (
      import.meta.env.VITE_PERPLEXITY_MODEL?.trim() || DEFAULT_MODELS.perplexity
    );
  }
  if (provider === "claude-code") {
    return DEFAULT_MODELS["claude-code"];
  }
  return DEFAULT_MODELS.gemini;
};

export const getModelEnvKey = (provider: AiProvider): string => {
  if (provider === "gemini") return "VITE_GEMINI_MODEL";
  if (provider === "openai") return "VITE_OPENAI_MODEL";
  if (provider === "anthropic") return "VITE_ANTHROPIC_MODEL";
  if (provider === "perplexity") return "VITE_PERPLEXITY_MODEL";
  if (provider === "claude-code") return "";
  return "VITE_GEMINI_MODEL";
};

export const DEFAULT_AI_SHORTCUTS: string[] = [];
