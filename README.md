# Slide Ask AI

这是一个可直接加载到 Chrome 的 `Manifest V3` 插件，支持在网页里滑词后直接向 AI 提问。

## 功能

- Popup 面板
- Background Service Worker
- Content Script
- 滑词后浮出“问 AI”按钮
- 点击“问 AI”后立即调用 AI 并展示回答
- AI 回答中的 Markdown 会在页面面板内渲染显示
- 页面浮层支持继续追问，形成一个简洁的对话窗口
- AI 回复支持流式逐字输出，不再等整段生成完成后一次性展示
- 在插件弹窗中配置 API Key、Base URL、Model 和系统提示词
- 可配置 `reasoning_effort`
- 插件弹窗显示最近一次请求的性能指标，如首 token 延迟和 token 速度

## 目录结构

```text
.
├── manifest.json
├── popup
│   ├── popup.css
│   ├── popup.html
│   └── popup.js
└── src
    ├── background.js
    └── content.js
```

## 本地使用

1. 打开 Chrome，进入 `chrome://extensions/`
2. 打开右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择当前项目目录
5. 打开插件弹窗，填好 AI 配置
6. 刷新目标网页后，选中文字开始提问

## 开发说明

- `manifest.json` 是插件入口配置
- `popup/` 放配置界面
- `src/background.js` 负责请求 AI 接口
- `src/content.js` 负责滑词按钮和页面内回答面板

## AI 接口说明

- 默认按 OpenAI 兼容接口请求
- 默认 Base URL 为 `https://api.deepseek.com/v1`
- 默认模型为 `deepseek-chat`
- 默认接口模式为 `Chat Completions API`
- 额外发送可配置的 `reasoning_effort`
- 如果你使用兼容该请求格式的服务，也可以改成自己的地址

## 简单校验

如果本机安装了 Node.js，可以运行：

```bash
npm run check
```
