import type { Attachment } from "@/lib/reference-files";

export interface RetryAttempt {
  text: string;
  attachments: Attachment[];
}

export interface RetryReceipt {
  succeeded: boolean;
  text: string;
  attachmentIds: string[];
}

/** Keep the original files when retrying a failed in-session request. */
export function resolveRetryAttempt(
  attempt: RetryAttempt | null,
  fallbackText: string,
): RetryAttempt | null {
  if (attempt?.text.trim()) {
    return { text: attempt.text, attachments: [...attempt.attachments] };
  }

  const text = fallbackText.trim();
  return text ? { text, attachments: [] } : null;
}

/** Do not erase newer edits if the person changed the composer before retrying. */
export function canClearRetryDraft(
  text: string,
  attachments: Attachment[],
  receipt: RetryReceipt,
): boolean {
  return (
    receipt.succeeded &&
    text.trim() === receipt.text.trim() &&
    attachments.map((file) => file.id).join("|") === receipt.attachmentIds.join("|")
  );
}
