// Performance Monitor - Press Ctrl+Shift+P to toggle
// Add this to viewer.html or run in console

let perfMonitor = null;

function createPerfMonitor() {
    if (perfMonitor) {
        perfMonitor.remove();
        perfMonitor = null;
        return;
    }

    perfMonitor = document.createElement('div');
    perfMonitor.id = 'perf-monitor';
    perfMonitor.style.cssText = `
        position: fixed;
        top: 50px;
        right: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: #0f0;
        font-family: monospace;
        font-size: 12px;
        padding: 10px;
        border-radius: 4px;
        z-index: 10000;
        min-width: 200px;
    `;
    document.body.appendChild(perfMonitor);

    let frameCount = 0;
    let lastTime = performance.now();
    let fps = 0;

    function updateMonitor() {
        const currentTime = performance.now();
        frameCount++;

        if (currentTime >= lastTime + 1000) {
            fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
            frameCount = 0;
            lastTime = currentTime;
        }

        const memory = performance.memory ?
            `${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)} MB` :
            'N/A';

        const renderedPages = document.querySelectorAll('.page[data-rendered="true"]').length;
        const totalPages = document.querySelectorAll('.page').length;

        perfMonitor.innerHTML = `
            <div><strong>Performance Monitor</strong></div>
            <div>FPS: ${fps}</div>
            <div>Memory: ${memory}</div>
            <div>Rendered Pages: ${renderedPages}/${totalPages}</div>
            <div>Event Listeners: ~${getApproxListenerCount()}</div>
        `;

        requestAnimationFrame(updateMonitor);
    }

    updateMonitor();
}

function getApproxListenerCount() {
    // Approximate count of event listeners
    let count = 0;
    count += document.querySelectorAll('button').length;
    count += document.querySelectorAll('input').length;
    count += document.querySelectorAll('select').length;
    count += 5; // scroll, resize, etc.
    return count;
}

// Toggle monitor with Ctrl+Shift+P
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        createPerfMonitor();
    }
});
