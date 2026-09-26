#!/usr/bin/env bash
# GeoWorthy 线索 Worker 一键部署
#
# 跑之前只需要做一件事：wrangler login（浏览器里点一下授权）。
# App Secret 从 macOS 钥匙串里取，不经过终端回显，也不进 git。
set -euo pipefail
cd "$(dirname "$0")"

# 资源标识从本地 .deploy.env 读取。该文件已被 .gitignore 排除，
# 因为本仓库是公开的（GitHub Pages 会原样托管 worker/ 目录）。
# 没有这个文件时，照模板自己填一份：见 .deploy.env.example
ENV_FILE="$(dirname "$0")/.deploy.env"
[ -f "$ENV_FILE" ] || { echo "缺少 $ENV_FILE，请参考 .deploy.env.example 创建" >&2; exit 1; }
# shellcheck disable=SC1090
. "$ENV_FILE"
for v in LARK_APP_ID LARK_OPEN_ID BASE_TOKEN TABLE_ID BASE_LINK; do
  [ -n "${!v:-}" ] || { echo ".deploy.env 里缺 $v" >&2; exit 1; }
done

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31mX  %s\033[0m\n' "$1" >&2; exit 1; }

command -v wrangler >/dev/null || die "没装 wrangler：npm i -g wrangler"

say "1/5 检查 Cloudflare 登录状态"
if ! wrangler whoami >/dev/null 2>&1; then
  die "还没登录 Cloudflare。先跑：wrangler login"
fi
wrangler whoami 2>/dev/null | grep -i -E 'account|email' || true

say "2/5 准备 KV namespace（限流 + token 缓存）"
if grep -q 'PLACEHOLDER_KV_ID' wrangler.toml; then
  KV_OUT="$(wrangler kv namespace create GW_KV 2>&1)"
  echo "$KV_OUT"
  KV_ID="$(printf '%s' "$KV_OUT" | grep -o '"id"[^"]*"[0-9a-f]\{32\}"' | grep -o '[0-9a-f]\{32\}' | head -1)"
  [ -n "$KV_ID" ] || KV_ID="$(printf '%s' "$KV_OUT" | grep -o '[0-9a-f]\{32\}' | head -1)"
  [ -n "$KV_ID" ] || die "没能从 wrangler 输出里解析出 KV id，手动把 id 填进 wrangler.toml 再重跑"
  sed -i '' "s/PLACEHOLDER_KV_ID/$KV_ID/" wrangler.toml
  echo "KV id 已写入 wrangler.toml: $KV_ID"
else
  echo "wrangler.toml 里已有 KV id，跳过"
fi

say "3/5 写入 Worker secrets（不回显、不入 git）"
printf '%s' "$LARK_APP_ID"  | wrangler secret put LARK_APP_ID
printf '%s' "$LARK_OPEN_ID" | wrangler secret put LARK_RECEIVE_OPEN_ID
printf '%s' "$BASE_TOKEN"   | wrangler secret put LARK_BASE_TOKEN
printf '%s' "$TABLE_ID"     | wrangler secret put LARK_BASE_TABLE_ID
printf '%s' "$BASE_LINK"    | wrangler secret put LARK_BASE_LINK

say "4/5 App Secret"
cat <<NOTE
下面这一步 wrangler 会让你粘贴 Lark 应用的 App Secret。
去这里复制（凭证与基础信息 → App Secret）：
  https://open.larksuite.com/app/$LARK_APP_ID/baseinfo
粘贴的内容不会回显，也不会写进任何文件。
NOTE
wrangler secret put LARK_APP_SECRET

say "5/5 部署"
wrangler deploy

cat <<'TIP'

部署完了。最后两步：
  1) 记下上面输出的 https://geoworthy-lead.<你的子域>.workers.dev
  2) 把这个地址填进 index.html 的 LEAD_ENDPOINT，替换掉 __CF_SUBDOMAIN__

自检：
  curl -s https://geoworthy-lead.<你的子域>.workers.dev/health
TIP
