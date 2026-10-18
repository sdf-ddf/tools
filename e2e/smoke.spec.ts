import { test, expect } from "@playwright/test";

// CI 冒烟:页面加载 + 核心功能可用(mock 模式,无外部依赖)
test("页面加载且分层树渲染", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("svg.layer-tree-svg")).toHaveCount(1);
  await expect(page.locator(".panel h2")).toContainText("Transformer 架构");
});

test("mock 讲解可用", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForLoadState("networkidle");
  // 切到 mock
  await page.locator(".tool-btn.accent").click();
  await page.locator(".modal select").first().selectOption("mock");
  await page.locator(".modal button", { hasText: "保存" }).click();
  // 点选讲解
  await page.locator(".action-btn.primary", { hasText: "点选讲解" }).click();
  await expect(page.locator(".chat-item.assistant").first()).toContainText("是什么", { timeout: 10000 });
});
