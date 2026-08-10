---
name: lingguang-flash-apps
description: 当用户需要创建、改造、预览发布或正式发布灵光闪应用。
---

# 灵光闪应用开发与发布

灵光闪应用是使用 React + TypeScript 开发的 HTML5 应用，可运行在移动端 App WebView、PC 浏览器或移动浏览器的 iframe 中，并通过 `lingguang.*` API 使用宿主提供的增强能力，例如存储、LLM、搜索等服务端能力、相机、相册、陀螺仪等客户端能力。本技能负责指导项目初始化、已有项目改造、质量检查、源码打包、预览发布和正式发布。

应用代码必须使用外部提供的官方 React 脚手架。禁止把 React 代码库或真实访问令牌复制到本技能中。

## 开始前

1. 确认用户要新建应用还是改造已有项目，并确认应用目标、源项目目录（如有）和输出目录。
2. 说明最终会交付通过检查的 React 源码项目；用户要求发布时，先交付预览版供确认，确认后再正式发布。
3. 先把本 `SKILL.md` 所在目录记为 `SKILL_DIR`。检查 `node`、`npm`、Python、`curl` 和 `tar` 是否可用，并输出版本。官方脚手架当前要求 Node.js `^20.19.0` 或 `>=22.12.0`；发布脚本要求 Python `>=3.10` 和 `qrcode==8.2`。macOS/Linux 使用 `python3`，Windows 优先使用 Python Launcher `py -3`，没有 Launcher 时使用 `python`。用当前解释器运行 `-c "from importlib.metadata import version; assert version('qrcode') == '8.2'"` 检查二维码依赖；缺失或版本不符时暂停并征得用户同意，再用同一解释器运行 `-m pip install -r requirements.txt`。
4. 工具缺失或版本不兼容时，明确报告缺失项。安装或升级系统软件前先征得用户同意，再使用用户系统已有的包管理方式处理；禁止静默安装。

## Windows 运行约定

`scripts/flashapp_api.py` 第一行的 `#!/usr/bin/env python3` 在 Windows 上只会被 Python 当作注释，不影响运行；不要在 PowerShell 中直接执行脚本文件，使用 `py -3 scripts\flashapp_api.py ...`，没有 `py` 命令时使用 `python scripts\flashapp_api.py ...`。

Windows 原生路径如下：

- 访问令牌配置：`%APPDATA%\lingguang-flash-apps\config.json`
- 自动生成的二维码：`%LOCALAPPDATA%\lingguang-flash-apps\qrcodes\`

脚本仍兼容旧位置 `~/.config/lingguang-flash-apps/config.json`：Windows 原生配置不存在时会自动回退读取旧配置。Windows 不执行 POSIX `0600` 权限检查，令牌文件应只保存在当前用户可访问的目录中；也可以改用当前 PowerShell 会话的 `$env:LINGGUANG_FLASH_APPS_ACCESS_TOKEN`。

Windows 检查和安装二维码依赖：

```powershell
$SkillDir = "C:\absolute\path\to\lingguang-flash-apps"
py -3 --version
py -3 -c "from importlib.metadata import version; assert version('qrcode') == '8.2'"
py -3 -m pip install -r (Join-Path $SkillDir "requirements.txt")
```

只在用户同意安装依赖后执行最后一条命令。

## 初始化官方脚手架

官方脚手架的版本清单如下。开启新项目时，从版本清单的 JSON `latest` 字段获取下载地址，并使用该地址初始化一个新的脚手架项目：

```text
版本清单：https://agi-static.lingguang.com/developer-react-scaffold.json
下载地址：版本清单 JSON 的 latest 字段
```

由 Agent 获取下载地址、下载并解压脚手架；不要要求用户手工下载。先让用户确认一个尚不存在的新目录，再执行：

```bash
APP_DIR=/absolute/path/to/new-flash-app
SCAFFOLD_MANIFEST_URL="https://agi-static.lingguang.com/developer-react-scaffold.json"
SCAFFOLD_TMP_DIR=$(mktemp -d)
SCAFFOLD_ARCHIVE="$SCAFFOLD_TMP_DIR/developer-react-scaffold.tar.gz"
SCAFFOLD_STAGE_DIR="$SCAFFOLD_TMP_DIR/project"

cleanup_scaffold_tmp() {
  rm -rf -- "$SCAFFOLD_TMP_DIR"
}
trap cleanup_scaffold_tmp EXIT

