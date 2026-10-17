const MAX_LABEL_LENGTH = 80;

export function sanitizeLabel(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LABEL_LENGTH);
}

export function labelFromTab(url: string | undefined, title: string | undefined): string {
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      const host = parsed.hostname.replace(/^www\./i, "");
      if (!host || host.endsWith("icloud.com")) return "";
      return sanitizeLabel(host);
    } catch {
      return "";
    }
  }

  if (title) {
    const cleaned = sanitizeLabel(
      title
        .replace(/\s*[|｜\-–—]\s*(公式サイト|公式|ホームページ|Home|Official Site).*$/i, "")
        .replace(/\s*[|｜]\s*.*$/, ""),
    );
    if (cleaned) return cleaned;
  }

  return "";
}
