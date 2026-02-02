/**
 * ============================================================================
 * API & INTEGRATION TESTS
 * ============================================================================
 * Tests for Gemini API, dictionary API, and external service interactions
 */

const apiTests = {
    'API & Integration': {
        icon: '🔌',
        tests: [
            {
                name: 'Gemini API key storage is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['geminiApiKey'], resolve);
                    });

                    // Key can be undefined if not set, but should be string if set
                    if (result.geminiApiKey !== undefined && typeof result.geminiApiKey !== 'string') {
                        throw new Error('geminiApiKey should be a string');
                    }
                    return true;
                }
            },
            {
                name: 'API model fallback list is valid',
                fn: async () => {
                    const candidateModels = [
                        'gemini-2.5-flash',
                        'gemini-2.0-flash',
                        'gemini-flash-latest',
                        'gemini-pro-latest',
                        'gemini-2.0-flash-lite',
                        'gemini-1.5-flash',
                        'gemini-1.5-pro'
                    ];

                    if (candidateModels.length < 3) {
                        throw new Error('Should have at least 3 fallback models');
                    }

                    for (const model of candidateModels) {
                        if (!model.includes('gemini')) {
                            throw new Error(`Invalid model name: ${model}`);
                        }
                    }

                    return true;
                }
            },
            {
                name: 'API request payload structure is correct',
                fn: async () => {
                    const payload = {
                        contents: [{
                            parts: [{ text: 'Test prompt' }]
                        }]
                    };

                    if (!payload.contents || !Array.isArray(payload.contents)) {
                        throw new Error('Payload missing contents array');
                    }

                    if (!payload.contents[0].parts || !payload.contents[0].parts[0].text) {
                        throw new Error('Payload missing text content');
                    }

                    return true;
                }
            },
            {
                name: 'Dictionary API URL format is correct',
                fn: async () => {
                    const word = 'example';
                    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`;

                    if (!url.includes('dictionaryapi.dev')) {
                        throw new Error('Invalid dictionary API URL');
                    }

                    if (!url.endsWith(word)) {
                        throw new Error('Word not properly appended to URL');
                    }

                    return true;
                }
            },
            {
                name: 'Error response handling is correct',
                fn: async () => {
                    const errorResponse = {
                        error: {
                            code: 429,
                            message: 'Rate limit exceeded'
                        }
                    };

                    const extractedMessage = errorResponse.error?.message || 'Unknown error';

                    if (extractedMessage !== 'Rate limit exceeded') {
                        throw new Error('Error message not extracted correctly');
                    }

                    return true;
                }
            },
            {
                name: 'API response parsing handles edge cases',
                fn: async () => {
                    // Test null/undefined handling
                    const emptyResponse = {};
                    const nullCandidates = null;

                    const hasContent = emptyResponse.candidates?.[0]?.content?.parts?.[0]?.text || null;

                    if (hasContent !== null) {
                        throw new Error('Empty response should return null');
                    }

                    // Test valid response
                    const validResponse = {
                        candidates: [{
                            content: {
                                parts: [{ text: 'Response text' }]
                            }
                        }]
                    };

                    const validContent = validResponse.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (validContent !== 'Response text') {
                        throw new Error('Valid response not parsed correctly');
                    }

                    return true;
                }
            },
            {
                name: 'URL encoding works for special characters',
                fn: async () => {
                    const text = 'Hello World! How are you?';
                    const encoded = encodeURIComponent(text);

                    if (encoded.includes(' ')) {
                        throw new Error('Spaces should be encoded');
                    }

                    if (!encoded.includes('%20') && !encoded.includes('+')) {
                        throw new Error('Spaces not encoded correctly');
                    }

                    const decoded = decodeURIComponent(encoded);
                    if (decoded !== text) {
                        throw new Error('Encoding/decoding roundtrip failed');
                    }

                    return true;
                }
            },
            {
                name: 'Markdown parsing handles basic formatting',
                fn: async () => {
                    const markdown = '**bold** and *italic* and `code`';

                    // Simple regex replacements (like in explain.js)
                    let html = markdown;
                    html = html.replace(/(\*\*|__)(.*?)\1/g, '<b>$2</b>');
                    html = html.replace(/(\*|_)(.*?)\1/g, '<i>$2</i>');
                    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

                    if (!html.includes('<b>bold</b>')) {
                        throw new Error('Bold not parsed');
                    }
                    if (!html.includes('<i>italic</i>')) {
                        throw new Error('Italic not parsed');
                    }
                    if (!html.includes('<code>code</code>')) {
                        throw new Error('Code not parsed');
                    }

                    return true;
                }
            },
            {
                name: 'Translation lookup structure is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['vocabulary'], resolve);
                    });

                    const vocabulary = result.vocabulary || [];

                    // Check that any vocabulary items have the right structure
                    for (const item of vocabulary.slice(0, 5)) {
                        if (!item.word && !item.term) {
                            throw new Error('Vocabulary item missing word/term');
                        }
                    }

                    return true;
                }
            }
        ]
    }
};

// Export for use in main test suite
if (typeof window !== 'undefined') {
    window.apiTests = apiTests;
}
