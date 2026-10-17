# 検証結果

検証日: 2026-10-17  
環境: macOS 26.6.2 / Google Chrome 155.0.8059.82 / Google Chrome for Testing 148.0.7778.96

## 1. 自動チェック

| チェック | コマンド | 結果 |
| --- | --- | --- |
| 型チェック | `npm run typecheck` | 成功 |
| 単体テスト | `npm test` | 72件すべて成功 |
| 本番ビルド | `npm run build` | 成功（`dist/` を生成） |
| Chrome E2E | `npm run test:e2e` | 8シナリオすべて成功 |

### 単体テストの内訳

- ラベル生成（ホスト名、www除去、iCloud除外、タイトル補完、80文字制限）
- ログイン判定（サインインボタン、パスワード欄）
- セッション切れ
- 通信失敗（作成前は再試行可能、作成後は未確認）
- 作成失敗（クリック前はエラー、クリック後は未確認）
- 画面が見つからない場合
- 二重クリック・二重CREATEの防止
- Service Worker再起動時の状態復元（作成中なら未確認）
- 未確認状態からの明示的な再開

## 2. Chrome E2E（模擬iCloud画面）

Chrome for Testingに `dist-e2e/` を読み込み、ローカルHTTPサーバーの模擬iCloud画面で通し確認しました。実アカウントのアドレスは作成していません。

| シナリオ | 結果 |
| --- | --- |
| 作成成功 | アドレス表示、自動コピー成功、作成ボタンは1回だけ、HMEタイルの専用ボタン1回・他カード0回 |
| 未ログイン | `awaiting_login`、Appleサインインの案内を表示、作成試行なし |
| セッション切れ | `awaiting_login`、セッション切れの案内を表示、作成試行なし |
| 作成失敗 | `uncertain`、自動再試行なし、作成ボタンは1回だけ |
| 二重開始 | 2つの開始要求のうち採用は1つ、作成ボタンは1回だけ、アドレス表示あり |

### 実測時間

模擬iCloud画面での「作成してコピー」クリックから、アドレス表示・自動コピーまで:

- 2.542秒（最終実行）
- 2.463秒、2.470秒、2.521秒、2.522秒、2.525秒（追加実行）

ばらつきは **2.46〜2.54秒** でした。ローカルHTTPサーバーを使った模擬画面の値であり、実際のiCloud+の作成時間ではありません。

### 操作数

拡張機能側の操作は **2クリック** です。

1. ツールバーの拡張アイコンを押してポップアップを開く
2. 「作成してコピー」を押す

自動コピーに成功した場合、コピー操作は不要です。初回のAppleサインインはこれとは別に必要です。

## 3. 実際のiCloud.comでの未ログイン確認

実アカウントにはサインインせず、ログアウト状態の `https://www.icloud.com/icloudplus` で確認しました。

- 拡張機能が実際のiCloud.comのページを開いた。
- 1.02秒で `awaiting_login` になった。
- メッセージは「Appleのサインインが必要です。iCloudを開いてサインインしてください。」
- `createAttempted` は `false`。作成ボタンは押していない。
- Appleのログイン操作、パスワード入力、認証コード入力は行っていない。

この確認で、実際のiCloud.comのログアウト画面でコンテンツスクリプトが動き、サインイン案内まで到達することを確認しました。

## 4. セキュリティ・プライバシーの確認

- 要求権限は `storage`、`activeTab`、`clipboardWrite`、ホスト権限 `https://www.icloud.com/*` のみ。
- `cookies`、`tabs`、`webRequest`、`scripting`、`<all_urls>` は未要求。
- ソースとビルド成果物に、外部への `fetch` / `XMLHttpRequest`、`console` 出力、`storage.local` / `storage.sync` の使用がないことを確認。
- パスワード欄はログイン画面の判定にのみ使用し、値の読み取り・保存をしない。
- 作成したアドレスは `chrome.storage.session` とクリップボードだけに置く。`chrome.storage.session` はブラウザ再起動で消える。
- 作成ボタンを押した事実をセッションに記録し、二重クリック・再試行・Service Worker再起動時の重複作成を止める。
- 実アカウントのアドレス作成・無効化・削除は行っていない。

