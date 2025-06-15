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
    CHARACTER: 0,     // 'you' - Character ("Yourself")
    USER: 1,          // 'me' - User ("Me") 
    SCENARIO: 2,      // 'scene' - Scenario ("The Whole Story")
    RAW_LAST: 3,      // 'raw_last' - Raw Last Message
    NOW: 4,           // 'last' - Last Message
    FACE: 5,          // 'face' - Portrait ("Your Face")
    FREE: 6,          // Default when no trigger matches
    BACKGROUND: 7,    // 'background' - Background
    CHARACTER_MULTIMODAL: 8,
    USER_MULTIMODAL: 9,
    FACE_MULTIMODAL: 10,
    FREE_EXTENDED: 11
};

// Processing strategy based on generation type
function getProcessingStrategy(generationType) {
    switch(generationType) {
        case GENERATION_MODE.NOW: // Last Message
        case GENERATION_MODE.RAW_LAST:
            return { candidateLimit: 3, strategy: 'fast' }; // Limited context = fewer candidates
        case GENERATION_MODE.CHARACTER: // 'you' - Character
        case GENERATION_MODE.FACE: // 'face' - Portrait
        case GENERATION_MODE.USER: // 'me' - User
        case GENERATION_MODE.CHARACTER_MULTIMODAL:
        case GENERATION_MODE.USER_MULTIMODAL:
        case GENERATION_MODE.FACE_MULTIMODAL:
            return { candidateLimit: 5, strategy: 'comprehensive' }; // Rich character context = more options
        case GENERATION_MODE.SCENARIO: // 'scene' - Scenario
            return { candidateLimit: 4, strategy: 'balanced' }; // Medium context = balanced
        case GENERATION_MODE.BACKGROUND: // 'background' - Background
            return { candidateLimit: 3, strategy: 'environmental' }; // Environmental focus = fewer candidates
        case GENERATION_MODE.FREE:
        case GENERATION_MODE.FREE_EXTENDED:
            return { candidateLimit: 5, strategy: 'free' }; // Free mode = flexible
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
            case GENERATION_MODE.CHARACTER: // 'you' - Character ("Yourself") - AI character
            case GENERATION_MODE.FACE: // 'face' - Portrait - AI character face
            case GENERATION_MODE.CHARACTER_MULTIMODAL:
            case GENERATION_MODE.FACE_MULTIMODAL:
                return await selectBestTagForCharacter(candidates, originalTag);
                
            case GENERATION_MODE.USER: // 'me' - User ("Me") - Human user
            case GENERATION_MODE.USER_MULTIMODAL:
                return await selectBestTagForUser(candidates, originalTag);
                
            case GENERATION_MODE.NOW: // 'last' - Last Message
            case GENERATION_MODE.RAW_LAST: // 'raw_last' - Raw Last Message
                return await selectBestTagForLastMessage(candidates, originalTag);
                
            case GENERATION_MODE.SCENARIO: // 'scene' - Scenario ("The Whole Story")
                return await selectBestTagForScenario(candidates, originalTag);
                
            case GENERATION_MODE.BACKGROUND: // 'background' - Background
                return await selectBestTagForBackground(candidates, originalTag);
                
            case GENERATION_MODE.FREE:
            case GENERATION_MODE.FREE_EXTENDED:
                return await selectBestTagGeneric(candidates, originalTag);
                
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

// Tag selection for AI character/face generation (/sd you - CHARACTER mode)
async function selectBestTagForCharacter(candidates, originalTag) {
    const context = globalContext;
    const character = context.characters[context.characterId];
    
    if (!character) {
        return candidates[0];
    }

    const selectionPrompt = `Character: ${character.name}
Description: ${character.description}

Choose the tag that best matches "${originalTag}" from these candidates: ${candidates.join(', ')}

IMPORTANT GUIDELINES:
- Preserve as much detail and meaning from the original tag as possible
- Do NOT add descriptors not present in the original (e.g., don't add skin colors, ethnicities, etc.)
- Prefer tags that keep modifiers and specific details (e.g., "steel_walls" vs just "walls")
- Avoid completely unrelated tags
- If no tag is a good match, choose the closest one

Return only the best tag.`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Character selection prompt:', selectionPrompt);
    }

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

    const selectionPrompt = `Scene: "${lastMessage.mes}"

Choose the tag that best matches "${originalTag}" from these candidates: ${candidates.join(', ')}

IMPORTANT GUIDELINES:
- Preserve the original tag's meaning and detail level
- Do NOT add descriptors not in the original tag
- Keep specific modifiers when possible (e.g., "led_lighting" vs just "lighting")
- Avoid nonsensical or unrelated suggestions
- Choose the most semantically similar option

Return only the best tag.`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Last message selection prompt:', selectionPrompt);
    }

    const result = await globalContext.generateQuietPrompt(selectionPrompt, false, false);
    const trimmed = result.trim().toLowerCase();
    
    // Find exact match in candidates (case insensitive)
    const match = candidates.find(c => c.toLowerCase() === trimmed);
    return match || candidates[0];
}

