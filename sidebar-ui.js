/* Responsive sidebar shell and single-page navigation helpers. */
(function () {
    const desktopBreakpoint = 768;

    function isMobile() { return window.innerWidth <= desktopBreakpoint; }

    window.closeMobileSidebar = function () {
        document.body.classList.remove('sidebar-mobile-open');
        const button = document.getElementById('mobileMenuButton');
        if (button) button.setAttribute('aria-expanded', 'false');
    };

    window.refreshSidebarBadges = function () {
        const alerts = cachedDeviceAlerts[currentSiteKey] || {};
        const total = Object.values(alerts).reduce((sum, count) => sum + Number(count || 0), 0);
        ['sidebarAlertBadge', 'sidebarIssueBadge'].forEach(id => {
            const badge = document.getElementById(id);
            if (!badge) return;
            badge.dataset.count = String(total);
            badge.textContent = total > 99 ? '99+' : String(total);
            badge.setAttribute('aria-label', `${total} รายการแจ้งเตือน`);
        });
    };

    document.addEventListener('DOMContentLoaded', function () {
        const header = document.querySelector('body > header');
        const sidebar = document.getElementById('appSidebar');
        const collapse = document.getElementById('sidebarCollapseButton');
        const mobileButton = document.getElementById('mobileMenuButton');
        const overlay = document.getElementById('sidebarOverlay');
        if (!sidebar || !collapse || !mobileButton) return;

         function syncHeaderHeight() {
            if (header) document.documentElement.style.setProperty('--app-header-height', `${header.offsetHeight}px`);
        }
        syncHeaderHeight();
        if (header && window.ResizeObserver) new ResizeObserver(syncHeaderHeight).observe(header);

        if (localStorage.getItem('peaSidebarCollapsed') === 'true') document.body.classList.add('sidebar-collapsed');
        collapse.addEventListener('click', function () {
            document.body.classList.toggle('sidebar-collapsed');
            const collapsed = document.body.classList.contains('sidebar-collapsed');
            localStorage.setItem('peaSidebarCollapsed', String(collapsed));
            collapse.setAttribute('aria-label', collapsed ? 'ขยายเมนูด้านข้าง' : 'พับเมนูด้านข้าง');
        });
        mobileButton.addEventListener('click', function () {
            const open = document.body.classList.toggle('sidebar-mobile-open');
            mobileButton.setAttribute('aria-expanded', String(open));
        });
        overlay.addEventListener('click', window.closeMobileSidebar);
          window.addEventListener('resize', function () { syncHeaderHeight(); if (!isMobile()) window.closeMobileSidebar(); });
        sidebar.querySelectorAll('#tab-topology, #tab-summary, #tab-registry').forEach(button => button.addEventListener('click', window.closeMobileSidebar));
    });
})();
