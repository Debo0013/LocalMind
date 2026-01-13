document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chatArea = document.getElementById('chat-area');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings');
    const saveSettingsBtn = document.getElementById('save-settings');
    const settingsModal = document.getElementById('settings-modal');
    const statusIndicator = document.getElementById('status-indicator');

    // Settings Inputs
    const apiUrlInput = document.getElementById('api-url');
    const modelNameInput = document.getElementById('model-name');
    const systemPromptInput = document.getElementById('system-prompt');
    const resetSettingsBtn = document.getElementById('reset-settings');

    // Global Error Catcher for Browser Console issues
    window.onerror = function (msg, url, lineNo, columnNo, error) {
        console.error('Window Error:', msg, 'at', url, ':', lineNo);
        addMessage(`**Browser Error:** ${msg}. Check console for details.`, 'assistant');
        return false;
    };

    // State
    // Some browsers block requests to 0.0.0.0, so we convert it to localhost
    let currentOrigin = window.location.origin;
    if (currentOrigin.includes('0.0.0.0')) {
        currentOrigin = currentOrigin.replace('0.0.0.0', 'localhost');
    }

    const defaultApiUrl = `${currentOrigin}/api/chat`;
    let state = {
        // Use the current origin to ensure we hit the same server
        apiUrl: localStorage.getItem('apiUrl') || defaultApiUrl,
        model: localStorage.getItem('model') || 'gemma-local-model',
        systemPrompt: localStorage.getItem('systemPrompt') || 'You are a helpful AI assistant.',
        history: []
    };

    // Initialize UI
    apiUrlInput.value = state.apiUrl;
    modelNameInput.value = state.model;
    systemPromptInput.value = state.systemPrompt;

    // Check connection on load
    checkConnection();

    // Event Listeners
    sendBtn.addEventListener('click', handleSendMessage);

    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    userInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value === '') this.style.height = 'auto';
    });

    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('active');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('active');
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('active');
        }
    });

    saveSettingsBtn.addEventListener('click', () => {
        state.apiUrl = apiUrlInput.value.trim();
        state.model = modelNameInput.value.trim();
        state.systemPrompt = systemPromptInput.value.trim();

        localStorage.setItem('apiUrl', state.apiUrl);
        localStorage.setItem('model', state.model);
        localStorage.setItem('systemPrompt', state.systemPrompt);

        settingsModal.classList.remove('active');
        checkConnection();
    });

    if (resetSettingsBtn) {
        resetSettingsBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset all settings to defaults?')) {
                localStorage.clear();
                window.location.reload();
            }
        });
    }

    // Functions
    async function checkConnection() {
        statusIndicator.className = 'status-indicator';
        statusIndicator.title = 'Checking connection...';

        try {
            // If apiUrl is a relative path like '/api/chat', we need to make it absolute for the connection check
            // or just fetch it directly.
            let tagsUrl;
            if (state.apiUrl.startsWith('http')) {
                const baseUrl = state.apiUrl.replace('/api/chat', '');
                tagsUrl = `${baseUrl}/api/tags`;
            } else {
                tagsUrl = '/api/tags';
            }

            console.log('Checking connection to:', tagsUrl);
            const response = await fetch(tagsUrl).catch(e => {
                console.error('Fetch error during checkConnection:', e);
                return { ok: false, status: 'NETWORK_ERROR' };
            });
            console.log('Connection check status:', response.status);

            if (response.ok) {
                statusIndicator.classList.add('connected');
                statusIndicator.title = 'Connected to Local LLM';
            } else {
                statusIndicator.classList.add('error');
                statusIndicator.title = 'Connection failed';
            }
        } catch (error) {
            statusIndicator.classList.add('error');
            statusIndicator.title = 'Connection failed';
            console.error('Connection check failed:', error);
        }
    }

    async function handleSendMessage() {
        const text = userInput.value.trim();
        if (!text || sendBtn.disabled) return;

        // Disable UI
        userInput.disabled = true;
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';

        // Clear input
        userInput.value = '';
        userInput.style.height = 'auto';

        // Add user message
        addMessage(text, 'user');

        // Prepare context/history
        const messages = [
            { role: 'system', content: state.systemPrompt },
            ...state.history,
            { role: 'user', content: text }
        ];

        // Create AI message placeholder
        const aiMessageId = addMessage('Thinking...', 'ai', true);
        let aiResponseText = '';

        console.log('--- CHAT ATTEMPT ---');
        console.log('Fetching from URL:', state.apiUrl);
        if (state.apiUrl.includes('11434')) {
            alert('Wait! Your settings are still pointing to port 11434 (Ollama). I am resetting it to 8080 for you now. Please click Send again.');
            state.apiUrl = 'http://localhost:8080/api/chat';
            localStorage.setItem('apiUrl', state.apiUrl);
            apiUrlInput.value = state.apiUrl;
            userInput.disabled = false;
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
            return;
        }

        console.log('Request body:', {
            model: state.model,
            messages: messages,
            stream: true
        });

        try {
            const response = await fetch(state.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: state.model,
                    messages: messages,
                    stream: true
                })
            });

            console.log('Response status:', response.status);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `API Error: ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            // Clear "Thinking..."
            updateMessage(aiMessageId, '');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');

                // Keep the last partial line in the buffer
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const json = JSON.parse(line);
                        if (json.message && json.message.content) {
                            aiResponseText += json.message.content;
                            updateMessage(aiMessageId, aiResponseText);
                        }
                    } catch (e) {
                        console.error('Error parsing JSON chunk', e, line);
                    }
                }
            }

            // Process any remaining data in buffer
            if (buffer.trim()) {
                try {
                    const json = JSON.parse(buffer);
                    if (json.message && json.message.content) {
                        aiResponseText += json.message.content;
                        updateMessage(aiMessageId, aiResponseText);
                    }
                } catch (e) {
                    // Might not be a full JSON yet
                }
            }

            // Update history
            state.history.push({ role: 'user', content: text });
            state.history.push({ role: 'assistant', content: aiResponseText });

        } catch (error) {
            console.error('Chat error:', error);
            updateMessage(aiMessageId, `**Error:** ${error.message}\n\nPlease check your settings and ensure your local LLM is running.`);
        } finally {
            // Re-enable UI
            userInput.disabled = false;
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
            userInput.focus();
        }
    }

    function addMessage(text, sender, isLoading = false) {
        const id = 'msg-' + Date.now();
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        messageDiv.id = id;

        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'avatar';
        avatarDiv.textContent = sender === 'user' ? 'U' : 'AI';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (isLoading) {
            contentDiv.textContent = text;
            contentDiv.classList.add('loading');
        } else {
            contentDiv.innerHTML = marked.parse(text);
            // Highlight code blocks
            contentDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }

        if (sender === 'user') {
            messageDiv.appendChild(contentDiv);
            messageDiv.appendChild(avatarDiv);
        } else {
            messageDiv.appendChild(avatarDiv);
            messageDiv.appendChild(contentDiv);
        }

        chatArea.appendChild(messageDiv);
        scrollToBottom();

        // Remove welcome message if it exists
        const welcome = document.querySelector('.welcome-message');
        if (welcome) welcome.remove();

        return id;
    }

    function updateMessage(id, text) {
        const messageDiv = document.getElementById(id);
        if (!messageDiv) return;

        const contentDiv = messageDiv.querySelector('.message-content');
        contentDiv.classList.remove('loading');
        contentDiv.innerHTML = marked.parse(text);

        // Highlight code blocks
        contentDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });

        scrollToBottom();
    }

    function scrollToBottom() {
        chatArea.scrollTop = chatArea.scrollHeight;
    }
});
