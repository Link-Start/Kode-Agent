# 灵光闪应用发布接口

只在发布源码包、查询发布状态或排查接口响应时读取本文档。

## 认证

在 <https://www.lingguang.com/settings> 创建访问令牌（Access Token）。

除正常 HTTP 协议头外，只发送以下浏览器上下文请求头：

```text
Accept: application/json, text/plain, */*
Authorization: Bearer <access-token>
Origin: https://www.lingguang.com
Referer: https://www.lingguang.com/
```

禁止保存或重放从浏览器复制的示例 Cookie、User-Agent、`sec-ch-*` 或 `sec-fetch-*` 请求头。Spanner 网关可能在认证失败或 Referer 被拒绝时仍返回 HTTP 200，因此必须始终校验 JSON 中的业务字段。

## 发布

```text
POST https://cognihome.lingguang.com/openapi/flashapp/releaseApp.json
Content-Type: multipart/form-data
```

Multipart 字段：

| 字段 | 是否必填 | 含义 |
|---|---:|---|
| `Filedata` | 是 | 源码 `.tar` 或 `.tar.gz` 压缩包 |
| `preview` | 否 | 预览发布时传入字符串 `true`；正式发布时完全省略该字段 |
| `artifactId` | 仅更新时 | 新应用必须省略；更新已有应用时传入稳定 ID，以新增一个版本 |

发布模式由 `preview` 字段是否存在决定：

- 预览发布：发送 `preview=true`。
- 正式发布：不要发送 `preview` 字段；不要发送空字符串、`false` 或其他替代值。

推荐先完成预览发布并查询到 `PASS`，让用户验证预览链接；只有用户明确确认后，才使用同一 `artifactId` 提交正式发布。

成功响应示例：

```json
{
  "code": "SUCCESS",
  "msg": "成功",
  "result": {
    "createTime": 0,
    "instanceId": "3fe920ca34467efaa9dbc8a865a890f397"
  },
  "success": true,
  "traceId": "0be8ed2017843610017305500ecf96"
}
```

`instanceId` 只标识本次发布任务，不是稳定的应用身份。该接口没有文档化的幂等键，因此网络失败且结果不明确时，禁止自动重试发布请求。

## 查询

```text
GET https://cognihome.lingguang.com/openapi/flashapp/queryAppInfo.json?instanceId=<instance-id>
```

成功响应示例：

```json
{
  "code": "SUCCESS",
  "msg": "成功",
  "result": {
    "artifactId": "flashapp-0e49bdb6b426ba20",
    "artifactVersion": "1",
    "instanceId": "3fe920ca34467efaa9dbc8a865a890f397",
    "name": "简易计算器",
    "packageUrl": "https://preview.lingguangcontent.com/example/index.html",
    "status": "PASS"
  },
  "success": true,
  "traceId": "0be8ed2017843610705841044ecf96"
}
```

文档只把 `PASS` 定义为成功的终态。查询结果为 `PASS` 时，命令行工具才能写入 `flashapp-artifact.json`。其他查询请求即使成功，也只应报告原始状态并稍后再次查询；禁止自行推断文档未定义的终态含义。

查询脚本在 `PASS` 时还会强校验 `name`、`artifactId`、`artifactVersion` 和 `packageUrl`。脚本不会输出原始 `packageUrl`：它会对该 URL 连续执行两次与 JavaScript `encodeURIComponent` 一致的百分号编码，拼入灵光 App 闪应用详情深链后生成 SVG 二维码。顶层 `releaseSummary` 输出应用名称、应用 ID、版本号、发布类型和二维码绝对路径；正式发布还输出“可前往灵光 App 或网页版「我的创作」查看”的提示。

## 失败判定

出现以下任一情况时，都把请求判定为失败：

- HTTP 状态码不在 200–299 范围内。
- 响应正文不是 JSON 对象。
- `stat` 为 `deny`、`fail` 或 `failed`。
- `success` 不为 `true`。
- `code` 不为 `SUCCESS`。
- 缺少必要的结果字段。

在经过脱敏的诊断信息中保留 `code`、`msg` 和 `traceId`，但绝不能输出访问令牌。
