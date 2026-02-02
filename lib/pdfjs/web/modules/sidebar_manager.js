// Sidebar Injection

function injectGeminiSidebar() {
    const sidebar = document.createElement('div');
    sidebar.id = 'gemini-sidebar-container';

    // Apply inline styles
    sidebar.style.position = 'fixed';
    sidebar.style.top = '32px';
    sidebar.style.right = '-360px';
    sidebar.style.width = '360px';
    sidebar.style.height = 'calc(100vh - 32px)';
    sidebar.style.backgroundColor = '#ffffff';
    sidebar.style.borderLeft = '1px solid #e0e0e0';
    sidebar.style.boxShadow = '-4px 0 16px rgba(0, 0, 0, 0.15)';
    sidebar.style.transition = 'right 0.25s ease';
    sidebar.style.zIndex = '900';
    sidebar.style.display = 'flex';
    sidebar.style.flexDirection = 'column';

    const iframe = document.createElement('iframe');
    iframe.id = 'gemini-sidebar-frame';
    iframe.src = 'gemini_sidebar.html';
    iframe.style.border = 'none';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.background = 'white';
    sidebar.appendChild(iframe);

    document.body.appendChild(sidebar);

    const checkToolbar = setInterval(() => {
        const toolbarRight = document.getElementById('toolbarViewerRight');
        if (toolbarRight) {
            clearInterval(checkToolbar);

            // Remove old buttons
            const oldBtn = document.getElementById('viewAI');
            if (oldBtn) oldBtn.remove();
            const oldToggleBtn = document.getElementById('gemini-toggle-btn');
            if (oldToggleBtn) oldToggleBtn.remove();
            const oldNewBtn = document.getElementById('new-gemini-btn');
            if (oldNewBtn) oldNewBtn.remove();

            // Create NEW button
            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'new-gemini-btn';
            toggleBtn.className = 'toolbarButton';
            toggleBtn.title = 'Ask AI';
            toggleBtn.style.display = 'flex';
            toggleBtn.style.alignItems = 'center';
            toggleBtn.style.gap = '4px';
            toggleBtn.style.padding = '3px';
            toggleBtn.style.border = 'none';
            toggleBtn.style.borderRadius = '2px';
            toggleBtn.style.backgroundColor = 'transparent';
            toggleBtn.style.color = 'inherit';
            toggleBtn.style.cursor = 'pointer';
            toggleBtn.style.transition = 'opacity 0.2s ease';

            toggleBtn.addEventListener('mouseenter', () => {
                toggleBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
            });
            toggleBtn.addEventListener('mouseleave', () => {
                toggleBtn.style.backgroundColor = 'transparent';
            });

            toggleBtn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <polygon points="80,40 95,85 140,100 95,115 80,160 65,115 20,100 65,85" fill="none" stroke="currentColor" stroke-width="10"/>
                    <polygon points="160,50 170,75 190,80 170,85 160,110 150,85 130,80 150,75" fill="none" stroke="currentColor" stroke-width="10"/>
                    <polygon points="120,30 127,47 140,50 127,53 120,70 113,53 100,50 113,47" fill="none" stroke="currentColor" stroke-width="10"/>
                </svg>
            `;

            toolbarRight.insertBefore(toggleBtn, toolbarRight.firstChild);

            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const sidebarEl = document.getElementById('gemini-sidebar-container');
                if (!sidebarEl) return;

                const isOpen = sidebarEl.classList.toggle('open');
                document.body.classList.toggle('gemini-sidebar-open', isOpen);

                if (isOpen) {
                    sidebarEl.style.right = '0';
                    document.getElementById('outerContainer').style.marginRight = '360px';
                    toggleBtn.style.opacity = '1';
                } else {
                    sidebarEl.style.right = '-360px';
                    document.getElementById('outerContainer').style.marginRight = '0';
                    toggleBtn.style.opacity = '0.8';
                }
            });
        }
    }, 100);
}
