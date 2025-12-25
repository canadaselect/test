/* 
 * 加国甄选 - 产品海报生成器 (增强版)
 * 支持更灵活的数据提取
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

// ========== 增强数据解析器 ==========
const Parser = {
  parseProductData(html, pageUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    console.log('开始解析产品数据...');
    
    // 提取产品标题 - 多种方式尝试
    let title = this.extractTitle(doc);
    console.log('提取的标题:', title);
    
    // 提取副标题
    let subtitle = this.extractSubtitle(doc, title);
    console.log('提取的副标题:', subtitle);
    
    // 提取价格
    let price = this.extractPrice(doc);
    console.log('提取的价格:', price);
    
    // 提取规格
    let specs = this.extractSpecs(doc);
    console.log('提取的规格:', specs);
    
    // 提取主图
    let image = this.extractImage(doc, pageUrl);
    console.log('提取的图片:', image);
    
    // 提取描述
    let description = this.extractDescription(doc);
    console.log('提取的描述:', description?.substring(0, 50) + '...');
    
    // 提取功效
    const benefits = this.extractBenefits(doc);
    console.log('提取的功效数量:', benefits.length);
    
    // 提取用法
    const usage = this.extractUsage(doc);
    console.log('提取的用法数量:', usage.length);
    
    return {
      name: title || '产品名称',
      subtitle: subtitle || '',
      price: price || '',
      specs: specs || '',
      description: description || '',
      image: image || '',
      benefits: benefits,
      usage: usage,
      url: pageUrl
    };
  },
  
  // 提取标题 - 多种选择器
  extractTitle(doc) {
    const selectors = [
      'h1.product_title',
      'h1.entry-title',
      '.product-title',
      'h1',
      '.product-name h1',
      '.product-name',
      '[itemprop="name"]'
    ];
    
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (el && el.textContent.trim()) {
        return Utils.cleanText(el.textContent);
      }
    }
    
    // 从meta标签获取
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    if (ogTitle) return Utils.cleanText(ogTitle.content);
    
    const titleTag = doc.querySelector('title');
    if (titleTag) {
      // 清理网站名称
      let title = titleTag.textContent.split('|')[0].split('-')[0];
      return Utils.cleanText(title);
    }
    
    return '';
  },
  
  // 提取副标题
  extractSubtitle(doc, mainTitle) {
    // 查找包含英文的元素
    const selectors = [
      '.product-subtitle',
      '.product_title + p',
      'h1 + p',
      '.woocommerce-product-details__short-description p:first-child'
    ];
    
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (el) {
        const text = Utils.cleanText(el.textContent);
        // 如果包含英文且不是主标题
        if (/[A-Za-z]/.test(text) && text !== mainTitle && text.length < 100) {
          return text;
        }
      }
    }
    
    return '';
  },
  
  // 提取价格
  extractPrice(doc) {
    const selectors = [
      '.price .amount',
      '.price ins .amount',
      '.price',
      '[itemprop="price"]',
      '.product-price',
      '.woocommerce-Price-amount'
    ];
    
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (el) {
        const text = el.textContent.trim();
        // 匹配价格格式
        const match = text.match(/\$[\d,]+\.?\d*/);
        if (match) return match[0];
      }
    }
    
    return '';
  },
  
  // 提取规格
  extractSpecs(doc) {
    // 查找包含"规格"、"容量"、"粒"等关键词的文本
    const bodyText = doc.body.textContent;
    
    // 匹配模式：数字 + 粒/瓶/盒/粒/颗 等
    const patterns = [
      /(\d+\s*粒\s*[\/|]\s*瓶)/,
      /(\d+\s*粒)/,
      /(\d+\s*颗)/,
      /(\d+\s*mg)/,
      /(\d+\s*g)/,
      /规格[：:]\s*([^\n]+)/
    ];
    
    for (const pattern of patterns) {
      const match = bodyText.match(pattern);
      if (match) return Utils.cleanText(match[1] || match[0]);
    }
    
    return '';
  },
  
  // 提取图片
  extractImage(doc, pageUrl) {
    const selectors = [
      '.woocommerce-product-gallery__image img',
      '.product-image img',
      '.wp-post-image',
      'img[class*="product"]',
      '.entry-content img:first-of-type',
      'meta[property="og:image"]'
    ];
    
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (el) {
        let src = '';
        if (el.tagName === 'META') {
          src = el.content;
        } else {
          src = el.src || el.dataset.src || el.dataset.lazySrc || el.getAttribute('data-lazy-src') || '';
        }
        
        if (src) {
          // 过滤掉太小的图片（可能是图标）
          if (!src.includes('icon') && !src.includes('logo') && !src.includes('placeholder')) {
            return Utils.normalizeUrl(src);
          }
        }
      }
    }
    
    // 尝试找到所有图片中最大的
    const allImages = Array.from(doc.querySelectorAll('img'));
    const productImages = allImages.filter(img => {
      const src = img.src || '';
      const alt = img.alt || '';
      return !src.includes('logo') && 
             !src.includes('icon') && 
             !alt.includes('logo') &&
             img.width > 100;
    });
    
    if (productImages.length > 0) {
      return Utils.normalizeUrl(productImages[0].src);
    }
    
    return '';
  },
  
  // 提取描述
  extractDescription(doc) {
    const selectors = [
      '.woocommerce-product-details__short-description',
      '.product-description',
      '.entry-summary > p:first-of-type',
      'meta[name="description"]'
    ];
    
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (el) {
        const text = el.tagName === 'META' ? el.content : el.textContent;
        const cleaned = Utils.cleanText(text);
        if (cleaned && cleaned.length > 20) {
          return cleaned;
        }
      }
    }
    
    return '';
  },
  
  // 提取功效列表
  extractBenefits(doc) {
    const benefits = [];
    
    // 查找包含"功效"、"特点"、"成分"的标题
    const headers = Array.from(doc.querySelectorAll('h2, h3, h4, strong'));
    const benefitHeader = headers.find(h => {
      const text = h.textContent;
      return text.includes('功效') || 
             text.includes('特点') || 
             text.includes('成分') ||
             text.includes('优势') ||
             text.includes('好处');
    });
    
    if (benefitHeader) {
      // 查找后续的列表
      let current = benefitHeader.nextElementSibling;
      let count = 0;
      
      while (current && count < 10) {
        if (current.tagName === 'UL' || current.tagName === 'OL') {
          const items = current.querySelectorAll('li');
          items.forEach(item => {
            const text = this.cleanBenefitText(item.textContent);
            if (text && text.length > 3) {
              benefits.push(text);
            }
          });
          break;
        } else if (current.tagName.match(/^H[2-4]$/)) {
          break;
        }
        current = current.nextElementSibling;
        count++;
      }
    }
    
    // 如果没找到，尝试查找所有带圆点或数字的列表
    if (benefits.length === 0) {
      const lists = doc.querySelectorAll('ul li, ol li');
      lists.forEach(item => {
        const text = this.cleanBenefitText(item.textContent);
        if (text && text.length > 5 && text.length < 100) {
          benefits.push(text);
        }
      });
    }
    
    return benefits.slice(0, 5);
  },
  
  // 清理功效文本
  cleanBenefitText(text) {
    // 去除emoji和特殊符号
    let cleaned = text.replace(/^[🔴🟢🟡⭐️✨💊🌿\s•·\-\d\.]+/, '').trim();
    // 只取第一行
    cleaned = cleaned.split('\n')[0].trim();
    // 限制长度
    if (cleaned.length > 80) {
      cleaned = cleaned.substring(0, 80) + '...';
    }
    return cleaned;
  },
  
  // 提取用法说明
  extractUsage(doc) {
    const usage = [];
    
    // 查找包含"用法"、"用量"、"服用"的标题
    const headers = Array.from(doc.querySelectorAll('h2, h3, h4, strong'));
    const usageHeader = headers.find(h => {
      const text = h.textContent;
      return text.includes('用法') || 
             text.includes('用量') || 
             text.includes('服用') ||
             text.includes('使用方法') ||
             text.includes('建议');
    });
    
    if (usageHeader) {
      let current = usageHeader.nextElementSibling;
      let count = 0;
      
      while (current && count < 5) {
        if (current.tagName === 'UL' || current.tagName === 'OL') {
          const items = current.querySelectorAll('li');
          items.forEach(item => {
            const text = Utils.cleanText(item.textContent);
            if (text && text.length > 5) {
              usage.push(text);
            }
          });
          break;
        } else if (current.tagName === 'P') {
          const text = Utils.cleanText(current.textContent);
          if (text && (text.includes('每') || text.includes('次') || text.includes('天'))) {
            usage.push(text);
          }
        } else if (current.tagName.match(/^H[2-4]$/)) {
          break;
        }
        current = current.nextElementSibling;
        count++;
      }
    }
    
    return usage.slice(0, 3);
  }
};

