import { describe, it, expect } from "vitest";
import { validatePack } from "./validate";
import { dedupeIds, chunkText, tryParseObject, extractJsonObject } from "./llm/extract";
import type { ContentPack } from "./types";

function makePack(overrides?: Partial<ContentPack>): ContentPack {
  return {
    id: "t",
    title: "测试",
    theme: "测试",
    root: {
      id: "r",
      name: "根",
      type: "model",
      summary: "s",
      children: [{ id: "c1", name: "子", type: "step", summary: "x" }],
    },
    ...overrides,
  };
}

describe("validatePack", () => {
  it("接受合法内容包", () => {
    const r = validatePack(makePack());
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("拒绝缺失 title/root", () => {
    const r = validatePack({ id: "x" } as unknown as ContentPack);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("pack.title 缺失");
    expect(r.errors.join()).toContain("pack.root 缺失");
  });

  it("拒绝重复 id", () => {
    const r = validatePack(
      makePack({
        root: {
          id: "r",
          name: "根",
          type: "model",
          summary: "s",
          children: [
            { id: "dup", name: "A", type: "step", summary: "a" },
            { id: "dup", name: "B", type: "step", summary: "b" },
          ],
        },
      })
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("id 重复 dup");
  });

  it("拒绝非法 type", () => {
    const r = validatePack(
      makePack({ root: { id: "r", name: "根", type: "bogus" as never, summary: "s" } })
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("type 非法");
  });

  it("拒绝 dataRef 指向不存在的数据集", () => {
    const r = validatePack(
      makePack({
        root: {
          id: "r",
          name: "根",
          type: "model",
          summary: "s",
          visualization: { kind: "line", dataRef: "missing" },
        },
      })
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("dataRef missing");
  });
});

describe("dedupeIds", () => {
  it("修复重复 id(追加 -2/-3)", () => {
    const pack = makePack({
      root: {
        id: "r",
        name: "根",
        type: "model",
        summary: "s",
        children: [
          { id: "pangu", name: "A", type: "step", summary: "a" },
          {
            id: "pangu",
            name: "B",
            type: "step",
            summary: "b",
            children: [
              { id: "3dest", name: "b1", type: "step", summary: "x" },
              { id: "3dest", name: "b2", type: "step", summary: "y" },
            ],
          },
        ],
      },
    });
    dedupeIds(pack);
    const r = validatePack(pack);
    expect(r.ok).toBe(true);
    const kids = pack.root.children as { id: string }[];
    expect(kids[0].id).toBe("pangu");
    expect(kids[1].id).toBe("pangu-2");
  });

  it("补齐缺失 id", () => {
    const pack = {
      id: "t",
      title: "测试",
      theme: "测试",
      root: { name: "根", type: "model", summary: "s" },
    } as unknown as ContentPack;
    dedupeIds(pack);
    expect((pack.root as { id: string }).id).toBeTruthy();
  });
});

describe("chunkText", () => {
  it("短文本单块", () => {
    const r = chunkText("短文档");
    expect(r).toHaveLength(1);
  });

  it("长文本按标题切分", () => {
    const doc = "# 标题1\n\n" + "内容".repeat(1500) + "\n\n# 标题2\n\n" + "内容2".repeat(1500);
    const r = chunkText(doc);
    expect(r.length).toBeGreaterThan(1);
    // 每个块首行应为标题
    expect(r[0].startsWith("# 标题1")).toBe(true);
  });
});

describe("tryParseObject / extractJsonObject", () => {
  it("剥离 markdown 围栏并解析", () => {
    const r = tryParseObject('```json\n{"id":"x","title":"t"}\n```');
    expect(r).toEqual({ id: "x", title: "t" });
  });

  it("jsonrepair 修复尾逗号", () => {
    const r = tryParseObject('{"id":"x","title":"t",}');
    expect(r).not.toBeNull();
    expect((r as { id: string }).id).toBe("x");
  });

  it("返回 null 给完全无效输入", () => {
    expect(tryParseObject("这不是 JSON")).toBeNull();
    expect(extractJsonObject("没有花括号")).toBeNull();
  });
});
