# 更新发布流程

## 推荐方案：NAS 静态更新源

仓库保持 Private，只存源码。设计师同事不需要 GitHub 权限，也不会接触飞书 API 密钥。

自动更新需要一个公司内网可访问的 HTTP/HTTPS 静态目录，例如：

```text
https://nas.gameale.com/updates/poring-gameale/
```

这个地址必须能直接打开：

```text
https://nas.gameale.com/updates/poring-gameale/latest.yml
```

并且浏览器打开 exe 链接时会直接下载文件，而不是进入 NAS File Station 管理页。

## 首次安装

把最新安装包发给同事安装：

```text
poring-gameale-x.x.x-x64.exe
```

安装时会创建桌面快捷方式和开始菜单快捷方式。用户本地设置保存在应用数据目录，覆盖安装不会清空飞书配置、素材库路径和输出目录。

## 后续在线更新

1. 修改代码并测试。
2. 提升 `package.json` 里的 `version`，例如 `0.1.2` -> `0.1.3`。
3. 执行：

```powershell
npm run dist
```

4. 把 `release` 目录里的 3 个文件上传到同一个 NAS 更新目录：

```text
latest.yml
poring-gameale-x.x.x-x64.exe
poring-gameale-x.x.x-x64.exe.blockmap
```

5. 同事的软件启动后会自动检查更新；下载时界面会显示进度；下载完成后提示重启安装。

## 为什么不用 Private GitHub 给同事更新

Private GitHub Releases 下载需要鉴权。如果把 token 写进软件，同事拿到安装包后就有泄露风险。GitHub 适合放源码和版本管理，给同事分发更新更适合用内网 NAS 或公司静态文件服务。

## NAS 要求

- 不要使用 `https://nas.gameale.com/file/` 这种 File Station 页面作为更新源。
- 需要一个“静态文件直链目录”，能直接访问 `latest.yml` 和 exe。
- 如果 NAS 只有文件管理页面，需要让 IT 开一个 Web Station、Nginx、IIS 或 Docker 静态文件服务，把更新目录映射出去。

## 回滚

如果新版有问题，把旧版本的这 3 个文件重新上传到更新目录即可：

```text
latest.yml
poring-gameale-旧版本-x64.exe
poring-gameale-旧版本-x64.exe.blockmap
```

注意 `latest.yml` 必须和对应 exe/blockmap 来自同一次打包。
