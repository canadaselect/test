/**
 * Cloudflare Pages Function - 代理服务
 * 路径: /api/fetch
 * 用途: 解决跨域问题，允许海报生成器抓取产品页面
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
      }
    });
  }
  
  // 只允许 GET 请求
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({
      error: '只支持 GET 请求'
    }), {
      status: 405,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  // 获取目标URL
  const targetUrl = url.searchParams.get('url');
  
  if (!targetUrl) {
    return new Response(JSON.stringify({
      error: '缺少 url 参数',
      usage: '/api/fetch?url=https://example.com'
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  // 验证URL格式
  let validatedUrl;
  try {
    validatedUrl = new URL(targetUrl);
    
    // 安全检查：只允许 HTTPS
    if (validatedUrl.protocol !== 'https:') {
      throw new Error('只支持 HTTPS 协议');
    }
    
    // 可选：限制允许的域名（提高安全性）
    const allowedDomains = [
      'canadiannaturals.ca',
      'www.canadiannaturals.ca'
    ];
    
    // 如果需要严格限制域名，取消下面的注释
    /*
    if (!allowedDomains.includes(validatedUrl.hostname)) {
      throw new Error(`域名 ${validatedUrl.hostname} 不在允许列表中`);
    }
    */
    
  } catch (error) {
    return new Response(JSON.stringify({
      error: `无效的URL: ${error.message}`,
      url: targetUrl
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  try {
    // 发起请求
    const response = await fetch(validatedUrl.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Canadian-Naturals-Poster-Generator/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      // Cloudflare Workers 会自动处理超时
      cf: {
        cacheTtl: 300, // 缓存5分钟
        cacheEverything: true
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // 获取内容
    const content = await response.text();
    
    // 返回结果，添加 CORS 头
    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=300', // 浏览器缓存5分钟
        'X-Proxy-By': 'Cloudflare Pages Function',
        'X-Target-URL': validatedUrl.toString()
      }
    });
    
  } catch (error) {
    console.error('代理请求失败:', error);
    
    return new Response(JSON.stringify({
      error: `请求失败: ${error.message}`,
      url: validatedUrl.toString(),
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

/**
 * 使用说明：
 * 
 * 这个文件会自动部署为 Cloudflare Pages Function
 * 访问路径: https://your-site.pages.dev/api/fetch?url=目标URL
 * 
 * 示例:
 * https://your-site.pages.dev/api/fetch?url=https://canadiannaturals.ca/皇家礼豹
 * 
 * 部署方式:
 * 1. 将此文件放在项目的 functions/api/fetch.js
 * 2. 提交到 GitHub
 * 3. Cloudflare Pages 会自动部署
 * 
 * 目录结构:
 * your-project/
 * ├── functions/
 * │   └── api/
 * │       └── fetch.js  (此文件)
 * ├── index.html
 * ├── poster.js
 * └── README.md
 * 
 * 无需额外配置，开箱即用！
 */