## 5. 未確認事項

以下は今回確認できていません。実機で使う前に、iCloudの画面で結果を確認してください。

1. **実際のログイン済みiCloud+でのHME作成・コピー**  
   実アカウントのアドレスを作らない方針のため、実際のHME画面のDOMに対する作成操作は未確認です。模擬画面とApple公式の文言・手順に基づいて実装しています。
2. **実際のHME画面のHTML構造**  
   Apple公式の画面DOMは公開されていません。作成画面の「ラベル」入力欄、「メールアドレスを作成」ボタン、新規アドレスの表示位置が、実装の想定と異なる可能性があります。
3. **実際の作成失敗・セッション切れの表示**  
   モックと単体テストでは確認済みですが、Appleの実際のエラー表示・再ログイン画面での挙動は未確認です。
4. **実際の作成時間**  
   実アカウントで作成していないため未計測です。モックの2.46〜2.54秒を実環境の値として扱わないでください。
5. **AppleのUI変更・別ホスト**  
   `beta.icloud.com` など別ホスト、日本語・英語以外のUI、将来の画面変更には未対応の可能性があります。
6. **OS・Chromeの組み合わせ**  
   確認したのはmacOS上のChrome 155とChrome for Testing 148です。Windows、Linux、その他のChromeバージョンでは未確認です。
7. **Chrome Web Storeからのインストール**  
   ストア公開・パッケージ署名は行っていません。未パッケージ拡張として `dist/` を読み込む方式のみ確認しています。

## 6. 実機で確かめる手順

1. `dist/` をChromeに読み込み、iCloud.comにサインインする。
2. 適当なサイトで拡張アイコンを開き、ラベルがホスト名になっていることを確認する。
3. 「作成してコピー」を押す。
4. iCloudのタブで「メールを非公開」画面が開き、ラベルが入り、「メールアドレスを作成」まで進むことを確認する。
5. 作成後、ポップアップにアドレスが表示され、クリップボードにコピーされていることを確認する。
6. iCloudの「メールを非公開」一覧で、同じアドレスが1つだけ増えていることを確認する。

作成結果が不明な場合は、拡張の「iCloudで確認」を開き、同じラベルのアドレスが重複していないか確認してください。重複がある場合は、拡張を使わずAppleの画面で整理してください。

## 7. 「iCloud+の機能」タブで止まる不具合の修正（2026-10-17 追記）

### 7.1 原因

実機の `https://www.icloud.com/icloudplus` の「iCloud+の機能」タブで、拡張機能が「メールを非公開」カードの前で止まっていました。原因は、カード見出しの先祖をたどって押せる要素を探す実装にありました。

指示元が実機のBraveで取得したDOMでは、見出しと操作ボタンが兄弟です（`article` > `div.hide-my-email-tile` の直下に `button.tile-button` と `div.banner .heading` が並ぶ）。そのため `clickableAncestor(heading)` では専用ボタンに到達できず、見出しやその先祖（操作要素ではない）を押していたため、管理画面へ遷移しませんでした。トップページにiframeはありません。

### 7.2 修正

- `src/lib/hme/dom.ts`: 指定要素の範囲にある操作要素（カード自身を含む）を、shadow DOMも含めて集める `interactiveDescendants` を追加。
- `src/lib/hme/automation.ts`: 見出しから最も近いカード境界（`tile`/`card` クラス、`role="listitem"`、見出し名を含む `aria-label`）を求める `findCardBoundary` と、その境界の中だけで操作要素を探す `findCardControl` を追加。カード内では見出し名を含む `aria-label` のボタン、`aria-haspopup` 付きボタン、その他の順に優先する。カード境界の外（別カードや全体ナビ）へは探索を広げない。`openHmeTile` は、カード内に有効な操作要素があればそれを押し、無い・無効・非表示なら `false` を返す。カード境界が取れない場合だけ、明確に操作要素である見出しの先祖を使う（操作要素でなければ `false`）。

### 7.3 自動チェック（この修正での実行結果）

