const originalWarn = console.warn.bind(console);

console.warn = (...args) => {
    const message = args.map(arg => String(arg)).join(' ');
    if (/^Detected \d+ diacritics$/.test(message)) {
        return;
    }
    originalWarn(...args);
};

importScripts('worker.min.js');
