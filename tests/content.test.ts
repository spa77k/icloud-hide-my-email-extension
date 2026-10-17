import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (
  message: { type: string; jobId?: string; label?: string },
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => boolean;

let listener: Listener | null = null;
let sentMessages: Array<Record<string, unknown>> = [];

function send(message: { type: string; jobId: string; label?: string }): Promise<unknown> {
  if (!listener) throw new Error("content listener was not registered");
  return new Promise((resolve) => {
    const returns = listener!(message, {}, resolve);
    expect(returns).toBe(true);
  });
}

beforeEach(async () => {
  vi.resetModules();
  listener = null;
  sentMessages = [];
  document.body.innerHTML = "";

  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });

  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: {
        addListener: (fn: Listener) => {
          listener = fn;
        },
      },
      sendMessage: vi.fn(async (message: Record<string, unknown>) => {
        sentMessages.push(message);
        return { ok: true };
      }),
    },
  });

  await import("../src/content");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("コンテンツ側の重複防止", () => {
  it("CREATEを2回受信しても、作成ボタンは1回だけ押す", async () => {
    document.body.innerHTML = `
      <h1>メールを非公開</h1>
      <label>ラベル <input id="label" type="text" /></label>
      <button id="create">メールアドレスを作成</button>
    `;
    const createClick = vi.fn();
    const button = document.getElementById("create")!;
    button.addEventListener("click", () => {
      createClick();
      setTimeout(() => {
        const address = document.createElement("div");
        address.textContent = "dedupe-check@icloud.com";
        document.body.appendChild(address);
      }, 5);
    });

    const prepared = await send({ type: "PREPARE", jobId: "job-1", label: "example.com" });
    expect(prepared).toMatchObject({ ok: true, status: "ready" });

    const first = await send({ type: "CREATE", jobId: "job-1" });
    expect(first).toMatchObject({ ok: true, status: "accepted" });

    const second = await send({ type: "CREATE", jobId: "job-1" });
    expect(second).toMatchObject({ ok: false, status: "failed" });
    expect(createClick).toHaveBeenCalledTimes(1);

    expect(sentMessages).toContainEqual(
      expect.objectContaining({
        type: "JOB_EVENT",
        jobId: "job-1",
        phase: "created",
        address: "dedupe-check@icloud.com",
      }),
    );
  });
});
