# Cloud Code Bot - Free Tier Edition

专为 Cloudflare 免费账户设计的轻量级版本。

## 免费版特性

- ✅ **Workers** - 10万次请求/天
- ✅ **KV** - 1GB 存储
- ✅ **R2** - 10GB/月 文件存储
- ✅ **D1** - 500MB SQL 数据库

## 使用限额

### KV 存储
- 最大存储: 1GB
- 单键大小: 最大 512KB
- 单值大小: 最大 25MB

### R2 文件存储
- 最大存储: 10GB/月
- 单文件大小: 最大 300MB
- 每日上传限制: 1000 个文件

### D1 数据库
- 最大存储: 500MB
- 单查询长度: 最大 100KB
- 单次查询返回: 最多 50000 行

### Workers 请求
- 每日限制: 10万次请求

## API 端点

### 状态检查
```
GET /api/status
```

### KV 操作
```
POST /api/kv          # 存储数据
GET /api/kv/:key      # 读取数据
```

### R2 文件操作
```
POST /api/files       # 上传文件 (multipart/form-data)
GET /api/files/:key   # 下载文件
```

### D1 数据库操作
```
POST /api/db/init     # 初始化数据库表
POST /api/db/query    # 执行 SQL 查询
```

## 部署步骤

### 1. 创建资源

```bash
# 创建 KV namespace
npx wrangler kv:namespace create STORAGE

# 创建 R2 bucket
npx wrangler r2 bucket create cloud-code-files

# 创建 D1 数据库
npx wrangler d1 create cloud-code-db
```

### 2. 更新配置

将 `wrangler.jsonc` 中的占位符替换为实际 ID：

```json
{
  "kv_namespaces": [{
    "binding": "STORAGE",
    "id": "your_kv_namespace_id"  // 替换
  }],
  "d1_databases": [{
    "binding": "DB",
    "database_id": "your_d1_database_id"  // 替换
  }]
}
```

### 3. 初始化数据库

```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/api/db/init \
  -H "Authorization: Basic $(echo -n 'admin:your-password' | base64)"
```

### 4. 部署

```bash
pnpm install
pnpm deploy
```

## 环境变量

在 Cloudflare Dashboard 设置以下变量：

| 变量名 | 说明 | 必需 |
|--------|------|------|
| `SERVER_USERNAME` | 认证用户名 | 否 |
| `SERVER_PASSWORD` | 认证密码 | 否 |

## 与原版的区别

| 功能 | 原版 | 免费版 |
|------|------|--------|
| Containers | ✅ | ❌ |
| KV | ✅ | ✅ |
| R2 | ✅ | ✅ |
| D1 | ✅ | ✅ |
| Durable Objects | ✅ | ❌ |
| 成本 | 付费 | 免费 |

## 注意事项

1. 免费版没有容器功能，所有代码在 Workers 中运行
2. 严格遵守限额，超出会被限制
3. 建议定期清理 R2 中的旧文件
4. D1 适合小型应用，大数据量建议升级

## License

MIT
