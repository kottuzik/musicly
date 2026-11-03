import type { AssistantErrorKey } from "./provider";

// Shown to the admin when the assistant cannot answer. Never includes provider details.
export const ASSISTANT_ERRORS: Record<AssistantErrorKey | "ai_not_configured" | "invalid_input", string> = {
  ai_unavailable: "העוזר אינו זמין כרגע. אפשר להמשיך לעבוד בשאר המערכת, ולנסות שוב בעוד כמה דקות.",
  ai_timeout: "העוזר לא הספיק לענות בזמן. נסו שוב, או נסחו את השאלה בצורה פשוטה יותר.",
  ai_bad_response: "לא הצלחתי לנסח תשובה. נסו לשאול שוב בצורה אחרת.",
  ai_rate_limited: "הגעתם למגבלת השימוש בעוזר.",
  ai_not_configured: "העוזר עדיין לא הוגדר.",
  invalid_input: "השאלה ריקה או ארוכה מדי (עד 1,000 תווים).",
};

export function rateLimitMessage(minutes: number | undefined): string {
  return minutes && minutes > 0
    ? `הגעתם למגבלת השימוש בעוזר. אפשר לנסות שוב בעוד כ־${minutes} דקות.`
    : ASSISTANT_ERRORS.ai_rate_limited;
}