// Tag selection for scenario generation (/sd world - SCENARIO mode)
async function selectBestTagForScenario(candidates, originalTag) {
    const context = globalContext;
    const recentMessages = context.chat.slice(-5);
    
    if (!recentMessages || recentMessages.length === 0) {
        return candidates[0];
    }

    const conversationContext = recentMessages
        .map(msg => `${msg.name}: ${msg.mes}`)
        .join('\n');

    const selectionPrompt = `Recent conversation context:
${conversationContext}

Choose the tag that best matches "${originalTag}" from these candidates: ${candidates.join(', ')}

IMPORTANT GUIDELINES:
- Preserve the original tag's specific meaning and details
- Do NOT add new descriptors not present in the original
- Maintain the same level of specificity (e.g., "steel_ceiling" vs just "ceiling")
- Avoid tags that change the fundamental meaning
- Select the most semantically similar match

Return only the best tag.`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Scenario selection prompt:', selectionPrompt);
    }

    const result = await globalContext.generateQuietPrompt(selectionPrompt, false, false);
    const trimmed = result.trim().toLowerCase();
    
    // Find exact match in candidates (case insensitive)
    const match = candidates.find(c => c.toLowerCase() === trimmed);
    return match || candidates[0];
}

// Generic tag selection fallback
async function selectBestTagGeneric(candidates, originalTag) {
    const selectionPrompt = `Choose the tag that best matches "${originalTag}" from these candidates: ${candidates.join(', ')}

IMPORTANT GUIDELINES:
- Select the tag that preserves the most meaning from the original
- Do NOT choose tags that add descriptors not in the original
- Prefer tags that maintain specific details and modifiers
- Avoid completely unrelated or nonsensical matches
- Choose based on semantic similarity, not just word overlap

Return only the best tag.`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Generic selection prompt:', selectionPrompt);
    }

    const result = await globalContext.generateQuietPrompt(selectionPrompt, false, false);
    const trimmed = result.trim().toLowerCase();
    
    // Find exact match in candidates (case insensitive)
    const match = candidates.find(c => c.toLowerCase() === trimmed);
    return match || candidates[0];
}

// Tag selection for user character generation (/sd me - USER mode)
async function selectBestTagForUser(candidates, originalTag) {
    const context = globalContext;
    const userName = context.name1 || 'User';
    
    const selectionPrompt = `User: ${userName} (human user/player character)
Context: Describing the human user in the scene

Choose the tag that best matches "${originalTag}" from these candidates: ${candidates.join(', ')}

IMPORTANT GUIDELINES:
- Preserve the original tag's meaning and specificity
- Do NOT add descriptors not present in the original
- Keep detailed modifiers when available (e.g., "oversized_clothing" vs just "clothing")
- Avoid unrelated or nonsensical suggestions
- Focus on semantic similarity to the original

Return only the best tag.`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: User character selection prompt:', selectionPrompt);
    }

    const result = await globalContext.generateQuietPrompt(selectionPrompt, false, false);
    const trimmed = result.trim().toLowerCase();
    
    // Find exact match in candidates (case insensitive)
    const match = candidates.find(c => c.toLowerCase() === trimmed);
    return match || candidates[0];
}


// Tag selection for background generation (/sd background - BACKGROUND mode)
async function selectBestTagForBackground(candidates, originalTag) {
    const context = globalContext;
    const character = context.characters[context.characterId];
    
    const selectionPrompt = `Background/Environment generation
Setting: ${character ? character.scenario || 'General setting' : 'Background environment'}

Choose the tag that best matches "${originalTag}" from these candidates: ${candidates.join(', ')}

IMPORTANT GUIDELINES:
- Preserve the original tag's environmental details and specificity
- Do NOT add descriptors not in the original tag
- Maintain specific environmental details (e.g., "led_lighting" vs just "lighting")
- Focus on backgrounds, environments, lighting, and atmospheric elements
- Avoid nonsensical or unrelated environmental tags

Return only the best tag.`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Background selection prompt:', selectionPrompt);
    }

    const result = await globalContext.generateQuietPrompt(selectionPrompt, false, false);
    const trimmed = result.trim().toLowerCase();
    
    // Find exact match in candidates (case insensitive)
    const match = candidates.find(c => c.toLowerCase() === trimmed);
    return match || candidates[0];
}