| チェック | コマンド | 結果 |
| --- | --- | --- |
| 型チェック | `npm run typecheck` | 成功 |
| 単体テスト | `npm test` | 39件すべて成功 |
| 本番ビルド | `npm run build` | 成功（`dist/` を更新） |
| Chrome E2E | `npm run test:e2e` | 5シナリオすべて成功 |

追加した回帰テストは次のとおりです。

- 実DOM構造で、見出しの先祖探索では専用ボタンに到達できないことを固定
- 見出しの兄弟の専用ボタンを1回だけ押す（日本語・英語）
- 同じカード内に複数の操作要素があっても見出し名を持つ専用ボタンを優先
- 別カードのボタンを押さない
- `aria-hidden` 内の同じ見出しのカードを押さない
- 無効化された専用ボタンを押さず、`false` を返し、隣のカードも押さない
- カードにボタンが無いとき、隣のカードのボタンを押さず、`false` を返す
- カードのボタンが `hidden` のとき、隣のカードのボタンを押さず、`false` を返す
- 見出しだけでカード内に操作要素が無いとき、ヘッダの無関係なボタンを押さず、`false` を返す
- 見出しが操作要素の中にある従来構造でも押す

E2Eの模擬iCloud画面も、実機の `article` / `div.hide-my-email-tile` / 兄弟の `button.tile-button` / 2枚目のカードを持つ構造に更新しました。「作成成功」では、HMEタイルの専用ボタンが1回、他カードのボタンが0回であることを確認しています（模擬画面の値であり、実アカウントの作成時間ではありません）。

### 7.4 実機確認と未確認の区別

- 指示元の実機観測（この拡張機能によるものではない）: 実DOMで「メールを非公開」の専用ボタンをUIクリックすると管理画面が開きました。管理画面はsame-origin iframe（`https://www.icloud.com/applications/hidemyemail/...`）で、「7件の有効なメールアドレス」の見出し、`aria-label="追加"` のボタン、`aria-label="閉じる"` のボタンがあることを確認しています。既存アドレスには触れていません。
- 未確認: 修正後の拡張機能を実機のログイン済みiCloud+で動かし、カード遷移からアドレス作成確定まで通すことは確認していません。実アカウントのアドレス作成・無効化・削除は行っていません。
- 模擬画面で確認したこと: 実DOMに近い構造でのカード遷移、専用ボタンを1回だけ押すこと、他カードを押さないこと、その後の作成・コピーまでの流れ。

### 7.5 読み込み済み拡張への反映手順

1. `npm run build` を実行して `dist/` を更新する（この修正では更新済み）。
2. BraveまたはChromeで `chrome://extensions` を開く。
3. 「デベロッパーモード」をオンにし、読み込み済みの「iCloud+ メールを非公開 作成コピー」の更新ボタン（円形の矢印）を押す。
4. iCloud+を開いているタブを再読み込みする（`https://www.icloud.com/icloudplus`）。
5. ツールバーの拡張アイコンから「作成してコピー」を押し、「メールを非公開」の管理画面が開いて、ラベル入力と「メールアドレスを作成」まで進むことを確認する。作成を確定する前に、内容が意図どおりか確認する。

## 8. 「新しいメールアドレスを追加」で候補を成功と誤認する不具合の修正（2026-10-17 追記）

### 8.1 原因

実機の「新しいメールアドレスを追加」フォームで、確定前に表示される候補アドレスを、拡張機能が「作成済み」と誤認していました。指示元の実機観測では、Apple側はフォームと青い「メールアドレスを作成」ボタンが残ったままなのに、拡張機能は同じ候補アドレスを結果として「コピー済み」と表示していました。

- 旧 `createAddress` は、クリック前のアドレス集合（`before`）に無いアドレスが1つでも見つかると成功にしていました。HMEフォームは確定前に候補アドレスを表示し、「別のメールアドレスを使用」で候補を再生成します。そのため、確定していなくても候補の生成・再生成だけで「fresh」と判定され、コピーまで進んでいました。
- `findCreateButton` は部分一致で確定ボタンを探していたため、確定ボタン以外でも「メールアドレスを作成」を含む操作要素があると誤って押す可能性がありました。
- さらに、`findAllByText` を `interactiveOnly` で絞ると、確定ボタンを包む非interactiveな `div` の操作要素として、`clickableAncestor` が広い `ui-*` 祖先（`ui-panel` など）を返していました。指示元の再現DOM `<ui-panel><button id="regenerate">別のメールアドレスを使用</button><div class="button-bar-side"><button id="confirm">メールアドレスを作成</button></div></ui-panel>` では、`findCreateButton` が `confirm` ではなく `UI-PANEL` を返し、`clickElement` が `ui-panel` 直下の最初のボタン（`別のメールアドレスを使用`）を押して候補を再生成するだけになっていました。候補再生成だけで止まる実機の現象と一致します。

