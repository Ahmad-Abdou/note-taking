// UI Utilities

function showInputModal(message, defaultValue = '') {
    return new Promise((resolve) => {
        const modalOverlay = document.createElement('div');
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';
        modalOverlay.style.zIndex = '10000';

        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.padding = '20px';
        modalContent.style.borderRadius = '8px';
        modalContent.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        modalContent.style.minWidth = '300px';

        const label = document.createElement('p');
        label.textContent = message;
        label.style.marginBottom = '10px';
        label.style.fontWeight = 'bold';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultValue;
        input.style.width = '100%';
        input.style.padding = '8px';
        input.style.marginBottom = '15px';
        input.style.border = '1px solid #ccc';
        input.style.borderRadius = '4px';

        const btnContainer = document.createElement('div');
        btnContainer.style.display = 'flex';
        btnContainer.style.justifyContent = 'flex-end';
        btnContainer.style.gap = '10px';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.padding = '8px 16px';
        cancelBtn.style.border = 'none';
        cancelBtn.style.background = '#f0f0f0';
        cancelBtn.style.borderRadius = '4px';
        cancelBtn.style.cursor = 'pointer';

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.padding = '8px 16px';
        okBtn.style.border = 'none';
        okBtn.style.background = '#0078d4';
        okBtn.style.color = 'white';
        okBtn.style.borderRadius = '4px';
        okBtn.style.cursor = 'pointer';

        const close = (value) => {
            document.body.removeChild(modalOverlay);
            resolve(value);
        };

        cancelBtn.onclick = () => close(null);
        okBtn.onclick = () => close(input.value);
        input.onkeydown = (e) => {
            if (e.key === 'Enter') close(input.value);
            if (e.key === 'Escape') close(null);
        };

        btnContainer.appendChild(cancelBtn);
        btnContainer.appendChild(okBtn);
        modalContent.appendChild(label);
        modalContent.appendChild(input);
        modalContent.appendChild(btnContainer);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        input.focus();
    });
}
