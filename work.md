# 旅游规划网站 · 项目交接文档（Handoff）

> 本文档写给**完全没有上下文的新对话**（新会话的 AI 助手）。请先完整阅读本文，再按需结合
> `PRD_旅游规划网站.md`（需求基线 v2.1）、`.workbuddy/memory/MEMORY.md`（精简项目记忆）、
> `更新记录.md`（版本迭代摘要）开展工作。首次接手建议同时读根目录 `新会话启动指令.txt`。
>
> 最后更新：2026-08-11

---

## 1. 我们在做什么

一个**纯前端、单机使用**的「旅游行程规划网站」（无后端、无构建工具、无登录）：

- 用户可创建**多个旅游计划**，每个计划对应一段起止日期（允许选过去日期补录）
- 计划内按**天**排事项：事项带时间段（分钟级、不允许跨天），自动校验重叠、按时间排序
- 计划级共享**注意事项**（标题+正文）
- 计划内可记录**花销**：一个事项可关联多个花销，另可独立添加；每日/事项/计划三级汇总
- 计划可**导出**为可复制文字 或 Word 文档，也可从**文字或 Word** 导入还原（始终新建计划）
- 数据存浏览器 **localStorage**；清新旅行风浅色 UI，**电脑端 + 手机端都要适配**

当前状态：**功能已开发完成（PRD v2.1）、测试通过、已部署云端**，处于"按用户需求持续迭代"阶段。

---

## 2. 已完成的功能（按 PRD v2.1）

- **计划管理**：新增（起止日期 + 选填旅游地点 → 默认名「{地点}之旅」/「{开始} 至 {结束} 旅行」）、重命名、改期（事项**整体平移**，缩短范围末尾天删除需确认）、删除（弹窗二次确认，提示「该计划及其全部事项、注意事项等都将被删除」）、列表按创建时间倒序；「一键清空」需随机 6 位验证码（首位非 0）
- **天数与事项**：天数导航；两种新增方式（选时间段 / 在某事项后添加，起始默认=前一事项结束、**结束时间留空必填**）；分钟级重叠校验（`新开始<旧结束 && 新结束>旧开始`，首尾相接允许）；自动按开始时间排序；编辑/删除（二次确认）；每天红色「一键删除」（确认后清空当天事项+花销，无需验证码）；介绍/备注用「添加介绍/添加备注」勾选开关录入（编辑自动预填）
- **时间输入**：**「时:分」两个数字文本框（AA:BB）**——只打数字、小时满 2 位自动跳转分钟框、**分钟留空默认 00**、保存归一化（8:0 → 08:00）
- **注意事项**：计划级共享，增删改
- **花销（v2.1 核心）**：
  - 数据存 `trip.expenses`，项 `{id, day, title, amount(分,整数), remark, itemId?, time, createdAt}`；**一对多**：expense.itemId 指向事项，事项侧动态 filter（**无 expenseId 字段**）
  - 事项弹窗内花销管理区：每行「金额（左）+ 标题（右，选填可留空=空标题）+ 删除（直接删）」+「＋ 添加花销」；保存时统一同步（新增/更新/删除）
  - 金额**必填**、非负、最多两位小数、上限 999999.99 元，内部以「分」整数运算求和（防浮点误差）；所有花销数字一律以 expenses 求和为准
  - 时间 `time`（HH:mm）：事项来源=事项开始时间；独立添加=添加时刻；导入=导入时刻；spend 页编辑弹窗 AA:BB 可改（**输入了但非法 → toast 提示且不保存；全部留空 → 用当前时间**；右侧有「当前时间」按钮一键填入）
  - 汇总：每日标题「今日花销：X元」（>0 才显示）/ 事项卡片花销总和 / 计划头部「总花销：X元（查看详情）」→ spend.html
  - **spend.html 花销详情页**（`?id=&preview=1` 预览只读）：总花销 → 日期下拉 → 每日花销 → 花销项按 time 排序增删改；「导出花销」按钮在总花销下方；**显示规则：事项关联花销标题非空→「事项标题 - 花销标题」、空→「事项标题」；独立项显示自身标题并紧贴 * 标记**；删除绑定事项花销二次确认并提示「对应事项花销一并删除」
  - 联动：事项删除 → 其全部关联花销删除；spend 页添加=独立项（标题必填）、编辑仅金额同步回事项、删除（绑定事项的）二次确认；改期时带 itemId 花销随事项平移、独立项留原日期、被压缩天花销删除（确认弹窗提示数量）