### 8.2 修正

- `src/lib/hme/automation.ts`
  - `findCreateButton`: 「メールアドレスを作成」または `/^create email address$/i` と完全一致するラベルを持つ要素だけを対象にし、`button`／submit系`input`／`role="button"`／`*-button` の実際の確定ボタンそのものを返す。ボタン内`span`の文言のときだけボタン祖先までさかのぼり、非interactiveな親`div`から広い `ui-*` 祖先（`ui-panel` 等）へ乗り換えて別ボタンに置き換わることはしない。
  - `extractEmails(doc, scope?)`: フォーム内だけのアドレスを取れるようにした。
  - `findFormContainer` / `isCreateFormOpen`: 確定ボタンを含むフォーム（`role="dialog"` 等）の境界を取り、確定ボタンが残っている間、またはフォーム境界がDOM上に表示されている間は「フォームが開いている」と判定する。
  - `createAddress`: フォームが開いている間に出たアドレスは候補の生成・再生成として無視する。フォームが閉じてから、確定前にフォーム内にあった候補アドレスが作成済みとして見える場合、または新しいアドレスが現れた場合だけ成功とし、そのときだけコピーする。フォームが閉じないまま失敗・タイムアウトした場合は `RESULT_UNKNOWN`（未確認）にしてコピーしない。
- `tests/automation.test.ts` / `tests/content.test.ts`: 実画面に近いダイアログ（候補・別のメールアドレスを使用・ラベル・任意メモ・戻る・確定）と、`ui-panel` 祖先の再現DOMを用意し、上記を回帰テスト化。
- `tests/e2e/mock-server.mjs` / `tests/e2e/run.mjs`: 模擬HME画面の作成フォームを `ui-panel` の下に候補再生成ボタンと `div` 内の確定ボタンを持つ構造にし、確定1回・候補再生成0回・候補と一致するアドレスの成功・コピーを確認。この構造は旧実装では `ui-panel` 直下の候補再生成ボタンを押して失敗する。

### 8.3 自動チェック（この修正での実行結果）

| チェック | コマンド | 結果 |
| --- | --- | --- |
| 型チェック＋単体テスト＋本番ビルド | `npm run check` | 終了コード0、単体テスト55件すべて成功、`dist/` 更新 |
| Chrome E2E | `npm run test:e2e` | 終了コード0、5シナリオすべて成功 |

E2E「作成成功」の実測:

- 経過時間 2943ms（模擬画面の値。実アカウントの作成時間ではない）
- 確定ボタン1回（`createCalls: 1`）
- 候補再生成0回（`regenerateCalls: 0`）
- 表示したアドレスと模擬HMEが作成した候補が一致（`candidateMatched: true`）
- 自動コピー成功（`copied: true`）

追加・更新した回帰テスト:

- 候補の表示→確定1回→フォームが閉じて同じ候補が一覧に出たら、そのアドレスをコピーする
- 確定前に候補が生成されても成功扱いしない（結果不明・コピーなし）
- 確定前に候補が再生成されても成功扱いしない（結果不明・コピーなし）
- フォームが閉じて新しいアドレスが出たら、そのアドレスをコピーする
- 確定時に候補と異なるアドレスが作成されたら、作成された方を使う
- 既存アドレスがあっても、確定した候補のアドレスをコピーする
- 作成失敗の表示を検出したら、再試行せずコピーしない
- 確定ボタンが無ければクリックせず失敗を返す
- 確定ボタンにaria-labelが付いていても、表示テキストが一致すれば押す
- 確定ラベルと部分一致するだけのボタンは押さない
- 再現DOM（`ui-panel` 祖先）で `findCreateButton` が `confirm` を返す
- 非interactiveな親`div`から広い`ui-panel`祖先へ乗り換えない（旧不具合の固定。旧実装の祖先探索が`UI-PANEL`を返すことも固定）
- `ui-panel`祖先下でも `createAddress` が確定1回・候補再生成0回で成功する
- ボタン内`span`文言、`aria-label`のみ、`aria-label`＋表示名、英語、`disabled`、shadow DOM内の確定ボタン探索を維持
- 従来のカード遷移（英語・日本語・別カード・hidden・disabled）の回帰を維持

