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
  
  // Simple KV-based storage endpoints
  if (url.pathname === '/api/status') {
    return new Response(JSON.stringify({ 
      status: 'running', 
      version: 'free-tier',
      message: 'Cloud Code Bot Free Edition - Running on Cloudflare Workers + KV'
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (url.pathname === '/api/store' && request.method === 'POST') {
    const data = await request.json()
    const key = `data:${Date.now()}`
    await env.STORAGE.put(key, JSON.stringify(data))
    return new Response(JSON.stringify({ success: true, key }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (url.pathname.startsWith('/api/store/') && request.method === 'GET') {
    const key = url.pathname.replace('/api/store/', '')
    const value = await env.STORAGE.get(key)
    if (!value) {
      return new Response('Not found', { status: 404 })
    }
    return new Response(value, {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Default response
  return new Response(JSON.stringify({
    message: 'Cloud Code Bot Free Edition',
    endpoints: [
      'GET /api/status - Check service status',
      'POST /api/store - Store data in KV',
      'GET /api/store/:key - Retrieve data from KV'
    ]
  }), {
    headers: { 'Content-Type': 'application/json' }
  })
}

export default {
  fetch: handleFetch,
} satisfies ExportedHandler<Cloudflare.Env>
