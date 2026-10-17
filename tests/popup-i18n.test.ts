import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { idleState } from "../src/lib/protocol";

interface CatalogMessage {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

const root = process.cwd();
const popupHtml = readFileSync(path.join(root, "src", "popup.html"), "utf8");
const cases = [
  { locale: "ja", lang: "ja" },
  { locale: "en", lang: "en" },
  { locale: "zh_CN", lang: "zh-CN" },
  { locale: "ko", lang: "ko" },
] as const;

function catalog(locale: string): Record<string, CatalogMessage> {
  return JSON.parse(
    readFileSync(path.join(root, "src", "_locales", locale, "messages.json"), "utf8"),
  ) as Record<string, CatalogMessage>;
}

function getMessage(messages: Record<string, CatalogMessage>, key: string, substitutions?: string | string[]): string {
  const entry = messages[key];
  if (!entry) return "";
  const values = typeof substitutions === "string" ? [substitutions] : (substitutions ?? []);
  let text = entry.message;
  values.forEach((value, index) => {
    text = text.replaceAll(`$${index + 1}$`, value);
  });
  for (const [name, placeholder] of Object.entries(entry.placeholders ?? {})) {
    const match = placeholder.content.match(/^\$(\d+)$/);
    if (!match) continue;
    text = text.replaceAll(`$${name.toUpperCase()}$`, values[Number(match[1]) - 1] ?? "");
  }
  return text;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  document.body.innerHTML = "";
});

describe("ポップアップの4言語表示", () => {
  it.each(cases)("$locale のUIを表示する", async ({ locale, lang }) => {
    const messages = catalog(locale);
    document.documentElement.innerHTML = popupHtml
      .replace(/^[\s\S]*?<html[^>]*>/i, "")
      .replace(/<\/html>[\s\S]*$/i, "");

    vi.stubGlobal("chrome", {
      i18n: {
        getUILanguage: () => locale.replace("_", "-"),
        getMessage: (key: string, substitutions?: string | string[]) =>
          getMessage(messages, key, substitutions),
      },
      tabs: {
        query: vi.fn(async () => [{ url: "https://example.com/page", title: "Example" }]),
      },
      runtime: {
        sendMessage: vi.fn(async () => ({ ok: true, state: idleState() })),
      },
    } as unknown as typeof chrome);

    await import("../src/popup");
    await vi.waitFor(() => {
      expect(document.getElementById("create")?.textContent).toBe(messages.createAndCopy!.message);
    });

    expect(document.documentElement.lang).toBe(lang);
    expect(document.title).toBe(messages.popupTitle!.message);
    expect(document.querySelector("h1")?.textContent).toBe(messages.heading!.message);
    expect(document.getElementById("label")?.getAttribute("placeholder")).toBe(
      messages.labelPlaceholder!.message,
    );
    expect(document.getElementById("status")?.textContent).toBe(messages.statusIdle!.message);
    expect(document.getElementById("site-hint")?.textContent).toBe(
      getMessage(messages, "siteHintCurrent", "example.com"),
    );
  });
});
