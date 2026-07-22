/**
 * Pulsar — small persisted UI settings (AI mode + release-type filter).
 * Each setter broadcasts an event so decoupled components stay in sync.
 */

export type AiMode = "survey" | "chat";
export type ShowType = "all" | "album" | "ep" | "single";

const AI_KEY = "pulsar_ai_mode";
const TYPE_KEY = "pulsar_show_type";

export function loadAiMode(): AiMode {
  try {
    return (localStorage.getItem(AI_KEY) as AiMode) === "survey" ? "survey" : "chat";
  } catch {
    return "chat";
  }
}
export function saveAiMode(m: AiMode) {
  try {
    localStorage.setItem(AI_KEY, m);
    window.dispatchEvent(new CustomEvent("pulsar-ai-mode-change", { detail: m }));
  } catch {
    /* noop */
  }
}

export function loadShowType(): ShowType {
  try {
    const v = localStorage.getItem(TYPE_KEY) as ShowType;
    return ["all", "album", "ep", "single"].includes(v) ? v : "all";
  } catch {
    return "all";
  }
}
export function saveShowType(t: ShowType) {
  try {
    localStorage.setItem(TYPE_KEY, t);
    window.dispatchEvent(new CustomEvent("pulsar-type-change", { detail: t }));
  } catch {
    /* noop */
  }
}
