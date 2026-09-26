/**
 * GeoWorthy 官网线索中转
 *
 * 为什么需要它：官网跑在 GitHub Pages，纯静态没有后端。表单要把线索推到 Lark，
 * 就必须有一个能保管 App Secret 的地方 —— 密钥绝不能出现在前端 JS 里，
 * 否则任何人扒下来都能冒充官网往你的 Lark 灌垃圾。
 *
 * 送达策略：私聊卡片是主通道（必须成功），多维表格是副通道（尽力而为）。
 * 副通道挂了不影响用户拿到「提交成功」—— 线索已经进了你的 Lark，不会丢。
 */

const MAX_BODY = 8 * 1024; // 8KB，正常表单约 1KB
const MIN_DWELL_MS = 3000; // 真人填完这张表不可能快于 3 秒
const RATE_LIMIT = 5; // 单 IP 每窗口最多 5 次
const RATE_WINDOW_S = 600; // 10 分钟
const TOKEN_TTL_S = 5400; // tenant_access_token 官方有效期 2h，提前 30min 续期

const FIELDS = {
  plan: { label: '套餐', max: 60, required: true },
  name: { label: '称呼', max: 60, required: true },
  type: { label: '优化对象', max: 40, required: true },
  contact: { label: '联系方式', max: 120, required: true },
  email: { label: '邮箱', max: 160, required: false },
  field: { label: '领域', max: 200, required: true },
  links: { label: '现有主页', max: 1000, required: false },
  goal: { label: '期望AI怎么介绍', max: 1200, required: true },
};

/* ---------- 工具 ---------- */

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json;charset=utf-8', ...headers },
  });

