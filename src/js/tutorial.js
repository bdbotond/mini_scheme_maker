/**
 * 3D Mesh Surface Classifier & Interactive Segmentor
 * Tutorial Modal: Startup walkthrough, available tools & options guide
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.defineProperties(root, Object.getOwnPropertyDescriptors(exports));
    root.Tutorial = exports;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const STORAGE_KEY = 'mini_seg_show_tutorial';

  function shouldShowOnStartup() {
    try {
      const val = localStorage.getItem(STORAGE_KEY);
      // Default to true if not explicitly disabled
      return val === null || val === 'true';
    } catch (e) {
      return true;
    }
  }

  function setStartupPreference(show) {
    try {
      localStorage.setItem(STORAGE_KEY, show ? 'true' : 'false');
    } catch (e) {}
  }

  function openTutorial(tabId) {
    const modal = document.getElementById('tutorial-modal');
    if (modal) {
      modal.classList.add('open');
      const chk = document.getElementById('tutorial-startup-chk');
      if (chk) {
        chk.checked = shouldShowOnStartup();
      }
      if (tabId) {
        switchTutorialTab(tabId);
      }
    }
  }

  function closeTutorial() {
    const modal = document.getElementById('tutorial-modal');
    if (modal) {
      modal.classList.remove('open');
    }
  }

  function switchTutorialTab(tabId) {
    const tabs = document.querySelectorAll('.tutorial-tab-btn');
    const panes = document.querySelectorAll('.tutorial-tab-pane');
    tabs.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    panes.forEach(pane => {
      pane.classList.toggle('active', pane.id === `tutorial-tab-${tabId}`);
    });
  }

  function initTutorial() {
    const chk = document.getElementById('tutorial-startup-chk');
    if (chk) {
      chk.checked = shouldShowOnStartup();
      chk.addEventListener('change', (e) => {
        setStartupPreference(e.target.checked);
      });
    }

    // Keyboard shortcut: '?' opens tutorial when not focused on an input
    window.addEventListener('keydown', (e) => {
      if (document.activeElement && (
        document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA' ||
        document.activeElement.tagName === 'SELECT'
      )) {
        return;
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        openTutorial();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        const modal = document.getElementById('tutorial-modal');
        if (modal && modal.classList.contains('open')) {
          closeTutorial();
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }, true);

    // Automatically pop up on page load if enabled (default: true)
    if (shouldShowOnStartup()) {
      openTutorial();
    }
  }

  return {
    openTutorial,
    closeTutorial,
    switchTutorialTab,
    initTutorial,
    shouldShowOnStartup,
    setStartupPreference
  };
});