test ! -e "$APP_DIR" || { echo "目标目录已经存在：$APP_DIR" >&2; exit 1; }
if ! SCAFFOLD_MANIFEST_JSON=$(curl --fail --location --silent --show-error \
  "$SCAFFOLD_MANIFEST_URL"); then
  echo "获取脚手架版本清单失败" >&2
  exit 1
fi
if ! SCAFFOLD_URL=$(
  python3 - "$SCAFFOLD_MANIFEST_JSON" <<PY
import json
import sys
from urllib.parse import urlparse

try:
    value = json.loads(sys.argv[1]).get("latest")
except (AttributeError, json.JSONDecodeError) as exc:
    raise SystemExit(f"版本清单格式无效：{exc}")
parsed = urlparse(value) if isinstance(value, str) else None
if not (parsed and parsed.scheme == "https" and parsed.netloc):
    raise SystemExit("版本清单 latest 字段不是有效的 HTTPS URL")
print(value)
PY
); then
  echo "获取脚手架下载地址失败" >&2
  exit 1
fi
if ! curl --fail --location --show-error "$SCAFFOLD_URL" \
  --output "$SCAFFOLD_ARCHIVE"; then
  echo "脚手架下载失败" >&2
  exit 1
fi

mkdir -p "$SCAFFOLD_STAGE_DIR" "$(dirname "$APP_DIR")"
if ! tar -xzf "$SCAFFOLD_ARCHIVE" -C "$SCAFFOLD_STAGE_DIR"; then
  echo "脚手架解压失败" >&2
  exit 1
fi
for required_path in AGENTS.md package.json src/main.tsx; do
  if [ ! -f "$SCAFFOLD_STAGE_DIR/$required_path" ]; then
    echo "脚手架缺少必要文件：$required_path" >&2
    exit 1
  fi
done
mv "$SCAFFOLD_STAGE_DIR" "$APP_DIR"
```

Windows PowerShell 使用下面的等价流程：

```powershell
$ErrorActionPreference = "Stop"
$AppDir = "C:\absolute\path\to\new-flash-app"
$ScaffoldManifestUrl = "https://agi-static.lingguang.com/developer-react-scaffold.json"
$ScaffoldTempDir = Join-Path ([IO.Path]::GetTempPath()) `
  ("lingguang-scaffold-" + [guid]::NewGuid().ToString("N"))
$ScaffoldArchive = Join-Path $ScaffoldTempDir "developer-react-scaffold.tar.gz"
$ScaffoldStageDir = Join-Path $ScaffoldTempDir "project"

if (Test-Path -LiteralPath $AppDir) {
  throw "目标目录已经存在：$AppDir"
}

try {
  $ScaffoldManifest = Invoke-RestMethod -Uri $ScaffoldManifestUrl
  $ScaffoldUrl = [string]$ScaffoldManifest.latest
  $ParsedScaffoldUrl = $null
  if ([string]::IsNullOrWhiteSpace($ScaffoldUrl) -or
      -not [Uri]::TryCreate($ScaffoldUrl, [UriKind]::Absolute, [ref]$ParsedScaffoldUrl) -or
      $ParsedScaffoldUrl.Scheme -ne "https") {
    throw "版本清单 latest 字段不是有效的 HTTPS URL"
  }

  New-Item -ItemType Directory -Path $ScaffoldStageDir -Force | Out-Null
  Invoke-WebRequest -Uri $ScaffoldUrl -OutFile $ScaffoldArchive

  tar.exe -xzf $ScaffoldArchive -C $ScaffoldStageDir
  if ($LASTEXITCODE -ne 0) {
    throw "脚手架解压失败，tar.exe 退出码：$LASTEXITCODE"
  }

  $AppParent = Split-Path -Parent $AppDir
  New-Item -ItemType Directory -Path $AppParent -Force | Out-Null
  Move-Item -LiteralPath $ScaffoldStageDir -Destination $AppDir
} finally {
  if (Test-Path -LiteralPath $ScaffoldTempDir) {
    Remove-Item -LiteralPath $ScaffoldTempDir -Recurse -Force
  }
}
```

获取版本清单、下载或解压失败时，报告具体错误并停止初始化。禁止擅自改用 `master`、其他仓库副本或不来自版本清单 `latest` 字段的压缩包。脚手架版本由版本清单维护，不要在技能中固定版本化下载地址或包摘要。

## 改造已有项目

