// Chat UI Logic

let chatContainer;

function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message user-message';
    div.textContent = text;
    chatContainer.appendChild(div);
    scrollToBottom();
}

async function addAiMessage(text, animate = false) {
    const div = document.createElement('div');
    div.className = 'message ai-message';
    chatContainer.appendChild(div);

    if (animate) {
        await typeText(div, text);
    } else {
        if (typeof marked !== 'undefined') {
            div.innerHTML = marked.parse(text);
        } else {
            div.textContent = text;
        }
    }
    scrollToBottom();
}

function typeText(element, text) {
    return new Promise((resolve) => {
        let i = 0;
        element.textContent = ''; // Start empty

        // Add cursor
        element.classList.add('typing');

        function type() {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
                scrollToBottom();

                // Randomize typing speed slightly for realism
                const delay = Math.random() * 10 + 10;
                setTimeout(type, delay);
            } else {
                // Finished typing
                element.classList.remove('typing');
                if (typeof marked !== 'undefined') {
                    element.innerHTML = marked.parse(text);
                }
                resolve();
            }
        }

        type();
    });
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}