### 8.4 実機確認と未確認の区別

- 確認済み（指示元の実機観測）: 実機ではフォームと確定ボタンが残ったまま、拡張機能が候補アドレスを成功として表示していた（誤認）。実DOMの確定ボタンは `<button ...>メールアドレスを作成</button>`、ラベルは `input[name="hme-label"]`、任意メモ、候補表示、「別のメールアドレスを使用」「戻る」「閉じる」がある。指示元は確定ボタンを押していない。
- 確認済み（指示元の独立検証・再現）: 再現DOM `<ui-panel><button id="regenerate">別のメールアドレスを使用</button><div class="button-bar-side"><button id="confirm">メールアドレスを作成</button></div></ui-panel>` をJSDOMで実行すると、旧 `findCreateButton` は `selectedTag="UI-PANEL"`, `selectedId=""` を返し、`clickElement` が `ui-panel` 直下の `regenerate` を押していた。今回この再現を回帰テストに固定した。
- 未確認: 修正後の拡張機能を実機のログイン済みiCloud+で動かし、実際の「メールアドレスを作成」を確定して作成・コピーまで通すことは確認していません。実アカウントのアドレス作成・無効化・削除は行っていません。
- 模擬画面で確認したこと: `ui-panel` 祖先の下に候補再生成ボタンと `div` 内の確定ボタンがある構造で、確定1回・候補再生成0回・候補と一致するアドレスの成功・コピー。候補だけが出た場合に成功扱いしないこと。
- 読み込み済み拡張への反映手順は 7.5 と同じ（`npm run build` 済み、`chrome://extensions` で更新、iCloud+タブを再読み込み）。

## 9. iCloudタブを前面に出さずに作成する変更（2026-10-17 追記）

### 9.1 目的

「毎回iCloudに遷移するのが面倒」という要望に対し、通常の作成ではiCloudタブを前面化せず、現在のサイトとポップアップに留まったまま作成と自動コピーを完了できるようにしました。前面化するのは、ユーザーが「iCloudを開く」を明示的に押したときだけです。

### 9.2 公式に確認したこと（Chrome for Developers / MDN）

Chrome for Developersの各ページを開いて確認しました。

- `chrome.tabs.create` の `active`（省略可能・boolean）: 「Whether the tab should become the active tab in the window. Does not affect whether the window is focused (see windows.update). Defaults to true.」→ `active:false` で非アクティブのタブを作成でき、ウィンドウのフォーカスは変わりません。
- `chrome.tabs.update` の `active`（省略可能）: 「Whether the tab should be active. Does not affect whether the window is focused (see windows.update).」また「Properties that are not specified in updateProperties are not modified.」→ `active` を指定しなければタブの前面/背面状態は変わりません。
- `chrome.windows.update` の `focused`: 「If true, brings the window to the front; cannot be combined with the state 'minimized'. If false, brings the next window in the z-order to the front; can be combined with state 'minimized'.」→ ウィンドウを前面に出すのは `focused:true` を指定したときです。通常の作成では呼びません。
- Service Workerのライフサイクル: 「Normally, Chrome terminates a service worker when one of the following conditions is met: After 30 seconds of inactivity. Receiving an event or calling an extension API resets this timer.」と、予期せぬ終了に備えてデータを永続化することが推奨されています。本拡張は状態を `chrome.storage.session` に保存し、作成中に中断した場合は「未確認」にします。
- `chrome.offscreen`: 「Service workers don't have DOM access」であり、隠しドキュメントでDOM APIを使えること、`CLIPBOARD` の理由があること、「Offscreen documents can't be focused」が記載されています。ただし `offscreen` 権限が新たに必要になるため、今回は採用していません。
- Permissions listの `clipboardWrite`: 「Lets the extension cut and copy items to the clipboard using the web platform Clipboard API.」→ 既存権限でポップアップからコピーできます。
- Clipboard API（MDN・標準のリファレンス）: 「Writing requires either the clipboard-write permission or transient activation. If the permission is granted, it persists, and further transient activation is not required.」また「This API is not available in Web Workers」。Service WorkerにはDOMが無く、このAPIも使えません。

