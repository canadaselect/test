/* 
 * 智能海报生成器 - poster.js
 * 功能：搜索产品 + URL输入 + 自动生成3:4海报
 * 作者：Canadian Naturals
 */

// ========== 配置 ==========
const CONFIG = {
  // 画布尺寸
  canvasWidth: 1080,
  canvasHeight: 1440,
  
  // 品牌信息
  brand: {
    name: "CANADIAN NATURALS",
    tagline: "扫码查看详情",
    website: "canadiannaturals.ca"
  },
  
  // 布局参数
  layout: {
    padding: 50,
    cornerRadius: 24,
    headerHeight: 80,
    imageHeight: 580,
    qrSize: 180,
    qrMargin: 40
  },
  
  // 颜色方案
  colors: {
    background: "#ffffff",
    cardBg: "#f8f9fa",
    primary: "#2c3e50",
    secondary: "#7f8c8d",
    accent: "#3498db",
    border: "#e0e0e0"
  },
  
  // 搜索配置
  search: {
    baseUrl: "https://canadiannaturals.ca",
    searchQuery: "/search?q=",
    productSelector: ".product-item, .product-card, article"
  },
  
  // 代理配置（用于解决跨域）
  proxy: {
    enabled: true,
    endpoint: "/api/fetch?url="
  }
};

// ========== DOM 元素 ==========
const DOM = {
  // 标签切换
  tabButtons: document.querySelectorAll('.tab-btn'),
  searchTab: document.getElementById('searchTab'),
  urlTab: document.getElementById('urlTab'),
  
  // 输入
  searchInput: document.getElementById('searchInput'),
  urlInput: document.getElementById('urlInput'),
  titleOverride: document.getElementById('titleOverride'),
  highlightsOverride: document.getElementById('highlightsOverride'),
  usageOverride: document.getElementById('usageOverride'),
  
  // 按钮
  btnSearch: document.getElementById('btnSearch'),
  btnGenerate: document.getElementById('btnGenerate'),
  btnDownload: document.getElementById('btnDownload'),
  btnClear: document.getElementById('btnClear'),
  
  // 显示
  searchResults: document.getElementById('searchResults'),
  status: document.getElementById('status'),
  canvas: document.getElementById('posterCanvas'),
  canvasInfo: document.getElementById('canvasInfo'),
  
  // Canvas context
  ctx: document.getElementById('posterCanvas').getContext('2d', { alpha: false })
};

// ========== 全局状态 ==========
let currentUrl = '';
let currentData = null;
let downloadUrl = null;

// ========== 工具函数 ==========
const Utils = {
  // 显示状态消息
  showStatus(message, type = 'info') {
    const status = DOM.status;
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    if (type === 'success') {
      setTimeout(() => {
        status.style.display = 'none';
      }, 5000);
    }
  },
  
  // 隐藏状态
  hideStatus() {
    DOM.status.style.display = 'none';
  },
  
  // 规范化URL
  normalizeUrl(url, base = CONFIG.search.baseUrl) {
    try {
      if (/^https?:\/\//i.test(url)) return url;
      if (/^\/\//.test(url)) return 'https:' + url;
      return new URL(url, base).toString();
    } catch {
      return url;
    }
  },
  
  // 清理文本
  cleanText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  },
  
  // 分割文本为数组
  splitLines(text) {
    return (text || '')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  },
  
  // 截断文本
  truncate(text, maxLength = 100) {
    if (!text) return '';
    return text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text;
  },
  
  // 等待字体加载
  async waitForFonts() {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  },
  
  // 加载图片
  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`图片加载失败: ${src}`));
      img.src = src;
    });
  },
  
  // 防抖
  debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
};

