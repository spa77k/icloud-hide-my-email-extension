import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAddress,
  detectAuth,
  openHmeTile,
  prepareAddress,
} from "../src/lib/hme/automation";

type Locale = "ja" | "en" | "zh" | "ko";

interface FixtureText {
  title: string;
  activeCount: string;
  forwardHeading: string;
  newAddressHeading: string;
  newAddressButton: string;
  labelCaption: string;
  labelHint: string;
  memoPlaceholder: string;
  back: string;
  createButton: string;
  copyButton: string;
  deactivateButton: string;
  detailHmeLabel: string;
  detailForwardLabel: string;
  regenerate: string;
  plusLabel: string;
  signIn: string;
  creationError: string;
}

// Apple公式ヘルプ（iCloud.comでの「メールを非公開」作成・編集）で確認した文言。
// ja: https://support.apple.com/ja-jp/guide/icloud/mm1a876f7aed/icloud
// en: https://support.apple.com/en-us/guide/icloud/mm1a876f7aed/icloud
// zh: https://support.apple.com/zh-cn/guide/icloud/mm1a876f7aed/icloud
// ko: https://support.apple.com/ko-kr/guide/icloud/mm1a876f7aed/icloud
const TEXT: Record<Locale, FixtureText> = {
  ja: {
    title: "メールを非公開",
    activeCount: "7件の有効なメールアドレス",
    forwardHeading: "転送先",
    newAddressHeading: "新しいメールアドレスを追加",
    newAddressButton: "新しいメールアドレスを設定",
    labelCaption: "ラベル",
    labelHint: "アドレスにラベルを追加（例：買い物）",
    memoPlaceholder: "メモ（任意）",
    back: "戻る",
    createButton: "メールアドレスを作成",
    copyButton: "メールアドレスをコピー",
    deactivateButton: "メールアドレスを無効化",
    detailHmeLabel: "メールを非公開：",
    detailForwardLabel: "転送先：",
    regenerate: "別のメールアドレスを使用",
    plusLabel: "追加",
    signIn: "サインイン",
    creationError: "アドレスを作成できませんでした",
  },
  en: {
    title: "Hide My Email",
    activeCount: "7 active email addresses",
    forwardHeading: "Forward to",
    newAddressHeading: "Add a new email address",
    newAddressButton: "Set up a new email address",
    labelCaption: "Label",
    labelHint: "Add a label for the address (example: Shopping)",
    memoPlaceholder: "Note (optional)",
    back: "Back",
    createButton: "Create email address",
    copyButton: "Copy email address",
    deactivateButton: "Deactivate email address",
    detailHmeLabel: "Hide My Email:",
    detailForwardLabel: "Forward to:",
    regenerate: "Use a different email address",
    plusLabel: "Add",
    signIn: "Sign in",
    creationError: "Could not create the email address",
  },
  zh: {
    title: "隐藏邮件地址",
    activeCount: "7 个活跃电子邮件地址",
    forwardHeading: "转发至",
    newAddressHeading: "设置新的电子邮件地址",
    newAddressButton: "设置新的电子邮件地址",
    labelCaption: "标签",
    labelHint: "为地址添加标签（例如：购物）",
    memoPlaceholder: "备忘录（可选）",
    back: "返回",
    createButton: "创建电子邮件地址",
    copyButton: "拷贝电子邮件地址",
    deactivateButton: "停用电子邮件地址",
    detailHmeLabel: "隐藏邮件地址：",
    detailForwardLabel: "转发至：",
    regenerate: "使用其他电子邮件地址",
    plusLabel: "添加",
    signIn: "登录",
    creationError: "无法创建电子邮件地址",
  },
  ko: {
    title: "나의 이메일 가리기",
    activeCount: "7개의 활성 이메일 주소",
    forwardHeading: "전달 받을 이메일 주소",
    newAddressHeading: "새 이메일 주소 설정",
    newAddressButton: "새 이메일 주소 설정",
    labelCaption: "레이블",
    labelHint: "주소에 레이블 추가(예: 쇼핑)",
    memoPlaceholder: "메모(선택 사항)",
    back: "뒤로",
    createButton: "이메일 주소 생성",
    copyButton: "이메일 주소 복사",
    deactivateButton: "이메일 주소 비활성화",
    detailHmeLabel: "나의 이메일 가리기:",
    detailForwardLabel: "전달 받을 이메일 주소:",
    regenerate: "다른 이메일 주소 사용",
    plusLabel: "추가",
    signIn: "로그인",
    creationError: "이메일 주소를 생성할 수 없습니다",
  },
};

