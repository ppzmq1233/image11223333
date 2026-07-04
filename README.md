# st-chatu8-comfy

基于 [st-chatu8](https://github.com/damoshen123/st-chatu8) 拆分出的精简 ComfyUI 连接插件，仅保留「主要设置 + ComfyUI」相关核心：聊天标记触发、工作流预设、生图轮询、图片插入楼层。

UI 为重新实现，代码可读，便于二次开发做更复杂的酒馆内生图效果。

## 功能

- 聊天内自定义标记触发 ComfyUI 生图
- 自定义工作流预设（API JSON），支持占位符替换
- ComfyUI 连接测试、生图轮询、图片自动插入到所在楼层
- 独立设置面板，与原 st-chatu8 插件互不依赖（可单独使用）

## 工作流占位符

在工作流 API JSON 字符串中使用以下占位符，运行时会被替换为实际值：

| 占位符 | 含义 |
| --- | --- |
| `%prompt%` | 正面提示词（聊天中标记包裹的文本） |
| `%negative_prompt%` | 负面提示词（设置面板配置） |
| `%width%` `%height%` | 图片宽高 |
| `%steps%` `%cfg_scale%` `%seed%` | 步数 / CFG / 种子 |
| `%sampler_name%` `%scheduler%` | 采样器 / 调度器 |

种子填 `-1` 表示随机。

## 安装

把本目录拷到酒馆 `public/scripts/extensions/third-party/` 下，重启酒馆，在扩展菜单启用 `st-chatu8-comfy`。

## 使用

1. 扩展设置区点击「ComfyUI 连接」按钮打开面板
2. 填 ComfyUI 地址（默认 `http://127.0.0.1:8188`）→ 测试连接
3. 勾选「启用插件」
4. 在 AI 回复里用 `image###提示词###image` 即可触发生成（标记可在面板自定义）

## 致谢

- 原插件作者：[从前跟你一样](https://github.com/damoshen123)
- 本插件参考了原插件反混淆后的通信元逻辑重新实现