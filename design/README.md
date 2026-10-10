# 插画资产

- `mini-program-avatar.png`：生图生成的小程序头像，1254 × 1254 像素、奶油白不透明背景；用于微信公众平台的头像设置，保留在代码包之外。可直接使用的介绍见 [mini-program-profile.md](mini-program-profile.md)。

- `wedding-hero.original.png`：按本次需求调用生图生成的韩式婚礼人物主视觉，保留完整分辨率和透明背景，不依赖外链。
- `../miniprogram/assets/illustrations/wedding-hero.webp`：供 Web 与微信小程序使用的轻量交付格式，保持原图尺寸、构图和透明背景。原始 PNG 留在小程序打包目录之外，避免增加小程序包体积。
- 20 款 SVG 插画图标及对应 PNG 在 `../miniprogram/assets/illustrations/`，由 `scripts/draw-illustrations.js` 的原创矢量路径生成；包含人物简笔画备选、花束、戒指、礼物、音乐、礼服等。

修改矢量图后运行 `npm run art`，再运行 `npm run art:raster` 生成微信端 PNG。原始生图更新后可以用 `node scripts/prepare-generated-hero.js` 重新编码 WebP。后两项是美术构建工具，需要 Playwright 与 Chromium；正常运行两端时不需要这些依赖。
