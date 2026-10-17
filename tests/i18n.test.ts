import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const localesDir = path.join(root, "src", "_locales");
const locales = ["en", "ja", "ko", "zh_CN"];

interface LocalizedMessage {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

function readMessages(locale: string): Record<string, LocalizedMessage> {
  return JSON.parse(readFileSync(path.join(localesDir, locale, "messages.json"), "utf8")) as Record<
    string,
    LocalizedMessage
  >;
}

describe("4言語のi18nカタログ", () => {
  it("日本語・英語・簡体字中国語・韓国語のカタログが揃っている", () => {
    expect(readdirSync(localesDir).sort()).toEqual([...locales].sort());
  });

  it("全言語が同じキーを持ち、空のメッセージがない", () => {
    const reference = Object.keys(readMessages("en")).sort();
    for (const locale of locales) {
      const messages = readMessages(locale);
      expect(Object.keys(messages).sort(), locale).toEqual(reference);
      for (const [key, value] of Object.entries(messages)) {
        expect(value.message.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("manifestとpopupが参照するキーが全言語に存在する", () => {
    const reference = new Set(Object.keys(readMessages("en")));
    const manifest = JSON.parse(readFileSync(path.join(root, "src", "manifest.json"), "utf8")) as Record<
      string,
      unknown
    >;
    const manifestKeys = JSON.stringify(manifest).match(/__MSG_([A-Za-z0-9_]+)__/g) ?? [];
    expect(manifest.default_locale).toBe("en");
    expect(manifestKeys.length).toBeGreaterThan(0);
    for (const token of manifestKeys) {
      expect(reference.has(token.slice(6, -2)), token).toBe(true);
    }

    const popupTs = readFileSync(path.join(root, "src", "popup.ts"), "utf8");
    const popupHtml = readFileSync(path.join(root, "src", "popup.html"), "utf8");
    const used = new Set<string>();
    for (const match of popupTs.matchAll(/translate\("([^"]+)"/g)) used.add(match[1]!);
    for (const match of popupHtml.matchAll(/data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g)) {
      used.add(match[1]!);
    }
    expect(used.size).toBeGreaterThan(20);
    for (const key of used) {
      expect(reference.has(key), key).toBe(true);
    }
  });

  it("メッセージ内のプレースホルダーが定義されている", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(readMessages(locale))) {
        const referenced = [...value.message.matchAll(/\$([A-Za-z0-9_]+)\$/g)].map((match) =>
          match[1]!.toLowerCase(),
        );
        const defined = new Set(Object.keys(value.placeholders ?? {}).map((name) => name.toLowerCase()));
        for (const name of referenced) {
          expect(defined.has(name), `${locale}:${key}: ${name}`).toBe(true);
        }
      }
    }
  });
});