// ========== 网络请求 ==========
const Network = {
  // 获取HTML内容
  async fetchHtml(url) {
    const targetUrl = CONFIG.proxy.enabled 
      ? `${CONFIG.proxy.endpoint}${encodeURIComponent(url)}`
      : url;
    
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: { 'Accept': 'text/html,*/*' }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.text();
    } catch (error) {
      console.error('获取HTML失败:', error);
      throw new Error(`无法访问页面: ${error.message}`);
    }
  },
  
  // 搜索产品
  async searchProducts(keyword) {
    try {
      // 构建搜索URL - 这里需要根据实际网站的搜索功能调整
      const searchUrl = `${CONFIG.search.baseUrl}${CONFIG.search.searchQuery}${encodeURIComponent(keyword)}`;
      
      // 方案1: 如果网站有搜索API
      // const response = await fetch(`${CONFIG.search.baseUrl}/api/search?q=${keyword}`);
      // return await response.json();
      
      // 方案2: 抓取搜索结果页面
      const html = await this.fetchHtml(searchUrl);
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // 解析产品列表
      const products = [];
      const productElements = doc.querySelectorAll(CONFIG.search.productSelector);
      
      productElements.forEach((el, index) => {
        if (index >= 10) return; // 最多返回10个结果
        
        const link = el.querySelector('a');
        const title = el.querySelector('h2, h3, .product-title, .title')?.textContent?.trim();
        const img = el.querySelector('img')?.src;
        
        if (link && title) {
          products.push({
            title: Utils.cleanText(title),
            url: Utils.normalizeUrl(link.href),
            image: img ? Utils.normalizeUrl(img) : null
          });
        }
      });
      
      // 如果搜索结果为空，尝试直接构建产品URL
      if (products.length === 0) {
        const directUrl = `${CONFIG.search.baseUrl}/${encodeURIComponent(keyword)}.html`;
        products.push({
          title: keyword,
          url: directUrl,
          image: null
        });
      }
      
      return products;
    } catch (error) {
      console.error('搜索失败:', error);
      throw new Error(`搜索失败: ${error.message}`);
    }
  }
};

// ========== 数据解析 ==========
const Parser = {
  // 解析产品数据
  parseProductData(html, pageUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    // 优先尝试从 JSON 数据获取
    const jsonData = this.extractJsonData(doc);
    if (jsonData) {
      return this.normalizeData(jsonData, pageUrl);
    }
    
    // 降级方案：从页面元素提取
    return this.extractFromPage(doc, pageUrl);
  },
  
  // 提取JSON数据
  extractJsonData(doc) {
    const jsonScript = doc.querySelector('script#product-poster-data');
    if (!jsonScript) return null;
    
    try {
      return JSON.parse(jsonScript.textContent.trim());
    } catch (error) {
      console.warn('JSON数据解析失败:', error);
      return null;
    }
  },
  
  // 从页面提取数据
  extractFromPage(doc, pageUrl) {
    // 标题
    const title = 
      doc.querySelector('meta[property="og:title"]')?.content ||
      doc.querySelector('h1')?.textContent ||
      doc.querySelector('title')?.textContent ||
      '未命名产品';
    
    // 图片
    let image = 
      doc.querySelector('meta[property="og:image"]')?.content ||
      doc.querySelector('.product-image img, .main-image img, img[class*="product"]')?.src ||
      doc.querySelector('img')?.src ||
      '';
    
    image = Utils.normalizeUrl(image, pageUrl);
    
    // 描述
    const description = 
      doc.querySelector('meta[name="description"]')?.content ||
      doc.querySelector('.product-description, .description')?.textContent ||
      '';
    
    // 尝试提取卖点和用法
    const highlights = this.extractHighlights(doc, description);
    const usage = this.extractUsage(doc);
    
    return {
      name: Utils.cleanText(title),
      image: image,
      highlights: highlights,
      usage: usage,
      url: pageUrl
    };
  },
  
  // 提取产品卖点
  extractHighlights(doc, fallbackText) {
    // 尝试从特定区域提取
    const highlightSection = doc.querySelector('.highlights, .features, .benefits');
    if (highlightSection) {
      const items = highlightSection.querySelectorAll('li, p');
      const highlights = [];
      items.forEach(item => {
        const text = Utils.cleanText(item.textContent);
        if (text.length > 5 && text.length < 100) {
          highlights.push(text);
        }
      });
      if (highlights.length > 0) return highlights.slice(0, 5);
    }
    
    // 从描述文本分割
    if (fallbackText) {
      return fallbackText
        .split(/[。.!?；;，,]/)
        .map(s => Utils.cleanText(s))
        .filter(s => s.length > 10 && s.length < 100)
        .slice(0, 4);
    }
    
    return [];
  },
  
  // 提取使用方法
  extractUsage(doc) {
    const usageSection = doc.querySelector('.usage, .how-to-use, .directions');
    if (!usageSection) return [];
    
    const items = usageSection.querySelectorAll('li, p');
    const usage = [];
    
    items.forEach(item => {
      const text = Utils.cleanText(item.textContent);
      if (text.length > 5 && text.length < 150) {
        usage.push(text);
      }
    });
    
    return usage.slice(0, 4);
  },
  
  // 规范化数据
  normalizeData(data, pageUrl) {
    return {
      name: Utils.cleanText(data.name || data.title || '未命名产品'),
      image: Utils.normalizeUrl(data.image || data.imageUrl || '', pageUrl),
      highlights: Array.isArray(data.highlights) 
        ? data.highlights.map(h => Utils.cleanText(h)).filter(Boolean)
        : [],
      usage: Array.isArray(data.usage)
        ? data.usage.map(u => Utils.cleanText(u)).filter(Boolean)
        : [],
      url: pageUrl
    };
  }
};