const allowList = (env) =>
  (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

function corsHeaders(origin, env) {
  const allowed = allowList(env);
  const ok = origin && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] || '',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const isAllowed = (origin, env) => !!origin && allowList(env).includes(origin);

// 去掉控制字符并截断 —— 防止有人往卡片里塞超长内容或伪造换行结构
const CTRL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');
function clean(v, max) {
  return String(v == null ? '' : v).replace(CTRL, '').trim().slice(0, max);
}

/* ---------- Lark ---------- */

async function tenantToken(env) {
  const cached = await env.GW_KV.get('lark:tenant_token');
  if (cached) return cached;

  const r = await fetch(`${env.LARK_BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json;charset=utf-8' },
    body: JSON.stringify({ app_id: env.LARK_APP_ID, app_secret: env.LARK_APP_SECRET }),
  });
  const d = await r.json();
  if (d.code !== 0 || !d.tenant_access_token) {
    throw new Error(`tenant_access_token failed: ${d.code} ${d.msg}`);
  }
  // expire 单位是秒；取官方值与本地上限中的小者，避免用到过期 token
  const ttl = Math.max(60, Math.min(TOKEN_TTL_S, (d.expire || TOKEN_TTL_S) - 300));
  await env.GW_KV.put('lark:tenant_token', d.tenant_access_token, { expirationTtl: ttl });
  return d.tenant_access_token;
}

function buildCard(data, meta, env) {
  const short = (label, value) => ({
    is_short: true,
    text: { tag: 'lark_md', content: `**${label}**\n${value || '—'}` },
  });
  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: '新线索 · GeoWorthy 官网' },
      subtitle: { tag: 'plain_text', content: `${data.name} · ${data.plan}` },
    },
    elements: [
      {
        tag: 'div',
        fields: [
          short('称呼', data.name),
          short('套餐', data.plan),
          short('优化对象', data.type),
          short('联系方式', data.contact),
          short('邮箱', data.email),
          short('领域', data.field),
        ],
      },
      { tag: 'hr' },
      { tag: 'div', text: { tag: 'lark_md', content: `**目标平台**\n${data.models.join(' · ') || '—'}` } },
      { tag: 'div', text: { tag: 'lark_md', content: `**现有主页**\n${data.links || '—'}` } },
      { tag: 'div', text: { tag: 'lark_md', content: `**希望 AI 怎么介绍**\n${data.goal}` } },
      { tag: 'hr' },
      { tag: 'note', elements: [{ tag: 'plain_text', content: `${meta.time} · ${meta.country} · ${meta.ip}` }] },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            type: 'primary',
            text: { tag: 'plain_text', content: '打开线索池' },
            url: env.LARK_BASE_LINK,
          },
        ],
      },
    ],
  };
}

async function sendCard(env, token, data, meta) {
  const r = await fetch(`${env.LARK_BASE_URL}/im/v1/messages?receive_id_type=open_id`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json;charset=utf-8' },
    body: JSON.stringify({
      receive_id: env.LARK_RECEIVE_OPEN_ID,
      msg_type: 'interactive',
      content: JSON.stringify(buildCard(data, meta, env)),
    }),
  });
  const d = await r.json();
  if (d.code !== 0) throw new Error(`im send failed: ${d.code} ${d.msg}`);
  return d.data && d.data.message_id;
}

async function writeBase(env, token, data, meta) {
  if (!env.LARK_BASE_TOKEN || !env.LARK_BASE_TABLE_ID) return { skipped: 'not_configured' };
  const url = `${env.LARK_BASE_URL}/bitable/v1/apps/${env.LARK_BASE_TOKEN}/tables/${env.LARK_BASE_TABLE_ID}/records`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json;charset=utf-8' },
    body: JSON.stringify({
      fields: {
        提交时间: Date.now(),
        称呼: data.name,
        套餐: data.plan,
        优化对象: data.type,
        联系方式: data.contact,
        邮箱: data.email,
        领域: data.field,
        目标平台: data.models,
        现有主页: data.links,
        期望AI怎么介绍: data.goal,
        来源: `官网 · ${meta.country} · ${meta.ip}`,
        跟进状态: '待联系',
      },
    }),
  });
  const d = await r.json();
  if (d.code !== 0) throw new Error(`bitable failed: ${d.code} ${d.msg}`);
  return { record_id: d.data && d.data.record && d.data.record.record_id };
}

/* ---------- 入口 ---------- */

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('origin') || '';
    const cors = corsHeaders(origin, env);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(req.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'geoworthy-lead' }, 200, cors);
    if (req.method !== 'POST' || url.pathname !== '/lead') {
      return json({ ok: false, error: 'not_found' }, 404, cors);
    }
    if (!isAllowed(origin, env)) {
      return json({ ok: false, error: 'origin_not_allowed' }, 403, cors);
    }

    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ ok: false, error: 'payload_too_large' }, 413, cors);

    let body;
    try {
      body = JSON.parse(raw);
    } catch (e) {
      return json({ ok: false, error: 'bad_json' }, 400, cors);
    }

    // 蜜罐：真人看不见这个字段，填了的一定是脚本。
    // 返回 200 而不是错误码 —— 不给爬虫任何「被识破了」的反馈信号。
    if (clean(body.company_site, 80)) return json({ ok: true, queued: true }, 200, cors);

    // 停留时长：表单渲染时打时间戳，提交时算差值。秒填的不是人。
    if (!(Number(body.dwell) >= MIN_DWELL_MS)) {
      return json({ ok: false, error: 'too_fast' }, 400, cors);
    }

    const ip = req.headers.get('cf-connecting-ip') || 'unknown';
    const country = (req.cf && req.cf.country) || '--';

    // 限流：单 IP 10 分钟 5 条。
    // 这里只读不写 —— 计数放到真正投递之前，免得真人把表填错几次就被锁 10 分钟。
    const rkey = `rl:${ip}`;
    const hits = Number(await env.GW_KV.get(rkey)) || 0;
    if (hits >= RATE_LIMIT) return json({ ok: false, error: 'rate_limited' }, 429, cors);

    // 字段清洗与必填校验
    const data = {};
    const missing = [];
    for (const [k, spec] of Object.entries(FIELDS)) {
      data[k] = clean(body[k], spec.max);
      if (spec.required && !data[k]) missing.push(spec.label);
    }
    data.models = Array.isArray(body.models)
      ? body.models.slice(0, 12).map((m) => clean(m, 20)).filter(Boolean)
      : [];
    if (!data.models.length) missing.push('目标平台');
    if (missing.length) {
      return json({ ok: false, error: 'missing_fields', fields: missing }, 400, cors);
    }

    const meta = {
      ip,
      country,
      time:
        new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16) +
        ' (UTC+8)',
    };

    // 校验全过、准备真投递了，这时候才占配额
    ctx.waitUntil(env.GW_KV.put(rkey, String(hits + 1), { expirationTtl: RATE_WINDOW_S }));

    try {
      const token = await tenantToken(env);
      // 主通道：私聊卡片。它失败才算整体失败。
      const messageId = await sendCard(env, token, data, meta);
      // 副通道：多维表格。缺 scope 或表结构变了都不该拖垮用户体验。
      const base = await writeBase(env, token, data, meta).catch((e) => ({
        error: String((e && e.message) || e),
      }));
      return json({ ok: true, message_id: messageId, base }, 200, cors);
    } catch (e) {
      console.error('lead delivery failed', e);
      return json({ ok: false, error: 'delivery_failed' }, 502, cors);
    }
  },
};
