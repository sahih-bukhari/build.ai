// When a build fails and the person sends the same request again, the failed attempt (their message and the error
// notices after it) is replaced instead of piling up as duplicates. Used by the browser and by the server function.

interface Message {
  role: string;
  content: string;
  error?: boolean | undefined;
  notice?: boolean | undefined;
}

export function dropFailedAttempt<T extends Message>(messages: T[], prompt: string): T[] {
  let end = messages.length;
  while (end > 0 && messages[end - 1]?.role === "assistant" && (messages[end - 1]?.error || messages[end - 1]?.notice)) end -= 1;
  const last = messages[end - 1];
  if (last && last.role === "user" && last.content.trim() === prompt.trim()) return messages.slice(0, end - 1);
  return messages;
}
