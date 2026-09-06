# M26 条目评论 + OKF 导出（K3 评论部分）

> 方案：`docs/research/团队知识共享平台方案v3-团队模式.md` §2.4（评论）+ §8（OKF）。
> K3 的团队节点部分已由 M24 提前完成，本里程碑 = 评论流 + OKF 导出 + MCP 评论可读。

## 实现

### 评论

- **v14 迁移**：`comments`（id/item_id FK 级联删/parent_id 楼中楼/author/content/created_at）
- **`routes/comments.ts`**：
  - `GET/POST /api/knowledge/:id/comments`（成员鉴权；parent_id 校验同条目）
  - `DELETE /api/comments/:id`（作者本人或团队 admin+）
  - 评论内容 `@名字` 命中团队成员 → `pushNotification` P0 必达
- **详情侧栏评论区**（KnowledgePanel）：顶层评论 + 一级缩进楼中楼、回复按钮（自动带 `@作者`）、@成员 chips 快捷插入、作者可删
- **MCP `kb_get`** 附评论摘要（作者+日期+内容），agent 可读

### OKF 导出（v3 §8 落地）

- **`routes/exportOkf.ts`**：`POST /api/knowledge/export/okf {team}` → `server/data/exports/okf-<团队名>-<日期>/`，每条目一个 `<type>--<标题>.md`
- frontmatter 按 OKF v0.2：`type`（必填）/title/status/`stale_after`（←expires_at）/`sources`（←source_url）/author/owners/tags/channels/project/created/updated；结论进正文「## 结论」，related → 正文「## 相关」交叉链接
- 导出后 `openPath` 打开目录；UI 入口在 团队 → 成员与设置 → 「导出 OKF 知识包」

## 报错及解决方案

| 报错 | 原因 | 解决 |
|---|---|---|
| JSX 编译炸（详情页底栏丢失） | StrReplaceFile 替换区间把底栏 `<div>` 开始标签吞了 | 读文件定位后补回；大段替换后必查上下文 |
| TS2322 `key={c}` 类型错 | 评论 map 的 key 用了整个对象 | 改 `key={c.id}` |
| verify-m26.ps1 解析报错（乱码 token） | PS 5.1 把无 BOM 的 .ps1 当 GBK 读，脚本里的中文字符串炸语法 | **ps1 脚本必须纯 ASCII**（注释/数据都英文） |
| `(... \| Where-Object {...}).Count` 断言误失败 | PS 5.1 管道单结果时 `.Count` 语义不可靠 | 一律 `@(...).Count` 强制数组 |
| 测试实例路由时有时无（404 飘忽） | 多次 Start-Process/Stop-Process 后 3399 被旧 dist 残留实例占着 | 用 `Get-NetTCPConnection -LocalPort -State Listen` 确认 OwningProcess 就是刚启动的 pid 再测 |

## 验证

- `server/verify-m26.ps1` 五步全绿（楼中楼结构/@人必达/非成员评论 403/非作者删除 403/OKF frontmatter 断言）
- headless Edge UI e2e 四断言全过（建条目/发评论/楼中楼回复/清理），截图核对
- `pnpm --filter server build` + `pnpm --filter desktop build` 0 错误