默认采用隔离迁移，禁止直接把脚手架覆盖到已有项目中：

1. 读取已有项目适用的 `AGENTS.md`（如有），检查 Git 状态，并盘点入口、路由、Provider、业务组件、依赖、静态资源、环境变量、网络请求、持久化和浏览器 API。
2. 在已有项目旁边选择一个尚不存在的新目录，按“初始化官方脚手架”创建迁移目标。
3. 完整读取迁移目标中的 `AGENTS.md`，再按已有项目实际使用的能力读取所需 `docs/API_*.md`。
4. 保留脚手架的平台入口 `src/main.tsx`、`package.json`、锁文件、构建配置和插件。把已有项目的业务组件、Provider、样式和资源迁入 `src/App.tsx` 及业务模块，不要复制原项目入口覆盖平台入口。
5. 只使用脚手架 `package.json` 已声明的依赖。原项目依赖不在脚手架中时，使用现有依赖改写对应功能；无法等价改写时，向用户说明影响并请求取舍，禁止擅自安装新依赖。
6. 把远程资源、环境变量、存储、网络请求和浏览器能力逐项改造成符合脚手架 `AGENTS.md` 与相关 `docs/API_*.md` 的实现，禁止把密钥迁入前端源码。
7. 完成 `manifest.json`、质量检查和关键路径验证后，把新目录作为改造结果交付。除非用户明确要求且已有可恢复的版本控制保护，否则不要原地覆盖旧项目。

## 开发应用

1. 修改代码前，完整阅读解压后项目中的 `AGENTS.md`。
2. 只读取当前功能需要的 `docs/API_*.md`。
3. 运行 `npm ci`。只使用 `package.json` 中已经声明的依赖。
4. 编写业务代码，但不要修改平台维护的 `src/main.tsx`。
5. 在项目根目录创建并维护 `manifest.json`。以脚手架中的 `plugins/manifest-utils.ts` 和 `plugins/vite-plugin-validate-manifest.ts` 为当前字段、封面格式及路径规则的事实来源，不要凭记忆臆造 schema。
6. 按“准备应用封面”处理默认封面和用户自定义封面。
7. 打包前运行 `npm run check`。修复所有失败项，禁止绕过检查。
8. 浏览器可用时运行 `npm run dev`，实际验证用户要求的关键操作路径。

## 准备应用封面

脚手架自带默认封面，且 `manifest.json` 中的 `artifact.coverImage` 已指向该文件。默认封面只作为兜底，不要把它默认为最终交付效果。

完成应用主要功能后、预览发布前，主动告知用户可以上传自己的封面，并鼓励用户提供与应用主题匹配的专属封面；用户没有现成图片时，主动建议根据应用名称、用途和视觉风格生成一张专属封面。用户愿意提供或生成时，把最终图片保存到源码项目中，更新 `artifact.coverImage` 为源码包内的相对路径，并向用户展示封面供确认。用户暂时不提供且不要求生成时，保留脚手架默认封面，不阻塞后续流程。

打包前确认 `artifact.coverImage` 指向的图片真实存在并会随源码包上传。封面格式及路径限制始终以当前脚手架的 manifest 工具和校验插件为准，禁止使用远程 URL 或只存在于源码包外的本地路径。

## 打包源码

在项目目录外创建压缩包，避免把压缩包自身包含进去：

```bash
tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.DS_Store' \
  --exclude='.env*' \
  --exclude='*.pem' \
  --exclude='*.key' \
  --exclude='flashapp-artifact.json' \
  -czf /tmp/flash-app-source.tar.gz .
```

确保 `package.json` 和 `manifest.json` 位于压缩包根目录。发布脚本会拒绝危险路径、软硬链接、应排除的目录、疑似密钥文件、缺少根目录必要文件的压缩包以及无效的 tar 压缩包。

Windows PowerShell 可使用系统自带的 `tar.exe`，并从项目根目录打包：

```powershell
$ProjectDir = "C:\absolute\path\to\my-flash-app"
$Package = Join-Path $env:TEMP "flash-app-source.tar.gz"
Push-Location $ProjectDir
try {
  tar.exe --exclude=.git --exclude=node_modules --exclude=dist `
    --exclude=.DS_Store --exclude=.env* --exclude=*.pem --exclude=*.key `
    --exclude=flashapp-artifact.json -czf $Package .
} finally {
  Pop-Location
}
```

## 配置认证信息

