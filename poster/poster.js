/* 
 * 加国甄选 - 产品海报生成器
 * 针对 canadiannaturals.ca 网站优化
 */

// ========== 配置 ==========
const CONFIG = {
  // 画布尺寸 (3:4 比例)
  canvasWidth: 1080,
  canvasHeight: 1440,
  
  // 品牌信息
  brand: {
    name: "加国甄选",
    website: "canadiannaturals.ca",
    tagline: "扫码查看详情"
  },
  
  // 布局参数
  layout: {
    padding: 60,
    logoHeight: 100,
    productImageHeight: 500,
    sectionGap: 40,
    iconSize: 24,
    qrSize: 160
  },
  
  // 颜色方案
  colors: {
    background: "#ffffff",
    primary: "#1a1a1a",
    secondary: "#666666",
    accent: "#c8102e",
    gold: "#d4af37",
    lightBg: "#f8f9fa",
    border: "#e5e5e5"
  },
  
  // 网站配置
  site: {
    baseUrl: "https://canadiannaturals.ca",
    // 如果部署到 Cloudflare Pages,代理会自动启用
    proxyEndpoint: "/api/fetch?url="
  }
};

// ========== DOM 元素 ==========
const DOM = {
  urlInput: document.getElementById('urlInput'),
  titleOverride: document.getElementById('titleOverride'),
  subtitleOverride: document.getElementById('subtitleOverride'),
  btnGenerate: document.getElementById('btnGenerate'),
  btnDownload: document.getElementById('btnDownload'),
  btnClear: document.getElementById('btnClear'),
  status: document.getElementById('status'),
  canvas: document.getElementById('posterCanvas'),
  canvasInfo: document.getElementById('canvasInfo'),
  ctx: document.getElementById('posterCanvas').getContext('2d', { alpha: false })
};

// ========== 全局状态 ==========
let currentData = null;
let downloadUrl = null;

// ========== 工具函数 ==========
const Utils = {
  showStatus(message, type = 'info') {
    const status = DOM.status;
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    if (type === 'success') {
      setTimeout(() => status.style.display = 'none', 5000);
    }
  },
  
  hideStatus() {
    DOM.status.style.display = 'none';
  },
  
  normalizeUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (/^\/\//.test(url)) return 'https:' + url;
    if (url.startsWith('/')) return CONFIG.site.baseUrl + url;
    if (!url.includes('://')) return CONFIG.site.baseUrl + '/' + url;
    return url;
  },
  
  cleanText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  },
  
  async loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`图片加载失败: ${src}`));
      img.src = src;
    });
  },
  
  async waitForFonts() {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  }
};

// ========== 网络请求 ==========
const Network = {
  async fetchHtml(url) {
    // 在 Cloudflare Pages 环境下使用代理
    const targetUrl = url.startsWith('http') 
      ? `${CONFIG.site.proxyEndpoint}${encodeURIComponent(url)}`
      : url;
    
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: { 'Accept': 'text/html' }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.text();
    } catch (error) {
      console.error('获取页面失败:', error);
      throw new Error(`无法访问页面: ${error.message}`);
    }
  }
};