const LOCALES: Locale[] = ["ja", "en", "zh", "ko"];

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function mockClipboard(): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
}

interface ManagementOptions {
  candidate?: string;
  existing?: Array<{ label: string; address: string }>;
  forwarding?: string;
  forwardingList?: boolean;
  label?: string;
  withNamedLabelInput?: boolean;
}

function managementMarkup(t: FixtureText, options: ManagementOptions = {}): string {
  const existing = (options.existing ?? [])
    .map(
      (item) =>
        `<li><button class="address-item" type="button"><h2>${item.label}</h2><span class="address-value">${item.address}</span></button></li>`,
    )
    .join("");
  const forwarding = options.forwarding ?? "forward-user@icloud.com";
  const forwardingBody = options.forwardingList
    ? `<ul id="forward-list"><li><button type="button"><h2>${t.forwardHeading}</h2><span>${forwarding}</span></button></li></ul>`
    : `<label><input type="radio" name="forward" checked /> <span id="forward-value">${forwarding}</span></label>`;
  const nameAttribute = options.withNamedLabelInput === false ? "" : ' name="hme-label"';
  return `
    <h1>${t.title}</h1>
    <p>${t.activeCount}</p>
    <ul id="addresses">${existing}</ul>
    <section id="forwarding-section">
      <h2>${t.forwardHeading}：</h2>
      ${forwardingBody}
    </section>
    <div id="account">account-user@icloud.com</div>
    <div id="hidden-address" hidden>hidden-user@icloud.com</div>
    <section role="dialog" aria-modal="true" id="dialog">
      <h2>${t.newAddressHeading}</h2>
      <div id="candidate" class="candidate-address">${options.candidate ?? ""}</div>
      <button id="regenerate" type="button">${t.regenerate}</button>
      <label aria-hidden="true">${t.labelHint}</label>
      <input id="label" type="text"${nameAttribute} value="${options.label ?? "example.com"}" />
      <textarea id="memo" placeholder="${t.memoPlaceholder}"></textarea>
      <button id="back" type="button">${t.back}</button>
      <div class="button-bar-side"><button id="create" type="button">${t.createButton}</button></div>
      <div id="error" role="alert" hidden></div>
    </section>
  `;
}

function detailMarkup(t: FixtureText, label: string, hmeAddress: string, forwardAddress: string): string {
  return `
    <div class="EmailDetail">
      <h1 class="PanelTitle-title modal-title">${label}</h1>
      <input name="hme-label" value="${label}" />
      <div class="EmailDetail-details">
        <div class="EmailDetail-detailsRow">
          <div class="LabeledField EmailDetail-hmeField">
            <label>${t.detailHmeLabel}</label>
            <p class="LabeledField-value">${hmeAddress}</p>
          </div>
        </div>
        <div class="EmailDetail-detailsRow">
          <div class="LabeledField EmailDetail-forwardToField">
            <label>${t.detailForwardLabel}</label>
            <p class="LabeledField-value">${forwardAddress}</p>
          </div>
        </div>
      </div>
      <button type="button">${t.copyButton}</button>
      <button type="button">${t.deactivateButton}</button>
    </div>
  `;
}

