// @vitest-environment node

import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

vi.mock("@/lib/ai/generate.functions", () => ({
  beginGeneration: vi.fn(),
  finishGeneration: vi.fn(),
  getMyUsage: vi.fn(),
}));
vi.mock("@/lib/ai/app-data.functions", () => ({
  declareCollection: vi.fn(),
  getProjectApp: vi.fn(),
  removeCollection: vi.fn(),
  rotateAppKey: vi.fn(),
}));
vi.mock("@/lib/ai/records.functions", () => ({
  deleteRecords: vi.fn(),
  exportRecords: vi.fn(),
  listRecords: vi.fn(),
  saveRecord: vi.fn(),
}));
vi.mock("@/lib/ai/threads.functions", () => ({
  createThread: vi.fn(),
  deleteThread: vi.fn(),
  getThread: vi.fn(),
  listThreads: vi.fn(),
}));

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
});
