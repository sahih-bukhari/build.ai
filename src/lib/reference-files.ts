import { z } from "zod";

export const referenceSchema = z.object({
  name: z.string().min(1).max(120),
  content: z.string().min(1).max(12_000),
});
export type ReferenceFile = z.infer<typeof referenceSchema>;
export const REFERENCE_ACCEPT = ".txt,.md,.html,.css,.json";

export async function readReferenceFile(file: File): Promise<ReferenceFile> {
  if (!/\.(txt|md|html|css|json)$/i.test(file.name)) throw new Error("فقط فایل TXT، MD، HTML، CSS یا JSON پذیرفته می‌شود.");
  if (file.size > 100_000) throw new Error("حجم فایل باید کمتر از ۱۰۰ کیلوبایت باشد.");
  const content = await file.text();
  if (content.includes("\0")) throw new Error("فایل متنی معتبر نیست.");
  const parsed = referenceSchema.safeParse({ name: file.name, content });
  if (!parsed.success) throw new Error("فایل باید متن داشته باشد و حداکثر ۱۲٬۰۰۰ نویسه باشد.");
  return parsed.data;
}