公式記載と観測の区別: 上記は公式ドキュメント・MDNの記載です。実際にiCloudタブが非アクティブのまま作成できるか、ポップアップでコピーできるかは、下記の模擬E2Eで観測しました（実アカウントでは未確認）。

### 9.3 変更

- `src/background.ts`: 通常の作成で使う `openIcloudTab` を、既存のiCloudタブの再利用（URLが違う場合だけ `tabs.update({url})`、`active` は指定しない）と、無ければ `tabs.create({active:false})` に変更。`focusTab`（`tabs.update({active:true})` と `windows.update({focused:true})`）は `OPEN_ICLOUD` のときだけ使います。
- `src/background.ts`: PREPAREに応答が無いときの再読み込みは、`shouldReloadForPrepare` で「jobId一致・`state.status==="preparing"`・`createAttempted`なし・未再読み込み」のときだけ行います。`await sendToTab` の間に `handleContentEvent` が `ready`／`creating`／終端へ進めていた場合は、確定処理を壊さないよう再読み込みも追加PREPAREも行いません。
- `src/lib/job.ts` / `src/lib/protocol.ts`: `MARK_COPIED` に `jobId` と `address` を持たせ、`markCopied` は一致する成功状態だけを「コピー済み」にします。古いポップアップの非同期コピー完了や別アドレスの記録は拒否します。
- `src/popup.ts`: 自動コピーは `await` 後に `currentState` が同じ `jobId`・`address` のままのときだけ表示を書き換え、一致する `jobId`／`address` を `MARK_COPIED` で送ります。
- `src/lib/hme/automation.ts`: iCloudタブのcontent scriptはクリップボードへコピーしません（`copyText` を削除）。コピーはフォーカスされているポップアップ側だけで行います。
- 権限の追加はありません（`storage`、`activeTab`、`clipboardWrite`、`https://www.icloud.com/*` のまま）。

### 9.4 検証結果

| チェック | コマンド | 結果 |
| --- | --- | --- |
| 型チェック＋単体テスト＋本番ビルド | `npm run check` | 終了コード0、単体テスト60件すべて成功、`dist/` 更新 |
| Chrome E2E | `npm run test:e2e` | 終了コード0、8シナリオすべて成功 |

模擬E2Eで観測した値（ローカルHTTPサーバー、Chrome for Testing。実アカウントの値ではありません）:

- 作成成功（裏タブ・自動コピー）: iCloudタブ `active:false`、前後でactiveタブ不変、入力元サイトの再読み込みなし、ポップアップの自動コピーでクリップボードが作成アドレスと一致、`copied:true`。2026-10-17の実行で1854ms。
- iCloudタブを再利用（reloadなし・別アドレス）: テスト側でもreload/gotoせず、同じiCloud画面のまま2件目を作成。iCloudタブは1枚・`active:false`、候補は `mock-candidate-1` と `mock-candidate-2` で別、確定2回・候補再生成0回。
- 手動でiCloudを開く: `OPEN_ICLOUD` の後だけ `active:true`。
- 未ログイン／セッション切れ: `awaiting_login` の案内。作成試行なし。
- 作成失敗: `uncertain`、`address:null`、`copied:false`、クリップボードの内容は変更なし。
- 二重開始: 採用は1つ、そのジョブの確定ボタンは1回（連続作成の累計で判定）。
- ポップアップを閉じて再表示: ポップアップを閉じ、入力元サイトを前面にしたままService Workerの `chrome.storage.session` をテスト側から観測。閉じたまま `success` に到達し、その時点で `copied:false`（背景文書はコピーしない）、入力元タブはactive・iCloudタブはinactive。開き直すと結果を表示し、ポップアップ側でコピーしてクリップボードが一致。