// ========== 二维码生成 ==========
const QRCode = {
  // 生成二维码Canvas
  async generate(text, size) {
    if (typeof window.QRCode === 'undefined') {
      throw new Error('二维码库未加载');
    }
    
    // 创建临时容器
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
    document.body.appendChild(container);
    
    // 生成二维码
    const qr = new window.QRCode(container, {
      text: text,
      width: size,
      height: size,
      correctLevel: window.QRCode.CorrectLevel.M
    });
    
    // 等待渲染
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 获取canvas
    let canvas = container.querySelector('canvas');
    
    // 如果是img，转换为canvas
    if (!canvas) {
      const img = container.querySelector('img');
      if (!img) throw new Error('二维码生成失败');
      
      await new Promise((resolve, reject) => {
        if (img.complete) return resolve();
        img.onload = resolve;
        img.onerror = reject;
      });
      
      canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(img, 0, 0, size, size);
    }
    
    // 复制canvas
    const result = document.createElement('canvas');
    result.width = size;
    result.height = size;
    result.getContext('2d').drawImage(canvas, 0, 0);
    
    // 清理
    document.body.removeChild(container);
    
    return result;
  }
};

// ========== 海报渲染 ==========
const PosterRenderer = {
  // 主渲染函数
  async render(data) {
    await Utils.waitForFonts();
    
    const ctx = DOM.ctx;
    const W = CONFIG.canvasWidth;
    const H = CONFIG.canvasHeight;
    const P = CONFIG.layout.padding;
    const R = CONFIG.layout.cornerRadius;
    
    // 清空画布
    ctx.clearRect(0, 0, W, H);
    
    // 背景
    ctx.fillStyle = CONFIG.colors.background;
    ctx.fillRect(0, 0, W, H);
    
    // 主卡片背景
    ctx.save();
    ctx.fillStyle = CONFIG.colors.cardBg;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 10;
    this.roundRect(ctx, P, P, W - P * 2, H - P * 2, R);
    ctx.fill();
    ctx.restore();
    
    // 内部布局
    const innerPad = 40;
    const contentX = P + innerPad;
    let contentY = P + innerPad;
    const contentW = W - P * 2 - innerPad * 2;
    
    // 品牌标题
    ctx.save();
    ctx.font = 'bold 24px "Noto Sans SC"';
    ctx.fillStyle = CONFIG.colors.secondary;
    ctx.fillText(CONFIG.brand.name, contentX, contentY);
    ctx.restore();
    contentY += 50;
    
    // 产品图片
    if (data.image) {
      try {
        const img = await Utils.loadImage(data.image);
        const imgH = CONFIG.layout.imageHeight;
        
        ctx.save();
        this.roundRect(ctx, contentX, contentY, contentW, imgH, 16);
        ctx.clip();
        this.drawImageCover(ctx, img, contentX, contentY, contentW, imgH);
        ctx.restore();
        
        contentY += imgH + 30;
      } catch (error) {
        console.error('图片加载失败:', error);
        // 绘制占位符
        ctx.fillStyle = '#f0f0f0';
        this.roundRect(ctx, contentX, contentY, contentW, CONFIG.layout.imageHeight, 16);
        ctx.fill();
        contentY += CONFIG.layout.imageHeight + 30;
      }
    }
    
    // 产品名称
    ctx.save();
    ctx.font = 'bold 42px "Noto Sans SC"';
    ctx.fillStyle = CONFIG.colors.primary;
    const nameResult = this.drawWrappedText(
      ctx, data.name, contentX, contentY, contentW, 56, 2
    );
    ctx.restore();
    contentY += nameResult.height + 30;
    
    // 产品卖点
    if (data.highlights && data.highlights.length > 0) {
      ctx.save();
      ctx.font = 'bold 22px "Noto Sans SC"';
      ctx.fillStyle = CONFIG.colors.primary;
      ctx.fillText('产品特点', contentX, contentY);
      ctx.restore();
      contentY += 35;
      
      data.highlights.slice(0, 4).forEach((highlight, index) => {
        ctx.save();
        ctx.font = '18px "Noto Sans SC"';
        ctx.fillStyle = CONFIG.colors.secondary;
        
        // 绘制圆点
        ctx.beginPath();
        ctx.arc(contentX + 10, contentY + 12, 4, 0, Math.PI * 2);
        ctx.fillStyle = CONFIG.colors.accent;
        ctx.fill();
        
        // 绘制文本
        ctx.fillStyle = CONFIG.colors.secondary;
        const textResult = this.drawWrappedText(
          ctx, highlight, contentX + 30, contentY, contentW - 30, 28, 2
        );
        ctx.restore();
        contentY += textResult.height + 12;
      });
      
      contentY += 20;
    }
    
    // 使用方法
    if (data.usage && data.usage.length > 0) {
      ctx.save();
      ctx.font = 'bold 22px "Noto Sans SC"';
      ctx.fillStyle = CONFIG.colors.primary;
      ctx.fillText('使用方法', contentX, contentY);
      ctx.restore();
      contentY += 35;
      
      data.usage.slice(0, 3).forEach((step, index) => {
        ctx.save();
        ctx.font = '18px "Noto Sans SC"';
        ctx.fillStyle = CONFIG.colors.secondary;
        
        // 绘制步骤编号
        const numberText = `${index + 1}.`;
        ctx.fillStyle = CONFIG.colors.accent;
        ctx.fillText(numberText, contentX, contentY + 20);
        
        // 绘制文本
        ctx.fillStyle = CONFIG.colors.secondary;
        const textResult = this.drawWrappedText(
          ctx, step, contentX + 40, contentY, contentW - 40, 28, 2
        );
        ctx.restore();
        contentY += textResult.height + 12;
      });
    }
    
    // 二维码（右下角）
    try {
      const qrSize = CONFIG.layout.qrSize;
      const qrMargin = CONFIG.layout.qrMargin;
      const qrX = W - P - innerPad - qrSize;
      const qrY = H - P - innerPad - qrSize;
      
      const qrCanvas = await QRCode.generate(data.url, qrSize);
      
      // 绘制二维码背景
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
      ctx.shadowBlur = 20;
      this.roundRect(ctx, qrX - 15, qrY - 15, qrSize + 30, qrSize + 30, 12);
      ctx.fill();
      ctx.restore();
      
      // 绘制二维码
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
      
      // 二维码说明文字
      ctx.save();
      ctx.font = '16px "Noto Sans SC"';
      ctx.fillStyle = CONFIG.colors.secondary;
      ctx.textAlign = 'center';
      ctx.fillText(CONFIG.brand.tagline, qrX + qrSize / 2, qrY + qrSize + 35);
      ctx.restore();
    } catch (error) {
      console.error('二维码生成失败:', error);
    }
    
    // 更新信息显示
    DOM.canvasInfo.textContent = `✅ 海报生成成功 - ${data.name}`;
  },
  
  // 绘制圆角矩形
  roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  },
  
  // 绘制文本自动换行
  drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 999) {
    const chars = text.split('');
    let line = '';
    let lines = [];
    
    for (let i = 0; i < chars.length; i++) {
      const testLine = line + chars[i];
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && line) {
        lines.push(line);
        line = chars[i];
        
        if (lines.length >= maxLines) break;
      } else {
        line = testLine;
      }
    }
    
    if (lines.length < maxLines && line) {
      lines.push(line);
    }
    
    // 如果超出行数，最后一行添加省略号
    if (lines.length >= maxLines) {
      let lastLine = lines[maxLines - 1];
      while (ctx.measureText(lastLine + '...').width > maxWidth && lastLine.length > 0) {
        lastLine = lastLine.slice(0, -1);
      }
      lines[maxLines - 1] = lastLine + '...';
      lines = lines.slice(0, maxLines);
    }
    
    // 绘制所有行
    lines.forEach((line, index) => {
      ctx.fillText(line, x, y + index * lineHeight);
    });
    
    return {
      lines: lines,
      height: lines.length * lineHeight
    };
  },
  
  // 绘制图片覆盖模式
  drawImageCover(ctx, img, x, y, w, h) {
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    const scale = Math.max(w / imgW, h / imgH);
    const scaledW = imgW * scale;
    const scaledH = imgH * scale;
    const offsetX = (w - scaledW) / 2;
    const offsetY = (h - scaledH) / 2;
    
    ctx.drawImage(img, x + offsetX, y + offsetY, scaledW, scaledH);
  }
};