// ========== 数据解析 ==========
const Parser = {
  parseProductData(html, pageUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    // 提取产品标题
    let title = '';
    const h1 = doc.querySelector('h1');
    if (h1) {
      title = h1.textContent.trim();
    }
    
    // 提取副标题（英文名称）
    let subtitle = '';
    const h1Parent = h1?.parentElement;
    if (h1Parent) {
      const lines = h1Parent.textContent.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length > 1) {
        subtitle = lines.find(l => /[A-Za-z]/.test(l) && l !== title) || '';
      }
    }
    
    // 提取价格
    let price = '';
    const priceEl = doc.querySelector('.price, [class*="price"]');
    if (priceEl) {
      const priceText = priceEl.textContent.trim();
      const match = priceText.match(/\$[\d,]+\.?\d*/);
      if (match) price = match[0];
    }
    
    // 提取规格
    let specs = '';
    const specEl = doc.querySelector('.woocommerce-product-details__short-description, .product-specs');
    if (specEl) {
      const specText = specEl.textContent;
      const match = specText.match(/规格[：:]\s*(.+?)(?:\n|$)/);
      if (match) specs = match[1].trim();
    }
    
    // 提取主图
    let image = '';
    const imgEl = doc.querySelector('.woocommerce-product-gallery__image img, .product-image img, img[class*="product"]');
    if (imgEl) {
      image = imgEl.src || imgEl.dataset.src || imgEl.getAttribute('data-lazy-src') || '';
      image = Utils.normalizeUrl(image);
    }
    
    // 提取产品描述
    let description = '';
    const descEl = doc.querySelector('.woocommerce-product-details__short-description p');
    if (descEl) {
      description = descEl.textContent.trim();
    }
    
    // 提取功效列表
    const benefits = [];
    const benefitSection = Array.from(doc.querySelectorAll('h2, h3, h4')).find(h => 
      h.textContent.includes('主要成分') || h.textContent.includes('功效')
    );
    
    if (benefitSection) {
      let currentEl = benefitSection.nextElementSibling;
      let count = 0;
      
      while (currentEl && count < 10) {
        if (currentEl.tagName === 'UL' || currentEl.tagName === 'OL') {
          const items = currentEl.querySelectorAll('li');
          items.forEach(item => {
            const text = item.textContent.trim();
            if (text && text.length > 5) {
              // 提取标题和内容
              const parts = text.split(/\n/);
              if (parts.length > 0) {
                const firstLine = parts[0].trim();
                // 去掉emoji和多余符号
                const cleaned = firstLine.replace(/^[🔴🟢🟡⭐️✨💊🌿]+\s*/, '').trim();
                if (cleaned) benefits.push(cleaned);
              }
            }
          });
          break;
        } else if (currentEl.tagName.match(/^H[2-4]$/)) {
          break;
        }
        currentEl = currentEl.nextElementSibling;
        count++;
      }
    }
    
    // 提取用法说明
    const usage = [];
    const usageSection = Array.from(doc.querySelectorAll('h2, h3, h4')).find(h => 
      h.textContent.includes('建议用量') || h.textContent.includes('用法') || h.textContent.includes('服用方法')
    );
    
    if (usageSection) {
      let currentEl = usageSection.nextElementSibling;
      let count = 0;
      
      while (currentEl && count < 5) {
        if (currentEl.tagName === 'UL' || currentEl.tagName === 'OL') {
          const items = currentEl.querySelectorAll('li');
          items.forEach(item => {
            const text = item.textContent.trim();
            if (text) usage.push(text);
          });
          break;
        } else if (currentEl.tagName === 'P') {
          const text = currentEl.textContent.trim();
          if (text.includes('每次') || text.includes('每天') || text.includes('每日')) {
            usage.push(text);
          }
        } else if (currentEl.tagName.match(/^H[2-4]$/)) {
          break;
        }
        currentEl = currentEl.nextElementSibling;
        count++;
      }
    }
    
    return {
      name: title || '产品名称',
      subtitle: subtitle || '',
      price: price || '',
      specs: specs || '',
      description: description || '',
      image: image || '',
      benefits: benefits.slice(0, 5), // 最多5个功效
      usage: usage.slice(0, 3), // 最多3条用法
      url: pageUrl
    };
  }
};

