/**
 * Cloudflare Worker - 代理服务
 * 用途：解决跨域问题，允许海报生成器抓取产品页面
 * 部署到：Cloudflare Workers
 * 路由：/api/fetch
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 只处理 /api/fetch 路径
    if (!url.pathname.startsWith('/api/fetch')) {
      return new Response('Not Found', { status: 404 });
    }
    
    // 获取目标URL
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
      return new Response(JSON.stringify({
        error: '缺少 url 参数'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
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
      
      // 如果你想限制域名，取消下面的注释
      /*
      if (!allowedDomains.includes(validatedUrl.hostname)) {
        throw new Error('域名不在允许列表中');
      }
      */
      
    } catch (error) {
      return new Response(JSON.stringify({
        error: `无效的URL: ${error.message}`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
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
        // 设置超时
        signal: AbortSignal.timeout(10000) // 10秒超时
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
          'Cache-Control': 'public, max-age=300', // 缓存5分钟
          'X-Proxy-By': 'Cloudflare Worker'
        }
      });
      
    } catch (error) {
      console.error('代理请求失败:', error);
      
      return new Response(JSON.stringify({
        error: `请求失败: ${error.message}`
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};

/**
 * 部署说明：
 * 
 * 1. 登录 Cloudflare Dashboard
 * 2. 进入 Workers & Pages
 * 3. 创建新的 Worker
 * 4. 将这个代码粘贴进去
 * 5. 部署
 * 6. 在 Routes 中设置路由：
 *    - 路由：yoursite.com/api/fetch*
 *    - Worker：选择你创建的 Worker
 * 
 * 或者使用 Wrangler CLI:
 * 
 * 1. 安装 wrangler: npm install -g wrangler
 * 2. 登录: wrangler login
 * 3. 创建 wrangler.toml 配置文件
 * 4. 部署: wrangler publish
 * 
 * wrangler.toml 示例：
 * 
 * name = "poster-proxy"
 * main = "worker.js"
 * compatibility_date = "2024-01-01"
 * 
 * [env.production]
 * routes = [
 *   { pattern = "canadiannaturals.ca/api/fetch*", zone_name = "canadiannaturals.ca" }
 * ]
 */
