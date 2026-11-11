import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatPanel, BuildProgressCard } from "@/components/builder/ChatPanel";
import { FilesPanel } from "@/components/builder/FilesPanel";
import type { BuildProgress } from "@/lib/ai/progress";
import type { ChatMessage } from "@/lib/ai/types";

const activityMessage: ChatMessage = {
  id: "assistant-1",
  role: "assistant",
  content: "سایت آماده شد.",
  activity: {
    kind: "web",
    files: [{ path: "src/index.html", lines: 24 }],
    collections: ["messages"],
  },
};

describe("build activity navigation", () => {
  it("opens the linked file, data collection and preview", () => {
    const onOpenFile = vi.fn();
    const onOpenCollection = vi.fn();
    const onOpenPreview = vi.fn();

    render(
      <ChatPanel
        messages={[activityMessage]}
        loading={false}
        progress={null}
        onSend={async () => true}
        onOpenFile={onOpenFile}
        onOpenCollection={onOpenCollection}
        onOpenPreview={onOpenPreview}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /src\/index\.html/ }));
    fireEvent.click(screen.getByRole("button", { name: /مجموعهٔ داده messages/ }));
    fireEvent.click(screen.getByRole("button", { name: /پیش‌نمایش/ }));

    expect(onOpenFile).toHaveBeenCalledWith("src/index.html");
    expect(onOpenCollection).toHaveBeenCalledWith("messages");
    expect(onOpenPreview).toHaveBeenCalledOnce();
  });

  it("opens the exact file requested by the build summary", () => {
    render(
      <FilesPanel
        files={[
          { path: "index.html", content: "OTHER_FILE" },
          { path: "src/app.py", content: "TARGET_FILE_CONTENT" },
        ]}
        focusPath="src/app.py"
      />,
    );

    expect(screen.getByText("TARGET_FILE_CONTENT")).toBeInTheDocument();
  });

  it("explains the live server action and current file progress", () => {
    const progress: BuildProgress = {
      phase: "writing",
      title: "فرم تماس",
      files: [{ path: "src/form.html", chars: 220, lines: 16, done: false }],
      chars: 900,
      model: "gemini-test",
      startedAt: Date.now(),
    };

    render(<BuildProgressCard progress={progress} />);

    expect(screen.getByRole("status")).toHaveTextContent("در حال نوشتن src/form.html");
    expect(screen.getAllByText(/۱۶ خط/)).toHaveLength(2);
  });
});