- **导入导出**：
  - 导出文字（自定义标记格式，【起止日期】与【注意事项】间**无空行**；**含花销行**：`花销：金额元（标题）`，无标题不加括号，多条 `A元（标题1）+B元 = 总和`；**备注与独立花销不导出**）
  - 导出 Word（暖橙两列表格，JSZip + 自建 OOXML；**不含花销**）
  - 导入：粘贴文字 / 上传 Word 两种来源，均新建计划、重名自动加后缀；**花销行还原为关联事项的花销**（标题=括号内容或空、金额、备注空、time=导入时刻，解析前先切除「= 总和」）
- **UI/交互**：首页（`index.html`）= 一键清空 | 导入计划 | 新增计划 + 计划卡片（含「预览」按钮）；详情页（`plan.html?id=xxx[&preview=1]`）独立页面、**无导入按钮**；预览模式只读（隐藏全部修改操作，经「返回计划列表」退出）；作者页 `author.html`（作者介绍 + QQ 邮箱 1452231503@qq.com）；粘性页脚「作者：Jimmy · 联系作者」
- **云端部署**：已部署，链接见第 9 节

---

## 3. 技术架构与文件结构

```
Travel_Plan/                      # 项目根目录（C:\Users\tanjunming\Desktop\Travel_Plan）
├── index.html                    # 首页：计划列表（一键清空 | 导入计划 | 新增计划）
├── plan.html                     # 计划详情页（URL 参数 ?id=&preview=1，preview=1 为只读）
├── spend.html                    # 花销详情页（URL 参数 ?id=&preview=1，预览只读）
├── author.html                   # 作者页
├── css/style.css                 # 全部样式（浅色清新风 + 移动端 @media 规则）
├── js/
│   ├── storage.js                # 数据层：localStorage 版本化、日期工具、Money（分整数）、重叠/排序、改期平移
│   ├── format.js                 # 文字导入导出（含花销行解析）
│   ├── word.js                   # Word 导出/导入（JSZip + 手写 OOXML）
│   └── app.js                    # 界面与交互（按容器 #app / #plan-app / #spend-app 分派渲染）
├── vendor/jszip.min.js           # 唯一第三方库（本地化，无 CDN）
├── dist/                         # 云端部署目录（改完代码后 cp 同步）
├── tools/
│   ├── smoke_test.js             # 冒烟测试：数据层/文字往返/花销金额与导入导出等（66 项）
│   ├── dom_test.js               # DOM 级测试：jsdom 模拟真实点击（82 项，覆盖首页/详情/花销/预览）
│   ├── gen_word_sample.js        # 生成官方 Word 样例（样例_北京五日游.docx）
│   └── gen_sample_indent.js      # 历史遗留，已无用（保留无害）
├── PRD_旅游规划网站.md           # 需求基线（v2.1；不保留更新记录）
├── PRD_待更新清单.txt            # PRD 攒批清单（重要！当前 0 项）
├── 更新记录.md                   # CHANGELOG（v2.1 概括 + 历史迭代概括）
├── 长远待做清单.md               # 已确认暂缓的远期功能（数据安全/扩容/云同步/归档/搜索/复制/真机验证）
├── 新会话启动指令.txt             # 新会话省 Token 启动模板（复制粘贴即可）
├── 样例_北京五日游.docx          # Word 官方样例（评审样式用）
├── work.md                       # 本交接文档
└── .workbuddy/memory/            # 项目记忆（MEMORY.md 长期约定 + 当日日志）
```