首次发布前必须暂停后续发布步骤，确保访问令牌已经配置完成。未配置或尚未确认时，主动向用户提供以下两种方式：

1. **由 Agent 配置**：允许用户把访问令牌直接发送到聊天中。收到后不要在回复中复述或展示令牌；去掉可选的 `Bearer ` 前缀。macOS/Linux 写入 `~/.config/lingguang-flash-apps/config.json` 并把权限设置为 `0600`；Windows 写入 `%APPDATA%\lingguang-flash-apps\config.json`，不运行 `chmod`。使用不会把令牌显示在终端命令、补丁、stdout、stderr 或日志中的写入方式。完成后只确认“访问令牌已配置”，不要输出文件内容或令牌值。
2. **由用户配置**：让用户按下面的命令复制模板，自行替换占位值并设置文件权限；用户确认完成后再继续。

先确定本 `SKILL.md` 所在目录：

```bash
SKILL_DIR=/absolute/path/to/lingguang-flash-apps
mkdir -p ~/.config/lingguang-flash-apps
cp "$SKILL_DIR/assets/config.example.json" ~/.config/lingguang-flash-apps/config.json
chmod 600 ~/.config/lingguang-flash-apps/config.json
```

Windows PowerShell 使用：

```powershell
$SkillDir = "C:\absolute\path\to\lingguang-flash-apps"
$ConfigDir = Join-Path $env:APPDATA "lingguang-flash-apps"
New-Item -ItemType Directory -Force $ConfigDir | Out-Null
Copy-Item (Join-Path $SkillDir "assets\config.example.json") `
  (Join-Path $ConfigDir "config.json")
notepad (Join-Path $ConfigDir "config.json")
```

访问令牌从 <https://www.lingguang.com/settings> 获取，也可以由用户自行设置环境变量 `LINGGUANG_FLASH_APPS_ACCESS_TOKEN`。配置后，macOS/Linux 验证文件存在、权限为 `0600`、JSON 结构有效且令牌不是占位值；Windows 验证文件位于当前用户的 `%APPDATA%`、JSON 结构有效且令牌不是占位值，不验证 POSIX 权限位。禁止在验证结果中显示令牌。

允许在聊天中接收访问令牌，但禁止通过 CLI 参数传递，禁止把它写入源码、提交记录或发布包，也禁止打印或复制到诊断日志中。禁止保存或发送浏览器中的 Cookie、UA 或 `sec-*` 请求头。

## 发布与查询

相对于本 `SKILL.md` 定位 `scripts/flashapp_api.py`。首次发布前或排查接口响应时，先阅读 `references/deploy-api.md`。需要查看全部命令参数时，运行 `--help`。

`release --preview` 会在 API 请求中发送 `preview=true`，用于预览发布。不传 `--preview` 时请求中完全省略 `preview` 字段，属于正式发布。`--new-artifact` 只控制新建还是更新应用，不代表发布模式。

标准流程必须先预览、展示结果并等待用户确认，然后才能正式发布：

| 阶段     | 发布参数                             | 应用身份处理方式                                   |
| -------- | ------------------------------------ | -------------------------------------------------- |
| 首次预览 | `--preview --new-artifact`           | 不传 `artifactId`，创建新应用                      |
| 更新预览 | `--preview`                          | 复用 `flashapp-artifact.json` 中的 `artifactId`    |
| 正式发布 | 不传 `--preview` 和 `--new-artifact` | 复用已通过预览的 `artifactId`                      |
| 查询发布 | 使用本次发布的 `instanceId`          | 仅在状态为 `PASS` 时生成成功摘要、二维码并保存身份 |

首次预览发布：

```bash
python3 "$SKILL_DIR/scripts/flashapp_api.py" release \
  --package /tmp/flash-app-source.tar.gz \
  --project-dir /path/to/my-flash-app \
  --preview \
  --new-artifact
```

从标准输出中取得 `result.instanceId`，然后查询该发布实例：

```bash
python3 "$SKILL_DIR/scripts/flashapp_api.py" query \
  --instance-id INSTANCE_ID \
  --project-dir /path/to/my-flash-app \
  --preview
```

查询命令的发布类型必须与对应的发布请求一致：预览发布的查询必须传 `--preview`，正式发布的查询不得传 `--preview`。

Windows PowerShell 对应的首次预览与查询命令如下；正式发布时省略 `--preview` 和 `--new-artifact`。以下 `py -3` 在没有 Python Launcher 时均可替换为 `python`：

```powershell
$SkillDir = "C:\absolute\path\to\lingguang-flash-apps"
$ProjectDir = "C:\absolute\path\to\my-flash-app"
$Package = Join-Path $env:TEMP "flash-app-source.tar.gz"

