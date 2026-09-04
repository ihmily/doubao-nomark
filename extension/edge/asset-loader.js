(() => {
  'use strict';

  const FALLBACK_REQUEST_EVENT = 'doubao-nomark-fallback-request';
  const FALLBACK_RESPONSE_EVENT = 'doubao-nomark-fallback-response';
  const DOWNLOAD_REQUEST_EVENT = 'doubao-nomark-download-request';
  const DOWNLOAD_RESPONSE_EVENT = 'doubao-nomark-download-response';

  function respond(detail) {
    document.dispatchEvent(new CustomEvent(FALLBACK_RESPONSE_EVENT, { detail }));
  }

  document.addEventListener(FALLBACK_REQUEST_EVENT, async event => {
    const { requestId, url } = event.detail || {};
    if (typeof requestId !== 'string' || typeof url !== 'string') return;
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'doubao-nomark-fetch-fallback',
        url
      });
      if (!result || typeof result !== 'object') throw new Error('扩展后台未响应');
      respond({ requestId, ...result });
    } catch (error) {
      respond({ requestId, ok: false, error: error.message || '扩展后台请求失败' });
    }
  });

  document.addEventListener(DOWNLOAD_REQUEST_EVENT, async event => {
    const { requestId, url, filename } = event.detail || {};
    if (typeof requestId !== 'string' || typeof url !== 'string') return;
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'doubao-nomark-download',
        url,
        filename
      });
      if (!result || typeof result !== 'object') throw new Error('扩展后台未响应');
      document.dispatchEvent(new CustomEvent(DOWNLOAD_RESPONSE_EVENT, {
        detail: { requestId, ...result }
      }));
    } catch (error) {
      document.dispatchEvent(new CustomEvent(DOWNLOAD_RESPONSE_EVENT, {
        detail: { requestId, ok: false, error: error.message || '扩展后台下载失败' }
      }));
    }
  });

  // Change this single value to switch the panel theme: "kurumi" or "none".
  const panelTheme = 'kurumi';
  const panelUrl = `${chrome.runtime.getURL('panel.html')}?theme=${encodeURIComponent(panelTheme)}`;
  document.documentElement.dataset.doubaoNomarkPanel = panelUrl;
  document.documentElement.dataset.doubaoNomarkBridge = 'ready';
  document.documentElement.dispatchEvent(new CustomEvent('doubao-nomark-assets-ready'));
})();