function appendCreatedItem(address: string, label: string): void {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "address-item";
  const heading = document.createElement("h2");
  heading.textContent = label;
  const value = document.createElement("span");
  value.className = "address-value";
  value.textContent = address;
  button.append(heading, value);
  li.appendChild(button);
  document.getElementById("addresses")!.appendChild(li);
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

describe.each(LOCALES)("%s のiCloud画面", (locale) => {
  const t = () => TEXT[locale];

  it("HMEカードの専用操作を1回だけ押す", () => {
    setBody(
      `<article class="tile-article"><div class="hide-my-email-tile tile"><button id="tile-button" type="button" aria-haspopup="dialog" aria-label="${t().plusLabel}"></button><div class="banner"><h2>${t().title}</h2></div></div></article>`,
    );
    const click = vi.fn();
    document.getElementById("tile-button")!.addEventListener("click", click);

    expect(openHmeTile(document)).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("有効アドレスがない画面では新規作成ボタンを押してラベルを入れる", async () => {
    setBody(`
      <h1>${t().title}</h1>
      <button id="new" type="button">${t().newAddressButton}</button>
      <section id="form" hidden>
        <label>${t().labelHint}<input id="label" type="text" name="hme-label" /></label>
        <button id="create" type="button">${t().createButton}</button>
      </section>
    `);
    document.getElementById("new")!.addEventListener("click", () => {
      document.getElementById("form")!.hidden = false;
    });

    const outcome = await prepareAddress(document, "example.com", { isTopFrame: false, timeoutMs: 300, pollMs: 5 });

    expect(outcome).toEqual({ kind: "ready" });
    expect((document.getElementById("label") as HTMLInputElement).value).toBe("example.com");
  });

  it("有効アドレスがある画面では＋を押して作成は押さない", async () => {
    setBody(`
      <h1>${t().title}</h1>
      <p>${t().activeCount}</p>
      <button id="add" type="button" aria-label="${t().plusLabel}">＋</button>
      <section id="form" hidden>
        <label>${t().labelHint}<input id="label" type="text" name="hme-label" /></label>
        <button id="create" type="button">${t().createButton}</button>
      </section>
    `);
    document.getElementById("add")!.addEventListener("click", () => {
      document.getElementById("form")!.hidden = false;
    });
    const createClick = vi.fn();
    document.getElementById("create")!.addEventListener("click", createClick);

    const outcome = await prepareAddress(document, "example.com", { isTopFrame: false, timeoutMs: 300, pollMs: 5 });

    expect(outcome).toEqual({ kind: "ready" });
    expect((document.getElementById("label") as HTMLInputElement).value).toBe("example.com");
    expect(createClick).not.toHaveBeenCalled();
  });

  it("名前属性が無いラベル欄も表示文言で特定する", async () => {
    setBody(`
      <h1>${t().title}</h1>
      <button id="new" type="button">${t().newAddressButton}</button>
      <section id="form" hidden>
        <label>${t().labelCaption}<input id="label" type="text" /></label>
        <button id="create" type="button">${t().createButton}</button>
      </section>
    `);
    document.getElementById("new")!.addEventListener("click", () => {
      document.getElementById("form")!.hidden = false;
    });

    const outcome = await prepareAddress(document, "example.com", { isTopFrame: false, timeoutMs: 300, pollMs: 5 });

    expect(outcome).toEqual({ kind: "ready" });
    expect((document.getElementById("label") as HTMLInputElement).value).toBe("example.com");
  });

  it("作成ダイアログの候補を一覧の完全一致で確定し、転送先を返さない", async () => {
    setBody(
      managementMarkup(t(), {
        candidate: `candidate-${locale}@icloud.com`,
        existing: [{ label: "shopping", address: `existing-${locale}@icloud.com` }],
        forwarding: `forward-${locale}@icloud.com`,
        forwardingList: true,
        label: "example.com",
      }),
    );
    const dialog = document.getElementById("dialog")!;
    const candidate = document.getElementById("candidate")!;
    document.getElementById("create")!.addEventListener("click", () => {
      const address = candidate.textContent ?? "";
      const label = (document.getElementById("label") as HTMLInputElement).value;
      dialog.remove();
      appendCreatedItem(address, label);
    });

    const result = await createAddress(document, { timeoutMs: 500, pollMs: 5, label: "example.com" });

    expect(result).toEqual({
      kind: "success",
      address: `candidate-${locale}@icloud.com`,
      copied: false,
      verified: true,
    });
    expect(result.kind === "success" ? result.address : "").not.toContain("forward-");
  });

  it("確定後に作成失敗の通知が出たら成功にしない", async () => {
    setBody(
      managementMarkup(t(), {
        candidate: `candidate-${locale}@icloud.com`,
        label: "example.com",
      }),
    );
    const error = document.getElementById("error")!;
    document.getElementById("create")!.addEventListener("click", () => {
      error.hidden = false;
      error.textContent = t().creationError;
    });

    const result = await createAddress(document, { timeoutMs: 300, pollMs: 5, label: "example.com" });

    expect(result).toMatchObject({ kind: "failed", clicked: true, code: "CREATE_FAILED" });
  });

  it("転送先だけが候補と一致する場合は成功にしない", async () => {
    setBody(
      managementMarkup(t(), {
        candidate: `candidate-${locale}@icloud.com`,
        forwarding: `candidate-${locale}@icloud.com`,
        forwardingList: true,
        label: "example.com",
      }),
    );
    const dialog = document.getElementById("dialog")!;
    document.getElementById("create")!.addEventListener("click", () => {
      dialog.remove();
      appendCreatedItem(`candidate-${locale}@icloud.com`, "different-label");
    });

    const result = await createAddress(document, { timeoutMs: 300, pollMs: 5, label: "example.com" });

    expect(result).toMatchObject({ kind: "failed", clicked: true, code: "RESULT_UNKNOWN" });
  });

  it("詳細画面から読み取り専用の戻るで一覧に戻り、ラベルを入れる", async () => {
    setBody(`
      <section id="list-view" hidden>
        <p>${t().activeCount}</p>
        <button id="add" type="button" aria-label="${t().plusLabel}">＋</button>
      </section>
      <button id="detail-back" type="button">${t().back}</button>
      <section id="detail" class="EmailDetail">
        ${detailMarkup(t(), "second.example", `detail-${locale}@icloud.com`, `forward-${locale}@icloud.com`)}
      </section>
      <section id="dialog" hidden>
        <h2>${t().newAddressHeading}</h2>
        <div id="candidate">dialog-${locale}@icloud.com</div>
        <input id="new-label" type="text" name="hme-label" value="" />
        <button id="create" type="button">${t().createButton}</button>
      </section>
    `);
    const listView = document.getElementById("list-view")!;
    const detail = document.getElementById("detail")!;
    const dialog = document.getElementById("dialog")!;
    const backClick = vi.fn();
    document.getElementById("detail-back")!.addEventListener("click", () => {
      backClick();
      detail.hidden = true;
      listView.hidden = false;
    });
    document.getElementById("add")!.addEventListener("click", () => {
      listView.hidden = true;
      dialog.hidden = false;
    });

    const outcome = await prepareAddress(document, "second.example", { isTopFrame: false, timeoutMs: 400, pollMs: 5 });

    expect(outcome).toEqual({ kind: "ready" });
    expect(backClick).toHaveBeenCalledTimes(1);
    expect((document.getElementById("new-label") as HTMLInputElement).value).toBe("second.example");
  });

  it("サインインボタンを言語別に判定する", () => {
    setBody(`<ui-button role="button"><button>${t().signIn}</button></ui-button>`);
    expect(detectAuth(document)).toBe("AUTH_REQUIRED");
  });

  it("確定文言と部分一致するだけの一般ボタンは押さない", async () => {
    setBody(`<h1>${t().title}</h1><button id="fake" type="button">${t().createButton} ヘルプ</button>`);
    const fakeClick = vi.fn();
    document.getElementById("fake")!.addEventListener("click", fakeClick);

    const result = await createAddress(document, { timeoutMs: 100, pollMs: 5, label: "example.com" });

    expect(result).toMatchObject({ kind: "failed", clicked: false, code: "UI_NOT_FOUND" });
    expect(fakeClick).not.toHaveBeenCalled();
  });
});
