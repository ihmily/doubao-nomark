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
    if (!hasAllowedPageUrl(sender.url) || !hasAllowedFallbackUrl(message.url)) {
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
})();
