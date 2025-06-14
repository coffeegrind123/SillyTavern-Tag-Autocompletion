// Tag Autocompletion Extension for SillyTavern
// Implements Danbooru tag validation and correction for improved LLM-generated image prompts

const extensionName = 'SillyTavern-Tag-Autocompletion';
const globalContext = SillyTavern.getContext();

// Extension settings will be initialized in loadSettings()
let extensionSettings = {};
const defaultSettings = {
    enabled: false,
    apiEndpoint: 'http://localhost:8000',
    timeout: 5000,
    candidateLimit: 5,
    debug: false
};

// Initialize extension settings
function loadSettings() {
    globalContext.extensionSettings[extensionName] = Object.assign({}, defaultSettings, globalContext.extensionSettings[extensionName]);
    extensionSettings = globalContext.extensionSettings[extensionName];
    globalContext.saveSettingsDebounced();
}

// Save settings
function saveSettings() {
    globalContext.extensionSettings[extensionName] = extensionSettings;
    globalContext.saveSettingsDebounced();
}

// Generation mode constants (confirmed from SillyTavern code)
const GENERATION_MODE = {
    CHARACTER: 0,
    SCENARIO: 2,
    RAW_LAST: 3,
    NOW: 4,  // Last Message
    FACE: 5
};

// Processing strategy based on generation type
function getProcessingStrategy(generationType) {
    switch(generationType) {
        case GENERATION_MODE.NOW: // Last Message
        case GENERATION_MODE.RAW_LAST:
            return { candidateLimit: 3, strategy: 'fast' }; // Limited context = fewer candidates
        case GENERATION_MODE.CHARACTER:
        case GENERATION_MODE.FACE:
            return { candidateLimit: 5, strategy: 'comprehensive' }; // Rich context = more options
        case GENERATION_MODE.SCENARIO:
            return { candidateLimit: 4, strategy: 'balanced' }; // Medium context = balanced
        default:
            return { candidateLimit: 5, strategy: 'default' };
    }
}

// API call to search for tag candidates
async function searchTagCandidates(query, limit = 5) {
    if (!extensionSettings.enabled) {
        return { candidates: [] };
    }

    try {
        const response = await fetch(`${extensionSettings.apiEndpoint}/search_tag`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                limit: limit
            }),
            signal: AbortSignal.timeout(extensionSettings.timeout)
        });

        if (!response.ok) {
            console.warn(`Tag API error: ${response.status}`);
            return { candidates: [] };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        if (extensionSettings.debug) {
            console.warn('Tag autocomplete API failed:', error);
        }
        return { candidates: [] };
    }
}

// Context-aware tag selection using SillyTavern's LLM
async function selectBestTagWithContext(candidates, originalTag, generationType) {
    if (candidates.length === 0) {
        return originalTag;
    }

    if (candidates.length === 1) {
        return candidates[0];
    }

    try {
        switch(generationType) {
            case GENERATION_MODE.CHARACTER:
            case GENERATION_MODE.FACE:
                return await selectBestTagForCharacter(candidates, originalTag);
                
            case GENERATION_MODE.NOW: // Last Message
            case GENERATION_MODE.RAW_LAST:
                return await selectBestTagForLastMessage(candidates, originalTag);
                
            case GENERATION_MODE.SCENARIO:
                return await selectBestTagForScenario(candidates, originalTag);
                
            default:
                return await selectBestTagGeneric(candidates, originalTag);
        }
    } catch (error) {
        if (extensionSettings.debug) {
            console.warn('Tag selection failed:', error);
        }
        return candidates[0] || originalTag; // Return first candidate or fallback to original
    }
}

// Tag selection for character/face generation (rich context)
async function selectBestTagForCharacter(candidates, originalTag) {
    const context = globalContext;
    const character = context.characters[context.characterId];
    
    if (!character) {
        return candidates[0];
    }

    const selectionPrompt = `Character: ${character.name}
Description: ${character.description.slice(0, 500)}

Which tag best describes this character: ${candidates.join(', ')}
Original tag: "${originalTag}"

Return only the best tag.`;

    const result = await globalContext.generateQuietPrompt(selectionPrompt, false, false);
    const trimmed = result.trim().toLowerCase();
    
    // Find exact match in candidates (case insensitive)
    const match = candidates.find(c => c.toLowerCase() === trimmed);
    return match || candidates[0];
}

// Tag selection for last message generation (limited context)
async function selectBestTagForLastMessage(candidates, originalTag) {
    const lastMessage = globalContext.getLastUsableMessage();
    
    if (!lastMessage || !lastMessage.mes) {
        return candidates[0];
    }

    const selectionPrompt = `Scene: "${lastMessage.mes.slice(0, 300)}"

Which tag best describes what's happening: ${candidates.join(', ')}
Original tag: "${originalTag}"

Return only the best tag.`;

    const result = await globalContext.generateQuietPrompt(selectionPrompt, false, false);
    const trimmed = result.trim().toLowerCase();
    
    // Find exact match in candidates (case insensitive)
    const match = candidates.find(c => c.toLowerCase() === trimmed);
    return match || candidates[0];
}

