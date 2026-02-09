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

  const expected = btoa(`${username}:${password}`)
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
      services: ['KV', 'D1'],
      message: 'Cloud Code Bot Free Edition - KV & D1'
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
    await env.DB.exec(`
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
    `)
    
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
      d1: 'SQL database for structured data'
    },
    endpoints: [
      { method: 'GET', path: '/api/status', desc: 'Service status' },
      { method: 'POST', path: '/api/kv', desc: 'Store data in KV' },
      { method: 'GET', path: '/api/kv/:key', desc: 'Retrieve from KV' },
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
