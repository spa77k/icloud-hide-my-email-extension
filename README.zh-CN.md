# iCloud+「隐藏邮件地址」创建与复制

[日本語](README.md) | [English](README.en.md) | [한국어](README.ko.md)

这是一款 Chrome 扩展：以当前网站名称作为标签，创建 iCloud+ 的「隐藏邮件地址」（Hide My Email）地址，并复制到剪贴板。支持 Manifest V3。

- 扩展内只需 **两次点击**（工具栏图标 →「创建并复制」）。创建成功后，弹窗会自动复制地址。
- 正常创建时不会把 iCloud 标签页切到前台。扩展会复用已有的 iCloud 标签页；如果没有，则在后台打开一个非活动标签页。
- 会阻止双击和随意重试，避免重复创建同一个地址。
- 不处理密码或验证码。请在 Apple 的登录页面自行登录。
- 不会把创建的地址发送到外部服务。地址只保存在浏览器会话中。

## 需要准备

1. Google Chrome 120 或更高版本
2. iCloud+ 订阅（个人或家庭共享）
3. Apple Account 的双重认证
4. 日常使用的 Chrome 配置可以登录 iCloud

创建过程需要双重认证。即使已订阅 iCloud+，如果 iCloud.com 中没有显示「隐藏邮件地址」，也可能是受到了仅限网页访问等 Apple 限制。

## 安装

本仓库已包含可直接加载的 `dist/`，无需构建。

