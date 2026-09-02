(() => {
  // Change this single value to switch the panel theme: "kurumi" or "none".
  const panelTheme = 'kurumi';
  const panelUrl = `${chrome.runtime.getURL('panel.html')}?theme=${encodeURIComponent(panelTheme)}`;
  document.documentElement.dataset.doubaoNomarkPanel = panelUrl;
  document.documentElement.dispatchEvent(new CustomEvent('doubao-nomark-assets-ready'));
})();
