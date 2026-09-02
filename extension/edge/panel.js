(() => {
  'use strict';

  let activeType = 'video';
  let media = { video: [], image: [] };

  const elements = {
    grid: document.getElementById('grid'),
    toast: document.getElementById('toast'),
    meta: document.querySelector('.meta'),
    close: document.querySelector('.close'),
    previewModal: document.getElementById('preview-modal'),
    previewDialog: document.getElementById('preview-dialog'),
    previewClose: document.getElementById('preview-close')
  };
  const { grid, toast: toastEl, meta: metaEl, close: closeBtn,
    previewModal, previewDialog, previewClose } = elements;
  const navButtons = [...document.querySelectorAll('.nav button')];
  let activePreview = null;
  let toastTimer = null;
  const theme = window.DoubaoNomarkTheme || {};
  const titleEl = document.querySelector('.title');
  const quoteEl = document.querySelector('.quote');
  const quoteTextEl = document.querySelector('.quote-text');
  const quoteAuthorEl = document.querySelector('.quote-author');

  if (theme.copy) {
    if (theme.copy.title) titleEl.textContent = theme.copy.title;
    quoteTextEl.textContent = theme.copy.quote || '';
    quoteAuthorEl.textContent = theme.copy.author || '';
    if (!theme.copy.quote && !theme.copy.author) quoteEl.classList.add('is-empty');
  }

  function updatePanelScale() {
    if (!window.innerWidth || !window.innerHeight) return;
    const scale = Math.min(window.innerWidth / 1020, window.innerHeight / 620);
    document.documentElement.style.setProperty('--panel-scale', String(scale));
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1200);
  }

  function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '';
    const value = Math.floor(seconds);
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }

  function formatDimensions(width, height) {
    const normalizedWidth = Number(width);
    const normalizedHeight = Number(height);
    if (!Number.isFinite(normalizedWidth) || !Number.isFinite(normalizedHeight)
      || normalizedWidth <= 0 || normalizedHeight <= 0) {
      return '';
    }
    return `${Math.round(normalizedWidth)}x${Math.round(normalizedHeight)}`;
  }

  function createBatchTimestamp(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate())
    ].join('') + '_' + [
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join('');
  }

  function updateNavigation() {
    navButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.type === activeType);
    });
  }

  function updateMeta() {
    metaEl.textContent = activeType === 'video'
      ? `共 ${media.video.length} 个视频素材`
      : `共 ${media.image.length} 张图片素材`;
  }

  function createActionButtons() {
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.innerHTML = `
      <button class="download" type="button">下载</button>
      <button class="copy" type="button">复制地址</button>`;
    return actions;
  }

  function render() {
    closePreview();
    const items = media[activeType];
    grid.innerHTML = '';
    const fragment = document.createDocumentFragment();
    items.forEach(item => {
      const card = document.createElement('article');
      card.className = 'card';

      const preview = document.createElement('div');
      preview.className = 'thumb';
      if (item.type === 'video') {
        const video = document.createElement('video');
        video.src = item.url;
        video.preload = 'metadata';
        video.playsInline = true;
        if (item.poster) video.poster = item.poster;
        preview.appendChild(video);
        let durationBadge = null;
        const addDurationBadge = seconds => {
          if (durationBadge || !seconds || !Number.isFinite(seconds) || seconds <= 0) return;
          durationBadge = document.createElement('span');
          durationBadge.className = 'dur';
          durationBadge.textContent = formatDuration(seconds);
          preview.appendChild(durationBadge);
        };
        addDurationBadge(Number(item.durationSeconds));
        if (item.duration) {
          durationBadge = document.createElement('span');
          durationBadge.className = 'dur';
          durationBadge.textContent = item.duration;
          preview.appendChild(durationBadge);
        }
        video.addEventListener('loadedmetadata', () => addDurationBadge(video.duration));
        const playToggle = document.createElement('button');
        playToggle.className = 'play-toggle';
        playToggle.type = 'button';
        playToggle.title = '播放/暂停';
        playToggle.setAttribute('aria-label', '播放/暂停');
        playToggle.addEventListener('click', async event => {
          event.stopPropagation();
          if (video.paused) {
            try {
              await video.play();
            } catch (error) {
              return;
            }
          } else {
            video.pause();
          }
          playToggle.classList.toggle('is-playing', !video.paused);
        });
        video.addEventListener('ended', () => playToggle.classList.remove('is-playing'));
        preview.appendChild(playToggle);
      } else {
        const image = document.createElement('img');
        image.src = item.url;
        image.alt = item.title;
        image.loading = 'lazy';
        preview.appendChild(image);

        let dimensionsBadge = null;
        const addDimensionsBadge = (width, height) => {
          if (dimensionsBadge) return;
          const dimensions = formatDimensions(width, height);
          if (!dimensions) return;
          dimensionsBadge = document.createElement('span');
          dimensionsBadge.className = 'dur dimensions';
          dimensionsBadge.textContent = dimensions;
          preview.appendChild(dimensionsBadge);
        };
        addDimensionsBadge(item.width, item.height);
        image.addEventListener('load', () => {
          addDimensionsBadge(image.naturalWidth, image.naturalHeight);
        });
      }

      preview.addEventListener('click', event => {
        if (event.target.closest('.play-toggle')) return;
        openPreview(item, preview);
      });

      const actions = createActionButtons();

      card.append(preview, actions);
      fragment.appendChild(card);
    });
    grid.appendChild(fragment);

    if (!items.length) {
      const label = activeType === 'video' ? '视频' : '图片';
      grid.innerHTML = `<div class="empty-state">当前页面暂无${label}素材</div>`;
    }
    updateMeta();
  }

  grid.addEventListener('click', event => {
    const action = event.target.closest('button');
    const card = action?.closest('.card');
    if (!action || !card) return;
    const item = media[activeType][[...grid.children].indexOf(card)];
    if (!item) return;
    if (action.classList.contains('download')) {
      window.parent.postMessage({
        type: 'doubao-nomark-download',
        url: item.url,
        filename: item.filename
      }, '*');
      toast('已开始下载');
    } else if (action.classList.contains('copy')) {
      window.parent.postMessage({ type: 'doubao-nomark-copy', url: item.url }, '*');
      toast('已复制地址');
    }
  });

  let scrollbarTimer = null;
  grid.addEventListener('scroll', () => {
    grid.classList.add('is-scrolling');
    clearTimeout(scrollbarTimer);
    scrollbarTimer = setTimeout(() => grid.classList.remove('is-scrolling'), 800);
  }, { passive: true });

  function closePreview() {
    previewModal.classList.remove('show');
    if (!activePreview) return;
    const { mediaEl, origin, anchor, controls } = activePreview;
    if (mediaEl.tagName === 'VIDEO') mediaEl.controls = controls;
    if (anchor?.isConnected) origin.insertBefore(mediaEl, anchor);
    else origin.appendChild(mediaEl);
    activePreview = null;
  }

  function openPreview(item, origin) {
    closePreview();
    const mediaEl = origin.querySelector('video, img');
    if (!mediaEl) return;
    const anchor = origin.querySelector('.dur, .play-toggle');
    const controls = mediaEl.tagName === 'VIDEO' ? mediaEl.controls : false;
    if (item.type === 'video') {
      mediaEl.controls = true;
    }
    activePreview = { mediaEl, origin, anchor, controls };
    previewDialog.appendChild(mediaEl);
    previewModal.classList.add('show');
  }

  function setMedia(payload) {
    updatePanelScale();
    const images = Array.isArray(payload.images) ? payload.images : [];
    const videos = Array.isArray(payload.videos) ? payload.videos : [];
    const batchTimestamp = createBatchTimestamp();
    const platformCode = payload.platform === 'Q' ? 'Q' : 'D';
    const [batchDate, batchTime] = batchTimestamp.split('_');
    const filePrefix = `${batchDate}${platformCode}_${batchTime}`;
    media = {
      video: videos.filter(video => video && video.url).map((video, index) => ({
        type: 'video',
        title: `视频素材 · ${String(index + 1).padStart(2, '0')}`,
        duration: formatDuration(video.duration),
        poster: video.poster_url || '',
        url: video.url,
        filename: `video_${filePrefix}_${String(index + 1).padStart(2, '0')}.mp4`
      })),
      image: images.filter(image => image && image.url).map((image, index) => ({
        type: 'image',
        title: `图片素材 · ${String(index + 1).padStart(2, '0')}`,
        url: image.url,
        width: image.width,
        height: image.height,
        filename: `image_${filePrefix}_${String(index + 1).padStart(2, '0')}.png`
      }))
    };
    if (!media[activeType].length) {
      if (media.video.length) activeType = 'video';
      else if (media.image.length) activeType = 'image';
    }
    updateNavigation();
    render();
  }

  closeBtn.addEventListener('click', () => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'doubao-nomark-panel-close' }, '*');
    } else {
      document.getElementById('modal').style.display = 'none';
    }
  });

  previewClose.addEventListener('click', closePreview);
  previewModal.addEventListener('click', event => {
    if (event.target === previewModal) closePreview();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && previewModal.classList.contains('show')) closePreview();
  });

  window.addEventListener('message', event => {
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'doubao-nomark-media') setMedia(event.data);
  });
  window.addEventListener('resize', updatePanelScale);

  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      activeType = button.dataset.type;
      updateNavigation();
      render();
    });
  });

  updatePanelScale();
  updateNavigation();
  render();
  window.parent.postMessage({ type: 'doubao-nomark-panel-ready' }, '*');
})();