**关键设计点：**
- **多页面架构**：`app.js` 检测容器 `#app`（首页）/ `#plan-app`（详情）/ `#spend-app`（花销）分派逻辑；页面跳转用 `location.href`；三个容器共用居中限宽布局（CSS 选择器要一起写，别漏 spend-app）
- **Word 生成完全自建**：`js/word.js` 用 JSZip 组装 .docx（`[Content_Types].xml`、`_rels/`、`word/document.xml`），**不依赖 docx 库**（原因见坑 1）
- **数据模型**（localStorage，key `travel-planner:v1`）：
  ```json
  { "trips": [ {
      "id", "name", "startDate": "2026-08-10", "endDate": "2026-08-14",
      "notes": [ { "id", "title", "body", "createdAt" } ],
      "days": { "2026-08-10": [ { "id", "start": "09:00", "end": "10:30", "title", "location", "intro", "remark" } ] },
      "expenses": [ { "id", "day", "title", "amount"(分), "remark", "itemId"?, "time", "createdAt" } ],
      "createdAt", "updatedAt"
  } ] }
  ```
  旧数据 load 时自动补齐 `expenses`（缺省 []）与花销 `time`（事项来源取事项开始时间、独立项取创建时刻）
- **文本格式规范**：`【旅游计划】名称` / `【起止日期】YYYY-MM-DD ~ YYYY-MM-DD` / `【注意事项】`（`- 标题：正文`）/ `【第N天 MM月DD日】`（**不带年份**）/ 事项行 `HH:mm-HH:mm 标题` / 子行 `地点：` `介绍：` `备注：` / 花销行 `花销：金额元（标题）`。导入忽略空行、报错不静默
- **Word 格式规范**：标题 24pt 暖橙 #D9651C、副标题、注意事项 `• 标题：正文`、每天两列表格（时间段列宽 1750 DXA 水平垂直居中 / 事项列标题加粗 + 地点/介绍/备注冒号行只显示有内容 + 整栏左缩进 240 twips）、表头底 #FDEBD8 文字 #B4550F、边框 #EAC291、表格全宽 `w:tblW w:w="5000" w:type="pct"` + 固定布局、无事项天「（无事项安排）」、天章节间空一行

---

## 4. 当前卡在哪 / 未决事项

**当前没有阻塞性卡点**，项目稳定可用。持续维护事项：

1. **PRD 攒批清单**：`PRD_待更新清单.txt` 累计 **0 项**。今后值得记录的需求变更**先追加到该 txt**，等用户说「一并更新到 PRD」再一次性并入（**不要每次直接改 PRD**）。
2. **云端部署按需**：只有用户明确要求时才更新部署；日常改动只需 `cp -r index.html plan.html spend.html author.html css js vendor dist/` 同步。
3. **长远待做项已确认暂缓**（见 `长远待做清单.md`，未经用户确认**不要实施**）：数据安全提示（save 失败提示/load 损坏兜底）、容量扩容（压缩/IndexedDB）、CloudBase 云同步、行程归档、计划搜索、复制计划、手机真机验证。
4. **遗留杂物**：`tools/gen_sample_indent.js` 无用但保留无害。

---

## 5. 下一步计划

按用户需求继续迭代（无固定路线图）。例行工作流：

1. **改代码** → 立即同步 `dist/`（本地）
2. **跑测试**：冒烟 `tools/smoke_test.js` + DOM `tools/dom_test.js`（命令见第 8 节），确保全绿
3. 值得记录的内容 → **追加到 `PRD_待更新清单.txt`**（不直接改 PRD）
4. 用户要求改 PRD 文档本身 → 先申请 → 批准后改
5. 用户要求更新云端 → 重新部署（**链接不变**：https://522920836859489c9de53fcd2cff4781.app.workbuddy.host）
6. 涉及 Word 样式变更 → 同步修改 `tools/gen_word_sample.js` 并重新生成 `样例_北京五日游.docx` 给用户评审
7. 重要版本变更 → 追加 `更新记录.md`

