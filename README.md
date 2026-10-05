# 与友行 · 旅行规划

> 和好友结伴，规划好每一次出发。

一个**纯前端、单机使用**的旅游行程规划网站。无需后端、无需构建、无需登录，打开网页即可使用，数据保存在浏览器本地（localStorage）。

## ✨ 功能特性

- **多计划管理**：创建多个旅行计划，支持起止日期（允许补录过去日期）、重命名、改期（事项整体平移）、删除、一键清空
- **按天排行程**：每天可添加事项，事项带分钟级时间段（不跨天），自动校验时间重叠、按开始时间排序
- **注意事项**：计划级共享，标题 + 正文
- **花销记账**：一个事项可关联多个花销，也可独立记账；每日 / 事项 / 计划三级汇总
- **导入导出**：可导出为可复制文字或 Word 文档，也可从文字或 Word 还原（始终新建计划）
- **响应式设计**：电脑端与手机端均适配，触控友好
- **数据本地存储**：localStorage 版本化管理，旧数据自动补齐新字段

## 🚀 快速开始

本项目是纯静态站点，**无需安装依赖**，二选一即可：

### 方式一：直接打开（推荐）

双击 `index.html` 即可在浏览器中打开使用。

### 方式二：本地起一个静态服务

```bash
# 在项目根目录执行（任选其一）
python -m http.server 8000
# 或
npx serve .
```

然后访问 http://localhost:8000

## 📁 项目结构

```
travel/
├── index.html          # 首页：计划列表（一键清空 | 导入计划 | 新增计划）
├── plan.html           # 计划详情页（URL 参数 ?id=&preview=1，preview=1 为只读）
├── spend.html          # 花销详情页（URL 参数 ?id=&preview=1，预览只读）
├── author.html         # 作者页
├── css/style.css       # 全部样式（浅色清新风 + 移动端 @media）
├── js/
│   ├── storage.js      # 数据层：localStorage 版本化、日期工具、金额（分整数）、重叠/排序
│   ├── format.js       # 文字导入导出
│   ├── word.js         # Word 导出/导入（JSZip + 手写 OOXML）
│   └── app.js          # 界面与交互
├── vendor/jszip.min.js # 唯一第三方库（本地化，无 CDN）
├── dist/               # 云端部署目录
├── tools/              # 测试与工具脚本
│   ├── smoke_test.js   # 冒烟测试（数据层 / 文字往返 / 花销金额与导入导出）
│   ├── dom_test.js     # DOM 级测试（jsdom 模拟真实点击）
│   └── gen_word_sample.js
├── PRD_旅游规划网站.md  # 需求基线（v2.1）
├── 更新记录.md          # 版本迭代摘要
└── work.md             # 项目交接文档
```

## 🛠 技术栈

- **HTML + CSS + 原生 JavaScript**，无框架、无构建工具
- **localStorage** 做数据持久化（key `travel-planner:v1`）
- **JSZip + 手写 OOXML** 实现 Word 导出/导入（不依赖 docx 库）
- **jsdom** 用于 DOM 级测试（仅开发环境）

## ✅ 测试

```bash
# 冒烟测试（数据层 / 文字往返 / 花销金额与导入导出）
node tools/smoke_test.js

# DOM 测试（jsdom 模拟真实点击，覆盖首页/详情/花销/预览）
node tools/dom_test.js
```

## 🚢 部署

项目为纯静态站点，`dist/` 目录即全部待发布内容，可部署到任意静态托管平台（GitHub Pages / Vercel / Netlify / Cloudflare Pages 等）。

线上演示：https://522920836859489c9de53fcd2cff4781.app.workbuddy.host

## 📄 更多文档

- `PRD_旅游规划网站.md` — 需求基线（v2.1）
- `更新记录.md` — 版本迭代摘要
- `work.md` — 项目交接文档（面向开发/协作）
- `长远待做清单.md` — 已确认暂缓的远期功能

## 👤 作者

Jimmy · 联系作者：1452231503@qq.com
