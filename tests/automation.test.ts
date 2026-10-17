import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AutomationError,
  createAddress,
  detectAuth,
  prepareAddress,
} from "../src/lib/hme/automation";

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
