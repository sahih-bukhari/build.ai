import JSZip from "jszip";
import type { ProjectFile } from "@/lib/ai/types";

export async function createProjectZip(files: ProjectFile[]): Promise<Blob> {
  const zip = new JSZip();
  for (const file of files) {
    const path = file.path.replaceAll("\\", "/");
    const parts = path.split("/");
    if (!path || path.startsWith("/") || parts.some((part) => !part || part === "." || part === "..") || !/^[a-zA-Z0-9._/-]{1,180}$/.test(path)) {
      throw new Error("Invalid project filename");
    }
    zip.file(path, file.content);
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/zip" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function deliverProject(blob: Blob) {
  const file = new File([blob], "project.zip", { type: "application/zip" });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "project.zip" }); return; }
    catch (error) { if ((error as DOMException).name === "AbortError") return; }
  }
  downloadBlob(blob, "project.zip");
}