// Tag selection for scenario generation (medium context)
async function selectBestTagForScenario(candidates, originalTag) {
    const context = globalContext;
    const recentMessages = context.chat.slice(-5);
    
    if (!recentMessages || recentMessages.length === 0) {
        return candidates[0];
    }

    const conversationContext = recentMessages
        .map(msg => `${msg.name}: ${msg.mes}`)
        .join('\n')
        .slice(0, 500);

    const selectionPrompt = `Recent conversation context:
${conversationContext}

Which tag best fits this scenario: ${candidates.join(', ')}
Original tag: "${originalTag}"

Return only the best tag.`;

    const result = await globalContext.generateQuietPrompt(selectionPrompt, false, false);
    const trimmed = result.trim().toLowerCase();
    
    // Find exact match in candidates (case insensitive)
    const match = candidates.find(c => c.toLowerCase() === trimmed);
    return match || candidates[0];
}

// Generic tag selection fallback
async function selectBestTagGeneric(candidates, originalTag) {
    const selectionPrompt = `Which of these tags is most similar to "${originalTag}": ${candidates.join(', ')}

Return only the best tag.`;

    const result = await globalContext.generateQuietPrompt(selectionPrompt, false, false);
    const trimmed = result.trim().toLowerCase();
    
    // Find exact match in candidates (case insensitive)
    const match = candidates.find(c => c.toLowerCase() === trimmed);
    return match || candidates[0];
}

// Main tag correction function
async function correctTagsWithContext(prompt, generationType) {
    if (!extensionSettings.enabled) {
        return prompt;
    }

    // Split prompt into individual tags
    const tags = prompt.split(',').map(t => t.trim()).filter(t => t.length > 0);
    const correctedTags = [];
    
    // Get processing strategy based on generation type
    const strategy = getProcessingStrategy(generationType);
    
    if (extensionSettings.debug) {
        console.log(`Tag correction: ${tags.length} tags, strategy: ${strategy.strategy}, generation type: ${generationType}`);
    }

    // Process each tag individually
    for (const tag of tags) {
        try {
            // Skip tags that are likely weights/parameters (e.g., "(from_side:1.1)")
            if (tag.includes(':') && tag.includes('(')) {
                correctedTags.push(tag);
                continue;
            }

            const response = await searchTagCandidates(tag, strategy.candidateLimit);
            
            if (response.candidates && response.candidates.length > 0) {
                const bestTag = await selectBestTagWithContext(
                    response.candidates, 
                    tag, 
                    generationType
                );
                correctedTags.push(bestTag);
            } else {
                correctedTags.push(tag); // Fallback to original
            }
        } catch (error) {
            if (extensionSettings.debug) {
                console.warn('Tag processing failed for:', tag, error);
            }
            correctedTags.push(tag); // Always fallback to original
        }
    }
    
    const result = correctedTags.join(', ');
    
    if (extensionSettings.debug) {
        console.log('Tag correction result:', { original: prompt, corrected: result });
    }
    
    return result;
}

// Hook into SillyTavern's getPrompt function (where both prompt and generationType are available)
let originalGetPrompt = null;

function hookGetPrompt() {
    if (originalGetPrompt) {
        return; // Already hooked
    }

    originalGetPrompt = window.getPrompt;
    window.getPrompt = async function(generationType, message, trigger, quietPrompt, combineNegatives) {
        const originalPrompt = await originalGetPrompt.call(this, generationType, message, trigger, quietPrompt, combineNegatives);
        
        // Only process if extension is enabled and this is an image generation
        if (extensionSettings.enabled && originalPrompt && typeof originalPrompt === 'string') {
            try {
                return await correctTagsWithContext(originalPrompt, generationType);
            } catch (error) {
                if (extensionSettings.debug) {
                    console.warn('Tag correction failed:', error);
                }
                return originalPrompt; // Always fallback to original
            }
        }
        
        return originalPrompt;
    };
    
    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Hooked into getPrompt function');
    }
}

function unhookGetPrompt() {
    if (originalGetPrompt) {
        window.getPrompt = originalGetPrompt;
        originalGetPrompt = null;
        
        if (extensionSettings.debug) {
            console.log('Tag Autocompletion: Unhooked from getPrompt function');
        }
    }
}

// Extension lifecycle
function onExtensionEnabled() {
    hookGetPrompt();
}

function onExtensionDisabled() {
    unhookGetPrompt();
}

