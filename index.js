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
    candidateLimit: 20,
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
            return { candidateLimit: 10, strategy: 'fast' }; // Limited context = fewer candidates
        case GENERATION_MODE.CHARACTER: // 'you' - Character
        case GENERATION_MODE.FACE: // 'face' - Portrait
        case GENERATION_MODE.USER: // 'me' - User
        case GENERATION_MODE.CHARACTER_MULTIMODAL:
        case GENERATION_MODE.USER_MULTIMODAL:
        case GENERATION_MODE.FACE_MULTIMODAL:
            return { candidateLimit: 20, strategy: 'comprehensive' }; // Rich character context = more options
        case GENERATION_MODE.SCENARIO: // 'scene' - Scenario
            return { candidateLimit: 15, strategy: 'balanced' }; // Medium context = balanced
        case GENERATION_MODE.BACKGROUND: // 'background' - Background
            return { candidateLimit: 12, strategy: 'environmental' }; // Environmental focus = fewer candidates
        case GENERATION_MODE.FREE:
        case GENERATION_MODE.FREE_EXTENDED:
            return { candidateLimit: 20, strategy: 'free' }; // Free mode = flexible
        default:
            return { candidateLimit: 15, strategy: 'default' };
    }
}

// Generate fallback search terms using LLM
async function generateFallbackTerms(originalTag) {
    const prompt = `For the tag "${originalTag}", generate 3-5 simpler search terms that might find related tags.

Examples:
- "led_lighting" → lighting, light, illumination
- "metal_chair" → chair, seat, furniture
- "steel_walls" → walls, wall, steel
- "oversized_clothing" → clothing, clothes, oversized

IMPORTANT: Return ONLY a comma-separated list of words. No quotes, brackets, notes, or explanations.`;

    try {
        const result = await globalContext.generateQuietPrompt(prompt, false, false);
        const terms = result.trim()
            .split(/[,\n]/)
            .map(term => term.trim().replace(/['"()\[\]*]/g, ''))
            .filter(term => term.length > 0 && term !== originalTag && !term.includes('Note:') && !term.includes('derived'));
        
        console.log(`[TAG-AUTO] Generated fallback terms for "${originalTag}":`, terms);
        
        return terms;
    } catch (error) {
        if (extensionSettings.debug) {
            console.warn('Failed to generate fallback terms:', error);
        }
        return [];
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

// Evaluate if current fallback candidates are sufficient to represent the original
async function evaluateFallbackSufficiency(originalTag, candidates) {
    const prompt = `Original compound tag: "${originalTag}"
Current candidates found: ${candidates.join(', ')}

Question: Can you find ALL the core components of the original compound tag among these candidates?

For "${originalTag}", you MUST find:
${originalTag.includes('_') ? 
    `- Component 1: "${originalTag.split('_')[0]}" or similar (REQUIRED)
- Component 2: "${originalTag.split('_')[1]}" or similar (REQUIRED)` :
    `- Any candidates that closely match the original meaning`
}

Answer YES ONLY if you can find ALL required components among the candidates.
Answer NO if ANY component is missing.

Examples:
- "steel_walls" with candidates ["steel", "wall", "pokemon"] → YES (steel + wall both found)
- "padded_room" with candidates ["padded jacket", "padded walls"] → NO (padded found, but room missing)
- "padded_room" with candidates ["padded walls", "room"] → YES (padded + room both found)
- "ceiling_hatch" with candidates ["ceiling", "wallet"] → NO (ceiling found, but hatch missing)

Answer ONLY "YES" or "NO".`;

    try {
        const result = await globalContext.generateQuietPrompt(prompt, false, false);
        const answer = result.trim().toUpperCase();
        
        console.log(`[TAG-AUTO] LLM sufficiency evaluation for "${originalTag}": ${answer}`);
        
        return answer === 'YES';
    } catch (error) {
        console.warn('[TAG-AUTO] Failed to evaluate sufficiency (LLM error):', error);
        // Fallback: if we have 2+ candidates, assume they're sufficient to avoid infinite loops
        return candidates.length >= 2;
    }
}

// Evaluate if search results are good quality using LLM
async function evaluateSearchResults(originalTag, candidates) {
    if (!candidates || candidates.length === 0) {
        return false;
    }
    
    const prompt = `Original tag: "${originalTag}"
Search results: ${candidates.join(', ')}

Are these search results good quality matches for the original tag? 

For compound tags like "${originalTag}", check if the results preserve the FULL meaning:
${originalTag.includes('_') ? 
    `- Do any results contain or represent "${originalTag.split('_')[0]}"? 
- Do any results contain or represent "${originalTag.split('_')[1]}"?
- For compound tags, BOTH components should be represented.` :
    `- Do the results preserve the original meaning?`
}

For single-word tags, one excellent match is sufficient.
For compound tags, BOTH components should be represented among the candidates.

Answer ONLY "YES" if the results adequately represent the full original meaning, or ONLY "NO" if key components are missing.`;

    try {
        const result = await globalContext.generateQuietPrompt(prompt, false, false);
        const answer = result.trim().toUpperCase();
        
        console.log(`[TAG-AUTO] LLM evaluation for "${originalTag}" with candidates [${candidates.join(', ')}]: ${answer}`);
        
        return answer === 'YES';
    } catch (error) {
        console.warn('[TAG-AUTO] Failed to evaluate search results (LLM error):', error);
        // Fallback: assume results are poor if LLM fails, trigger fallback search
        return false;
    }
}

// Enhanced search with LLM-evaluated fallback terms
async function searchTagCandidatesWithFallback(originalTag, limit = 5) {
    // Try original search first
    let result = await searchTagCandidates(originalTag, limit);
    
    // Skip LLM evaluation if we have exact/near-exact matches
    if (result.candidates && result.candidates.length > 0) {
        const normalizedOriginal = originalTag.toLowerCase().replace(/[_\s]/g, '');
        const hasExactMatch = result.candidates.some(candidate => 
            candidate.toLowerCase().replace(/[_\s]/g, '') === normalizedOriginal
        );
        
        if (hasExactMatch) {
            console.log(`[TAG-AUTO] Found exact match for "${originalTag}" - skipping LLM evaluation`);
            return result;
        }
    }
    
    // Let LLM evaluate if results are good quality
    const resultsAreGood = await evaluateSearchResults(originalTag, result.candidates);
    
    if (resultsAreGood) {
        console.log(`[TAG-AUTO] LLM says results are GOOD for "${originalTag}" - using original results`);
        return result;
    }
    
    console.log(`[TAG-AUTO] LLM says results are POOR for "${originalTag}" - generating fallback terms`);
    
    // Generate LLM-powered fallback terms
    const fallbackTerms = await generateFallbackTerms(originalTag);
    
    // Collect all fallback results
    let allFallbackCandidates = [];
    
    // Try each fallback term and collect all results
    for (const fallbackTerm of fallbackTerms) {
        console.log(`[TAG-AUTO] Trying fallback term "${fallbackTerm}"`);
        
        const fallbackResult = await searchTagCandidates(fallbackTerm, limit);
        
        if (fallbackResult.candidates && fallbackResult.candidates.length > 0) {
            console.log(`[TAG-AUTO] Found ${fallbackResult.candidates.length} candidates with fallback term "${fallbackTerm}": [${fallbackResult.candidates.join(', ')}]`);
            allFallbackCandidates.push(...fallbackResult.candidates);
            
            // Ask LLM if current candidates are sufficient to represent the original
            if (allFallbackCandidates.length >= 2) {
                const isSufficient = await evaluateFallbackSufficiency(originalTag, allFallbackCandidates);
                if (isSufficient) {
                    console.log(`[TAG-AUTO] LLM says current candidates are sufficient for "${originalTag}" - stopping search`);
                    console.log(`[TAG-AUTO] Final sufficient candidates: [${allFallbackCandidates.join(', ')}]`);
                    break;
                }
            }
        }
    }
    
    if (allFallbackCandidates.length > 0) {
        // Remove duplicates and limit
        const uniqueCandidates = [...new Set(allFallbackCandidates)].slice(0, limit);
        
        console.log(`[TAG-AUTO] Using ${allFallbackCandidates.length} fallback candidates (discarding original poor results)`);
        
        return {
            query: originalTag,
            candidates: uniqueCandidates,
            fallbackTerms: fallbackTerms
        };
    }
    
    // Return original result even if poor
    return result;
}

// Helper function to parse LLM tag selection response
function parseLLMTagSelection(result, candidates) {
    const trimmed = result.trim().toLowerCase();
    
    // Handle multiple tags (comma-separated)
    if (trimmed.includes(',')) {
        const selectedTags = trimmed.split(',')
            .map(tag => tag.trim())
            .map(tag => candidates.find(c => c.toLowerCase() === tag))
            .filter(tag => tag !== undefined);
        
        if (selectedTags.length > 0) {
            return selectedTags.join(', ');
        }
    }
    
    // Single tag match
    const match = candidates.find(c => c.toLowerCase() === trimmed);
    return match || candidates[0];
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

Choose the best tag(s) that match "${originalTag}" from these candidates: ${candidates.join(', ')}

IMPORTANT GUIDELINES:
- Preserve as much detail and meaning from the original tag as possible
- Do NOT add descriptors not present in the original (e.g., don't add skin colors, ethnicities, etc.)
- Prefer tags that keep modifiers and specific details (e.g., "steel_walls" vs just "walls")
- Avoid completely unrelated tags
- For compound terms (like "ceiling_hatch", "steel_room"), you SHOULD return multiple tags if together they preserve more meaning than any single tag (e.g., "ceiling, hatch" is better than just "ceiling")
- Only return one tag if a single candidate captures the full meaning well

Return the best tag or tags (comma-separated if multiple).`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Character selection prompt:', selectionPrompt);
    }

    const result = await globalContext.generateQuietPrompt(selectionPrompt, false, false);
    return parseLLMTagSelection(result, candidates);
}

// Tag selection for last message generation (limited context)
async function selectBestTagForLastMessage(candidates, originalTag) {
    const context = globalContext;
    const lastMessage = context.chat && context.chat.length > 0 ? context.chat[context.chat.length - 1] : null;
    
    if (!lastMessage || !lastMessage.mes) {
        return candidates[0];
    }

    const selectionPrompt = `Scene: "${lastMessage.mes}"

Choose the best tag(s) that match "${originalTag}" from these candidates: ${candidates.join(', ')}

IMPORTANT GUIDELINES:
- Preserve the original tag's meaning and detail level
- Do NOT add descriptors not in the original tag
- Keep specific modifiers when possible (e.g., "led_lighting" vs just "lighting")
- Avoid nonsensical or unrelated suggestions
- For compound terms, you SHOULD return multiple tags if together they preserve more meaning than any single tag
- Choose the most semantically similar option(s)

Return the best tag or tags (comma-separated if multiple).`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Last message selection prompt:', selectionPrompt);
    }

    const result = await globalContext.generateQuietPrompt(selectionPrompt, false, false);
    return parseLLMTagSelection(result, candidates);
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

Choose the best tag(s) that match "${originalTag}" from these candidates: ${candidates.join(', ')}

IMPORTANT GUIDELINES:
- Preserve the original tag's specific meaning and details
- Do NOT add new descriptors not present in the original
- Maintain the same level of specificity (e.g., "steel_ceiling" vs just "ceiling")
- Avoid tags that change the fundamental meaning
- For compound terms, you SHOULD return multiple tags if together they preserve more meaning than any single tag
- Select the most semantically similar match(es)

Return the best tag or tags (comma-separated if multiple).`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Scenario selection prompt:', selectionPrompt);
    }

    const result = await globalContext.generateQuietPrompt(selectionPrompt, false, false);
    return parseLLMTagSelection(result, candidates);
}

// Generic tag selection fallback
async function selectBestTagGeneric(candidates, originalTag) {
    const selectionPrompt = `Choose the best tag(s) that match "${originalTag}" from these candidates: ${candidates.join(', ')}

IMPORTANT GUIDELINES:
- Select the tag(s) that preserve the most meaning from the original
- Do NOT choose tags that add descriptors not in the original
- Prefer tags that maintain specific details and modifiers
- Avoid completely unrelated or nonsensical matches (ignore character names, anime references, etc.)
- For compound terms like "padded_room", you SHOULD return multiple relevant tags like "padded walls, room" rather than unrelated items
- Choose based on semantic similarity to the ORIGINAL CONCEPT, not just word overlap

EXAMPLES:
- "padded_room" with candidates ["padded jacket", "padded walls", "room"] → "padded walls, room"
- "steel_chair" with candidates ["steel", "chair", "dental chair"] → "steel, chair" or "dental chair"

Return the best tag or tags (comma-separated if multiple).`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Generic selection prompt:', selectionPrompt);
    }

    const result = await globalContext.generateQuietPrompt(selectionPrompt, false, false);
    return parseLLMTagSelection(result, candidates);
}

// Tag selection for user character generation (/sd me - USER mode)
async function selectBestTagForUser(candidates, originalTag) {
    const context = globalContext;
    const userName = context.name1 || 'User';
    
    const selectionPrompt = `User: ${userName} (human user/player character)
Context: Describing the human user in the scene

Choose the best tag(s) that match "${originalTag}" from these candidates: ${candidates.join(', ')}

IMPORTANT GUIDELINES:
- Preserve the original tag's meaning and specificity
- Do NOT add descriptors not present in the original
- Keep detailed modifiers when available (e.g., "oversized_clothing" vs just "clothing")
- Avoid unrelated or nonsensical suggestions
- For compound terms, you SHOULD return multiple tags if together they preserve more meaning than any single tag
- Focus on semantic similarity to the original

Return the best tag or tags (comma-separated if multiple).`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: User character selection prompt:', selectionPrompt);
    }

    const result = await globalContext.generateQuietPrompt(selectionPrompt, false, false);
    return parseLLMTagSelection(result, candidates);
}


// Tag selection for background generation (/sd background - BACKGROUND mode)
async function selectBestTagForBackground(candidates, originalTag) {
    const context = globalContext;
    const character = context.characters[context.characterId];
    
    const selectionPrompt = `Background/Environment generation
Setting: ${character ? character.scenario || 'General setting' : 'Background environment'}

Choose the best tag(s) that match "${originalTag}" from these candidates: ${candidates.join(', ')}

IMPORTANT GUIDELINES:
- Preserve the original tag's environmental details and specificity
- Do NOT add descriptors not in the original tag
- Maintain specific environmental details (e.g., "led_lighting" vs just "lighting")
- Focus on backgrounds, environments, lighting, and atmospheric elements
- For compound environmental terms, you SHOULD return multiple tags if together they preserve more meaning than any single tag
- Avoid nonsensical or unrelated environmental tags

Return the best tag or tags (comma-separated if multiple).`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Background selection prompt:', selectionPrompt);
    }

    const result = await globalContext.generateQuietPrompt(selectionPrompt, false, false);
    return parseLLMTagSelection(result, candidates);
}

// Main tag correction function
async function correctTagsWithContext(prompt, generationType) {
    console.log('[TAG-AUTO] Extension enabled check:', extensionSettings.enabled);
    
    if (!extensionSettings.enabled) {
        console.log('[TAG-AUTO] Extension disabled, returning original prompt');
        return prompt;
    }

    console.log('[TAG-AUTO] Starting tag correction...');
    console.log('[TAG-AUTO] Original prompt:', prompt);
    console.log('[TAG-AUTO] Generation type:', generationType);

    // Split prompt into individual tags
    const tags = prompt.split(',').map(t => t.trim()).filter(t => t.length > 0);
    const correctedTags = [];
    
    // Get processing strategy based on generation type
    // const strategy = getProcessingStrategy(generationType);
    const strategy = getProcessingStrategy();
    
    console.log(`[TAG-AUTO] Processing ${tags.length} tags, strategy: ${strategy.strategy}, generation type: ${generationType}`);
    console.log('[TAG-AUTO] Tags to process:', tags);

    // Process each tag individually
    for (const tag of tags) {
        try {
            console.log(`[TAG-AUTO] Processing tag: "${tag}"`);
            
            // Skip metadata tags in brackets (e.g., "[ASPECT:wide]", "[RESOLUTION:1024x1024]")
            if (tag.startsWith('[') && tag.endsWith(']')) {
                console.log(`[TAG-AUTO] Skipping metadata tag: "${tag}"`);
                correctedTags.push(tag);
                continue;
            }
            
            // Handle mixed metadata + tag (e.g., "[ASPECT:square] padded_room")
            if (tag.includes('[') && tag.includes(']')) {
                const metadataMatch = tag.match(/(\[.*?\])\s*(.+)/);
                if (metadataMatch) {
                    const [, metadata, actualTag] = metadataMatch;
                    console.log(`[TAG-AUTO] Processing mixed tag: metadata="${metadata}" tag="${actualTag}"`);
                    
                    // Process the actual tag part
                    const response = await searchTagCandidatesWithFallback(actualTag, strategy.candidateLimit);
                    
                    if (response.candidates && response.candidates.length > 0) {
                        console.log(`[TAG-AUTO] API returned ${response.candidates.length} candidates for "${actualTag}": [${response.candidates.join(', ')}]`);
                        
                        const bestTag = await selectBestTagWithContext(
                            response.candidates, 
                            actualTag, 
                            generationType
                        );
                        
                        console.log(`[TAG-AUTO] LLM selected best tag for "${actualTag}": "${bestTag}"`);
                        correctedTags.push(`${metadata} ${bestTag}`); // Recombine with metadata
                    } else {
                        console.log(`[TAG-AUTO] No candidates found for "${actualTag}", keeping original`);
                        correctedTags.push(tag);
                    }
                    continue;
                }
            }
            
            // Skip tags that are likely weights/parameters (e.g., "(from_side:1.1)")
            if (tag.includes(':') && tag.includes('(')) {
                console.log(`[TAG-AUTO] Skipping parameter tag: "${tag}"`);
                correctedTags.push(tag);
                continue;
            }

            const response = await searchTagCandidatesWithFallback(tag, strategy.candidateLimit);
            
            if (response.candidates && response.candidates.length > 0) {
                console.log(`[TAG-AUTO] API returned ${response.candidates.length} candidates for "${tag}": [${response.candidates.join(', ')}]`);
                
                const bestTag = await selectBestTagWithContext(
                    response.candidates, 
                    tag, 
                    generationType
                );
                
                console.log(`[TAG-AUTO] LLM selected best tag for "${tag}": "${bestTag}"`);
                correctedTags.push(bestTag);
            } else {
                console.log(`[TAG-AUTO] No candidates found for "${tag}", keeping original`);
                correctedTags.push(tag); // Fallback to original
            }
        } catch (error) {
            console.warn(`[TAG-AUTO] Tag processing failed for "${tag}":`, error);
            correctedTags.push(tag); // Always fallback to original
        }
    }
    
    const result = correctedTags.join(', ');
    
    console.log('[TAG-AUTO] Tag correction completed!');
    console.log('[TAG-AUTO] FINAL RESULT:', result);
    
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
                console.log('[TAG-AUTO] SD prompt processing event triggered');
                console.log('[TAG-AUTO] Original prompt length:', data.prompt?.length || 0);
                console.log('[TAG-AUTO] Generation type:', data.generationType);
                
                if (extensionSettings.enabled && data.prompt) {
                    try {
                        const corrected = await correctTagsWithContext(data.prompt, data.generationType);
                        data.prompt = corrected;
                        
                        console.log('[TAG-AUTO] Prompt correction complete!');
                    } catch (error) {
                        console.warn('[TAG-AUTO] Error during correction:', error);
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