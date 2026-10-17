# iCloud+「メールを非公開」作成コピー

いま見ているサイト名をラベルにして、iCloud+の「メールを非公開」アドレスを作成し、クリップボードへコピーする Manifest V3 拡張機能です。作成中もiCloudのタブへ切り替わらず、開いているサイトとポップアップから離れずに完了できます。

- 拡張機能側の操作は **2クリック**（ツールバーのアイコン → 「作成してコピー」）。作成に成功すると、ポップアップ側で自動でコピーします。
- 通常の作成ではiCloudのタブを前面に出しません。既存のiCloudタブを裏で再利用し、無ければ非アクティブのタブとして開きます。
- 二重クリックや安易な再試行で、同じアドレスを重複作成しないようにしています。
- パスワードや認証コードは扱いません。Appleのログイン画面で本人がサインインします。
- 作成したアドレスを外部サービスへ送信しません。保存先はブラウザのセッション内だけです。

## 必要なもの

1. Google Chrome 120 以上
2. iCloud+ の契約（本人またはファミリー共有）
3. Apple Account の2ファクタ認証
4. 普段使っているChromeでiCloudにサインインできること

作成には2ファクタ認証が必要です。iCloud+に加入していても、iCloud.comに「メールを非公開」が表示されない場合は、ウェブ限定アクセスなどの可能性があります（Appleの公式注記）。

## インストール

このリポジトリには、読み込み用の `dist/` を同梱しています。ビルドは不要です。

1. Chromeで `chrome://extensions` を開きます。
2. 右上の「デベロッパー モード」をオンにします。
3. 「パッケージ化されていない拡張機能を読み込む」を押します。
4. このプロジェクトの `dist` フォルダを選びます。
5. ツールバーのパズルピースから「iCloud+ メールを非公開 作成コピー」をピン留めします。

ソースから作り直す場合:

```bash
npm install
npm run build
```

`dist/` が更新されます。読み込み済みの拡張は、`chrome://extensions` の再読み込みボタンで反映してください。

## 使い方

1. メールアドレスを入力したいサイトを開きます。
2. ツールバーの拡張アイコンを押します。
3. ラベルを確認します。現在のタブのホスト名（例: `example.com`）が自動で入ります。必要なら書き換えます。
4. 「作成してコピー」を押します。このとき、開いているサイトとポップアップは切り替わりません。
5. 初回だけAppleのサインインが必要です。ポップアップの「iCloudを開く」を押すとiCloudのタブが前面に出るので、そこでサインインします。サインイン後はポップアップに戻り、もう一度「作成してコピー」を押します。
6. 作成できたら、アドレスがポップアップに表示され、自動でクリップボードへコピーされます。コピーされなかった場合は「コピー」を押します。

iCloudのタブは裏で開いたままになります。内容を確認したいときは、ポップアップの「iCloudで確認」から明示的に開けます。

### ポップアップを閉じたとき

作成中にポップアップを閉じても、ジョブは取り消されません。完了後にポップアップを開き直すと、結果が表示され、そのままコピーできます。

### 操作数と時間

- 拡張機能側の操作: **2クリック**（アイコン、作成ボタン）。自動コピーに成功した場合、コピー操作は不要です。
- ローカルの模擬iCloud画面を使ったE2Eでは、作成開始からアドレス表示・コピーまで数秒で完了しました（裏タブのまま作成、同じiCloud画面から連続作成）。模擬画面の値で、環境により変動します。
- 実際のiCloud+での作成時間は計測していません。実アカウントでアドレスを作成していないためです。「一瞬で終わる」とは保証できません。回線やiCloudの応答によって変わります。

## 仕組み

Appleの公開APIではなく、iCloud.comの公式Web画面を拡張機能が操作します。

1. `icloud.com/icloudplus` のタブを裏で用意する（既存タブを再利用、無ければ非アクティブで開く）
2. 「メールを非公開」を開く
3. 新しいアドレスの作成画面を開く
4. ラベルを入力する
5. 「メールアドレスを作成」を押す
6. 作成画面の候補アドレスと、確定後の結果（一覧項目のラベル見出し＋アドレス、または作成済み詳細画面の非公開アドレス欄）を突き合わせて、今回作成したHMEだけを読み取り、フォーカスされているポップアップ側でクリップボードへコピーする（iCloud側のcontent scriptはコピーしない）

