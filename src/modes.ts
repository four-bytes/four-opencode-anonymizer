export type AnonymizeMode =
  | "redact_for_llm"
  | "redact_for_logs"
  | "redact_for_memory"
  | "irreversible_export";

export interface ModeConfig {
  mode: AnonymizeMode;
  storeMappings: boolean;
  reversible: boolean;
}

const MODE_CONFIGS: Record<AnonymizeMode, ModeConfig> = {
  redact_for_llm: {
    mode: "redact_for_llm",
    storeMappings: true,
    reversible: true,
  },
  redact_for_logs: {
    mode: "redact_for_logs",
    storeMappings: true,
    reversible: true,
  },
  redact_for_memory: {
    mode: "redact_for_memory",
    storeMappings: true,
    reversible: true,
  },
  irreversible_export: {
    mode: "irreversible_export",
    storeMappings: false,
    reversible: false,
  },
};

/** Load mode from env, default redact_for_llm */
export function getMode(): AnonymizeMode {
  const env = (process.env.FOUR_ANON_MODE || "").toLowerCase();
  if (env === "redact_for_logs") return "redact_for_logs";
  if (env === "redact_for_memory") return "redact_for_memory";
  if (env === "irreversible_export") return "irreversible_export";
  return "redact_for_llm";
}

export function getModeConfig(): ModeConfig {
  return MODE_CONFIGS[getMode()];
}
