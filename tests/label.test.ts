import { describe, expect, it } from "vitest";
import { labelFromTab, sanitizeLabel } from "../src/lib/label";

describe("labelFromTab", () => {
  it("httpsのホスト名からwwwを除いてラベルにする", () => {
    expect(labelFromTab("https://www.example.com/path?q=1", "Example Shop")).toBe("example.com");
  });

  it("iCloudの画面ではサイト名を提案しない", () => {
    expect(labelFromTab("https://www.icloud.com/icloudplus", "iCloud+")).toBe("");
  });

  it("URLが読めないときはタイトルを使う", () => {
    expect(labelFromTab(undefined, "Example Shop | 公式サイト")).toBe("Example Shop");
  });

  it("拡張機能のページではラベルを提案しない", () => {
    expect(labelFromTab("chrome-extension://abc/popup.html", "メールを非公開")).toBe("");
  });
});

describe("sanitizeLabel", () => {
  it("制御文字と連続空白を整理する", () => {
    expect(sanitizeLabel("  Example\u0000   Shop  ")).toBe("Example Shop");
  });

  it("80文字に切り詰める", () => {
    expect(sanitizeLabel("a".repeat(100))).toHaveLength(80);
  });
});
