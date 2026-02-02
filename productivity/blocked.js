// Blocked page script
// This must be an external file due to Chrome Extension CSP requirements

// Motivational quotes
const quotes = [
    { quote: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { quote: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
    { quote: "It's not that I'm so smart, it's just that I stay with problems longer.", author: "Albert Einstein" },
    { quote: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
    { quote: "Your focus determines your reality.", author: "Qui-Gon Jinn" },
    { quote: "Concentrate all your thoughts upon the work in hand.", author: "Alexander Graham Bell" },
    { quote: "The successful warrior is the average man, with laser-like focus.", author: "Bruce Lee" },
    { quote: "Starve your distractions, feed your focus.", author: "Unknown" },
    { quote: "Where focus goes, energy flows.", author: "Tony Robbins" },
    { quote: "Do the hard jobs first. The easy jobs will take care of themselves.", author: "Dale Carnegie" }
];

// Initialize blocked page
function initBlockedPage() {
    // Get site and reason from URL params
    const params = new URLSearchParams(window.location.search);
    const site = params.get('site');
    const reason = params.get('reason'); // 'time_limit' when blocked for exceeding limit
    const usage = params.get('usage'); // time used in minutes
    const limit = params.get('limit'); // time limit in minutes

    if (site) {
        document.getElementById('site-name').textContent = site;
    }

    // Handle time limit blocked case
    if (reason === 'time_limit') {
        const messageEl = document.querySelector('.message');
        const timerSection = document.querySelector('.timer-section');
        const blockedSiteEl = document.querySelector('.blocked-site');

        if (messageEl) {
            messageEl.innerHTML = `
                <strong>Daily time limit exceeded!</strong><br>
                You've used <strong>${usage || 'all'}</strong> of your <strong>${limit || 'allowed'}</strong> minutes on this site today.<br>
                The limit will reset at midnight.
            `;
        }

        if (blockedSiteEl) {
            blockedSiteEl.innerHTML = `
                <i class="fas fa-stopwatch"></i> <strong>${site}</strong> is time-limited
            `;
        }

        // Hide temporary unblock for time-limited sites
        if (timerSection) {
            timerSection.style.display = 'none';
        }
    }

    // Random quote
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    document.getElementById('motivational-quote').textContent = `"${randomQuote.quote}"`;
    document.getElementById('quote-author').textContent = `— ${randomQuote.author}`;

    // Load stats
    chrome.storage.local.get(['blockStats', `blockStats_${new Date().toISOString().split('T')[0]}`], (result) => {
        const today = new Date().toISOString().split('T')[0];
        const todayStats = result[`blockStats_${today}`] || { blocks: 0 };
        const totalStats = result.blockStats || { savedMinutes: 0 };

        document.getElementById('blocks-today').textContent = todayStats.blocks || 0;
        document.getElementById('time-saved').textContent = totalStats.savedMinutes || 0;

        // Increment block count
        todayStats.blocks = (todayStats.blocks || 0) + 1;
        chrome.storage.local.set({ [`blockStats_${today}`]: todayStats });
    });


    // Temporary unblock buttons
    document.querySelectorAll('.timer-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const minutes = parseInt(btn.dataset.minutes);
            if (confirm(`Unblock ${site} for ${minutes} minutes?`)) {
                // Send message to background to temporarily unblock
                chrome.runtime.sendMessage({
                    type: 'TEMP_UNBLOCK',
                    site: site,
                    minutes: minutes
                }, () => {
                    // Go to the site
                    window.location.href = `https://${site}`;
                });
            }
        });
    });

    // Fix the productivity hub link
    const primaryBtn = document.querySelector('.btn-primary');
    if (primaryBtn) {
        primaryBtn.href = chrome.runtime.getURL('productivity/index.html');
    }

    // Fix go back button
    const backBtn = document.querySelector('.btn-secondary');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            history.back();
        });
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBlockedPage);
} else {
    initBlockedPage();
}