追加した単体テスト: 成功とアドレスが一致するときだけコピー記録、古いジョブ・異なるアドレスの記録拒否、PREPARE無応答時は準備中で未作成のときだけ再読み込み、`ready`／`creating`／終端では再読み込み・追加PREPAREをしない。

E2Eの補足: 拡張ポップアップはPlaywrightではタブとして開きます（実際のポップアップとは異なるテスト都合です）。「元のタブがactiveのまま」は、実行前後でactiveタブIDが変わらず、iCloudタブがactiveでないことで確認しています。入力元サイトはiCloudモックと別オリジン（`127.0.0.1:4174`）に置き、マーカーが消えていないことで再読み込みされていないことを確認しています。クリップボードのテスト許可は読み取り（`clipboard-read`）だけで、書き込みは製品manifestの `clipboardWrite` で動くことを確認しています。模擬iCloudはモードを変えるシナリオだけテスト側でiCloudタブを裏のまま再読み込みし、normal→normalの連続作成ではreloadしていません。

### 9.5 実機確認と未確認の区別

- 模擬E2Eで確認: iCloudタブを非アクティブで用意・再利用すること、前面化しないこと、同じ画面からreloadなしで連続作成できること、ポップアップを閉じたまま完了し、開き直すとポップアップ側でコピーできること（背景文書ではコピーしないこと）。
- 未確認: 実際のBrave／Chromeのログイン済みiCloud+で、裏タブのままHMEアドレスを作成し、実ポップアップで自動コピーまで通すこと。実アカウントのアドレス作成・無効化・削除は行っていません。
- 未確認: 作成中にService Workerが実際に休止した場合の継続。状態の保存と「未確認」への遷移は単体テストで確認していますが、実機で30秒以上の休止を挟む検証はしていません。
- 未確認: Brave固有の挙動（クリップボード許可、バックグラウンドタブのタイマー抑制）。公式仕様とChrome for Testingの模擬で確認した範囲です。

## 10. 転送先メールを誤取得する不具合の修正（2026-10-17 追記）

### 10.1 原因

実機のHME管理画面で、拡張の結果欄に作成した非公開アドレスではなく、同じ`@icloud.com`の**転送先（本来のメールアドレス）**が表示・コピーされていました。管理画面には次のものが同じ画面に混在します。

- 作成済みアドレスの一覧（各項目はbuttonで、ラベル見出しと非公開アドレスを持つ）
- 別セクションの見出し「転送先：」と、転送先radio（説明が `forward-user@icloud.com （主要メールアドレス）` の形式）
- アカウントのメール表示、任意メモ欄、非表示DOM

旧実装は `extractEmails(doc)` で画面全体から`@icloud.com`を集め、`before`に無い最初のアドレスを成功としていました。また、フォーム境界が広いと転送先を候補に含めました。転送先も`@icloud.com`のため、ドメインでは区別できません。さらに一覧項目の照合が `item.text.includes(label)` の部分一致だったため、ラベル`icloud.com`が全アドレス本文に一致したり、`foo`が`foobar`に混ざる余地がありました。

### 10.2 修正

- `src/lib/hme/automation.ts`
  - `exactAddressOf`: 要素自身のテキストが完全に1つのアドレスで、`input/textarea/select`・メモ欄の値を含まないときだけ採用。最深の一致だけを残し、見出しとアドレスが連結した親要素を拾わない。
  - `findCreateScreen` / `candidateAddressFromScreen`: 作成見出し「新しいメールアドレスを追加」・`input[name="hme-label"]`・確定ボタンの最も近い共通の先祖を作成画面とし、body/htmlまで広がる場合は特定不能として止める。作成画面内でも、転送先セクション（「転送先」見出しとradioを含む先祖）・`radiogroup`/`fieldset`・radioの`label`・hiddenを構造で除外する。完全一致アドレスがちょうど1つのときだけ候補にし、複数・無しは確定せず `RESULT_UNKNOWN`。
  - `findAddressItems` / `itemLabelOf`: 一覧項目は、見出し（`h1`-`h6`や`[role="heading"]`等）と、ちょうど1つの完全一致アドレスを持つ`button`/`li`/`article`/`[role="listitem"]`に限定。転送先・radio・作成フォーム内は除外し、親子の入れ子は内側の実項目だけ残して二重に数えない。
  - 確定後は、**保持した今回の作成候補と一致し、今回のラベル見出しが正規化完全一致する一覧項目**が、作成前のアドレス集合に無い新規項目として確認できた場合だけ成功にする。候補が確定時に変わった場合や、同じラベルの別の項目（隠れていた旧一覧が現れた場合を含む）しか無い場合は、本物を一意に保証できないため成功にせず `RESULT_UNKNOWN` で止める。
