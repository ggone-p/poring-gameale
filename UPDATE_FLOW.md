# 更新发布流程

## 结论

源码仓库可以保持 Private。设计师同事不需要 GitHub 权限，也不需要看到源码或 API 信息。

同事只需要拿到安装包。新版安装包覆盖安装后，会继续使用本机的配置文件：

`%APPDATA%\素材悬浮上传\config.json`

所以飞书凭证、素材库路径、输出目录等本地设置不会因为覆盖安装丢失。

## 当前可用流程：内部更新源

同事不需要 GitHub。维护者只需要维护一个公司内部可访问的静态下载目录。

推荐目录示例：

`https://updates.example.com/poring-gameale/`

也可以用 NAS 或内网对象存储，只要电脑能通过 HTTP/HTTPS 访问即可。

1. 在软件设置页填写“更新源地址”，例如：

   `https://updates.example.com/poring-gameale/`

2. 修改代码并确认测试通过。
3. 提升 `package.json` 里的 `version`，例如 `0.1.0` -> `0.1.1`。
4. 执行打包：

   ```powershell
   npm run dist
   ```

5. 把 `release` 目录里的这些文件上传到更新源目录：

   - `latest.yml`
   - `素材悬浮上传 Setup x.x.x.exe`
   - `素材悬浮上传 Setup x.x.x.exe.blockmap`

6. 同事的软件启动后会自动检查更新，也可以在设置页手动点击“检查更新”。
7. 下载完成后，退出并重新打开软件会安装新版。

## 备用流程：手动覆盖安装

如果更新源还没有准备好，就继续把 `release` 目录里的安装包发到飞书群或 NAS。同事关闭软件后直接运行新版安装包，覆盖安装即可。

## 为什么不直接用 Private GitHub

Private GitHub Releases 需要访问权限。同事没有 GitHub 权限时，软件必须内置 token 才能下载，这会把 token 暴露给安装包用户，不安全。

## 注意事项

- 不要把 `config.json`、飞书 `app_secret`、个人素材路径提交到 GitHub。
- Private GitHub 只用于存源码和版本管理，不作为同事下载更新的入口。
- 发给同事的安装包可以公开给团队内部，但不要包含测试凭证。
- 版本号必须递增，否则自动更新识别不到新版本。
