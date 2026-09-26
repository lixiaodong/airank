# GeoWorthy 线索 Worker

官网（GitHub Pages，纯静态）的表单 → 这个 Worker → Lark 私聊卡片 ＋ 多维表格线索池。

## 为什么要中转

App Secret 不能出现在前端 JS 里。任何人扒下来就能冒充官网往 Lark 灌垃圾。
Worker 用 `wrangler secret` 保管密钥，前端只知道一个 HTTPS 地址。

## 送达策略

| 通道 | 角色 | 失败后果 |
|---|---|---|
| Lark 私聊交互卡片 | 主通道 | 整体判失败，前端降级到 mailto |
| Lark 多维表格记录 | 副通道 | 静默记录错误，不影响用户看到「提交成功」 |

线索只要进了私聊就不会丢，多维表格是方便后续筛选跟进用的。

## 防刷

- **蜜罐字段** `company_site`：真人看不见，填了直接静默丢弃（返回 200 不给反馈信号）
- **停留时长** `dwell`：小于 3 秒判为脚本
- **单 IP 限流**：10 分钟 5 条（KV 计数）
- **Origin 白名单**：只接受 `ALLOWED_ORIGINS` 里的来源
- **包体上限** 8KB，所有字段定长截断并剥离控制字符

## 部署

```bash
wrangler login     # 浏览器点一下授权
./deploy.sh        # KV、secrets、部署一条龙
```

部署完把输出的 `https://geoworthy-lead.<子域>.workers.dev/lead` 填进
`index.html` 的 `LEAD_ENDPOINT`（替换 `__CF_SUBDOMAIN__`）。

## 自检

```bash
curl -s https://geoworthy-lead.<子域>.workers.dev/health
```

## 前置：Lark 应用 scope

多维表格写入需要应用具备 `base:record:create`。没有这个 scope 时，
私聊卡片照常送达，Worker 返回体里的 `base.error` 会说明原因。

申请地址（把 `<APP_ID>` 换成 `.deploy.env` 里的 `LARK_APP_ID`）：
`https://open.larksuite.com/page/scope-apply?clientID=<APP_ID>&scopes=base%3Arecord%3Acreate`

另外多维表格本身也需要把应用加为协作者：

```bash
lark-cli drive +member-add --token <base_token> --type bitable \
  --member-type appid --member-id <APP_ID> --perm edit --yes --as user
```

## 资源标识存哪

本仓库是公开的（GitHub Pages 会原样托管 `worker/` 目录），所以 `base_token`、
`open_id`、`app_id` 一律放在 `.deploy.env`（已 gitignore），模板见 `.deploy.env.example`。
仓库里不出现任何可据以访问文档或冒充应用的标识。