- `src/lib/protocol.ts` / `src/lib/job.ts` / `src/content.ts`: 作成結果に `verified` を持たせ、作成を確認できた結果だけを成功として扱う。`created` で `verified` でない結果は未確認にし、`restoreState` は修正前に保存された未確認の成功結果を「未確認」にしてアドレスを残さない。
- `src/popup.ts`: 表示・自動コピー・手動コピーは `verified` の結果だけを対象にする（古い誤取得結果の再表示・再コピーを防ぐ）。`shouldAutoCopy` で自動コピーを判定。

### 10.3 検証結果

| チェック | コマンド | 結果 |
| --- | --- | --- |
| 型チェック＋単体テスト＋本番ビルド | `npm run check` | 終了コード0、単体テスト72件すべて成功、`dist/` 更新 |
| Chrome E2E | `npm run test:e2e` | 終了コード0、8シナリオすべて成功 |

追加・更新した回帰テスト（単体）:

- 転送先・アカウント・メモ・hiddenが混在しても、ダイアログの候補だけを返す
- 転送先が`li`/`article`/`button`配下にあっても、一覧項目として扱わない
- 作成候補が無く転送先だけある場合は確定せず未確認（確定ボタン0回）
- 候補が複数・hidden内だけの場合は確定せず未確認
- 候補が作成前から一覧にあるだけでは成功にしない
- 候補が確定時に変わった場合は未確認で止める（本物を一意に保証できないため）
- 隠れていた同ラベルの旧一覧が現れただけでは成功・verifiedにしない（候補と一致しない）
- ラベル見出しの完全一致（`icloud.com`が本文に含まれるだけ、`foo`と`foobar`を不一致）
- 転送先本文に現在のラベルが含まれても一覧項目にしない
- `li`>`button`の入れ子でも二重に数えず1件で成功
- `verified`でない`created`は成功にしない／修正前の未確認成功は復元時に未確認／`shouldAutoCopy`は確認済みだけtrue

E2E（模擬管理画面に転送先・アカウント・メモ・hiddenを混在。すべて同じ`@icloud.com`）:

- 作成成功: 返る値とコピー値が `mock-candidate-N@icloud.com`（今回のHME）と一致。転送先・アカウント・メモ・hiddenのアドレスは結果に出ない（`hmeOnly: true`）。経過時間1865ms。
- iCloudタブを再利用: reloadなしで2件目を作成し、別アドレス（`mock-candidate-1` と `mock-candidate-2`）、タブは1枚・inactive。
- 作成失敗: `address:null`、`copied:false`、クリップボード不変。
- ポップアップを閉じて再表示: 閉じたまま完了（`backgroundCopied:false`）、元サイトactive・iCloud inactive、開き直すとポップアップ側でコピーし、クリップボードが今回のHMEと一致。

### 10.4 実機確認と未確認の区別

- 確認済み（指示元の実機観測）: 結果欄に転送先の本来のメールアドレスが表示・コピーされていた。
- 未確認: 修正後の拡張を実際のログイン済みiCloud+で動かし、実機の管理画面（転送先・一覧・アカウント表示・メモの実際のDOM）で今回のHMEだけを返すこと。実アカウントのアドレス作成・無効化・削除は行っていません。
- 未確認: 実際の一覧項目の見出し要素（実DOMはbutton内`h2`との観測）や転送先セクションの構造が、模擬と異なる場合の挙動。公式にDOM構造は公開されていないため、画面変更時は再確認が必要です。