py -3 (Join-Path $SkillDir "scripts\flashapp_api.py") release `
  --package $Package --project-dir $ProjectDir --preview --new-artifact

py -3 (Join-Path $SkillDir "scripts\flashapp_api.py") query `
  --instance-id INSTANCE_ID --project-dir $ProjectDir --preview
```

如果返回状态不是 `PASS`，以固定且有限的间隔继续查询同一个 `instanceId`，例如每 10 秒一次、最多等待 10 分钟。达到等待上限时，报告当前状态和 `instanceId`，不要重复提交发布请求。

状态为 `PASS` 后，查询输出会移除 API 原始 `packageUrl`，并新增 `releaseSummary`，包含 `name`、`artifactId`、`artifactVersion`、`releaseType` 和 `qrCodePath`；正式发布还包含 `viewHint`。二维码在 macOS/Linux 默认生成于 `~/.cache/lingguang-flash-apps/qrcodes/`，Windows 默认生成于 `%LOCALAPPDATA%\lingguang-flash-apps\qrcodes\`；需要指定路径时给查询命令传入 `--qr-output` 和一个以 `.svg` 结尾的绝对路径。

二维码不得直接编码 API 返回的原始 URL。脚本会对原始 URL 连续执行两次与 JavaScript `encodeURIComponent` 一致的百分号编码，再拼入灵光 App 的 `leopards://` 闪应用详情深链，最终把完整深链编码进二维码。以脚本中的 `build_qr_target_url()` 为规则事实来源，不要自行拼接或只编码一次。

每次查询到 `PASS` 都必须向用户同时展示：

- 应用名称
- 应用 ID（`artifactId`）
- 版本号（`artifactVersion`）
- 使用 `qrCodePath` 绝对路径渲染的二维码图片，并紧邻二维码明确提醒：“请使用灵光 App 扫码访问”

预览发布只展示二维码和上述基本信息，禁止向用户提供 API 返回的原始 URL。二维码交付后，本次预览发布即结束；必须暂停并明确等待用户确认预览没有问题。未得到确认时，禁止自动提交正式发布。用户确认后，使用同一源码包和已保存的应用身份正式发布：

```bash
python3 "$SKILL_DIR/scripts/flashapp_api.py" release \
  --package /tmp/flash-app-source.tar.gz \
  --project-dir /path/to/my-flash-app
```

正式发布同样要使用新的 `instanceId` 查询到 `PASS`，查询时不得传 `--preview`。向用户交付正式版本的名称、应用 ID、版本号和二维码，提醒二维码须使用灵光 App 扫码，并告知：“可前往灵光 App 或网页版「我的创作」查看。”不要向用户提供 API 返回的原始 URL。完成二维码和查看方式交付后，整个发布流程即结束；不要继续查询该 `instanceId`，也不要再提交发布请求。

查询为 `PASS` 时，命令还会把稳定的应用身份写入项目根目录的 `flashapp-artifact.json`。该文件应纳入应用自己的 Git 仓库，但不要放进发布压缩包；只有用户授权提交时才执行 `git commit`。后续发布不要传 `--new-artifact`，脚本会自动复用保存的 `artifactId`。

如果查询返回不同的 ID，先排查原因，再决定是否使用 `--replace-artifact-id`。只有明确要更换项目的应用身份时才能使用该参数。

## 常见错误

- 禁止只根据 HTTP 200 判断成功；还必须检查 JSON 中的业务字段。
- 禁止把 `--new-artifact` 当作预览开关；只有 `--preview` 控制预览发布。
- 禁止在用户确认预览前省略 `--preview`；省略该参数就是正式发布。
- 禁止把预览发布的查询当作正式查询；预览查询必须传 `query --preview`。
- 禁止展示 API 返回的原始 `packageUrl`，也禁止直接把原始 URL 编码成二维码。
- 禁止把 `instanceId` 当作稳定应用身份；只有 `artifactId` 是稳定身份。
- 禁止在 `flashapp-artifact.json` 中保存版本、状态、预览 URL、trace ID、访问令牌或 Cookie。
- 禁止上传 `dist`；发布接口需要通过检查的源码包。
- 禁止把 React 脚手架放入技能分发包。