作成画面の候補は作成ダイアログの中だけから取ります。転送先・アカウントのメール・既存一覧・メモ欄・非表示のアドレスは候補にも作成結果にもしません。確定後は、保持した今回の候補と一致し、今回のラベル見出しが完全一致する一覧項目か、作成済み詳細画面（`.EmailDetail`）の非公開アドレス欄（`.EmailDetail-hmeField`）が確認できた場合だけ成功にします。詳細画面では転送先欄（`.EmailDetail-forwardToField`）は読みません。候補を1つに特定できない場合、候補が確定時に変わった場合、一致する結果を確認できない場合は、成功扱いにせず「未確認」で止め、コピーしません。

バックグラウンドのタブではClipboard APIが使えないことがあるため、コピーはポップアップ側で行います。確定前に表示される候補アドレスはコピーせず、確定後だけコピーします。

非公開APIを直接呼び出してはいません。ただし、iCloud.comの画面DOMや内部の画面遷移に依存します。Appleが公式に提供する拡張機能向けAPIではないため、画面が変わると動かなくなることがあります。

詳しい調査結果と、公式に書かれていること／書かれていないことの区別は [docs/research.md](docs/research.md) にまとめています。

## 制約

- Appleの公開APIには、HMEアドレスを任意に作成するエンドポイントが公式ドキュメント上に見当たりません。本拡張は画面操作で作成します。
- iCloud+の契約と2ファクタ認証が必要です。同じApple AccountでiCloud.comにサインインしている必要があります。
- 対応するiCloudの画面は `www.icloud.com` です。Appleが別ホスト（betaなど）へ切り替えた場合は動作しません。
- iCloudの表示言語は日本語と英語の主要な文言に対応しています。それ以外の言語や文言変更には対応できない場合があります。
- ラベルの文字数・使用可能文字・作成できるアドレス数はApple側の仕様に従います。本拡張は上限を独自に判定しません。
- 通常の作成ではiCloudのタブを前面に出しません。前面になるのは、ユーザーが「iCloudを開く」を押したときだけです。
- 自動コピーはポップアップ側だけで行います。iCloudのタブ（背景文書）ではコピーしません。ポップアップを閉じていた場合は、完了後に開き直すと結果が表示され、コピーできます。バックグラウンドのタブやService WorkerではClipboard APIが使えないことがあるため、iCloudのタブを前面にしてコピーする回避策は取りません。
- 作成中にService Workerが休止した場合に備え、状態は `chrome.storage.session` に保存します。作成中に中断した場合は「未確認」として自動再試行を止めます。
- 作成結果を確認できなかった場合、拡張は「未確認」として自動再試行を止めます。iCloudで結果を確認し、チェックを入れてから再開してください。重複作成を避けるための動作です。
- Appleの利用規約・サポートの対象外です。業務や重要な用途で使う場合は、Appleの公式画面でも結果を確認してください。

## 権限

| 権限 | 用途 |
| --- | --- |
| `storage` | 作成状況と結果を `chrome.storage.session` に一時保存するため |
| `activeTab` | ポップアップを開いたときだけ、現在のタブのURL・タイトルをラベル候補に使うため |
| `clipboardWrite` | 作成したアドレスをクリップボードへコピーするため |
| `https://www.icloud.com/*` | iCloud.comの「メールを非公開」画面を操作するため |

`cookies`、`tabs`、`webRequest`、`scripting`、`<all_urls>` は要求していません。ブラウザの保護機能を無効にする操作もしません。

## プライバシー

- パスワード、認証コード、Cookieを読み取り・保存・送信しません。
- 作成したアドレスは、拡張機能のセッションストレージとクリップボードにだけ置きます。`chrome.storage.session` はブラウザを再起動すると消えます。
- 外部のサーバーへ通信しません。通信するのは、ユーザーが開いたiCloud.comの画面とAppleの間だけです。
- 拡張機能のログにアドレスや認証情報を出しません。
- 二重作成を防ぐため、作成ボタンを押した事実とジョブ状態だけをセッション内に残します。

## うまくいかないとき

**「Appleのサインインが必要です」と出る**  
ポップアップの「iCloudを開く」を押すとiCloudのタブが前面に出ます。そこでサインインし、ポップアップに戻って、もう一度作成してください。

**「iCloudの画面を開けませんでした」と出る**  
Appleのサインイン、通信状態、iCloud+の加入状況を確認してください。「iCloudを開く」で画面を確認できます。

