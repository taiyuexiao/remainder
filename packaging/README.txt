Remainder 便携版使用说明
=========================

Remainder 是个人任务规划与提醒助手：桌面小组件 + 任务四型（主线/支线/跟进/想法）
+ 全局热键速记 + AI 桌宠 + 文档/剪藏/报告/画布/时间轴全景 + AI 助手。

【系统要求】
- Windows 10 / 11（64 位）
- 无需安装 Node.js（包内已内置运行时）
- WebView2 运行时（Win10/11 一般已内置；如缺失请到微软官网下载 Evergreen Bootstrapper）

【快速开始】
1. 把整个 Remainder 文件夹解压到你有写权限的目录（如 文档\Remainder；
   不要放 Program Files，数据要写入 server\data）
2. 双击「启动Remainder.bat」
3. 稍等几秒，主窗口打开即可使用；桌面会有小组件和桌宠
4. 之后任何时候双击 bat：已运行则唤出主窗口，未运行则启动

【AI 功能配置（可选）】
LLM 功能（AI 助手、AI 排版、错别字、日报总结等）需要 DeepSeek API Key：
- 打开 设置 → LLM，填入 base_url（默认 https://api.deepseek.com）、api_key、
  model（默认 deepseek-chat），开关打开即可
- 也可复制 server\.env.example 为 server\.env 填写

【Live2D 桌宠】
- 内置官方示例模型 Hiyori：设置 → 桌宠 → 形象引擎选「Live2D 模型」
- 想换形象：把含 .model3.json 的模型包放进 server\data\live2d-models\
  （设置里有「打开模型文件夹」按钮和获取渠道说明），支持 Cubism 2~5

【数据位置】
全部数据在 server\data\ 目录（remainder.db 数据库、exports 导出、live2d-models）。
备份/迁移：整个 server\data 目录拷走即可。

【常见问题】
- 主窗口显示"正在连接后端服务…"：后端在启动中，等几秒自动进入
- 端口占用：本应用使用 127.0.0.1:3210，如被占用请先关掉占用进程
- 关闭程序：目前需在任务管理器结束 remainder.exe 和 Remainder Server 窗口

版本：v0.1.0（2026-09 打包）