// ========== 事件处理 ==========
const EventHandlers = {
  // 标签切换
  handleTabSwitch(e) {
    const tab = e.target.dataset.tab;
    if (!tab) return;
    
    // 更新按钮状态
    DOM.tabButtons.forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    
    // 切换内容
    if (tab === 'search') {
      DOM.searchTab.classList.add('active');
      DOM.urlTab.classList.remove('active');
    } else {
      DOM.searchTab.classList.remove('active');
      DOM.urlTab.classList.add('active');
    }
  },
  
  // 搜索产品
  async handleSearch() {
    const keyword = DOM.searchInput.value.trim();
    if (!keyword) {
      Utils.showStatus('请输入搜索关键词', 'warning');
      return;
    }
    
    Utils.showStatus('🔍 正在搜索产品...', 'info');
    DOM.btnSearch.disabled = true;
    
    try {
      const products = await Network.searchProducts(keyword);
      
      if (products.length === 0) {
        Utils.showStatus('未找到相关产品', 'warning');
        DOM.searchResults.style.display = 'none';
        return;
      }
      
      // 显示搜索结果
      this.displaySearchResults(products);
      Utils.showStatus(`找到 ${products.length} 个产品`, 'success');
    } catch (error) {
      console.error('搜索错误:', error);
      Utils.showStatus(`搜索失败: ${error.message}`, 'error');
    } finally {
      DOM.btnSearch.disabled = false;
    }
  },
  
  // 显示搜索结果
  displaySearchResults(products) {
    const container = DOM.searchResults;
    container.innerHTML = '';
    
    products.forEach(product => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.innerHTML = `
        <h4>${Utils.truncate(product.title, 80)}</h4>
        <p>${product.url}</p>
      `;
      
      item.addEventListener('click', () => {
        currentUrl = product.url;
        DOM.urlInput.value = product.url;
        this.handleGenerate();
      });
      
      container.appendChild(item);
    });
    
    container.style.display = 'block';
  },
  
  // 生成海报
  async handleGenerate() {
    // 获取URL
    const url = DOM.urlInput.value.trim() || currentUrl;
    
    if (!url) {
      Utils.showStatus('请输入产品URL或先搜索产品', 'warning');
      return;
    }
    
    Utils.showStatus('📥 正在抓取产品信息...', 'info');
    DOM.btnGenerate.disabled = true;
    DOM.btnDownload.disabled = true;
    
    try {
      // 抓取页面
      const html = await Network.fetchHtml(url);
      Utils.showStatus('📊 正在解析产品数据...', 'info');
      
      // 解析数据
      let data = Parser.parseProductData(html, url);
      
      // 应用手动覆盖
      if (DOM.titleOverride.value.trim()) {
        data.name = DOM.titleOverride.value.trim();
      }
      
      const highlightsOverride = Utils.splitLines(DOM.highlightsOverride.value);
      if (highlightsOverride.length > 0) {
        data.highlights = highlightsOverride;
      }
      
      const usageOverride = Utils.splitLines(DOM.usageOverride.value);
      if (usageOverride.length > 0) {
        data.usage = usageOverride;
      }
      
      // 保存数据
      currentData = data;
      currentUrl = url;
      
      // 渲染海报
      Utils.showStatus('🎨 正在生成海报...', 'info');
      await PosterRenderer.render(data);
      
      // 启用下载
      DOM.btnDownload.disabled = false;
      Utils.showStatus('✅ 海报生成成功！', 'success');
    } catch (error) {
      console.error('生成失败:', error);
      Utils.showStatus(`❌ 生成失败: ${error.message}`, 'error');
    } finally {
      DOM.btnGenerate.disabled = false;
    }
  },
  
  // 下载海报
  async handleDownload() {
    try {
      const canvas = DOM.canvas;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      
      // 清理旧的URL
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
      
      // 创建新的URL
      downloadUrl = URL.createObjectURL(blob);
      
      // 生成文件名
      const filename = currentData 
        ? `${currentData.name.slice(0, 30)}_海报.png`
        : '产品海报.png';
      
      // 触发下载
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      link.click();
      
      Utils.showStatus('✅ 海报已下载', 'success');
    } catch (error) {
      console.error('下载失败:', error);
      Utils.showStatus(`下载失败: ${error.message}`, 'error');
    }
  },
  
  // 清空
  handleClear() {
    DOM.searchInput.value = '';
    DOM.urlInput.value = '';
    DOM.titleOverride.value = '';
    DOM.highlightsOverride.value = '';
    DOM.usageOverride.value = '';
    DOM.searchResults.style.display = 'none';
    
    currentUrl = '';
    currentData = null;
    
    // 清空画布
    DOM.ctx.fillStyle = '#ffffff';
    DOM.ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
    DOM.canvasInfo.textContent = '等待生成海报...';
    
    DOM.btnDownload.disabled = true;
    Utils.hideStatus();
  }
};

// ========== 初始化 ==========
function init() {
  // 标签切换
  DOM.tabButtons.forEach(btn => {
    btn.addEventListener('click', EventHandlers.handleTabSwitch.bind(EventHandlers));
  });
  
  // 搜索
  DOM.btnSearch.addEventListener('click', EventHandlers.handleSearch.bind(EventHandlers));
  DOM.searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') EventHandlers.handleSearch.bind(EventHandlers)();
  });
  
  // 生成
  DOM.btnGenerate.addEventListener('click', EventHandlers.handleGenerate.bind(EventHandlers));
  
  // 下载
  DOM.btnDownload.addEventListener('click', EventHandlers.handleDownload.bind(EventHandlers));
  
  // 清空
  DOM.btnClear.addEventListener('click', EventHandlers.handleClear.bind(EventHandlers));
  
  // 初始化画布
  DOM.ctx.fillStyle = '#ffffff';
  DOM.ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
  
  console.log('✅ 海报生成器初始化完成');
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
