(() => {
  'use strict';

  const PAGE_HOSTS = new Set(['www.doubao.com', 'www.dola.com', 'www.qianwen.com']);
  const FALLBACK_HOST_SUFFIXES = ['.snssdk.com', '.douyinvod.com', '.dola.com', '.byteintlapi.com'];
  const REQUEST_TIMEOUT_MS = 20000;

  function hasAllowedPageUrl(value) {
    try {
      return PAGE_HOSTS.has(new URL(value).hostname.toLowerCase());
    } catch (_) {
      return false;
    }
  }

  function hasAllowedFallbackUrl(value) {
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      const trustedHost = FALLBACK_HOST_SUFFIXES.some(suffix =>
        hostname === suffix.slice(1) || hostname.endsWith(suffix)
      );
      return url.protocol === 'https:' && trustedHost && url.pathname.startsWith('/video/fplay/');
    } catch (_) {
      return false;
    }
  }

  function hasAllowedMediaUrl(value) {
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      // CDN hostnames rotate frequently, so do not hard-code the final media host.
      // The sender page, scheme, and credentials are still validated.
      return Boolean(hostname)
        && ['http:', 'https:'].includes(url.protocol)
        && !url.username
        && !url.password;
    } catch (_) {
      return false;
    }
  }

  function getSenderUrl(sender) {
    return sender?.url || sender?.tab?.url || '';
  }

  function normalizeFilename(value) {
    const filename = String(value || 'doubao_media').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
    return filename || 'doubao_media';
  }

  function startDownload(options) {
    return new Promise((resolve, reject) => {
      chrome.downloads.download(options, downloadId => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(downloadId);
      });
    });
  }

  async function fetchFallbackJson(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        credentials: 'omit',
        headers: { Accept: 'application/json, text/plain, */*' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'doubao-nomark-fetch-fallback') return undefined;
    if (!hasAllowedPageUrl(getSenderUrl(sender)) || !hasAllowedFallbackUrl(message.url)) {
      sendResponse({ ok: false, error: '请求地址不受信任' });
      return undefined;
    }

    fetchFallbackJson(message.url)
      .then(payload => sendResponse({ ok: true, payload }))
      .catch(error => sendResponse({
        ok: false,
        error: error.name === 'AbortError' ? 'fallback_api 请求超时' : error.message
      }));
    return true;
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'doubao-nomark-download') return undefined;
    if (!hasAllowedPageUrl(getSenderUrl(sender)) || !hasAllowedMediaUrl(message.url)) {
      sendResponse({ ok: false, error: '下载地址不受信任' });
      return undefined;
    }

    startDownload({
      url: message.url,
      filename: normalizeFilename(message.filename),
      saveAs: false,
      conflictAction: 'uniquify'
    })
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message || '后台下载失败' }));
    return true;
  });
})();