如果使用 [GitHub Releases](https://github.com/spa77k/icloud-hide-my-email-extension/releases) 中的分发包，请先解压 zip，并在第4步选择解压后的文件夹。

1. 在 Chrome 中打开 `chrome://extensions`。
2. 打开右上角的「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择本项目中的 `dist` 文件夹。
5. 在扩展菜单中固定「iCloud+ 隐藏邮件地址 创建与复制」。

从源码重新构建：

```bash
npm install
npm run build
```

这会更新 `dist/`。在 `chrome://extensions` 中重新加载扩展即可生效。

## 使用方法

1. 打开需要填写电子邮件地址的网站。
2. 点击工具栏中的扩展图标。
3. 确认标签。当前标签页的主机名（例如 `example.com`）会自动填入。需要时可以修改。
4. 点击「创建并复制」。当前网站和弹窗不会切换。
5. 首次使用可能需要登录 Apple 账户。点击弹窗中的「打开 iCloud」，在切到前台的 iCloud 标签页中登录，然后回到弹窗，再次点击「创建并复制」。
6. 创建完成后，地址会显示在弹窗中，并自动复制到剪贴板。如果没有复制成功，请点击「复制」。

iCloud 标签页会保留在后台。需要查看时，请使用弹窗中的「在 iCloud 中确认」明确打开。

### 关闭弹窗后

创建过程中关闭弹窗不会取消任务。完成后再打开弹窗，即可看到结果并复制地址。

### 点击次数与时间

- 扩展侧操作：**两次点击**（图标、创建按钮）。自动复制成功时无需额外复制。
- 尚未测量真实 iCloud+ 账户的创建耗时。时间会受网络和 iCloud 响应影响。

## 工作原理

本扩展不使用 Apple 的公开 API，而是操作 iCloud.com 的官方网页界面。

1. 在后台准备一个 `icloud.com/icloudplus` 标签页（复用已有标签页，或打开非活动标签页）。
2. 打开「隐藏邮件地址」。
3. 打开新建地址表单。
4. 输入标签。
5. 点击「创建电子邮件地址」。
6. 将表单中显示的候选地址与确认后的结果（列表项的标签标题＋地址，或已创建地址详情页中的隐藏邮件地址字段）进行比对。只读取本次创建的地址，并在获得焦点的弹窗中复制。

候选地址只从创建对话框中读取。转发地址、账户邮箱、已有列表、备注字段和隐藏地址都不会被当作候选或结果。确认后，只有保留的候选地址与结果一致，并且列表项的标签标题完全一致，或已创建地址详情页中显示隐藏邮件地址字段时，才会判定为成功。如果无法确定唯一候选、候选在确认时发生变化，或无法确认匹配结果，扩展会以「未确认」停止，不会复制。

后台标签页可能无法使用 Clipboard API，因此复制在弹窗中完成。确认前显示的候选地址不会被复制，只有确认后的地址才会被复制。

扩展没有直接调用非公开 API。但它依赖 iCloud.com 的页面 DOM 和内部页面跳转。Apple 并未为此流程提供官方扩展 API，因此界面变化可能导致扩展失效。

## 支持的语言

扩展的用户界面支持以下四种语言：

- 日语
- 英语
- 简体中文
- 韩语

界面会根据 Chrome 的 UI 语言自动切换。iCloud.com 的页面操作也已覆盖 Apple 官方帮助中确认的日语、英语、简体中文和韩语主要文案。尚未在真实登录的 iCloud+ 账户中验证地址创建（与界面语言无关），中文和韩语的 iCloud.com 实际界面也尚未在真实浏览器中确认。标签匹配本身不依赖语言：扩展会将输入的标签与 iCloud 中的标题进行完全一致比较。

## 限制与未确认事项

- Apple 的公开文档中似乎没有可随意创建隐藏邮件地址的接口。本扩展通过网页操作创建地址。
- 需要 iCloud+ 订阅和双重认证，并使用同一个 Apple Account 登录 iCloud.com。
- 支持的 iCloud 主机是 `www.icloud.com`。如果 Apple 将界面迁移到其他主机（例如 beta），扩展将无法工作。
- iCloud 界面自动化覆盖 Apple 官方帮助中的日语、英语、简体中文和韩语主要文案。中文和韩语的实际 iCloud.com 界面尚未确认，文案变更也可能导致无法工作。
- 标签长度、可用字符和可创建的地址数量由 Apple 控制。扩展不会自行判定上限。
- 正常创建时 iCloud 标签页保持在后台。只有用户点击「打开 iCloud」时才会切到前台。
- 自动复制只在弹窗中进行，不会在 iCloud 标签页（后台文档）中复制。如果关闭了弹窗，请在完成后重新打开以查看并复制结果。
- 为防止 Service Worker 停止导致状态丢失，任务状态保存在 `chrome.storage.session` 中。如果创建中断，扩展会以「未确认」停止，不会自动重试。
- 如果无法确认创建结果，扩展会以「未确认」停止以避免重复创建。请在 iCloud 中确认结果，勾选确认框后继续。
- **尚未确认真实登录的 iCloud+ 账户中的地址创建。** 验证主要基于单元测试和针对本地模拟 iCloud 页面的 Chrome E2E。使用真实账户时，请同时在 Apple 的官方界面确认结果。
- 本扩展不是 Apple 产品，不受 Apple 条款或支持覆盖。
- 本扩展是非官方工具，与 Apple 无关。

## 权限

| 权限 | 用途 |
| --- | --- |
| `storage` | 将任务状态和结果临时保存到 `chrome.storage.session` |
| `activeTab` | 仅在打开弹窗时读取当前标签页的 URL 和标题，用作标签建议 |
| `clipboardWrite` | 将创建的地址复制到剪贴板 |
| `https://www.icloud.com/*` | 操作 iCloud.com 的「隐藏邮件地址」页面 |

本扩展不请求 `cookies`、`tabs`、`webRequest`、`scripting` 或 `<all_urls>`，也不会禁用浏览器保护功能。

## 隐私

- 不读取、保存或传输密码、验证码或 Cookie。
- 创建的地址只放在扩展的会话存储和剪贴板中。浏览器重启后，`chrome.storage.session` 会被清除。
- 不向外部服务器通信。通信只发生在用户打开的 iCloud.com 页面与 Apple 之间。
- 扩展日志不会输出地址或认证信息。
- 为防止重复创建，会话中只保留「创建按钮曾被按下」这一事实和任务状态。

## 常见问题

**显示「需要登录 Apple 账户」**<br>
点击弹窗中的「打开 iCloud」，在 iCloud 标签页中登录，然后回到弹窗再次创建。

**显示「无法打开 iCloud 页面」**<br>
请检查 Apple 登录状态、网络连接和 iCloud+ 订阅。可以使用「打开 iCloud」查看页面。

**显示「无法确认创建结果」**<br>
为防止重复创建，扩展不会自动重试。打开「在 iCloud 中确认」，检查是否多出了相同标签的地址。确认无误后，勾选复选框并点击「标记为已确认并继续」。

**显示「未找到 iCloud+ 页面」**<br>
请确认 iCloud.com 中是否显示「隐藏邮件地址」。如果没有显示，请检查 iCloud+ 订阅和仅限网页访问设置。

**地址没有被复制**<br>
请点击弹窗中的「复制」。不需要把 iCloud 标签页切到前台。如果关闭了弹窗，重新打开即可看到结果。

## 构建与测试

```bash
npm install
npm run typecheck
npm test
npm run build
npm run test:e2e
```

- `npm run check`：运行类型检查、单元测试和生产构建。
- `npm run test:e2e`：在 Chrome for Testing（或 Chromium）中加载扩展，并使用本地模拟 iCloud 页面检查创建、复制、未登录、会话过期、创建失败等流程。
- 如需为 E2E 指定其他 Chrome，请设置 `CHROME_PATH`。

```bash
CHROME_PATH="/path/to/Google Chrome for Testing" npm run test:e2e
```

`dist/` 由 `npm run build` 生成。本项目不发布签名安装包，也不发布 Chrome 应用商店版本。

## 官方资料

- [在 iCloud.com 上创建和编辑隐藏邮件地址](https://support.apple.com/zh-cn/guide/icloud/mm1a876f7aed/icloud)
- [在所有设备上设置和使用隐藏邮件地址](https://support.apple.com/zh-cn/guide/icloud/mm9d9012c9e8/icloud)
- [将隐藏邮件地址与「通过 Apple 登录」搭配使用](https://support.apple.com/zh-cn/105078)
- [Manifest 文件格式（Chrome for Developers）](https://developer.chrome.com/docs/extensions/reference/manifest)
- [Chrome 扩展国际化（Chrome for Developers）](https://developer.chrome.com/docs/extensions/reference/api/i18n)

## 许可证

本项目采用 MIT License。完整内容请参阅 [LICENSE](LICENSE)。
