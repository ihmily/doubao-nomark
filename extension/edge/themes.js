(() => {
  'use strict';

  const themes = {
    none: {
      name: '无主题',
      vars: {},
      copy: {
        title: '无水印素材',
        quote: '',
        author: ''
      }
    },
    kurumi: {
      name: '时崎狂三',
      vars: {
        '--theme-bg-image': 'url("assets/panel-bg.png")',
        '--theme-bg-opacity': '1',
        '--theme-text': '#f4eeeb',
        '--theme-muted': '#bdaea8',
        '--theme-modal-border': 'rgba(149,37,53,.72)',
        '--theme-shadow': '0 24px 82px rgba(0,0,0,.7), 0 0 0 1px rgba(145,34,51,.55), inset 0 0 40px rgba(120,18,35,.16)',
        '--theme-modal-radius': '22px',
        '--theme-sidebar-radius': '18px',
        '--theme-content-radius': '22px',
        '--theme-card-radius': '10px',
        '--theme-title-shadow': '0 2px 12px rgba(0,0,0,.55)',
        '--theme-quote-shadow': '0 2px 10px rgba(0,0,0,.6)',
        '--theme-title-family': 'serif',
        '--theme-title-size': '31px',
        '--theme-title-weight': '700',
        '--theme-title-spacing': '2px',
        '--theme-close-border': 'rgba(168,56,73,.92)',
        '--theme-close-bg': 'rgba(117,16,34,.64)',
        '--theme-close-shadow': '0 0 16px rgba(180,35,54,.16)',
        '--theme-close-hover-border': 'rgba(198,62,82,.98)',
        '--theme-close-hover-bg': 'rgba(134,29,48,.82)',
        '--theme-close-size': '42px',
        '--theme-close-radius': '50%',
        '--theme-close-font-size': '28px',
        '--theme-close-top': '13px',
        '--theme-close-right': '14px',
        '--theme-sidebar-border': 'rgba(112,32,43,.52)',
        '--theme-sidebar-bg': 'linear-gradient(180deg, rgba(12,12,12,.44), rgba(8,8,8,.82))',
        '--theme-sidebar-decoration': 'linear-gradient(180deg, rgba(255,255,255,.03), transparent), radial-gradient(circle at 24% 40%, rgba(175,22,44,.10), transparent 24%)',
        '--theme-sidebar-shadow': 'inset 0 0 30px rgba(0,0,0,.36)',
        '--theme-panel-border': 'rgba(64,40,40,.94)',
        '--theme-panel-bg': 'linear-gradient(180deg, rgba(11,11,12,.88), rgba(8,8,8,.94))',
        '--theme-panel-shadow': 'inset 0 0 30px rgba(0,0,0,.42)',
        '--theme-nav-border': 'rgba(67,61,61,.78)',
        '--theme-nav-bg': 'rgba(14,14,15,.72)',
        '--theme-nav-active-border': 'rgba(159,42,59,.9)',
        '--theme-nav-active-bg': 'rgba(134,29,48,.62)',
        '--theme-nav-hover-border': 'rgba(115,63,70,.85)',
        '--theme-nav-hover-bg': 'rgba(28,17,19,.78)',
        '--theme-card-border': 'rgba(123,30,44,.82)',
        '--theme-card-bg': 'linear-gradient(180deg, rgba(20,20,21,.95), rgba(10,10,11,.98))',
        '--theme-card-shadow': 'inset 0 0 14px rgba(0,0,0,.34)',
        '--theme-action-primary-border': '#8b1d30',
        '--theme-action-primary-bg': 'linear-gradient(180deg, rgba(77,10,20,.96), rgba(49,7,13,.98))',
        '--theme-action-hover-bg': '#1a1a1b',
        '--theme-action-primary-hover-bg': 'linear-gradient(180deg, rgba(92,12,24,.98), rgba(61,8,16,.99))',
        '--theme-action-border': 'rgba(66,60,60,.95)',
        '--theme-action-bg': '#121213',
        '--theme-action-text': '#f4ece8',
        '--theme-accent': '#d53d52',
        '--theme-quote': '#f5e8e2',
        '--theme-quote-accent': '#cb4658',
        '--theme-modal-bg': '#080808',
        '--theme-footer-bg': 'rgba(5,5,6,.82)',
        '--theme-footer-color': 'rgba(232,217,212,.7)',
        '--theme-footer-hover-color': '#f4eeeb',
        '--theme-preview-border': 'rgba(134,41,55,.9)',
        '--theme-preview-shadow': '0 18px 50px rgba(0,0,0,.65)',
        '--theme-preview-close-hover-bg': 'rgba(134,29,48,.82)',
        '--theme-preview-close-border': 'rgba(210,177,177,.55)',
        '--theme-preview-close-bg': 'rgba(20,10,12,.76)',
        '--theme-preview-close-color': '#f8eeee',
        '--theme-preview-close-radius': '50%',
        '--theme-preview-close-hover-color': '#f8eeee',
        '--theme-scrollbar-track': 'rgba(8,8,9,.5)',
        '--theme-scrollbar-thumb': 'rgba(146,37,55,.82)',
        '--theme-scrollbar-thumb-hover': 'rgba(204,56,78,.96)'
      },
      copy: {
        title: '无水印素材',
        quote: '在钟声与玫瑰之间，命运悄然轮转。',
        author: '—— Tokisaki Kurumi'
      }
    }
  };

  const requested = new URLSearchParams(window.location.search).get('theme') || 'none';
  const active = themes[requested] || themes.none;
  const root = document.documentElement;
  root.dataset.theme = requested in themes ? requested : 'none';
  Object.entries(active.vars).forEach(([name, value]) => root.style.setProperty(name, value));
  window.DoubaoNomarkTheme = active;
})();
