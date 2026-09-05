把 Live2D 模型包放进这个目录即可被 Remainder 桌宠识别。

目录结构要求：
  live2d-models/
    <模型名>/                 ← 一个文件夹 = 一个模型
      xxx.model3.json         ← 模型入口文件（必须直接放在模型文件夹顶层）
      xxx.moc3
      textures/ ...           ← 贴图、动作、表情等按模型包原有相对路径放

支持 Cubism 3~5 的 .model3.json 模型，也兼容 Cubism 2 的老模型（model.json + .moc）。

模型获取渠道（自行下载，注意各模型的使用许可）：
  - Eikanya/Live2d-model（GitHub 收集仓库）
  - Booth（booth.pm，搜 Live2D）
  - B 站 / 模之屋 等社区分享
  - Live2D 官方免费示例模型（Hiyori / Haru / Mao 等）

放好后到「设置 → 桌宠」里把形象引擎切换为 Live2D，并点「刷新列表」选择模型。
