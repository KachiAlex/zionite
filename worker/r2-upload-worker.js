export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // PUT /upload/{folder}/{filename} — upload file to R2
    if (request.method === 'PUT' && path.startsWith('/upload/')) {
      const key = path.replace(/^\/upload\//, '');
      if (!key) return json({ error: 'Missing key' }, 400, corsHeaders);

      const contentType = request.headers.get('Content-Type') || 'application/octet-stream';

      // Stream the request body directly to R2 — avoids Cloudflare Worker
      // 100MB memory limit and 128MB request body limit for large files.
      await env.R2_BUCKET.put(key, request.body, {
        httpMetadata: { contentType },
      });

      const publicUrl = env.R2_PUBLIC_URL
        ? `${env.R2_PUBLIC_URL}/${key}`
        : `https://pub-65e1bfa308d049a98f14e848e0dfd516.r2.dev/${key}`;

      return json({ success: true, publicUrl, key }, 200, corsHeaders);
    }

    // DELETE /delete/{key} — delete file from R2
    if (request.method === 'DELETE' && path.startsWith('/delete/')) {
      const key = path.replace(/^\/delete\//, '');
      if (!key) return json({ error: 'Missing key' }, 400, corsHeaders);

      await env.R2_BUCKET.delete(key);
      return json({ success: true }, 200, corsHeaders);
    }

    // GET /health — health check
    if (request.method === 'GET' && path === '/health') {
      return json({ ok: true }, 200, corsHeaders);
    }

    return json({ error: 'Not found' }, 404, corsHeaders);
  },
};

function json(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
