import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AutomationError,
  createAddress,
  detectAuth,
  openHmeTile,
  prepareAddress,
} from "../src/lib/hme/automation";
import { clickableAncestor, findByText } from "../src/lib/hme/dom";

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function mockClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

beforeEach(() => {
  setBody("");
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  mockClipboard();
});

afterEach(() => {
  setBody("");
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

describe("iCloud画面の判定", () => {
  it("サインインボタンがあればログイン要求として扱う", () => {
    setBody("<ui-button role='button'><button>サインイン</button></ui-button>");
    expect(detectAuth(document)).toBe("AUTH_REQUIRED");
  });

  it("パスワード入力があればセッション切れとして扱う", () => {
    setBody("<h1>サインイン</h1><input type='password' /><button>続ける</button>");
    expect(detectAuth(document)).toBe("SESSION_EXPIRED");
  });
});

describe("作成前の準備", () => {
  it("有効なアドレスがある画面では＋を押してラベルを入れ、作成は押さない", async () => {
    setBody(`
      <h1>メールを非公開</h1>
      <h2>2件の有効なメールアドレス</h2>
      <button id="add" aria-label="メールアドレスを追加">＋</button>
      <section id="form" hidden>
        <label>ラベル <input id="label" type="text" /></label>
        <button id="create">メールアドレスを作成</button>
      </section>
    `);
    const add = document.getElementById("add")!;
    const form = document.getElementById("form")!;
    const create = document.getElementById("create")!;
    const createClick = vi.fn();
    add.addEventListener("click", () => {
      form.hidden = false;
    });
    create.addEventListener("click", createClick);

    const outcome = await prepareAddress(document, "example.com", { isTopFrame: false, timeoutMs: 300, pollMs: 5 });

    expect(outcome).toEqual({ kind: "ready" });
    expect((document.getElementById("label") as HTMLInputElement).value).toBe("example.com");
    expect(createClick).not.toHaveBeenCalled();
  });

  it("有効なアドレスがない画面では「新しいメールアドレスを設定」を押す", async () => {
    setBody(`
      <h1>メールを非公開</h1>
      <button id="new">新しいメールアドレスを設定</button>
      <section id="form" hidden>
        <label>ラベル <input id="label" type="text" /></label>
        <button id="create">メールアドレスを作成</button>
      </section>
    `);
    const button = document.getElementById("new")!;
    button.addEventListener("click", () => {
      document.getElementById("form")!.hidden = false;
    });

    const outcome = await prepareAddress(document, "example.com", { isTopFrame: false, timeoutMs: 300, pollMs: 5 });
    expect(outcome).toEqual({ kind: "ready" });
  });

  it("iCloud+のトップでは「メールを非公開」タイルを押す", async () => {
    setBody("<div id='tile' role='button'><h2>メールを非公開</h2><p>メールアドレスを非公開にする</p></div>");
    const tileClick = vi.fn();
    document.getElementById("tile")!.addEventListener("click", tileClick);

    const outcome = await prepareAddress(document, "example.com", { isTopFrame: true, timeoutMs: 300, pollMs: 5 });
    expect(outcome).toEqual({ kind: "opening" });
    expect(tileClick).toHaveBeenCalledTimes(1);
  });

  it("関係ない画面では何もしない", async () => {
    setBody("<h1>別のページ</h1>");
    const outcome = await prepareAddress(document, "example.com", { isTopFrame: false, timeoutMs: 100, pollMs: 5 });
    expect(outcome).toEqual({ kind: "none" });
  });

  it("オフラインなら通信エラーにする", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    setBody("<h1>メールを非公開</h1><button>新しいメールアドレスを設定</button>");
    await expect(
      prepareAddress(document, "example.com", { isTopFrame: false, timeoutMs: 100, pollMs: 5 }),
    ).rejects.toMatchObject({ code: "NETWORK" });
  });
});

describe("アドレス作成", () => {
  it("作成ボタンを1回押し、新しいアドレスをコピーする", async () => {
    setBody(`
      <h1>メールを非公開</h1>
      <label>ラベル <input id="label" type="text" value="example.com" /></label>
      <button id="create">メールアドレスを作成</button>
    `);
    const writeText = mockClipboard();
    const clickSpy = vi.fn();
    const button = document.getElementById("create")!;
    button.addEventListener("click", () => {
      clickSpy();
      setTimeout(() => {
        const address = document.createElement("div");
        address.textContent = "sample-address@icloud.com";
        document.body.appendChild(address);
      }, 5);
    });

    const result = await createAddress(document, { timeoutMs: 500, pollMs: 5 });

    expect(result).toEqual({ kind: "success", address: "sample-address@icloud.com", copied: true });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("sample-address@icloud.com");
  });

  it("作成失敗の表示を検出し、再試行しない", async () => {
    setBody(`
      <h1>メールを非公開</h1>
      <label>ラベル <input id="label" type="text" value="example.com" /></label>
      <button id="create">メールアドレスを作成</button>
    `);
    const clickSpy = vi.fn();
    const button = document.getElementById("create")!;
    button.addEventListener("click", () => {
      clickSpy();
      setTimeout(() => {
        const alert = document.createElement("div");
        alert.setAttribute("role", "alert");
        alert.textContent = "メールアドレスを作成できませんでした。";
        document.body.appendChild(alert);
      }, 5);
    });

    const result = await createAddress(document, { timeoutMs: 500, pollMs: 5 });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.clicked).toBe(true);
      expect(result.code).toBe("CREATE_FAILED");
    }
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("作成ボタンが無ければ、クリックせずに失敗を返す", async () => {
    setBody("<h1>メールを非公開</h1>");
    const result = await createAddress(document, { timeoutMs: 100, pollMs: 5 });
    expect(result).toMatchObject({ kind: "failed", clicked: false, code: "UI_NOT_FOUND" });
  });
});

// 実機のiCloud+「iCloud+の機能」タブで観測したDOM構造。
// 見出し（heading）と操作ボタン（tile-button）が兄弟で、headingの先祖には
// buttonが無い。専用ボタンを押せないと管理画面へ遷移しない。
function hmeTileMarkup(
  title: string,
  options: {
    id?: string;
    hidden?: boolean;
    disabled?: boolean;
    extraControl?: boolean;
    noButton?: boolean;
    hiddenButton?: boolean;
  } = {},
): string {
  const id = options.id ?? "tile";
  const hiddenAttr = options.hidden ? ' aria-hidden="true"' : "";
  const disabledAttr = options.disabled ? " disabled" : "";
  const hiddenButtonAttr = options.hiddenButton ? " hidden" : "";
  const extraControl = options.extraControl
    ? `<button id="${id}-close" class="card-close">閉じる</button>`
    : "";
  const button = options.noButton
    ? ""
    : `<button id="${id}-button" class="unstyled-button tile-button" aria-haspopup="dialog" aria-label="Show more options for ${title}"${disabledAttr}${hiddenButtonAttr}></button>`;
  return `
    <article aria-label="${title}" class="tile-article"${hiddenAttr}>
      <div class="tile small">
        ${extraControl}
        ${button}
        <div class="banner"><div class="header-content"><div class="text">
          <div class="heading" role="heading" aria-level="2">${title}</div>
          <div class="heading offscreen-measure" aria-hidden="true">${title}</div>
          <div class="description" title="メールアドレスを非公開にする" role="presentation"><span class="description-content">メールアドレスを非公開にする</span></div>
        </div></div></div>
        <div class="content" aria-hidden="false"><div class="static-tile-content">
          <div class="content-title-text">アドレス</div>
          <div class="content-list-items"><ul><li>アクティブ7件</li><li>非アクティブ1件</li></ul></div>
        </div></div>
      </div>
    </article>
  `;
}

// 指示元が実機のBraveで取得したDOM。この構造を回帰テストの基準にする。
const REAL_HME_TILE = `
  <article aria-label="メールを非公開" class="tile-article"><div draggable="false" class="hide-my-email-tile tile small"><button id="hme-button" class="unstyled-button tile-button" aria-haspopup="dialog" aria-label="Show more options for メールを非公開"></button><div class="banner"><div class="header-content"><div class="text" role="presentation"><div class="heading" role="heading" aria-level="2">メールを非公開</div><div class="heading offscreen-measure" aria-hidden="true">メールを非公開</div><div class="description" title="メールアドレスを非公開にする" role="presentation"><span class="description-content">メールアドレスを非公開にする</span></div></div></div></div><div class="content" aria-hidden="false"><div class="static-tile-content"><div class="content-title-text">アドレス</div><div class="content-list-items"><ul><li>アクティブ7件</li><li>非アクティブ1件</li></ul></div></div></div></div></article>
`;

describe("iCloud+の機能一覧カード", () => {
  it("見出しの先祖をたどっても専用ボタンには到達できない（原因の固定）", () => {
    setBody(REAL_HME_TILE);
    const title = findByText(document, ["メールを非公開"], { maxTextLength: 40 })!;
    const ancestor = clickableAncestor(title);

    expect(ancestor).not.toBe(document.getElementById("hme-button"));
    expect(ancestor.tagName).not.toBe("BUTTON");
  });

  it("見出しの兄弟にある専用ボタンを押す（実DOM構造）", () => {
    setBody(REAL_HME_TILE);
    const button = document.getElementById("hme-button")!;
    const click = vi.fn();
    button.addEventListener("click", click);

    expect(openHmeTile(document)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("トップページの準備では「開く」を返し、専用ボタンだけを押す", async () => {
    setBody(hmeTileMarkup("メールを非公開"));
    const button = document.getElementById("tile-button")!;
    const click = vi.fn();
    button.addEventListener("click", click);

    const outcome = await prepareAddress(document, "example.com", { isTopFrame: true, timeoutMs: 100, pollMs: 5 });

    expect(outcome).toEqual({ kind: "opening" });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("英語表記のカードでも専用ボタンを押す", () => {
    setBody(hmeTileMarkup("Hide My Email"));
    const button = document.getElementById("tile-button")!;
    const click = vi.fn();
    button.addEventListener("click", click);

    expect(openHmeTile(document)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("同じカード内に複数の操作要素があっても、見出し名を持つ専用ボタンを優先する", () => {
    setBody(hmeTileMarkup("メールを非公開", { extraControl: true }));
    const button = document.getElementById("tile-button")!;
    const close = document.getElementById("tile-close")!;
    const buttonClick = vi.fn();
    const closeClick = vi.fn();
    button.addEventListener("click", buttonClick);
    close.addEventListener("click", closeClick);

    expect(openHmeTile(document)).toBe(true);
    expect(buttonClick).toHaveBeenCalledTimes(1);
    expect(closeClick).not.toHaveBeenCalled();
  });

  it("別カードのボタンは押さない", () => {
    setBody(
      hmeTileMarkup("メールを非公開", { id: "hme" }) +
        hmeTileMarkup("カスタムメールドメイン", { id: "other" }),
    );
    const hmeButton = document.getElementById("hme-button")!;
    const otherButton = document.getElementById("other-button")!;
    const hmeClick = vi.fn();
    const otherClick = vi.fn();
    hmeButton.addEventListener("click", hmeClick);
    otherButton.addEventListener("click", otherClick);

    expect(openHmeTile(document)).toBe(true);
    expect(hmeClick).toHaveBeenCalledTimes(1);
    expect(otherClick).not.toHaveBeenCalled();
  });

  it("aria-hiddenの中にある同じ見出しのカードは押さない", () => {
    setBody(
      hmeTileMarkup("メールを非公開", { id: "hidden", hidden: true }) +
        hmeTileMarkup("メールを非公開", { id: "visible" }),
    );
    const hiddenButton = document.getElementById("hidden-button")!;
    const visibleButton = document.getElementById("visible-button")!;
    const hiddenClick = vi.fn();
    const visibleClick = vi.fn();
    hiddenButton.addEventListener("click", hiddenClick);
    visibleButton.addEventListener("click", visibleClick);

    expect(openHmeTile(document)).toBe(true);
    expect(visibleClick).toHaveBeenCalledTimes(1);
    expect(hiddenClick).not.toHaveBeenCalled();
  });

  it("無効化された専用ボタンは押さず、開けた扱いにせず、隣のカードも押さない", () => {
    setBody(
      hmeTileMarkup("メールを非公開", { id: "hme", disabled: true }) +
        hmeTileMarkup("カスタムメールドメイン", { id: "other" }),
    );
    const button = document.getElementById("hme-button")!;
    const otherButton = document.getElementById("other-button")!;
    const click = vi.fn();
    const otherClick = vi.fn();
    button.addEventListener("click", click);
    otherButton.addEventListener("click", otherClick);

    expect(openHmeTile(document)).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(otherClick).not.toHaveBeenCalled();
  });

  it("カードにボタンが無ければ、隣のカードのボタンを押さず、開けた扱いにしない", () => {
    setBody(
      hmeTileMarkup("メールを非公開", { id: "hme", noButton: true }) +
        hmeTileMarkup("カスタムメールドメイン", { id: "other" }),
    );
    const otherButton = document.getElementById("other-button")!;
    const otherClick = vi.fn();
    otherButton.addEventListener("click", otherClick);

    expect(openHmeTile(document)).toBe(false);
    expect(otherClick).not.toHaveBeenCalled();
  });

  it("カードのボタンがhiddenなら、隣のカードのボタンを押さず、開けた扱いにしない", () => {
    setBody(
      hmeTileMarkup("メールを非公開", { id: "hme", hiddenButton: true }) +
        hmeTileMarkup("カスタムメールドメイン", { id: "other" }),
    );
    const hiddenButton = document.getElementById("hme-button")!;
    const otherButton = document.getElementById("other-button")!;
    const hiddenClick = vi.fn();
    const otherClick = vi.fn();
    hiddenButton.addEventListener("click", hiddenClick);
    otherButton.addEventListener("click", otherClick);

    expect(openHmeTile(document)).toBe(false);
    expect(hiddenClick).not.toHaveBeenCalled();
    expect(otherClick).not.toHaveBeenCalled();
  });

  it("見出しだけでカード内に操作要素が無ければ、ヘッダの無関係なボタンを押さない", () => {
    setBody(`
      <header><button id="nav-button">設定</button></header>
      <article aria-label="メールを非公開" class="tile-article">
        <div class="tile small"><div class="heading" role="heading" aria-level="2">メールを非公開</div></div>
      </article>
    `);
    const navButton = document.getElementById("nav-button")!;
    const navClick = vi.fn();
    navButton.addEventListener("click", navClick);

    expect(openHmeTile(document)).toBe(false);
    expect(navClick).not.toHaveBeenCalled();
  });

  it("見出しが操作要素の中にある従来構造でも押す", () => {
    setBody("<div id='legacy' role='button'><h2>メールを非公開</h2></div>");
    const legacy = document.getElementById("legacy")!;
    const click = vi.fn();
    legacy.addEventListener("click", click);

    expect(openHmeTile(document)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });
});