// ========== 海报渲染 ==========
const PosterRenderer = {
  async render(data) {
    const ctx = DOM.ctx;
    const w = CONFIG.canvasWidth;
    const h = CONFIG.canvasHeight;
    const p = CONFIG.layout.padding;
    
    // 等待字体加载
    await Utils.waitForFonts();
    
    // 清空画布
    ctx.fillStyle = CONFIG.colors.background;
    ctx.fillRect(0, 0, w, h);
    
    let currentY = p;
    
    // 1. 绘制LOGO区域
    currentY = this.drawHeader(ctx, currentY);
    
    // 2. 绘制产品图片
    if (data.image) {
      try {
        const img = await Utils.loadImage(data.image);
        currentY = this.drawProductImage(ctx, img, currentY);
      } catch (error) {
        console.warn('产品图片加载失败:', error);
        currentY += 40;
      }
    } else {
      currentY += 40;
    }
    
    // 3. 绘制产品标题
    currentY = this.drawTitle(ctx, data, currentY);
    
    // 4. 绘制产品描述
    if (data.description) {
      currentY = this.drawDescription(ctx, data.description, currentY);
    }
    
    // 5. 绘制功效列表
    if (data.benefits.length > 0) {
      currentY = this.drawBenefits(ctx, data.benefits, currentY);
    }
    
    // 6. 绘制用法说明
    if (data.usage.length > 0) {
      currentY = this.drawUsage(ctx, data.usage, currentY);
    }
    
    // 7. 绘制二维码和底部信息
    this.drawFooter(ctx, data.url);
    
    DOM.canvasInfo.textContent = `✅ 海报生成成功 - ${data.name}`;
  },
  
  drawHeader(ctx, y) {
    const w = CONFIG.canvasWidth;
    const p = CONFIG.layout.padding;
    
    // 绘制品牌名称
    ctx.save();
    ctx.font = 'bold 56px "Ma Shan Zheng", "Noto Sans SC"';
    ctx.fillStyle = CONFIG.colors.gold;
    ctx.textAlign = 'center';
    ctx.fillText(CONFIG.brand.name, w / 2, y + 45);
    ctx.restore();
    
    // 绘制分隔线
    ctx.save();
    ctx.strokeStyle = CONFIG.colors.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p + 200, y + 75);
    ctx.lineTo(w - p - 200, y + 75);
    ctx.stroke();
    ctx.restore();
    
    return y + 100;
  },
  
  drawProductImage(ctx, img, y) {
    const w = CONFIG.canvasWidth;
    const p = CONFIG.layout.padding;
    const imgHeight = CONFIG.layout.productImageHeight;
    const imgWidth = w - p * 2;
    
    // 绘制图片背景
    ctx.save();
    ctx.fillStyle = CONFIG.colors.lightBg;
    this.roundRect(ctx, p, y, imgWidth, imgHeight, 16);
    ctx.fill();
    ctx.restore();
    
    // 绘制图片（保持宽高比，居中）
    ctx.save();
    ctx.beginPath();
    this.roundRect(ctx, p, y, imgWidth, imgHeight, 16);
    ctx.clip();
    
    this.drawImageContain(ctx, img, p, y, imgWidth, imgHeight);
    ctx.restore();
    
    return y + imgHeight + CONFIG.layout.sectionGap;
  },
  
  drawTitle(ctx, data, y) {
    const w = CONFIG.canvasWidth;
    const p = CONFIG.layout.padding;
    const maxWidth = w - p * 2;
    
    // 绘制中文标题
    ctx.save();
    ctx.font = 'bold 46px "Noto Sans SC"';
    ctx.fillStyle = CONFIG.colors.primary;
    ctx.textAlign = 'center';
    
    const title = data.name;
    const titleLines = this.wrapText(ctx, title, maxWidth);
    titleLines.forEach((line, index) => {
      ctx.fillText(line, w / 2, y + index * 56);
    });
    ctx.restore();
    
    let currentY = y + titleLines.length * 56 + 20;
    
    // 绘制英文副标题
    if (data.subtitle) {
      ctx.save();
      ctx.font = '24px "Noto Sans SC"';
      ctx.fillStyle = CONFIG.colors.secondary;
      ctx.textAlign = 'center';
      ctx.fillText(data.subtitle, w / 2, currentY);
      ctx.restore();
      currentY += 40;
    }
    
    // 绘制价格和规格
    if (data.price || data.specs) {
      ctx.save();
      ctx.font = 'bold 32px "Noto Sans SC"';
      ctx.fillStyle = CONFIG.colors.accent;
      ctx.textAlign = 'center';
      
      let priceText = '';
      if (data.price) priceText += data.price;
      if (data.specs) priceText += (data.price ? '  |  ' : '') + data.specs;
      
      ctx.fillText(priceText, w / 2, currentY);
      ctx.restore();
      currentY += 50;
    }
    
    return currentY;
  },
  
  drawDescription(ctx, description, y) {
    const w = CONFIG.canvasWidth;
    const p = CONFIG.layout.padding;
    const maxWidth = w - p * 2;
    
    ctx.save();
    ctx.font = '24px "Noto Sans SC"';
    ctx.fillStyle = CONFIG.colors.secondary;
    ctx.textAlign = 'center';
    
    const lines = this.wrapText(ctx, description, maxWidth - 100);
    lines.slice(0, 3).forEach((line, index) => {
      ctx.fillText(line, w / 2, y + index * 36);
    });
    ctx.restore();
    
    return y + Math.min(lines.length, 3) * 36 + 40;
  },
  
  drawBenefits(ctx, benefits, y) {
    const w = CONFIG.canvasWidth;
    const p = CONFIG.layout.padding;
    const maxWidth = w - p * 2 - 80;
    
    // 绘制标题
    ctx.save();
    ctx.font = 'bold 36px "Noto Sans SC"';
    ctx.fillStyle = CONFIG.colors.primary;
    ctx.textAlign = 'left';
    ctx.fillText('产品特点', p, y);
    ctx.restore();
    
    let currentY = y + 50;
    
    // 绘制功效列表
    benefits.forEach((benefit, index) => {
      if (currentY > CONFIG.canvasHeight - 300) return; // 防止溢出
      
      ctx.save();
      
      // 绘制圆点
      ctx.fillStyle = CONFIG.colors.accent;
      ctx.beginPath();
      ctx.arc(p + 20, currentY - 6, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // 绘制文字
      ctx.font = '26px "Noto Sans SC"';
      ctx.fillStyle = CONFIG.colors.primary;
      ctx.textAlign = 'left';
      
      const lines = this.wrapText(ctx, benefit, maxWidth);
      lines.slice(0, 2).forEach((line, lineIndex) => {
        ctx.fillText(line, p + 50, currentY + lineIndex * 38);
      });
      
      ctx.restore();
      
      currentY += Math.min(lines.length, 2) * 38 + 15;
    });
    
    return currentY + 30;
  },
  
  drawUsage(ctx, usage, y) {
    const w = CONFIG.canvasWidth;
    const p = CONFIG.layout.padding;
    const maxWidth = w - p * 2 - 80;
    
    // 绘制标题
    ctx.save();
    ctx.font = 'bold 36px "Noto Sans SC"';
    ctx.fillStyle = CONFIG.colors.primary;
    ctx.textAlign = 'left';
    ctx.fillText('使用方法', p, y);
    ctx.restore();
    
    let currentY = y + 50;
    
    // 绘制用法列表
    usage.forEach((item, index) => {
      if (currentY > CONFIG.canvasHeight - 250) return;
      
      ctx.save();
      ctx.font = '24px "Noto Sans SC"';
      ctx.fillStyle = CONFIG.colors.secondary;
      ctx.textAlign = 'left';
      
      const lines = this.wrapText(ctx, item, maxWidth);
      lines.slice(0, 2).forEach((line, lineIndex) => {
        ctx.fillText(line, p + 20, currentY + lineIndex * 34);
      });
      
      ctx.restore();
      
      currentY += Math.min(lines.length, 2) * 34 + 10;
    });
    
    return currentY;
  },
  
  drawFooter(ctx, url) {
    const w = CONFIG.canvasWidth;
    const h = CONFIG.canvasHeight;
    const p = CONFIG.layout.padding;
    const qrSize = CONFIG.layout.qrSize;
    
    // 生成二维码
    const qrCanvas = document.createElement('canvas');
    const qr = new QRCode(qrCanvas, {
      text: url,
      width: qrSize,
      height: qrSize,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
    
    // 绘制二维码背景
    const qrX = w - p - qrSize;
    const qrY = h - p - qrSize - 40;
    
    ctx.save();
    ctx.fillStyle = '#ffffff';
    this.roundRect(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 12);
    ctx.fill();
    ctx.strokeStyle = CONFIG.colors.border;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    
    // 绘制二维码
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
    
    // 绘制提示文字
    ctx.save();
    ctx.font = '20px "Noto Sans SC"';
    ctx.fillStyle = CONFIG.colors.secondary;
    ctx.textAlign = 'center';
    ctx.fillText(CONFIG.brand.tagline, qrX + qrSize / 2, qrY + qrSize + 32);
    ctx.restore();
    
    // 绘制网站地址
    ctx.save();
    ctx.font = '22px "Noto Sans SC"';
    ctx.fillStyle = CONFIG.colors.gold;
    ctx.textAlign = 'left';
    ctx.fillText(CONFIG.brand.website, p, h - p - 15);
    ctx.restore();
  },
  
  // 辅助方法：文字换行
  wrapText(ctx, text, maxWidth) {
    const words = text.split('');
    const lines = [];
    let currentLine = '';
    
    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine + words[i];
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  },
  
  // 辅助方法：圆角矩形
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
  
  // 辅助方法：图片包含模式（保持宽高比）
  drawImageContain(ctx, img, x, y, w, h) {
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    const scale = Math.min(w / imgW, h / imgH);
    const scaledW = imgW * scale;
    const scaledH = imgH * scale;
    const offsetX = (w - scaledW) / 2;
    const offsetY = (h - scaledH) / 2;
    
    ctx.drawImage(img, x + offsetX, y + offsetY, scaledW, scaledH);
  }
};

// ========== 事件处理 ==========
const EventHandlers = {
  async handleGenerate() {
    let url = DOM.urlInput.value.trim();
    
    if (!url) {
      Utils.showStatus('请输入产品URL', 'warning');
      return;
    }
    
    // 规范化URL
    url = Utils.normalizeUrl(url);
    
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
      if (DOM.subtitleOverride.value.trim()) {
        data.subtitle = DOM.subtitleOverride.value.trim();
      }
      
      // 保存数据
      currentData = data;
      
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
  
  async handleDownload() {
    try {
      const canvas = DOM.canvas;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
      
      downloadUrl = URL.createObjectURL(blob);
      
      const filename = currentData 
        ? `${currentData.name.slice(0, 20)}_海报.png`
        : '产品海报.png';
      
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
  
  handleClear() {
    DOM.urlInput.value = '';
    DOM.titleOverride.value = '';
    DOM.subtitleOverride.value = '';
    
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
  // 绑定事件
  DOM.btnGenerate.addEventListener('click', EventHandlers.handleGenerate);
  DOM.btnDownload.addEventListener('click', EventHandlers.handleDownload);
  DOM.btnClear.addEventListener('click', EventHandlers.handleClear);
  
  DOM.urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') EventHandlers.handleGenerate();
  });
  
  // 初始化画布
  DOM.ctx.fillStyle = '#ffffff';
  DOM.ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
  
  console.log('✅ 加国甄选海报生成器初始化完成');
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
