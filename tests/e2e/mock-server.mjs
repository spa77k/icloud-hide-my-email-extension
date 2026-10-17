import http from "node:http";

const PORT = 4173;
let mode = "normal";

const styles = `
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif; margin: 24px; color: #1d1d1f; }
    h1 { font-size: 20px; }
    [role="button"], button { font: inherit; cursor: pointer; }
    #tile { width: 260px; padding: 16px; border: 1px solid #d9d9de; border-radius: 12px; }
    .tile-button { display: block; width: 100%; height: 20px; }
    .tile-grid { display: flex; gap: 12px; }
    .tile-article { width: 260px; }
    #tile h2 { margin: 0 0 6px; font-size: 16px; }
    #tile p { margin: 0; color: #6e6e73; font-size: 12px; }
    iframe { width: 560px; height: 420px; margin-top: 18px; border: 1px solid #d9d9de; border-radius: 12px; }
    #dialog { margin-top: 16px; padding: 14px; border: 1px solid #d9d9de; border-radius: 10px; }
    label { display: block; font-size: 12px; font-weight: 600; }
    input { width: 280px; height: 32px; margin-top: 5px; padding: 0 8px; }
    button { margin-top: 10px; min-height: 32px; padding: 0 12px; }
    #new-address { margin-top: 14px; padding: 10px; background: #f1faf3; border: 1px solid #cfe8d5; border-radius: 8px; }
    [role="alert"] { margin-top: 12px; padding: 10px; color: #a5281b; background: #fff4f1; border: 1px solid #efd2cc; border-radius: 8px; }
  </style>
`;

function topPage(currentMode) {
  let content;
  if (currentMode === "loggedout") {
    content = `<ui-button role="button"><button id="signin">サインイン</button></ui-button>`;
  } else if (currentMode === "expired") {
    content = `<h1>サインイン</h1><p>セッションの有効期限が切れました。</p><input type="password" aria-label="パスワード" /><button>続ける</button>`;
  } else {
    content = `
      <h1>iCloud+</h1>
      <div class="tile-grid">
        <article aria-label="メールを非公開" class="tile-article">
          <div class="hide-my-email-tile tile small">
            <button id="hme-tile-button" class="unstyled-button tile-button" aria-haspopup="dialog" aria-label="Show more options for メールを非公開"></button>
            <div class="banner"><div class="header-content"><div class="text">
              <div class="heading" role="heading" aria-level="2">メールを非公開</div>
              <div class="heading offscreen-measure" aria-hidden="true">メールを非公開</div>
              <div class="description" title="メールアドレスを非公開にする" role="presentation"><span class="description-content">メールアドレスを非公開にする</span></div>
            </div></div></div>
            <div class="content" aria-hidden="false"><div class="static-tile-content">
              <div class="content-title-text">アドレス</div>
              <div class="content-list-items"><ul><li>アクティブ7件</li><li>非アクティブ1件</li></ul></div>
            </div></div>
          </div>
        </article>
        <article aria-label="カスタムメールドメイン" class="tile-article">
          <div class="custom-email-domain-tile tile small">
            <button id="other-tile-button" class="unstyled-button tile-button" aria-haspopup="dialog" aria-label="Show more options for カスタムメールドメイン"></button>
            <div class="heading" role="heading" aria-level="2">カスタムメールドメイン</div>
          </div>
        </article>
      </div>
      <iframe id="hme" title="メールを非公開"></iframe>
    `;
  }

  return `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><title>iCloud+</title>${styles}</head>
<body>
  ${content}
  <script>
    const mode = ${JSON.stringify(currentMode)};
    window.__tileClicks = 0;
    window.__otherClicks = 0;
    const tileButton = document.getElementById("hme-tile-button");
    if (tileButton) {
      tileButton.addEventListener("click", () => {
        window.__tileClicks += 1;
        const frame = document.getElementById("hme");
        if (frame && !frame.src) frame.src = "/hme?mode=" + encodeURIComponent(mode);
      });
    }
    const otherButton = document.getElementById("other-tile-button");
    if (otherButton) {
      otherButton.addEventListener("click", () => {
        window.__otherClicks += 1;
      });
    }
  </script>
</body>
</html>`;
}

function hmePage(currentMode) {
  return `<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><title>メールを非公開</title>${styles}</head>
<body>
  <h1>メールを非公開</h1>
  <p id="count">7件の有効なメールアドレス</p>
  <button id="add" aria-label="追加">＋</button>
  <button id="close-hme" aria-label="閉じる">閉じる</button>
  <section id="dialog" role="dialog" aria-modal="true" hidden>
    <label>ラベル <input id="label" type="text" /></label>
    <button id="create">メールアドレスを作成</button>
    <div id="error" role="alert" hidden></div>
  </section>
  <div id="addresses"></div>
  <script>
    const mode = ${JSON.stringify(currentMode)};
    window.__createCalls = 0;
    const dialog = document.getElementById("dialog");
    const label = document.getElementById("label");
    const create = document.getElementById("create");
    const error = document.getElementById("error");
    document.getElementById("add").addEventListener("click", () => {
      dialog.hidden = false;
      label.focus();
    });
    create.addEventListener("click", () => {
      window.__createCalls += 1;
      if (mode === "error") {
        error.hidden = false;
        error.textContent = "メールアドレスを作成できませんでした。";
        return;
      }
      create.disabled = true;
      setTimeout(() => {
        const address = "mock-" + Date.now().toString(36) + "-" + window.__createCalls + "@icloud.com";
        window.__address = address;
        const created = document.createElement("div");
        created.id = "new-address";
        created.textContent = address;
        document.getElementById("addresses").appendChild(created);
      }, 500);
    });
  </script>
</body>
</html>`;
}

export function startMockServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
    if (url.pathname === "/control") {
      mode = url.searchParams.get("mode") ?? "normal";
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end(mode);
      return;
    }

    if (url.pathname === "/icloudplus") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(topPage(mode));
      return;
    }

    if (url.pathname === "/hme") {
      const pageMode = url.searchParams.get("mode") ?? mode;
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(hmePage(pageMode));
      return;
    }

    if (url.pathname === "/merchant") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><html lang='ja'><head><title>Example Shop</title></head><body><h1>Example Shop</h1></body></html>");
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}
