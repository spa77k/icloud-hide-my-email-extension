# 調査メモ: iCloud+「メールを非公開」とChrome拡張

調査日: 2026-10-17  
対象: iCloud+の「メールを非公開」（Hide My Email）をChrome拡張から作成・コピーする方法

## 1. Apple公式で確認したこと

### 1.1 利用条件

AppleのiCloudユーザガイド「iCloud+の「メールを非公開」をすべてのデバイスで設定して使用する」には、次の記載があります。

- 自分またはファミリー共有グループの誰かがiCloud+サブスクリプションに登録している場合、iPhone、iPad、Mac、およびiCloud.comで「メールを非公開」にアクセスできる。
- それぞれのデバイスで、同じApple Accountにサインインしている必要がある。サインインしていないデバイスではアクセスできない。
- 作成方法として、iCloud.comの設定のほか、Safariのメール欄、メールアプリ、Apple Pay、対応する他社製アプリなどが案内されている。
- iCloud.comでは `icloud.com/icloudplus` または `icloud.com/mail` にアクセスし、Apple Accountにサインインする（必要な場合）と案内されている。

### 1.2 作成手順と2ファクタ認証

AppleのiCloudユーザガイド「iCloud.comで「メールを非公開」のアドレスを作成および編集する」には、次の記載があります。

- iCloud+に加入すると、iCloud.comの「メールを非公開」で一意でランダムなメールアドレスを作成できる。
- 「メールを非公開」でアドレスを作成するためには、**2ファクタ認証を設定する必要がある**。
- `icloud.com/icloudplus` にアクセスし、Apple Accountにサインインして（必要な場合）、「メールを非公開」を選択する。
- すでにiCloud.comにアクセスしている場合は、ツールバーから「メールを非公開」を選ぶこともできる。
- 有効なアドレスがある場合は「[数字]件の有効なメールアドレス」の横の追加ボタンを選ぶ。有効なアドレスがない場合は「新しいメールアドレスを設定」を選ぶ。
- 「メールを非公開」が一意でランダムなアドレスを生成する。各アドレスにラベルを追加でき、アドレスはラベルのアルファベット順に表示される。
- 「別のメールアドレスを使用」でアドレスを変更でき、メモも追加できる。
- 「メールアドレスを作成」を選ぶ。
- コピーするときは、`icloud.com/icloudplus` で「メールを非公開」を選び、有効なアドレスの一覧から使うアドレスを選び、「メールアドレスをコピー」を選ぶ。

公式の注記として、iCloud.comに「メールを非公開」が表示されない場合は、ウェブ限定アクセスで利用している可能性がある、と書かれています。

英語版の「Create and edit Hide My Email addresses on iCloud.com」にも同じ流れ（2ファクタ認証、`icloud.com/icloudplus`、「Set up a new email address」または追加ボタン、ラベル、「Create email address」、「Copy email address」）が記載されています。

### 1.3 「Appleでサインイン」の「メールを非公開」との違い

Appleサポート「「Appleでサインイン」で「メールを非公開」を使う方法」には、次の記載があります。

- 「Appleでサインイン」を使ってアプリやWebサイトで新しいアカウントを作成するときに「メールを非公開」を選ぶと、個人のメールアドレスを非公開にできる。
- この場合に作成されるアドレスは `@privaterelay.appleid.com` ドメインを使う。
- アプリやWebサイトに登録したアドレスからのメールだけが、Apple Accountに登録している確認済みアドレスへ転送される。

これは、iCloud+の「メールを非公開」画面で任意のアドレスを作成するAPIではありません。Sign in with Appleのアカウント作成フローで生成される別の仕組みです。

### 1.4 公開APIの記載

Apple Developerの「Sign in with Apple REST API」の公式ページを確認しました。

- 概要は、アプリのサーバーとAppleの認証サーバーの間で、ユーザー本人確認用のIDトークンを生成・検証するためのWebサービス。
- Topicsには、認可リクエスト、IDトークンの受信・検証、アカウント変更の処理、クライアントシークレット、Appleの公開鍵、トークン検証、トークン失効、JWKSet、TokenResponse、ErrorResponse、ボタンなどが並ぶ。
- **HMEアドレスを任意に作成するエンドポイントは、この公式一覧に記載されていない。**

ここで言えるのは「公式ドキュメントに作成APIの記載がない」ということであり、「Appleの内部に存在しない」「絶対に不可能」とまでは言えません。非公開の内部APIの存在や仕様は、Appleが公開していません。

## 2. 公式に書かれていないこと・未確認のこと

