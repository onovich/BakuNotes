# iPhone 安装包交付

当前项目是 Expo / React Native 共用源码，已有 iOS 项目配置入口和 `app/eas.json`。真正能安装到 iPhone 的 `.ipa` 还需要苹果签名和设备注册。

## 需要的账号

- Expo 账号：用于 EAS 云构建。
- Apple Developer Program 有效会员：用于 EAS 的 iOS 签名与 Ad Hoc 内部分发。Apple 的免费 Personal Team 可用 Mac 上的 Xcode 对自己的设备做短期测试，但不是此 Windows + EAS 交付路径。

## 账号就绪后的顺序

1. 先完成 [云同步配置](CLOUD_SETUP.md)，在网页验收加密与数据迁移。不要把未经验证的真实梦境放进安装包测试流程。
2. 在 `app/` 执行 `npx eas-cli login` 与 `npx eas-cli build:configure`，确认 Expo 项目归属。
3. 设置项目唯一的 `ios.bundleIdentifier`；用 `npx eas-cli device:create` 注册要安装的 iPhone。
4. 执行 `npx eas-cli build --platform ios --profile preview`，按 EAS 提示完成 Apple 签名。构建完成后下载 `.ipa` 并在已注册的 iPhone 上安装、验收。

EAS 的 `preview` 配置使用内部发布；设备必须包含在签名描述文件中。没有有效 Apple Developer Program 会员时，不把 iOS 源码或网页预览称作“真正的原生安装包”。

官方依据：[Expo iOS 真机云构建](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/) · [Expo 内部分发](https://docs.expo.dev/build/internal-distribution/) · [Apple 会员类型](https://developer.apple.com/support/compare-memberships/)