// ========== 海报渲染 ==========
const PosterRenderer = {
  async render(data) {
    const ctx = DOM.ctx;
    const w = CONFIG.canvasWidth;
    const h = CONFIG.canvasHeight;
    const p = CONFIG.layout.padding;
    
    await Utils.waitForFonts();
    
    ctx.fillStyle = CONFIG.colors.background;
    ctx.fillRect(0, 0, w, h);
    
    let currentY = p;
    
    currentY = this.drawHeader(ctx, currentY);
    
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
    
    currentY = this.drawTitle(ctx, data, currentY);
    
    if (data.description) {
      currentY = this.drawDescription(ctx, data.description, currentY);
    }
    
    if (data.benefits.length > 0) {
      currentY = this.drawBenefits(ctx, data.benefits, currentY);
    }
    
    if (data.usage.length > 0) {
      currentY = this.drawUsage(ctx, data.usage, currentY);
    }
    
    this.drawFooter(ctx, data.url);
    
    DOM.canvasInfo.textContent = `✅ 海报生成成功 - ${data.name}`;
  },
  
  drawHeader(ctx, y) {
    const w = CONFIG.canvasWidth;
    const p = CONFIG.layout.padding;
    
    ctx.save();
    ctx.font = 'bold 56px "Ma Shan Zheng", "Noto Sans SC"';
    ctx.fillStyle = CONFIG.colors.gold;
    ctx.textAlign = 'center';
    ctx.fillText(CONFIG.brand.name, w / 2, y + 45);
    ctx.restore();
    
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
    
    ctx.save();
    ctx.fillStyle = CONFIG.colors.lightBg;
    this.roundRect(ctx, p, y, imgWidth, imgHeight, 16);
    ctx.fill();
    ctx.restore();
    
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
    
    if (data.subtitle) {
      ctx.save();
      ctx.font = '24px "Noto Sans SC"';
      ctx.fillStyle = CONFIG.colors.secondary;
      ctx.textAlign = 'center';
      ctx.fillText(data.subtitle, w / 2, currentY);
      ctx.restore();
      currentY += 40;
    }
    
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
    
    ctx.save();
    ctx.font = 'bold 36px "Noto Sans SC"';
    ctx.fillStyle = CONFIG.colors.primary;
    ctx.textAlign = 'left';
    ctx.fillText('产品特点', p, y);
    ctx.restore();
    
    let currentY = y + 50;
    
    benefits.forEach((benefit, index) => {
      if (currentY > CONFIG.canvasHeight - 300) return;
      
      ctx.save();
      
      ctx.fillStyle = CONFIG.colors.accent;
      ctx.beginPath();
      ctx.arc(p + 20, currentY - 6, 6, 0, Math.PI * 2);
      ctx.fill();
      
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
    
    ctx.save();
    ctx.font = 'bold 36px "Noto Sans SC"';
    ctx.fillStyle = CONFIG.colors.primary;
    ctx.textAlign = 'left';
    ctx.fillText('使用方法', p, y);
    ctx.restore();
    
    let currentY = y + 50;
    
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
    
    const qrCanvas = document.createElement('canvas');
    const qr = new QRCode(qrCanvas, {
      text: url,
      width: qrSize,
      height: qrSize,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
    
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
    
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
    
    ctx.save();
    ctx.font = '20px "Noto Sans SC"';
    ctx.fillStyle = CONFIG.colors.secondary;
    ctx.textAlign = 'center';
    ctx.fillText(CONFIG.brand.tagline, qrX + qrSize / 2, qrY + qrSize + 32);
    ctx.restore();
    
    ctx.save();
    ctx.font = '22px "Noto Sans SC"';
    ctx.fillStyle = CONFIG.colors.gold;
    ctx.textAlign = 'left';
    ctx.fillText(CONFIG.brand.website, p, h - p - 15);
    ctx.restore();
  },
  
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
    
    url = Utils.normalizeUrl(url);
    
    Utils.showStatus('📥 正在抓取产品信息...', 'info');
    DOM.btnGenerate.disabled = true;
    DOM.btnDownload.disabled = true;
    
    try {
      const html = await Network.fetchHtml(url);
      Utils.showStatus('📊 正在解析产品数据...', 'info');
      
      let data = Parser.parseProductData(html, url);
      
      if (DOM.titleOverride.value.trim()) {
        data.name = DOM.titleOverride.value.trim();
      }
      if (DOM.subtitleOverride.value.trim()) {
        data.subtitle = DOM.subtitleOverride.value.trim();
      }
      
      currentData = data;
      
      Utils.showStatus('🎨 正在生成海报...', 'info');
      await PosterRenderer.render(data);
      
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
    
    DOM.ctx.fillStyle = '#ffffff';
    DOM.ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
    DOM.canvasInfo.textContent = '等待生成海报...';
    
    DOM.btnDownload.disabled = true;
    Utils.hideStatus();
  }
};

// ========== 初始化 ==========
function init() {
  DOM.btnGenerate.addEventListener('click', EventHandlers.handleGenerate);
  DOM.btnDownload.addEventListener('click', EventHandlers.handleDownload);
  DOM.btnClear.addEventListener('click', EventHandlers.handleClear);
  
  DOM.urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') EventHandlers.handleGenerate();
  });
  
  DOM.ctx.fillStyle = '#ffffff';
  DOM.ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
  
  console.log('✅ 加国甄选海报生成器初始化完成 (增强版)');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