// Settings UI handlers
function onEnabledInput() {
    extensionSettings.enabled = $('#tag_autocomplete_enabled').prop('checked');
    saveSettings();
    
    if (extensionSettings.enabled) {
        onExtensionEnabled();
    } else {
        onExtensionDisabled();
    }
}

function onApiEndpointInput() {
    extensionSettings.apiEndpoint = $('#tag_autocomplete_api_endpoint').val().trim();
    saveSettings();
}

function onTimeoutInput() {
    const timeout = parseInt($('#tag_autocomplete_timeout').val());
    if (!isNaN(timeout) && timeout > 0) {
        extensionSettings.timeout = timeout;
        saveSettings();
    }
}

function onDebugInput() {
    extensionSettings.debug = $('#tag_autocomplete_debug').prop('checked');
    saveSettings();
}

// Test connection function
async function testConnection() {
    const button = $('#tag_autocomplete_test_btn');
    const status = $('#tag_autocomplete_test_status');
    
    button.prop('disabled', true).text('Testing...');
    status.removeClass('success_message warning_message').text('');
    
    try {
        const response = await fetch(`${extensionSettings.apiEndpoint}/search_tag`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: "blonde_hair",
                limit: 5
            }),
            signal: AbortSignal.timeout(extensionSettings.timeout)
        });

        if (response.ok) {
            const data = await response.json();
            status.addClass('success_message').text(`✓ Connection successful! Found ${data.candidates ? data.candidates.length : 0} candidates.`);
        } else {
            status.addClass('warning_message').text(`✗ API returned error: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        if (error.name === 'TimeoutError') {
            status.addClass('warning_message').text('✗ Connection timeout - check if the API server is running');
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            status.addClass('warning_message').text('✗ Cannot connect to API - check endpoint URL and server status');
        } else {
            status.addClass('warning_message').text(`✗ Connection failed: ${error.message}`);
        }
    } finally {
        button.prop('disabled', false).text('Test Connection');
    }
}

// Load the extension settings HTML
async function loadExtensionHTML() {
    const settingsHtml = `
    <div id="tag_autocomplete_settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Tag Autocompletion</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="flex-container">
                    <label class="checkbox_label" for="tag_autocomplete_enabled">
                        <input id="tag_autocomplete_enabled" type="checkbox" />
                        <small>Enable Tag Autocompletion</small>
                    </label>
                </div>
                <div class="flex-container">
                    <label for="tag_autocomplete_api_endpoint">
                        <small>API Endpoint</small>
                    </label>
                    <input id="tag_autocomplete_api_endpoint" class="text_pole" type="text" placeholder="http://localhost:8000" />
                </div>
                <div class="flex-container">
                    <label for="tag_autocomplete_timeout">
                        <small>Timeout (ms)</small>
                    </label>
                    <input id="tag_autocomplete_timeout" class="text_pole" type="number" min="1000" max="30000" step="1000" />
                </div>
                <div class="flex-container">
                    <label class="checkbox_label" for="tag_autocomplete_debug">
                        <input id="tag_autocomplete_debug" type="checkbox" />
                        <small>Debug Mode</small>
                    </label>
                </div>
                <div class="flex-container">
                    <button id="tag_autocomplete_test_btn" class="menu_button" type="button">Test Connection</button>
                </div>
                <div class="flex-container">
                    <small id="tag_autocomplete_test_status"></small>
                </div>
                <small class="notes">
                    <strong>Note:</strong> This extension requires a running Tag Autocompletion API server. 
                    The extension will automatically correct Danbooru tags in image generation prompts using context-aware selection.
                </small>
            </div>
        </div>
    </div>
    `;
    
    $('#extensions_settings2').append(settingsHtml);
    
    // Set up event handlers
    $('#tag_autocomplete_enabled').on('input', onEnabledInput);
    $('#tag_autocomplete_api_endpoint').on('input', onApiEndpointInput);
    $('#tag_autocomplete_timeout').on('input', onTimeoutInput);
    $('#tag_autocomplete_debug').on('input', onDebugInput);
    $('#tag_autocomplete_test_btn').on('click', testConnection);
    
    // Load current settings into UI
    $('#tag_autocomplete_enabled').prop('checked', extensionSettings.enabled);
    $('#tag_autocomplete_api_endpoint').val(extensionSettings.apiEndpoint);
    $('#tag_autocomplete_timeout').val(extensionSettings.timeout);
    $('#tag_autocomplete_debug').prop('checked', extensionSettings.debug);
}

// Extension initialization
const init = async () => {
    try {
        // Load settings
        loadSettings();
        
        // Load extension HTML
        await loadExtensionHTML();
        
        // Enable extension if it was enabled previously
        if (extensionSettings.enabled) {
            onExtensionEnabled();
        }
        
        console.log('Tag Autocompletion extension loaded successfully');
    } catch (error) {
        console.error('Tag Autocompletion: Failed to initialize extension:', error);
    }
};

// Initialize the extension
await init();