**「作成結果を確認できませんでした」と出る**  
二重作成を防ぐため、自動では再試行しません。「iCloudで確認」を開き、同じラベルのアドレスが増えていないか確認してください。確認できたら、チェックを入れて「確認済みにして再開」を押します。

**「iCloud+の画面が見つかりませんでした」と出る**  
iCloud.comに「メールを非公開」が表示されるか確認してください。表示されない場合は、iCloud+の加入状況やウェブ限定アクセスを確認してください。

**コピーされない**  
ポップアップの「コピー」を押してください。iCloudのタブを前面にする必要はありません。ポップアップを閉じていた場合は、開き直すと結果が表示されます。

## 確認方法

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

- `npm test`: 78件の単体テスト（ログイン判定、セッション切れ、通信失敗、作成失敗、二重操作、状態復元、コピー記録、再読み込み判定、転送先・同一ドメインの候補/結果の識別、作成済み詳細画面の照合、詳細画面からの新ジョブ準備）
- `npm run test:e2e`: Chrome for Testingに拡張を読み込み、ローカルの模擬iCloud画面で作成・コピー・未ログイン・セッション切れ・作成失敗・二重開始に加え、次を確認
  - 元のタブがactiveのまま、iCloudタブがinactiveであること
  - 同じiCloud画面からreloadなしで2件目を作成し、別アドレスになること（タブは増やさない）
  - 「iCloudを開く」を押したときだけ前面になること
  - ポップアップを閉じたまま完了し、開き直すと結果を確認・コピーできること（背景文書ではコピーしないこと）
  - 転送先・アカウント・メモ・hiddenに同じ`@icloud.com`のアドレスを混在させても、返る値とコピー値が今回のHMEになること
  - 作成済み詳細画面（`.EmailDetail`）で非公開アドレス欄とラベルを根拠に今回のHMEを返し、転送先欄を返さないこと
  - 詳細画面から読み取り専用の「戻る」で一覧に戻り、同じタブ・iframeのまま3件連続作成できること（戻る2回・確定3回・無効化0回）
- 実アカウントでの作成・無効化・削除は行っていません

実機で確認した範囲と未確認事項は [docs/verification.md](docs/verification.md) にあります。

## 開発

```text
src/
  manifest.json       Manifest V3
  background.ts       ジョブ管理、タブ操作、二重開始の防止
  content.ts          iCloud画面での準備・作成・コピー
  popup.html/css/ts   日本語UI
  lib/hme/            DOM操作と作成フロー
  lib/job.ts          状態遷移と復元
tests/
  *.test.ts           単体テスト
  e2e/                模擬iCloud画面でのChrome E2E
```

主なコマンド:

```bash
npm run check       # 型チェック、単体テスト、本番ビルド
npm run test:e2e    # E2EビルドとChromeでの通し確認
```

E2Eは拡張機能の読み込みに対応したChrome for Testing（またはChromium）を使います。別の場所にある場合は `CHROME_PATH` を指定してください。

```bash
CHROME_PATH="/path/to/Google Chrome for Testing" npm run test:e2e
```

## 公式資料

- [iCloud+の「メールを非公開」をすべてのデバイスで設定して使用する（日本語）](https://support.apple.com/ja-jp/guide/icloud/mm9d9012c9e8/icloud)
- [iCloud.comで「メールを非公開」のアドレスを作成および編集する（日本語）](https://support.apple.com/ja-jp/guide/icloud/mm1a876f7aed/icloud)
- [Create and edit Hide My Email addresses on iCloud.com（英語）](https://support.apple.com/en-us/guide/icloud/mm1a876f7aed/icloud)
- [「Appleでサインイン」で「メールを非公開」を使う方法（日本語）](https://support.apple.com/ja-jp/105078)
- [Sign in with Apple REST API（Apple Developer）](https://developer.apple.com/documentation/signinwithapplerestapi)
- [Manifest file format（Chrome for Developers）](https://developer.chrome.com/docs/extensions/reference/manifest)
- [Declare permissions（Chrome for Developers）](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [The "activeTab" permission（Chrome for Developers）](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [chrome.storage（Chrome for Developers）](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [chrome.tabs（Chrome for Developers）](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [chrome.windows（Chrome for Developers）](https://developer.chrome.com/docs/extensions/reference/api/windows)
- [The extension service worker lifecycle（Chrome for Developers）](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [chrome.offscreen（Chrome for Developers）](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Permissions list（clipboardWrite）（Chrome for Developers）](https://developer.chrome.com/docs/extensions/reference/permissions-list)
- [Clipboard API（MDN）](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)
