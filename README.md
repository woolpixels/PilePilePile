# 堆堆堆 PilePilePile

堆堆堆是一款本地优先的文字构图工具。输入一组词条，即可将它们自动排布为几何图形、图片遮罩或自定义轮廓，并继续调整字号、颜色、旋转、间距、背景与单个词条样式。

默认画布为 1080 × 1080 px，支持导出 PNG、导出 SVG 和复制 SVG。项目可直接作为网页运行，也提供保留 macOS 原生窗口外壳的通用架构 App。

*PilePilePile turns words into editable typographic shapes for posters, graphics, and visual storytelling.*

## 核心能力

### 文字与字号

- 支持中文、英文词条，使用空格、换行、顿号、逗号或分号分隔。
- 提供“层级鲜明”和“大小相近”两种字号分布。
- 字号档位支持 2–10 档；2–7 档单行显示，8–10 档平衡为两行。
- 自动适配开启时，根据词条和形状面积缩放整组字号。
- 关闭自动适配后，可直接编辑每个档位；按回车或点击其他位置确认。
- 切换自动适配本身不会重新排版或重新随机字号。
- 文字间距和填充强度会按固定字号重新计算位置；空间不足时允许个别词条降档，确保不缺字。
- 预置苹方、华文宋体、Helvetica Neue 和 Georgia。

### 形状与排版

- 内置正方形、长方形、圆形、星形、心形、云朵和微博轮廓。
- 支持上传 SVG，并在浏览器本地保存为形状预置。
- 支持上传 PNG、JPEG、WebP 图片生成遮罩，可反转明暗区域。
- 支持节点绘图；使用“取消 / 完成绘图”管理绘图过程，节点操作统一进入全局撤销重做。
- 形状可显示为独立背景层，并调整颜色和透明度。
- 排版以完整放置全部词条为硬约束，极端情况下继续缩小字号紧凑放置。
- “随机字号”生成新的字号参数；“重新排版”使用当前参数更换布局。

### 配色、背景与词条编辑

- 内置鲜果、晴日、科技、时尚和墨彩 5 组配色；墨彩为中性灰阶。
- 支持最多 8 个自定义 HEX 颜色。
- 支持背景颜色、背景透明度和透明背景。
- 支持不旋转、随机旋转，以及 10 种可多选的自定义角度。
- 单击画布词条可设置其字号档位和颜色；选中状态使用蓝色元素描边。
- 词条详情默认收起，可查看并修改全部词条的字号和颜色；循环填充时额外显示数量。

### 历史与导出

- 全局撤销重做覆盖文字、字号、间距、配色、形状、旋转、背景、节点绘图、词条设置、随机字号和重新排版。
- 支持 `Command + Z` 和 `Command + Shift + Z`。
- 连续输入和滑杆拖动会合并记录，最多保留 50 条历史。
- 导出和复制不会写入历史，词条选中框也不会出现在导出结果中。
- SVG 使用显式字形基线偏移，并直接输出文字节点，便于继续在设计软件中编辑。

## 网页运行

项目不依赖第三方包，可直接打开 `index.html`，或启动本地服务器：

```bash
python3 -m http.server 4173
```

然后访问 <http://localhost:4173>。

## macOS App

macOS 版本使用原生 AppKit + WKWebView 外壳，要求 macOS 12 或更高版本。应用包含通用架构二进制，可运行于 Apple Silicon 和 Intel Mac。

原生窗口保留系统标题栏，背景色与网页导航栏一致；右侧显示当前版本号。窗口设置了最小尺寸，画布与词条详情分别滚动，展开详情不会压缩画布内容。

### 开发构建

需要安装 Xcode。默认构建使用 ad-hoc 临时签名，不执行 Apple 公证：

```bash
./scripts/build-macos.sh
```

产物位于：

```text
Build/development/堆堆堆.app
Build/development/堆堆堆-1.0.0-development-universal.dmg
```

### 正式发行

正式发行使用本机已有的 `Developer ID Application: Hui Liu (HB3KFA599J)`。脚本会先检查有效签名身份，并使用固定 SHA-1 identity，避免同名证书产生歧义。

发行流程为：

```text
构建通用架构 App
→ Developer ID 签名 App（Hardened Runtime + secure timestamp）
→ 创建并签名 DMG
→ Apple notarization
→ stapler
→ Gatekeeper 与磁盘镜像验证
```

DMG 的 `codesign` 完整性校验在 stapler 之前执行；stapler 会把公证票据写入 DMG，因此装订后以 `stapler validate`、`hdiutil verify` 和 Gatekeeper 结果作为最终校验。App 会在整个流程结束后再次执行严格签名校验。

执行：

```bash
./scripts/build-macos.sh --release
```

正式产物位于：

```text
Build/release/堆堆堆.app
Build/release/堆堆堆-1.0.0-universal.dmg
```

公证凭据从 macOS 钥匙串读取，默认 profile 名称为 `PilePilePile-Notary`。首次配置时执行：

```bash
xcrun notarytool store-credentials "PilePilePile-Notary" \
  --apple-id "<APPLE_ACCOUNT>" \
  --team-id "HB3KFA599J"
```

随后按提示输入 App 专用密码。也可通过 `NOTARY_PROFILE` 环境变量指定已有的其他钥匙串 profile。

项目、脚本和 Git 不保存证书、私钥、Apple Account 密码或 App 专用密码，也不会创建、修改或删除钥匙串证书。

## 文件结构

```text
index.html              网页界面结构
styles.css              布局与视觉样式
app.js                  词条解析、排版、绘制、历史与导出逻辑
assets/                 内置形状资源
macos/main.swift        macOS 原生窗口与 WKWebView 外壳
macos/Info.plist        App 标识、版本与系统要求
macos/AppIcon.png       macOS 应用图标源文件
scripts/build-macos.sh  开发构建与正式发行脚本
```

## 隐私

编辑、排版和导出均在本机完成。项目不会上传用户输入的词条、图片、SVG 或导出内容。