---

## 6. 踩过的坑（绝对不要踩！）

1. **不要用 `docx` 库做浏览器端 Word 导出**（最大的坑）：docx 浏览器构建在本环境 `Packer.toBuffer/toBlob` **会挂起/失败**。本项目已彻底弃用，统一走 **JSZip + 手写 OOXML**（js/word.js）。将来换库必须先验证。
2. **`el()` 多节点 HTML 模板只取 firstChild**：用 `<template>` 解析含多个顶层节点的 HTML 时若只返回 `firstChild` 会**静默丢弃后续节点**（曾导致新增计划弹窗缺字段）。修复：多节点时返回整个 DocumentFragment。
3. **OOXML 表格宽度 `pct` 值要 ×50**：100% = **5000**（不是 100）。写成 100 表格会缩成窄条。
4. **JSZip.generateAsync 在 jsdom 中会挂起**：jsdom 环境限制（真实浏览器正常）。DOM 测试**不要**做 Word 导出/压缩字节级验证，交给 Node 冒烟测试。
5. **异步确认弹窗的测试时序**：`confirmDialog` 用 Promise 回调，断言必须放在 setTimeout 回调内执行；`process.exit` 也要放进异步回调，否则同步提前退出导致测试数错乱（曾出现 44→29 假象）。
6. **中文文件名/路径删除**：Git Bash `rm -f` 可能触发安全删除机制失败。**改用 PowerShell `Remove-Item -LiteralPath`**。
7. **生成 Word 样例时目标文件被占用**（EBUSY，Windows 文件锁）：脚本支持 argv 指定输出文件名输出副本，等占用释放再覆盖；**提醒用户关闭编辑器里打开的旧文档**。
8. **移动端硬伤清单**（改样式别回退）：iOS 输入框字号 <16px 聚焦自动放大（→ 16px）；触控 <40px 难点（→ min-height 40px）；容器选择器 `#app, #plan-app, #spend-app` 一起写别漏；小屏允许换行；body 加 `overflow-x: hidden`。
9. **测试数据别与种子数据时间重叠**：DOM 测试造事项时间段避开种子数据（如 09:00-10:30），否则被正确的重叠校验拦截，测试误判失败。
10. **云端部署接口偶发 400**：服务端临时故障，**重试即可**（曾第 3 次成功），部署链接不变。
11. **花销导入正则会把「= 总和」误解析成花销项**：`花销：38元（高铁）+8元 = 46元` 中 `46元` 会被当无标题花销。**解析前先切除 `=` 之后的内容**。
12. **花销金额必须用「分」整数运算**：直接浮点加减会产生 0.1+0.2≠0.3 类误差。所有求和/比较走 `Money`（storage.js），显示才转回元。
13. **jsdom 中 `input.value` 赋值不触发 input 事件**：花销行的标题/金额输入靠 input 事件同步状态，测试必须手动 `dispatchEvent(new window.Event('input', {bubbles:true}))`；同理 **textarea 的内容在 `value` 属性而非 textContent**（导出文字断言读 `.exp-text.value`）。
14. **Store.newExpense 的签名要传对**：`(day, title, amountCents, itemId, remark, time)`——曾漏传 remark/time 导致花销备注丢失（用 DEBUG 打印定位）。

---

## 7. 用户协作约定（硬性，必须遵守）

