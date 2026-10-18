import transformerJson from "./transformerPack.json";
import remoteSensingJson from "./remoteSensingPack.json";
import remoteSensingPaperJson from "./remoteSensingPaper.json";
import type { ContentPack } from "../types";
import { validatePack } from "../validate";

export const BUILTIN_PACKS: ContentPack[] = [
  remoteSensingPaperJson as unknown as ContentPack,
  transformerJson as unknown as ContentPack,
  remoteSensingJson as unknown as ContentPack,
];

// 开发模式下启动自检:内置内容包必须通过校验
if (import.meta.env.DEV) {
  for (const p of BUILTIN_PACKS) {
    const res = validatePack(p);
    if (!res.ok) {
      console.warn("[layerview] 内置包校验失败:", p.id, res.errors);
    }
  }
}
