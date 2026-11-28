import type { OrchestrationV2ConversationMessage } from "@t3tools/contracts";
import { assistantCitationsToPlainText } from "@t3tools/shared/assistantCitations";

export const RECENT_PROMPT_CONTEXT_MESSAGE_COUNT = 6;
const MAX_PROMPT_CONTEXT_CHARS = 8_000;

/** Builds a bounded, newest-first budget of user and assistant text for prompt generation. */
export function recentThreadPromptContext(
  messages: ReadonlyArray<OrchestrationV2ConversationMessage>,
): string | undefined {
  const recentMessages = messages
    .filter(
      (message) => !message.streaming && (message.role === "user" || message.role === "assistant"),
    )
    .slice(-RECENT_PROMPT_CONTEXT_MESSAGE_COUNT);

  const budgetParts: string[] = [];
  let totalChars = 0;
  for (let index = recentMessages.length - 1; index >= 0; index--) {
    const message = recentMessages[index]!;
    const text = assistantCitationsToPlainText(message.text).trim();
    if (text.length === 0) continue;
    const entry = `${message.role.toUpperCase()}: ${text}`;
    const additionalChars = budgetParts.length === 0 ? entry.length : entry.length + 2;
    if (totalChars + additionalChars > MAX_PROMPT_CONTEXT_CHARS) {
      const prefix = `${message.role.toUpperCase()}: [earlier text omitted] `;
      const remaining =
        MAX_PROMPT_CONTEXT_CHARS - totalChars - (budgetParts.length > 0 ? 2 : 0) - prefix.length;
      if (remaining > 0) budgetParts.unshift(prefix + text.slice(-remaining));
      break;
    }
    budgetParts.unshift(entry);
    totalChars += additionalChars;
  }

  return budgetParts.length === 0 ? undefined : budgetParts.join("\n\n");
}