1. **可随时向用户提问任意多问题**（用户明确，不必担心问太多；有歧义就问，不要自作主张）。
2. **界面不使用任何 emoji**（永久约定）；保留纯文本符号（＋、←、▼、·）。
3. **修改 PRD 需先申请获准**；**只用重要更新写 PRD，UI 等小更新不写入**。
4. **PRD 攒批机制**：值得记录的内容先追加到 `PRD_待更新清单.txt`，攒到一定量由用户发起「一并更新到 PRD」再一次性执行（省积分）。
5. **响应式硬性要求**：任何修改**必须同时考虑电脑端与手机端**（布局换行、触控 ≥40px、iOS 输入 ≥16px 不缩放、防横向溢出；移动端基准 ≤640px、超窄 ≤480px）。
6. **云端部署按需**：只有用户明确要求时才更新部署（先同步 dist/ 再部署）。
7. Word 样例如需重生成，由 `tools/gen_word_sample.js` 执行（先经用户确认）。
8. 页面文案固定项：主页标题「与友行」+ 副标题「和好友结伴，规划好每一次出发」（下一行）；清空按钮「一键清空」；页脚「作者：Jimmy · 联系作者」→ `author.html`（QQ 邮箱 1452231503@qq.com）。
9. 版本更新记录统一写在 `更新记录.md`，PRD 不保留更新记录。

---

## 8. 常用命令（在项目根目录执行）

```bash
# 语法检查
"C:/Users/tanjunming/.workbuddy/binaries/node/versions/22.22.2/node.exe" --check js/app.js   # 等

# 冒烟测试（66 项：数据层/文字往返/花销金额与导入导出…）
NODE_PATH="C:/Users/tanjunming/.workbuddy/binaries/node/workspace/node_modules" \
"C:/Users/tanjunming/.workbuddy/binaries/node/versions/22.22.2/node.exe" tools/smoke_test.js

# DOM 测试（82 项：jsdom 模拟真实点击，覆盖首页/详情/花销/预览）
NODE_PATH="C:/Users/tanjunming/.workbuddy/binaries/node/workspace/node_modules" \
"C:/Users/tanjunming/.workbuddy/binaries/node/versions/22.22.2/node.exe" tools/dom_test.js

# 同步 dist（每次改完代码必做）
cp -r index.html plan.html spend.html author.html css js vendor dist/

# 重新生成 Word 官方样例
NODE_PATH="C:/Users/tanjunming/.workbuddy/binaries/node/workspace/node_modules" \
"C:/Users/tanjunming/.workbuddy/binaries/node/versions/22.22.2/node.exe" tools/gen_word_sample.js [输出文件名.docx]

# 云端部署（仅用户要求时）：内置工具 workbuddy_sites_deploy（「发布应用/sites」），action=deploy，directory=<项目>/dist，language=static，appName=与友行，userAskedToPublish=true
```

**运行环境**：受管 Node 22.22.2（`C:\Users\tanjunming\.workbuddy\binaries\node\versions\22.22.2\node.exe`）；依赖（jszip、jsdom）装在隔离 workspace `C:\Users\tanjunming\.workbuddy\binaries\node\workspace`，运行测试需 `NODE_PATH`。浏览器端只需 `vendor/jszip.min.js`。

---

## 9. 当前版本与测试基线（2026-08-11 快照）

- PRD：**v2.1**（迭代稿）；网站代码与 PRD 一致（待更新清单 0 项）
- 测试：冒烟 **66/66**、DOM **82/82** 全绿
- 云端：已部署，链接 https://522920836859489c9de53fcd2cff4781.app.workbuddy.host（仅用户要求时更新）
- 部署目录 `dist/` 与源码保持同步

---

## 10. 接手后第一件事

1. 读 `work.md`（本文件）+ `.workbuddy/memory/MEMORY.md`；PRD 按需求涉及的章节按需读（第 3-8 节）
2. 跑一遍冒烟 + DOM 测试确认环境可用（命令见第 8 节）
3. 询问用户当前要迭代的新需求（若有）；没有就待命
4. 任何代码改动 → 同步 dist → 跑测试 → 值得记录的内容追加 `PRD_待更新清单.txt`
5. 新会话记得看根目录 `新会话启动指令.txt`（省 Token 模板，仅对用户有用，不必读）