// Main tag correction function
async function correctTagsWithContext(prompt, generationType) {
    console.log('Tag Autocompletion: Debug mode check - extensionSettings.debug:', extensionSettings.debug);
    console.log('Tag Autocompletion: Extension enabled check - extensionSettings.enabled:', extensionSettings.enabled);
    
    if (!extensionSettings.enabled) {
        if (extensionSettings.debug) {
            console.log('Tag Autocompletion: Extension disabled, returning original prompt');
        }
        return prompt;
    }

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Starting tag correction...');
        console.log('Tag Autocompletion: Original prompt:', prompt);
        console.log('Tag Autocompletion: Generation type:', generationType);
    }

    // Split prompt into individual tags
    const tags = prompt.split(',').map(t => t.trim()).filter(t => t.length > 0);
    const correctedTags = [];
    
    // Get processing strategy based on generation type
    // const strategy = getProcessingStrategy(generationType);
    const strategy = getProcessingStrategy();
    
    if (extensionSettings.debug) {
        console.log(`Tag correction: ${tags.length} tags, strategy: ${strategy.strategy}, generation type: ${generationType}`);
        console.log('Tags to process:', tags);
    }

    // Process each tag individually
    for (const tag of tags) {
        try {
            // Skip metadata tags in brackets (e.g., "[ASPECT:wide]", "[RESOLUTION:1024x1024]")
            if (tag.startsWith('[') && tag.endsWith(']')) {
                correctedTags.push(tag);
                continue;
            }
            
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

// Hook into SillyTavern's image generation pipeline
let originalGetPrompt = null;
let originalGeneratePicture = null;

function hookImageGeneration() {
    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Setting up clean event hooks...');
    }

    function setupEventHook() {
        const context = window.SillyTavern?.getContext();
        const eventSource = context?.eventSource;
        
        if (eventSource) {
            eventSource.on('sd_prompt_processing', async (data) => {
                if (extensionSettings.debug) {
                    console.log('Tag Autocompletion: SD prompt processing event triggered');
                    console.log('Tag Autocompletion: Original prompt:', data.prompt?.slice(0, 100) + '...');
                    console.log('Tag Autocompletion: Generation type:', data.generationType);
                }
                
                if (extensionSettings.enabled && data.prompt) {
                    try {
                        const corrected = await correctTagsWithContext(data.prompt, data.generationType);
                        data.prompt = corrected;
                        
                        if (extensionSettings.debug) {
                            console.log('Tag Autocompletion: Corrected prompt:', corrected.slice(0, 100) + '...');
                        }
                    } catch (error) {
                        if (extensionSettings.debug) {
                            console.warn('Tag Autocompletion: Error during correction:', error);
                        }
                    }
                }
            });
            
            if (extensionSettings.debug) {
                console.log('Tag Autocompletion: Successfully hooked into SD prompt processing event');
            }
            return true;
        }
        return false;
    }

    // Try to setup hook immediately
    if (!setupEventHook()) {
        if (extensionSettings.debug) {
            console.log('Tag Autocompletion: EventSource not available yet, waiting...');
        }
        
        // Wait for eventSource to become available
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        const interval = setInterval(() => {
            attempts++;
            if (setupEventHook()) {
                clearInterval(interval);
                if (extensionSettings.debug) {
                    console.log(`Tag Autocompletion: EventSource found after ${attempts * 100}ms`);
                }
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                if (extensionSettings.debug) {
                    console.warn('Tag Autocompletion: EventSource still not available after 5 seconds');
                }
            }
        }, 100);
    }
}

function unhookImageGeneration() {
    if (originalGetPrompt) {
        window.getPrompt = originalGetPrompt;
        originalGetPrompt = null;
        
        if (extensionSettings.debug) {
            console.log('Tag Autocompletion: Unhooked from getPrompt function');
        }
    }
    
    if (originalGeneratePicture) {
        window.generatePicture = originalGeneratePicture;
        originalGeneratePicture = null;
        
        if (extensionSettings.debug) {
            console.log('Tag Autocompletion: Unhooked from generatePicture function');
        }
    }
}

// Extension lifecycle
function onExtensionEnabled() {
    hookImageGeneration();
}

function onExtensionDisabled() {
    unhookImageGeneration();
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
        
        // Delay hook setup to ensure functions are available
        setTimeout(() => {
            // Add debugging for function availability
            if (extensionSettings.debug) {
                console.log('Tag Autocompletion: Available window functions:', Object.keys(window).filter(key => 
                    typeof window[key] === 'function' && 
                    (key.toLowerCase().includes('prompt') || key.toLowerCase().includes('picture') || key.toLowerCase().includes('generate'))
                ));
                console.log('Tag Autocompletion: getPrompt type:', typeof window.getPrompt);
                console.log('Tag Autocompletion: generatePicture type:', typeof window.generatePicture);
            }
            
            // Enable extension if it was enabled previously
            if (extensionSettings.enabled) {
                onExtensionEnabled();
            }
        }, 1000); // Wait 1 second for all functions to be loaded
        
        console.log('Tag Autocompletion extension loaded successfully');
    } catch (error) {
        console.error('Tag Autocompletion: Failed to initialize extension:', error);
    }
};

// Initialize the extension
await init();