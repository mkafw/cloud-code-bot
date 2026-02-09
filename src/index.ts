import { env } from 'cloudflare:workers'

function verifyBasicAuth(request: Request): Response | null {
  const username = env.SERVER_USERNAME
  const password = env.SERVER_PASSWORD

  if (!password) {
    return null
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Basic ')) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Agent"' },
    })
  }

  const expected = btoa(\`\${username}:\${password}\`)
  const provided = authorization.slice(6)

  if (provided !== expected) {
    return new Response('Unauthorized', { status: 401 })
  }

  return null
}

async function handleFetch(request: Request) {
  const authError = verifyBasicAuth(request)
  if (authError) {
    return authError
  }

  const url = new URL(request.url)
  
  // Health check
  if (url.pathname === '/api/status') {
    return new Response(JSON.stringify({ 
      status: 'running', 
      version: 'free-tier',
      services: ['KV', 'R2', 'D1'],
      message: 'Cloud Code Bot Free Edition - Full Features'
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // KV Endpoints
  if (url.pathname === '/api/kv' && request.method === 'POST') {
    const { key, value } = await request.json()
    await env.STORAGE.put(key, JSON.stringify(value))
    return new Response(JSON.stringify({ success: true, key }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (url.pathname.startsWith('/api/kv/') && request.method === 'GET') {
    const key = url.pathname.replace('/api/kv/', '')
    const value = await env.STORAGE.get(key)
    if (!value) {
      return new Response('Not found', { status: 404 })
    }
    return new Response(value, {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // R2 File Storage Endpoints
  if (url.pathname === '/api/files' && request.method === 'POST') {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) {
      return new Response('No file provided', { status: 400 })
    }
    
    const key = \`uploads/\${Date.now()}-\${file.name}\`
    await env.FILES.put(key, file.stream(), {
      httpMetadata: { contentType: file.type }
    })
    
    return new Response(JSON.stringify({ 
      success: true, 
      key,
      url: \`/api/files/\${key}\`
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (url.pathname.startsWith('/api/files/') && request.method === 'GET') {
    const key = url.pathname.replace('/api/files/', '')
    const object = await env.FILES.get(key)
    
    if (!object) {
      return new Response('File not found', { status: 404 })
    }
    
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    
    return new Response(object.body, { headers })
  }

  // D1 Database Endpoints
  if (url.pathname === '/api/db/query' && request.method === 'POST') {
    const { sql, params = [] } = await request.json()
    
    try {
      const result = await env.DB.prepare(sql).bind(...params).all()
      return new Response(JSON.stringify({ 
        success: true, 
        result 
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: error.message 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  if (url.pathname === '/api/db/init' && request.method === 'POST') {
    // Initialize basic tables
    await env.DB.exec(\`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    \`)
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Database initialized' 
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Default response with API documentation
  return new Response(JSON.stringify({
    message: 'Cloud Code Bot Free Edition',
    version: '2.0.0',
    services: {
      kv: 'Key-Value storage for config and cache',
      r2: 'Object storage for files and images', 
      d1: 'SQL database for structured data'
    },
    endpoints: [
      // KV
      { method: 'GET', path: '/api/status', desc: 'Service status' },
      { method: 'POST', path: '/api/kv', desc: 'Store data in KV' },
      { method: 'GET', path: '/api/kv/:key', desc: 'Retrieve from KV' },
      // R2
      { method: 'POST', path: '/api/files', desc: 'Upload file to R2' },
      { method: 'GET', path: '/api/files/:key', desc: 'Download file from R2' },
      // D1
      { method: 'POST', path: '/api/db/init', desc: 'Initialize database tables' },
      { method: 'POST', path: '/api/db/query', desc: 'Execute SQL query' }
    ]
  }), {
    headers: { 'Content-Type': 'application/json' }
  })
}

export default {
  fetch: handleFetch,
} satisfies ExportedHandler<Cloudflare.Env>

// Free tier limits configuration
const FREE_TIER_LIMITS = {
  kv: {
    maxStorageBytes: 1024 * 1024 * 1024, // 1GB
    maxKeySize: 512 * 1024, // 512KB per key
    maxValueSize: 25 * 1024 * 1024, // 25MB per value
  },
  r2: {
    maxStorageBytes: 10 * 1024 * 1024 * 1024, // 10GB/month
    maxFileSize: 300 * 1024 * 1024, // 300MB per file
    maxFilesPerDay: 1000,
  },
  d1: {
    maxStorageBytes: 500 * 1024 * 1024, // 500MB
    maxQueryLength: 100000, // 100KB per query
    maxRowsPerQuery: 50000,
  },
  requests: {
    maxPerDay: 100000, // 100k requests/day
  }
}

// Check limits before operations
async function checkLimits(type: 'kv' | 'r2' | 'd1', size: number): Promise<Response | null> {
  const limits = FREE_TIER_LIMITS[type]
  
  if (type === 'kv' && size > limits.maxValueSize) {
    return new Response(JSON.stringify({
      error: 'KV value too large',
      limit: limits.maxValueSize,
      received: size
    }), { status: 413 })
  }
  
  if (type === 'r2' && size > limits.maxFileSize) {
    return new Response(JSON.stringify({
      error: 'File too large',
      limit: limits.maxFileSize,
      received: size
    }), { status: 413 })
  }
  
  return null
}
