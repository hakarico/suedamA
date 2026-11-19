# suedamA · DeepSeek Canvas

**1.0.2** · Chrome / Edge · [中文](#中文) · [English](#english)

## 中文

suedamA 为 [DeepSeek 网页](https://chat.deepseek.com/) 增加可整理的对话白板。沿用已登录的官网会话和原生分支，无需 API Key 或独立模型后端。

### 主要功能

- **对话白板**：把每轮提问与回答变成卡片，用历史线展示继承关系；一个白板可整理多条独立会话。
- **分支探索**：从历史卡片继续提问，使用官网原生版本保留不同回答路径。
- **引用与注释**：划选提问、回答或展开的思考作为引用；全文引用包含提问和回答。点击注释定位来源，流式界面原位高亮，白板内定位卡片。
- **侧栏整理**：白板、整理文件夹、拖动排序、折叠和多选。手动排序以最近更新为基础，只固定拖动过的项目；查看和收集历史不会置顶。
- **画布工具**：移动、实时调整卡片大小、框选、聚焦、全局预览、线路配色、收藏和背景设置。
- **归档与导出**：归档下游历史并以官网流式界面只读查看；导出和导入 JSON 备份，或将选中卡片导出为 Markdown 笔记。
- **提问设置**：共享全局自定义 Prompt，支持当前白板覆盖；开头引导只随根轮发送，应用指令更改后，各受影响分支在下一次提问发送一次更新。
- **界面语言**：跟随官网语言，中文显示中文，其他语言显示英文。

### 安装

1. 下载并解压 `suedama-deepseek-1.0.2.zip`。
2. 打开 `chrome://extensions` 或 `edge://extensions`，开启开发者模式。
3. 选择“加载已解压的扩展”，选中包含 `manifest.json` 的解压目录。
4. 刷新已登录的 DeepSeek 页面，在会话右上角点击白板入口，或点击浏览器工具栏的扩展按钮。

更新时重新加载扩展并刷新网页。源码构建后，也可直接加载 `dist/`。

### 简单使用

- 在侧栏创建白板，把会话拖入白板或整理文件夹；点击白板图标进入，点击名称展开成员。
- 单击卡片浏览；双击或点击“选中”固定提问目标。双击画布空白清除选择，再发送可创建新根线路。
- 白板发送新问题后，新卡片会居中显示并保持画布缩放。侧栏“开启新对话”返回官网主页，准备开始独立的流式对话。
- 单选或多选卡片后，在右键菜单或“本地数据”中导出笔记。卡片按历史顺序拼接；跳过轮次、切换分支或切换会话时，以 Markdown 注释说明。
- 右键拖动卡片或画布，左键拖动空白框选。卡片边缘可调整大小，右键短按打开菜单。
- 划选文字后添加注释，或使用卡片的“全文引用”；官网流式对话支持划选引用。
- 右侧设置可调整外观、自定义 Prompt、管理归档和本地数据。编辑 Prompt 后需点击“应用”；无改动时按钮禁用。

### 数据与边界

扩展整理数据保存在当前浏览器配置文件的本地存储，发布包不包含会话、草稿、背景图片或登录信息。扩展本身不上传数据到独立服务；提交问题、引用和自定义 Prompt 时，仍通过官网界面发送给 DeepSeek。界面隐藏的引用与指令仍存在于实际发送正文中，其他客户端或官网导出可能显示完整内容。

“导出备份”用于恢复本地白板、卡片、归档及整理设置。备份不能恢复官网已删除的会话或原始上传文件。未发送附件只保留在页面内存，刷新后需重新添加。

进入白板即显示本地卡片，优先只读官网历史缓存并复用结构化历史响应；必要时使用当前登录态向官网读取历史消息图，批量补齐提问和回答版本。身份信息只在页面内存中用于限定的官网历史读取，不进入本地备份或日志。结构化来源不可用时，回退到官网版本按钮和滚动采集；回退会受官网草稿、附件及侧栏入口限制。不遍历全部账号历史。

“本地数据 → 历史预加载”可选择按需加载或后台补齐白板会话，默认后台补齐。按需模式优先读取选中卡片所在会话；点击其他会话的卡片时再刷新该会话。官网已返回的分支直接使用，正文按可见区域渲染。返回流式对话会取消旧采集，优先按正式消息身份在官网一次选中祖先分支，再请求官网直接显示目标轮次；准备好后从白板一次切到官网，期间暂缓发送并保留草稿，不另造正文界面。原生定位适配限定到已核对的官网版本；版本或页面状态不兼容时回退到现有导航、版本按钮和滚动查找。白板发送仍保留完整落点校验，避免把未挂载的后续轮次误认为不存在。

官网接口和缓存格式属于内部实现，改版可能触发兼容回退。当前版本已通过合成历史协议、现有 DOM 适配及本地浏览器回归；真实登录环境中的完整接口联调和长时间测试尚未完成。当前不按账号隔离本地数据，多账号请使用不同浏览器配置文件，卸载前导出备份。

## English

suedamA adds an organized conversation canvas to the [DeepSeek website](https://chat.deepseek.com/). It uses your signed-in web session and native conversation branches, without an API key or a separate model backend.

### Features

- **Conversation canvas**: turn each question and answer into a card, connect its real history, and organize multiple independent chats on one whiteboard.
- **Branch exploration**: ask from an earlier card while retaining alternative paths through the website's native versions.
- **References and annotations**: quote selected questions, answers or expanded reasoning. Full-turn references include the question and answer. Open an annotation to highlight its source in native chat or locate its card on the canvas.
- **Sidebar organization**: whiteboards, folders, drag-and-drop ordering, collapsible groups and multi-select. Manual sorting follows recent activity while fixing only dragged items in place. Browsing and history collection do not promote chats.
- **Canvas tools**: move, resize, box-select and focus cards; use the global overview, history colors, bookmarks and custom backgrounds.
- **Archive and export**: archive downstream history, review it in the native read-only chat, export or import JSON backups, and export selected cards as Markdown notes.
- **Prompt settings**: one shared global custom prompt with optional whiteboard overrides. Opening guidance is sent only on root turns. Applied instruction changes are sent once with the next question on each affected branch.
- **Language**: follows the website language, using Chinese for Chinese locales and English otherwise.

### Install

1. Download and extract `suedama-deepseek-1.0.2.zip`.
2. Open `chrome://extensions` or `edge://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select the extracted directory containing `manifest.json`.
4. Refresh your signed-in DeepSeek page. Open the canvas from the conversation header or the browser extension button.

Reload the extension and refresh the page after an update. When building from source, load `dist/`.

### Quick start

- Create a whiteboard in the sidebar and drag chats into it or into an organization folder. The whiteboard icon opens the canvas; its name expands its members.
- Click a card to browse it. Double-click or choose **Select** to fix the question target. Double-click empty canvas space to clear the target, then send to create a new root conversation.
- Sending from the whiteboard centers the new card at the current zoom. **New chat** in the sidebar returns to the native home composer for an independent chat.
- Select one or more cards and export notes from their context menu or local data settings. Turns follow their history order; Markdown comments explain skipped turns, branch changes and separate chats.
- Drag with the right mouse button to move cards or pan; drag empty space with the left button to box-select. Resize from card edges and right-click to open a menu.
- Select text to add an annotation, or choose **Full-turn reference** on a card. Native chat supports selected-text references.
- Open settings on the right for appearance, prompts, archives and local data. Prompt edits take effect only after **Apply**; unchanged content keeps Apply disabled.

### Data and limitations

Organization data stays in your browser profile's local storage. Release archives do not include conversations, drafts, background images or sign-in details. The extension does not upload data to a separate service. Questions, references and custom prompts are submitted to DeepSeek through its website; UI-hidden references and instructions remain part of the submitted message and may be visible in other clients or website exports.

JSON backups restore local whiteboards, cards, archives and organization settings. Backups cannot restore deleted server-side chats or original uploaded files. Unsent attachments remain in page memory and must be added again after a reload.

Whiteboards show saved cards immediately, then read the website's history cache and structured responses. Scoped read-only history requests reuse the current website login when available; credentials remain in page memory and are never included in local backups or logs. Native version controls and scrolling remain a fallback. The extension does not crawl all account conversations.

History preload settings offer on-demand or background loading of this board's conversations (the default). Available branches are imported directly; only visible card bodies are rendered. Returning to native chat cancels collection, selects the saved ancestor branches by server message identity, and asks the native virtual list to display the target. The whiteboard hands off once ready, without a second body renderer; sending is paused and drafts remain intact. This adapter is restricted to the inspected website build. Unknown builds or incompatible page state fall back to existing navigation, version controls and DOM scanning. Whiteboard submission retains a complete path check to avoid mistaking an unmounted later turn for a leaf.

Website cache and history protocols are internal and may change. Synthetic protocol, DOM regression, and local browser checks have passed; live authenticated history integration and endurance testing remain unverified. Local data is not separated by account: use different browser profiles for multiple accounts and back up before uninstalling.

## Development / 开发

Requires Node.js 24+ and pnpm. The repository includes its SVG assets.

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm run build
```

Optional: `pnpm run benchmark` measures synthetic graph calculations; `pnpm dev` opens a local DOM fixture server at `127.0.0.1:3097`, using canned replies without contacting a model. A new fixture tab with `?stress=200` seeds a 200-turn history; `?history=1` uses a synthetic structured history source and exposes DOM counters for reads and scans. Add `&native=1` to use a synthetic native locator for UI handoff checks; real page-bridge behavior is covered by contract tests.

On Windows, run `./scripts/package.ps1` after building to create the ZIP and SHA256 checksum under `.scratch/release/`. Packaging uses an explicit file list and excludes source tests, debug output and browser data. Generated `dist/`, `.scratch/` and dependencies are excluded from Git.

本项目采用 [MIT 许可证](LICENSE)。第三方代码与素材遵循各自的许可，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

This project is licensed under the [MIT License](LICENSE). Third-party code and artwork retain their own license notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