- iCloud+のHMEアドレスを外部から作成するための、公開APIのエンドポイント・認証方式・レート制限。
- iCloud.comのHME画面のDOM構造、CSSクラス、画面遷移、iframeの構成。これらは公式の拡張機能向け仕様ではありません。
- 作成できるアドレスの上限、ラベルの最大文字数・使用可能文字の完全な仕様。公式ガイドにはラベルの追加は書かれていますが、拡張機能が依存できる上限値の記載は確認していません。
- Appleの利用規約上、ブラウザ拡張による画面操作がどこまで許容されるかの明示的な記載。公式の拡張機能向けAPIは提供されていません。
- 実アカウントでの作成時間、画面変更の頻度、英語以外のUIでの動作。

## 3. Chrome拡張の公式仕様

Chrome for Developersの公式ドキュメントを確認しました。

- Manifest V3では、`manifest_version: 3`、背景処理はService Worker、権限は `permissions` と `host_permissions` に分けて宣言する。
- `activeTab` は、ユーザーが拡張機能を呼び出したときに、現在のタブへの一時的なアクセスを与える。アクセスはタブを移動・閉じると失われる。`activeTab` があると、タブのURL・タイトル・faviconを取得できる。
- `content_scripts` は `matches` で対象URLを限定できる。`all_frames: true` で同一オリジンの子フレームにも注入できる。`run_at` で注入タイミングを指定できる。
- `chrome.storage.session` は、拡張機能が有効な間だけデータをメモリに保持する。拡張機能の無効化・再読み込み・更新、ブラウザの再起動で消える。既定ではコンテンツスクリプトからは見えない。
- `clipboardWrite` は、WebのClipboard APIを使ってクリップボードへ書き込むための権限。インストール時に「コピーしたデータを変更する」旨の警告が表示される。
- `clipboardWrite` と `activeTab` は、必要最小限の範囲で使う。`cookies`、`tabs`、`webRequest`、`<all_urls>` は使わない。

## 4. 採用した方式

iCloud.comの「メールを非公開」画面を、コンテンツスクリプトで操作する方式にしました。

理由:

1. HME作成の公開APIが公式に確認できない。
2. Sign in with Apple REST APIは、自社アプリのログイン検証用であり、任意のHMEアドレス作成には使えない。
3. ユーザーの既存のiCloudログイン（ChromeのCookieとAppleの画面）をそのまま利用できる。拡張機能がパスワードやCookieを読む必要がない。
4. 画面操作なら、Appleの2ファクタ認証やログイン保護を回避しない。

制約:

- 非公開APIを直接呼び出してはいないが、iCloud.comの非公開のDOM・内部画面遷移に依存する。
- Appleが画面を変更すると壊れる。セレクタは日本語・英語の主要文言と、ボタン・ラベル・入力欄の構造を複数組み合わせて探すが、保証はない。
- 公式の拡張機能APIではないため、Appleのサポート対象外。
- 通信はiCloud.comとAppleの間だけで、拡張機能から外部サーバーへは送らない。

## 5. セキュリティとプライバシーの設計

- パスワード・認証コード・Cookieを読まない。ログイン画面のパスワード欄は「ログイン画面かどうか」の判定にだけ使い、値を読まない。
- 既存のiCloudセッションを使う。未ログイン・セッション切れのときは、iCloudの画面を開いてユーザーにサインインを促す。
- 作成したアドレスは `chrome.storage.session` とクリップボードだけに置く。外部送信・ログ出力をしない。
- 作成ボタンを押した事実をセッションに残し、二重クリック・再試行・Service Workerの再起動時に重複作成しないようにする。
- 作成結果が不明な場合は「未確認」にして自動再試行を止める。ユーザーがiCloudで確認して明示的に再開するまで、次の作成を始めない。

## 6. 参照した公式ページ

### Apple

- [iCloud+の「メールを非公開」をすべてのデバイスで設定して使用する（日本語）](https://support.apple.com/ja-jp/guide/icloud/mm9d9012c9e8/icloud)
- [iCloud.comで「メールを非公開」のアドレスを作成および編集する（日本語）](https://support.apple.com/ja-jp/guide/icloud/mm1a876f7aed/icloud)
- [Create and edit Hide My Email addresses on iCloud.com（英語）](https://support.apple.com/en-us/guide/icloud/mm1a876f7aed/icloud)
- [「Appleでサインイン」で「メールを非公開」を使う方法（日本語）](https://support.apple.com/ja-jp/105078)
- [How to use Hide My Email with Sign in with Apple（英語）](https://support.apple.com/en-us/105078)
- [iCloud+（日本語）](https://www.apple.com/jp/icloud/)
- [Sign in with Apple REST API](https://developer.apple.com/documentation/signinwithapplerestapi)

### Chrome

- [Manifest file format](https://developer.chrome.com/docs/extensions/reference/manifest)
- [Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [The "activeTab" permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Manifest - content scripts](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts)
- [chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Permissions list（clipboardWrite）](https://developer.chrome.com/docs/extensions/reference/permissions-list)
