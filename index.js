// Tag Autocompletion Extension for SillyTavern
// Implements Danbooru tag validation and correction for improved LLM-generated image prompts

const extensionName = 'SillyTavern-Tag-Autocompletion';
const globalContext = SillyTavern.getContext();

// Extension settings will be initialized in loadSettings()
let extensionSettings = {};
const defaultSettings = {
    enabled: false,
    apiEndpoint: 'http://localhost:8000',
    timeout: 30000, // Increased to 30 seconds
    candidateLimit: 20,
    debug: false
};

// Profile management constants
const REQUIRED_PROFILE_NAME = 'tag_autocompletion';
let profileCheckPassed = false;
let profileSwitchInProgress = false;

// LLM operation tracking
let activeLLMOperations = new Set();
let llmOperationCounter = 0;
const activeAbortControllers = new Map(); // operationId -> AbortController

// Emergency reset function for stuck operations
function resetProfileSwitchState() {
    console.log('[TAG-AUTO] Emergency reset of profile switch state');
    profileSwitchInProgress = false;
}

function resetAllOperations() {
    console.log('[TAG-AUTO] Emergency reset of all operations');
    profileSwitchInProgress = false;
    
    // Abort all active controllers
    for (const [operationId, controller] of activeAbortControllers) {
        try {
            controller.abort();
        } catch (e) {
            console.warn(`[TAG-AUTO] Failed to abort operation ${operationId}:`, e);
        }
    }
    
    activeLLMOperations.clear();
    activeAbortControllers.clear();
    llmOperationCounter = 0;
}

// Track LLM operations
function startLLMOperation(operationName, abortController = null) {
    const operationId = `${operationName}_${++llmOperationCounter}`;
    activeLLMOperations.add(operationId);
    
    if (abortController) {
        activeAbortControllers.set(operationId, abortController);
    }
    
    console.log(`[TAG-AUTO] Started LLM operation: ${operationId} (${activeLLMOperations.size} total active)`);
    return operationId;
}

function endLLMOperation(operationId) {
    activeLLMOperations.delete(operationId);
    
    // Abort and cleanup the controller if it exists
    const controller = activeAbortControllers.get(operationId);
    if (controller) {
        try {
            controller.abort();
        } catch (e) {
            console.warn(`[TAG-AUTO] Failed to abort controller for ${operationId}:`, e);
        }
        activeAbortControllers.delete(operationId);
    }
    
    console.log(`[TAG-AUTO] Ended LLM operation: ${operationId} (${activeLLMOperations.size} remaining active)`);
}

function waitForAllLLMOperations() {
    return new Promise(async (resolve) => {
        console.log(`[TAG-AUTO] Waiting for ${activeLLMOperations.size} LLM operations to complete...`);
        
        let waitCount = 0;
        const maxWait = 100; // 10 seconds max
        
        while (activeLLMOperations.size > 0 && waitCount < maxWait) {
            console.log(`[TAG-AUTO] Still waiting for ${activeLLMOperations.size} operations: [${Array.from(activeLLMOperations).join(', ')}]`);
            await new Promise(r => setTimeout(r, 100));
            waitCount++;
        }
        
        if (activeLLMOperations.size > 0) {
            console.warn(`[TAG-AUTO] Timeout waiting for LLM operations. ${activeLLMOperations.size} operations still active:`, Array.from(activeLLMOperations));
            
            // Abort all hanging controllers
            for (const [operationId, controller] of activeAbortControllers) {
                try {
                    console.warn(`[TAG-AUTO] Force aborting operation: ${operationId}`);
                    controller.abort();
                } catch (e) {
                    console.warn(`[TAG-AUTO] Failed to abort hanging operation ${operationId}:`, e);
                }
            }
            
            // Force clear to prevent hanging
            activeLLMOperations.clear();
            activeAbortControllers.clear();
        }
        
        console.log('[TAG-AUTO] All LLM operations completed');
        resolve();
    });
}


// Profile management functions
function checkProfileExists() {
    const profiles = globalContext.extensionSettings?.connectionManager?.profiles || [];
    return profiles.find(profile => profile.name === REQUIRED_PROFILE_NAME);
}

function getCurrentProfile() {
    const profiles = globalContext.extensionSettings?.connectionManager?.profiles || [];
    const selectedProfileId = globalContext.extensionSettings?.connectionManager?.selectedProfile;
    return profiles.find(profile => profile.id === selectedProfileId);
}

async function withTagProfile(asyncOperation) {
    if (!profileCheckPassed) {
        throw new Error(`Profile "${REQUIRED_PROFILE_NAME}" not available`);
    }
    
    // Wait for any ongoing profile switch to complete with timeout
    let waitCount = 0;
    while (profileSwitchInProgress && waitCount < 50) { // Max 5 seconds
        console.log('[TAG-AUTO] Waiting for ongoing profile switch to complete...');
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
    }
    
    if (profileSwitchInProgress && waitCount >= 50) {
        console.error('[TAG-AUTO] Profile switch timeout - forcing reset');
        profileSwitchInProgress = false;
    }
    
    profileSwitchInProgress = true;
    console.log('[TAG-AUTO] Starting withTagProfile wrapper');
    
    // Check if SlashCommandParser is available - try multiple sources
    let slashParser = window.SlashCommandParser || globalContext.SlashCommandParser;
    
    // Try to get it from the global context more directly
    if (!slashParser && window.SillyTavern) {
        const context = window.SillyTavern.getContext();
        slashParser = context.SlashCommandParser;
    }
    
    if (!slashParser?.commands?.['profile']) {
        console.error('[TAG-AUTO] SlashCommandParser or profile command not available');
        console.log('[TAG-AUTO] Available window.SlashCommandParser:', !!window.SlashCommandParser);
        console.log('[TAG-AUTO] Available globalContext.SlashCommandParser:', !!globalContext.SlashCommandParser);
        console.log('[TAG-AUTO] Available via SillyTavern context:', !!(window.SillyTavern?.getContext()?.SlashCommandParser));
        console.log('[TAG-AUTO] Available commands:', Object.keys(slashParser?.commands || {}));
        
        // Don't fallback - this would use the wrong profile
        console.error('[TAG-AUTO] Profile switching unavailable - cannot proceed with LLM calls');
        throw new Error('Profile switching not available - extension cannot use dedicated profile');
    }
    
    // Get current profile name using invisible slash command callback
    const getNamedArguments = window.getNamedArguments || (() => ({}));
    let originalProfileName = null;
    
    try {
        originalProfileName = await slashParser.commands['profile'].callback(getNamedArguments(), '');
        console.log(`[TAG-AUTO] Original profile detected: "${originalProfileName || 'None'}"`);
    } catch (error) {
        console.warn('[TAG-AUTO] Could not get current profile, assuming None:', error);
        originalProfileName = null;
    }
    
    try {
        console.log(`[TAG-AUTO] Attempting to switch from profile "${originalProfileName || 'None'}" to "${REQUIRED_PROFILE_NAME}"`);
        
        // Switch to tag profile using invisible slash command callback
        const args = getNamedArguments({ await: 'true' });
        const switchResult = await slashParser.commands['profile'].callback(args, REQUIRED_PROFILE_NAME);
        console.log(`[TAG-AUTO] Profile switch result:`, switchResult);
        
        // Add delay to let profile switch settle
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verify profile was switched
        const verifyProfile = await slashParser.commands['profile'].callback(getNamedArguments(), '');
        console.log(`[TAG-AUTO] Current profile after switch: "${verifyProfile || 'None'}"`);
        
        if (verifyProfile !== REQUIRED_PROFILE_NAME) {
            console.error(`[TAG-AUTO] Profile switch failed! Expected "${REQUIRED_PROFILE_NAME}", got "${verifyProfile}"`);
            throw new Error(`Profile switch failed: expected "${REQUIRED_PROFILE_NAME}", got "${verifyProfile}"`);
        }
        
        // Execute the operation
        console.log('[TAG-AUTO] Executing LLM operation with tag profile');
        const result = await asyncOperation();
        console.log('[TAG-AUTO] LLM operation completed');
        
        return result;
    } catch (error) {
        console.error('[TAG-AUTO] Error in withTagProfile:', error);
        profileSwitchInProgress = false;
        throw error;
    } finally {
        // Always restore original profile
        try {
            console.log(`[TAG-AUTO] Restoring to original profile "${originalProfileName || 'None'}"`);
            
            const restoreTarget = (originalProfileName && originalProfileName !== '<None>' && originalProfileName.trim() !== '') 
                ? originalProfileName 
                : '<None>';
            
            // Restore to original profile using invisible slash command callback
            const args = getNamedArguments({ await: 'true' });
            const restoreResult = await slashParser.commands['profile'].callback(args, restoreTarget);
            console.log(`[TAG-AUTO] Profile restore result:`, restoreResult);
            
            // Add delay to let profile restoration settle
            await new Promise(resolve => setTimeout(resolve, 200));
            
            const finalProfile = await slashParser.commands['profile'].callback(getNamedArguments(), '');
            console.log(`[TAG-AUTO] Final profile after restoration: "${finalProfile || 'None'}"`);
        } catch (error) {
            console.warn('[TAG-AUTO] Failed to restore original profile:', error);
        } finally {
            // Add extra delay to ensure all async profile operations complete
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('[TAG-AUTO] Profile restoration cleanup completed');
            profileSwitchInProgress = false;
        }
    }
}

function showProfileError() {
    const message = `Tag Autocompletion requires a connection profile named "${REQUIRED_PROFILE_NAME}".

Please create this profile:
1. Go to API Connections → Connection Profiles
2. Create a new profile named exactly "${REQUIRED_PROFILE_NAME}"
3. Configure it with your preferred API settings for tag autocompletion
4. Try enabling this extension again

The extension will only use this profile for its own operations.`;

    if (window.toastr) {
        window.toastr.error(message, 'Profile Required', { 
            timeOut: 0, 
            extendedTimeOut: 0,
            closeButton: true 
        });
    } else {
        alert(message);
    }
}

// Initialize extension settings
function loadSettings() {
    globalContext.extensionSettings[extensionName] = Object.assign({}, defaultSettings, globalContext.extensionSettings[extensionName]);
    extensionSettings = globalContext.extensionSettings[extensionName];
    globalContext.saveSettingsDebounced();
    
    // Check for required profile
    const requiredProfile = checkProfileExists();
    profileCheckPassed = !!requiredProfile;
    
    if (extensionSettings.debug) {
        console.log(`[TAG-AUTO] Profile check: ${profileCheckPassed ? 'PASSED' : 'FAILED'}`);
        if (requiredProfile) {
            console.log(`[TAG-AUTO] Found required profile:`, requiredProfile);
        }
    }
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
    // Limit context to prevent environmental pollution
    const limitedContext = window.globalPrompt
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => !tag.match(new RegExp(`^${originalTag}$`, 'i')))
        .slice(0, 3)  // Only use first 3 other tags to minimize pollution
        .join(', ');

    const prompt = `For the image tag "${originalTag}", generate 3-4 simpler, more specific search terms that ONLY relate to the same semantic category and visual concept.

LIMITED CONTEXT: ${limitedContext}

STRICT REQUIREMENTS:
- Stay within the same semantic category (body→body, pose→pose, clothing→clothing, lighting→lighting)
- NO environmental terms for body/clothing tags
- NO body terms for environmental tags  
- NO object terms for action tags
- Break compound tags into their meaningful components ONLY

Examples:
- "bright_lighting" → lighting, light, bright, illumination
- "pink_nipples" → nipples, nipple, pink, breast
- "knee_scrape" → knee, scrape, injury, bruise  
- "hugging_own_knees" → hugging, embrace, knees, sitting
- "fully_nude" → nude, naked, bare, exposed
- "steel_walls" → walls, wall, steel, metal

Return ONLY a comma-separated list of semantically consistent words. No explanations.`;

    try {
        // Create isolated abort controller to prevent response mixing
        const controller = new AbortController();
        
        // Track this LLM operation with its abort controller
        const operationId = startLLMOperation(`fallback_${originalTag}`, controller);
        
        try {
            const result = await globalContext.generateQuietPrompt(
                prompt, false, false, null, null, null, null, controller.signal
            );
            
            // Remove thinking tags and explanatory content
            const cleanResult = stripThinkTags(result);
            
            const terms = cleanResult
                .split(/[,\n]/)
                .map(term => term.trim().replace(/['"()\[\]*]/g, ''))
                .filter(term => term.length > 0 && term !== originalTag);
            
            console.log(`[TAG-AUTO] Generated fallback terms for "${originalTag}":`, terms);
            
            return terms;
        } finally {
            endLLMOperation(operationId);
        }
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
    const tags = window.globalPrompt
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => !tag.match(new RegExp(`^${originalTag}$`, 'i')))
        .join(', ');

    const prompt = `Original compound tag: "${originalTag}"
Current candidates found: ${candidates.join(', ')}

CONTEXT: ${tags}

Question: Can you find ALL the core components of the original compound tag among these candidates with CONTEXTUALLY APPROPRIATE matches?

For "${originalTag}", you MUST find:
${originalTag.includes('_') ? 
    `- Component 1: "${originalTag.split('_')[0]}" or contextually similar (REQUIRED)
- Component 2: "${originalTag.split('_')[1]}" or contextually similar (REQUIRED)` :
    `- Any candidates that closely match the original meaning`
}

IMPORTANT: Components must be contextually appropriate, not just word matches.

Answer YES ONLY if you can find ALL required components with PROPER CONTEXT among the candidates.
Answer NO if ANY component is missing OR if matches are contextually wrong.

Examples:
- "steel_walls" with candidates ["steel", "wall", "pokemon"] → YES (steel + wall both found in proper context)
- "padded_room" with candidates ["padded jacket", "padded walls"] → NO (padded found, but room missing)
- "padded_room" with candidates ["padded walls", "room"] → YES (padded + room both found in proper context)
- "padded_floor" with candidates ["breast padding", "floor"] → NO (breast padding wrong context for floor padding)
- "ceiling_hatch" with candidates ["ceiling", "hatch", "other tags"] → YES (both ceiling and hatch found)
- "ceiling_hatch" with candidates ["ceiling", "wallet"] → NO (ceiling found, but hatch missing)

Answer ONLY "YES" or "NO".`;

    try {
        // Create isolated abort controller to prevent response mixing
        const controller = new AbortController();
        
        // Track this LLM operation with its abort controller
        const operationId = startLLMOperation(`sufficiency_${originalTag}`, controller);
        
        try {
            const result = await globalContext.generateQuietPrompt(
                prompt, false, false, null, null, null, null, controller.signal
            );
            
            // Strip think tags and clean the response (handle all variations: <think>, < think>, <THINK>, < THINK>)
            const cleanResult = stripThinkTags(result).toUpperCase();
            const answer = cleanResult.replace(/[^\w]/g, ''); // Remove non-word characters
            console.log(`[TAG-AUTO] LLM sufficiency evaluation for "${originalTag}": ${answer} (from raw: ${result.substring(0, 100)}...)`);
            
            return answer === 'YES';
        } finally {
            endLLMOperation(operationId);
        }
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

    const tags = window.globalPrompt
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => !tag.match(new RegExp(`^${originalTag}$`, 'i')))
        .join(', ');
    
    const prompt = `Original tag: "${originalTag}"
Search results: ${candidates.join(', ')}

CONTEXT: ${tags}

Are these search results good quality matches for the original tag? 

${originalTag.includes('_') ? 
    `This is a compound tag "${originalTag}". Check if the results preserve the FULL meaning:
- Do any results contain or represent "${originalTag.split('_')[0]}"? 
- Do any results contain or represent "${originalTag.split('_')[1]}"?
- For compound tags, BOTH components should be represented among the candidates.` :
    `This is a single-word tag "${originalTag}". Check if any result is a good match:
- Look for exact matches, plurals, or very similar variations
- Examples: "indoor" matches "indoors", "cat" matches "cats", "smile" matches "smiling"
- One excellent match is sufficient for single-word tags.`
}

Answer ONLY "YES" if the results adequately represent the original meaning, or ONLY "NO" if no good matches exist.`;

    try {
        // Create isolated abort controller to prevent response mixing
        const controller = new AbortController();
        
        // Track this LLM operation with its abort controller
        const operationId = startLLMOperation(`evaluation_${originalTag}`, controller);
        
        try {
            const result = await globalContext.generateQuietPrompt(
                prompt, false, false, null, null, null, null, controller.signal
            );
            
            // Strip think tags and clean the response (handle all variations: <think>, < think>, <THINK>, < THINK>)
            const cleanResult = stripThinkTags(result).toUpperCase();
            const answer = cleanResult.replace(/[^\w]/g, ''); // Remove non-word characters
            console.log(`[TAG-AUTO] LLM evaluation for "${originalTag}" with candidates [${candidates.join(', ')}]: ${answer} (from raw: ${result.substring(0, 100)}...)`);
            
            return answer === 'YES';
        } finally {
            endLLMOperation(operationId);
        }
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
    
    // Skip LLM evaluation if we have exact/near-exact matches and return only the exact match
    if (result.candidates && result.candidates.length > 0) {
        const normalizedOriginal = originalTag.toLowerCase().replace(/[_\s]/g, '');
        const exactMatch = result.candidates.find(candidate => 
            candidate.toLowerCase().replace(/[_\s]/g, '') === normalizedOriginal
        );
        
        if (exactMatch) {
            console.log(`[TAG-AUTO] Found exact match for "${originalTag}" - returning only exact match: "${exactMatch}"`);
            return {
                query: originalTag,
                candidates: [exactMatch]
            };
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
        // Remove duplicates but preserve component diversity for compound tags
        let uniqueCandidates = [...new Set(allFallbackCandidates)];
        
        // For compound tags, ensure we preserve candidates representing both components
        if (originalTag.includes('_')) {
            const [component1, component2] = originalTag.split('_');
            
            // Find candidates that match each component
            const component1Candidates = uniqueCandidates.filter(c => 
                c.toLowerCase().includes(component1.toLowerCase()) || 
                c.toLowerCase().replace(/[_\s]/g, '').includes(component1.toLowerCase())
            );
            const component2Candidates = uniqueCandidates.filter(c => 
                c.toLowerCase().includes(component2.toLowerCase()) || 
                c.toLowerCase().replace(/[_\s]/g, '').includes(component2.toLowerCase())
            );
            
            // Prioritize candidates that represent both components
            const prioritizedCandidates = [
                ...component1Candidates.slice(0, Math.ceil(limit/2)),
                ...component2Candidates.slice(0, Math.ceil(limit/2))
            ];
            
            // Add remaining candidates if we have space
            const remaining = uniqueCandidates.filter(c => !prioritizedCandidates.includes(c));
            uniqueCandidates = [...new Set([...prioritizedCandidates, ...remaining])].slice(0, limit);
        } else {
            uniqueCandidates = uniqueCandidates.slice(0, limit);
        }
        
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

// Helper function to parse LLM tag selection response optimized for Qwen3
function parseLLMTagSelection(result, candidates) {
    // Step 1: Extract content after </think> tag (Qwen3 specific)
    let cleanResult = result;
    
    // Find the last </think> tag and extract everything after it
    const thinkEndRegex = /<\/\s*think\s*>/gi;
    let lastThinkEnd = -1;
    let match;
    while ((match = thinkEndRegex.exec(result)) !== null) {
        lastThinkEnd = match.index + match[0].length;
    }
    
    if (lastThinkEnd !== -1) {
        cleanResult = result.substring(lastThinkEnd).trim();
        console.log(`[TAG-AUTO] Extracted post-think content: "${cleanResult}"`);
    }
    
    // Step 2: Additional cleaning for any remaining artifacts
    cleanResult = stripThinkTags(cleanResult) // Remove any remaining think blocks
        .replace(/```[\s\S]*?```/gi, '') // Remove code blocks
        .replace(/^\s*[-*+]\s+/gm, '') // Remove list markers
        .replace(/^#{1,6}\s*/gm, '') // Remove markdown headers
        .trim();
    
    if (!cleanResult) {
        console.warn(`[TAG-AUTO] Empty result after cleaning, using first candidate: "${candidates[0]}"`);
        return candidates[0];
    }
    
    // Step 3: Handle multiple tags (comma-separated) from old version logic
    if (cleanResult.includes(',')) {
        const selectedTags = cleanResult.split(',')
            .map(tag => tag.trim())
            .map(tag => {
                // Find matching candidate for each tag
                const normalizedTag = tag.toLowerCase();
                const match = candidates.find(c => c.toLowerCase() === normalizedTag);
                return match;
            })
            .filter(tag => tag !== undefined);
        
        if (selectedTags.length > 0) {
            console.log(`[TAG-AUTO] Multiple tags found: "${selectedTags.join(', ')}"`);
            return selectedTags.join(', ');
        }
    }
    
    // Step 4: Normalize function to handle underscore/space variations
    function normalizeTag(tag) {
        return tag.toLowerCase()
            .replace(/[_\s]/g, '') // Remove underscores and spaces
            .replace(/[^\w]/g, ''); // Remove all non-alphanumeric
    }
    
    // Step 5: Try exact matches first (most reliable)
    for (const candidate of candidates) {
        // Check for exact word boundary matches
        const escapedCandidate = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const exactRegex = new RegExp(`\\b${escapedCandidate}\\b`, 'gi');
        if (exactRegex.test(cleanResult)) {
            console.log(`[TAG-AUTO] Exact match found: "${candidate}"`);
            return candidate;
        }
    }
    
    // Step 6: Try normalized matches (handles underscore/space differences)
    const normalizedResult = normalizeTag(cleanResult);
    for (const candidate of candidates) {
        const normalizedCandidate = normalizeTag(candidate);
        // Exact normalized match (highest priority)
        if (normalizedResult === normalizedCandidate) {
            console.log(`[TAG-AUTO] Exact normalized match found: "${candidate}"`);
            return candidate;
        }
    }
    
    // Step 6b: Try partial normalized matches (commented out - too restrictive)
    // TODO: Implement smarter context-based matching instead of length-based restrictions
    /*
    for (const candidate of candidates) {
        const normalizedCandidate = normalizeTag(candidate);
        // Only allow if the result is reasonably long and significantly contained
        if (normalizedResult.length >= 4 && normalizedCandidate.length >= 4) {
            if (normalizedResult.includes(normalizedCandidate) || 
                (normalizedCandidate.includes(normalizedResult) && normalizedResult.length >= normalizedCandidate.length * 0.7)) {
                console.log(`[TAG-AUTO] Partial normalized match found: "${candidate}" (normalized: "${normalizedCandidate}" in "${normalizedResult}")`);
                return candidate;
            }
        }
    }
    */
    
    // Step 7: Try partial word matches (improved semantic matching)
    for (const candidate of candidates) {
        // Forward match: LLM result contains the candidate (more restrictive)
        if (cleanResult.toLowerCase().includes(candidate.toLowerCase())) {
            console.log(`[TAG-AUTO] Partial match found: "${candidate}"`);
            return candidate;
        }
        
        // Reverse match: Only if LLM result is a clear prefix/suffix of candidate
        // AND they share significant semantic overlap (same root word)
        const lowerCandidate = candidate.toLowerCase();
        const lowerResult = cleanResult.toLowerCase();
        
        // Only allow reverse matching if the result is a meaningful subset
        // and the candidate doesn't add completely different semantic meaning
        if (lowerCandidate.includes(lowerResult) && cleanResult.length >= 3) {
            // Additional checks to prevent semantic drift
            const candidateWords = lowerCandidate.split(/[_\s-]+/);
            const resultWords = lowerResult.split(/[_\s-]+/);
            
            // Check if the result word is actually a base word in the candidate
            const hasCommonRoot = resultWords.some(resultWord => 
                candidateWords.some(candidateWord => 
                    candidateWord.startsWith(resultWord) || resultWord.startsWith(candidateWord)
                )
            );
            
            // Only allow if there's semantic continuity
            if (hasCommonRoot) {
                console.log(`[TAG-AUTO] Semantic reverse match: "${candidate}" extends "${cleanResult}"`);
                return candidate;
            } else {
                console.log(`[TAG-AUTO] Rejected reverse match: "${candidate}" semantically different from "${cleanResult}"`);
            }
        }
    }
    
    // Step 8: Extract potential tag from last line/word
    const lines = cleanResult.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const lastLine = lines[lines.length - 1] || '';
    const words = lastLine.split(/\s+/);
    const lastWord = words[words.length - 1] || '';
    
    // Check if last word/line matches any candidate
    for (const candidate of candidates) {
        const normalizedCandidate = normalizeTag(candidate);
        const normalizedLastWord = normalizeTag(lastWord);
        const normalizedLastLine = normalizeTag(lastLine);
        
        if (normalizedLastWord === normalizedCandidate || normalizedLastLine === normalizedCandidate) {
            console.log(`[TAG-AUTO] Last word/line match: "${candidate}" from "${lastLine}"`);
            return candidate;
        }
    }
    
    // Step 9: Try matching individual words in the result against candidates
    const resultWords = cleanResult.toLowerCase().split(/\s+/);
    for (const candidate of candidates) {
        const candidateWords = candidate.toLowerCase().split(/[\s_]+/);
        
        // Check if any candidate word appears in result words
        for (const candidateWord of candidateWords) {
            if (candidateWord.length >= 3 && resultWords.some(word => 
                normalizeTag(word) === normalizeTag(candidateWord))) {
                console.log(`[TAG-AUTO] Word component match: "${candidate}" (matched word: "${candidateWord}")`);
                return candidate;
            }
        }
    }
    
    // Last resort: return first candidate
    console.warn(`[TAG-AUTO] Could not parse LLM response: "${result.substring(0, 200)}..." - using first candidate: "${candidates[0]}"`);
    return candidates[0];
}

// Context-aware tag selection using SillyTavern's LLM
async function selectBestTagWithContext(candidates, originalTag, generationType) {
    if (candidates.length === 0) {
        return originalTag;
    }

    if (candidates.length === 1) {
        return candidates[0];
    }

    let selectedTag;
    try {
        switch(generationType) {
            case GENERATION_MODE.CHARACTER: // 'you' - Character ("Yourself") - AI character
            case GENERATION_MODE.FACE: // 'face' - Portrait - AI character face
            case GENERATION_MODE.CHARACTER_MULTIMODAL:
            case GENERATION_MODE.FACE_MULTIMODAL:
                selectedTag = await selectBestTagForCharacter(candidates, originalTag);
                break;
                
            case GENERATION_MODE.USER: // 'me' - User ("Me") - Human user
            case GENERATION_MODE.USER_MULTIMODAL:
                selectedTag = await selectBestTagForUser(candidates, originalTag);
                break;
                
            case GENERATION_MODE.NOW: // 'last' - Last Message
            case GENERATION_MODE.RAW_LAST: // 'raw_last' - Raw Last Message
                selectedTag = await selectBestTagForLastMessage(candidates, originalTag);
                break;
                
            case GENERATION_MODE.SCENARIO: // 'scene' - Scenario ("The Whole Story")
                selectedTag = await selectBestTagForScenario(candidates, originalTag);
                break;
                
            case GENERATION_MODE.BACKGROUND: // 'background' - Background
                selectedTag = await selectBestTagForBackground(candidates, originalTag);
                break;
                
            case GENERATION_MODE.FREE:
            case GENERATION_MODE.FREE_EXTENDED:
                selectedTag = await selectBestTagGeneric(candidates, originalTag);
                break;
                
            default:
                selectedTag = await selectBestTagGeneric(candidates, originalTag);
                break;
        }
        
        // Validate the selected tag to prevent semantic mismatches
        try {
            const validation = await validateTagSelection(originalTag, selectedTag, candidates);
            
            if (!validation.isValid) {
                console.log(`[TAG-AUTO] Tag selection rejected by validation: "${originalTag}" → "${selectedTag}"`);
                
                // Try using validation suggestion if available
                if (validation.suggestion && candidates.includes(validation.suggestion)) {
                    console.log(`[TAG-AUTO] Using validation suggestion: "${validation.suggestion}"`);
                    return validation.suggestion;
                }
                
                // Fall back to first candidate or original tag
                console.log(`[TAG-AUTO] Using fallback: first candidate or original tag`);
                return candidates[0] || originalTag;
            }
            
            return selectedTag;
        } catch (validationError) {
            console.warn(`[TAG-AUTO] Validation failed for "${originalTag}" → "${selectedTag}":`, validationError);
            // Fall back to selected tag if validation fails
            return selectedTag;
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

    const selectionPrompt = `You must select the BEST danbooru/e621 tag for "${originalTag}" from the provided candidates. Choose the most appropriate tag that matches the visual concept. Do not stop until you have identified the optimal tag choice.

AVAILABLE CANDIDATES: ${candidates.join(', ')}

SELECTION CRITERIA:
- Choose the tag that best represents the visual concept of "${originalTag}"
- Select tags semantically closest to the original meaning
- Focus on visual and descriptive elements

CRITICAL RULES:
- Return ONLY ONE tag name from the candidates list
- Use only the exact tag text from the candidates (no variations)
- Select tags semantically closest to "${originalTag}"
- Prioritize exact semantic matches over partial matches
- Reject character names, franchises, or other contextually inappropriate tags
- For compound concepts, prefer tags that capture the core visual meaning
- Only combine multiple tags if they together represent the original concept better than any single tag
- No explanations, reasoning, or additional text

OUTPUT FORMAT: Return only the selected tag name (or comma-separated tags if multiple), nothing else.`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Character selection prompt:', selectionPrompt);
    }

    // Create isolated abort controller to prevent response mixing
    const controller = new AbortController();
    
    // Track this LLM operation with its abort controller
    const operationId = startLLMOperation(`select_character_${originalTag}`, controller);
    
    try {
        const result = await globalContext.generateQuietPrompt(
            selectionPrompt, false, false, null, null, null, null, controller.signal
        );
        return parseLLMTagSelection(result, candidates);
    } finally {
        endLLMOperation(operationId);
    }
}

// Tag selection for last message generation (limited context)
async function selectBestTagForLastMessage(candidates, originalTag) {
    const context = globalContext;
    const lastMessage = context.chat && context.chat.length > 0 ? context.chat[context.chat.length - 1] : null;
    
    if (!lastMessage || !lastMessage.mes) {
        return candidates[0];
    }

    const tags = window.globalPrompt
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => !tag.match(new RegExp(`^${originalTag}$`, 'i')))
        .join(', ');

    const selectionPrompt = `You must select the BEST danbooru/e621 tag for "${originalTag}" from the provided candidates. Choose the most appropriate tag that matches the visual concept. Do not stop until you have identified the optimal tag choice.

CONTEXT: ${tags}

AVAILABLE CANDIDATES: ${candidates.join(', ')}

SELECTION CRITERIA:
- Choose the tag that best represents the visual concept of "${originalTag}"
- Select tags semantically closest to the original meaning
- Focus on visual and descriptive elements

CRITICAL RULES:
- Return ONLY ONE tag name from the candidates list
- Use only the exact tag text from the candidates (no variations)
- Select tags semantically closest to "${originalTag}"
- Prioritize exact semantic matches over partial matches
- Reject character names, franchises, or other contextually inappropriate tags
- For compound concepts, prefer tags that capture the core visual meaning
- Only combine multiple tags if they together represent the original concept better than any single tag
- Context is for image generation - focus on visual, descriptive elements
- No explanations, reasoning, or additional text

OUTPUT FORMAT: Return only the selected tag name (or comma-separated tags if multiple), nothing else.`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Last message selection prompt:', selectionPrompt);
    }

    // Create isolated abort controller to prevent response mixing
    const controller = new AbortController();
    
    // Track this LLM operation with its abort controller
    const operationId = startLLMOperation(`select_lastmsg_${originalTag}`, controller);
    
    try {
        const result = await globalContext.generateQuietPrompt(
            selectionPrompt, false, false, null, null, null, null, controller.signal
        );
        
        if (extensionSettings.debug) {
            console.log('Tag Autocompletion: LLM raw response for last message:', result);
        }
        
        return parseLLMTagSelection(result, candidates);
    } finally {
        endLLMOperation(operationId);
    }
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

    const selectionPrompt = `You must select the BEST danbooru/e621 tag for "${originalTag}" from the provided candidates. Choose the most appropriate tag that matches the visual concept. Do not stop until you have identified the optimal tag choice.

AVAILABLE CANDIDATES: ${candidates.join(', ')}

SELECTION CRITERIA:
- Choose the tag that best represents the visual concept of "${originalTag}"
- Select tags semantically closest to the original meaning
- Focus on visual and descriptive elements

CRITICAL RULES:
- Return ONLY ONE tag name from the candidates list
- Use only the exact tag text from the candidates (no variations)
- Select tags semantically closest to "${originalTag}"
- Prioritize exact semantic matches over partial matches
- Reject character names, franchises, or other contextually inappropriate tags
- For compound concepts, prefer tags that capture the core visual meaning
- Only combine multiple tags if they together represent the original concept better than any single tag
- Context is for image generation - focus on visual, descriptive elements
- No explanations, reasoning, or additional text

OUTPUT FORMAT: Return only the selected tag name (or comma-separated tags if multiple), nothing else.`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Scenario selection prompt:', selectionPrompt);
    }

    // Create isolated abort controller to prevent response mixing
    const controller = new AbortController();
    
    // Track this LLM operation with its abort controller
    const operationId = startLLMOperation(`select_scenario_${originalTag}`, controller);
    
    try {
        const result = await globalContext.generateQuietPrompt(
            selectionPrompt, false, false, null, null, null, null, controller.signal
        );
        return parseLLMTagSelection(result, candidates);
    } finally {
        endLLMOperation(operationId);
    }
}


// Generic tag selection fallback
async function selectBestTagGeneric(candidates, originalTag) {
    const selectionPrompt = `You must select the BEST danbooru/e621 tag for "${originalTag}" from the provided candidates. Analyze the visual concept and choose the most appropriate tag that matches the intended meaning. Do not stop until you have identified the optimal tag choice.

AVAILABLE CANDIDATES: ${candidates.join(', ')}

SELECTION CRITERIA:
- Choose the tag that best represents the visual concept of "${originalTag}"
- Consider general visual meaning and common usage
- Prioritize tags that match the intended visual representation
- Select tags appropriate for generic/flexible generation contexts
- Focus on what IS visible, present, and actively described
- Use standard danbooru/e621 tag conventions

CRITICAL RULES:
- Return ONLY ONE tag name from the candidates list
- Use only the exact tag text from the candidates (no variations)
- No explanations, reasoning, or additional text
- Tag must match exactly as provided in candidates
- Choose the most universally appropriate option

OUTPUT FORMAT: Return only the selected tag name, nothing else.`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Generic selection prompt:', selectionPrompt);
    }

    // Create isolated abort controller to prevent response mixing
    const controller = new AbortController();
    
    // Track this LLM operation with its abort controller
    const operationId = startLLMOperation(`select_generic_${originalTag}`, controller);
    
    try {
        const result = await globalContext.generateQuietPrompt(
            selectionPrompt, false, false, null, null, null, null, controller.signal
        );
        return parseLLMTagSelection(result, candidates);
    } finally {
        endLLMOperation(operationId);
    }
}

// Tag selection for user character generation (/sd me - USER mode)
async function selectBestTagForUser(candidates, originalTag) {
    const context = globalContext;
    const userName = context.name1 || 'User';
    
    const selectionPrompt = `You must select the BEST danbooru/e621 tag for "${originalTag}" from the provided candidates. Choose the most appropriate tag that matches the visual concept. Do not stop until you have identified the optimal tag choice.

AVAILABLE CANDIDATES: ${candidates.join(', ')}

SELECTION CRITERIA:
- Choose the tag that best represents the visual concept of "${originalTag}"
- Select tags semantically closest to the original meaning
- Focus on visual and descriptive elements

CRITICAL RULES:
- Return ONLY ONE tag name from the candidates list
- Use only the exact tag text from the candidates (no variations)
- Select tags semantically closest to "${originalTag}"
- Prioritize exact semantic matches over partial matches
- Reject character names, franchises, or other contextually inappropriate tags
- For compound concepts, prefer tags that capture the core visual meaning
- Only combine multiple tags if they together represent the original concept better than any single tag
- Context is for image generation - focus on visual, descriptive elements
- No explanations, reasoning, or additional text

OUTPUT FORMAT: Return only the selected tag name (or comma-separated tags if multiple), nothing else.`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: User character selection prompt:', selectionPrompt);
    }

    // Create isolated abort controller to prevent response mixing
    const controller = new AbortController();
    
    // Track this LLM operation with its abort controller
    const operationId = startLLMOperation(`select_user_${originalTag}`, controller);
    
    try {
        const result = await globalContext.generateQuietPrompt(
            selectionPrompt, false, false, null, null, null, null, controller.signal
        );
        return parseLLMTagSelection(result, candidates);
    } finally {
        endLLMOperation(operationId);
    }
}


// Tag selection for background generation (/sd background - BACKGROUND mode)
async function selectBestTagForBackground(candidates, originalTag) {
    const context = globalContext;
    const character = context.characters[context.characterId];
    
    const selectionPrompt = `You must select the BEST danbooru/e621 tag for "${originalTag}" from the provided candidates. Choose the most appropriate tag that matches the visual concept. Do not stop until you have identified the optimal tag choice.

AVAILABLE CANDIDATES: ${candidates.join(', ')}

SELECTION CRITERIA:
- Choose the tag that best represents the visual concept of "${originalTag}"
- Select tags semantically closest to the original meaning
- Focus on visual and descriptive elements

CRITICAL RULES:
- Return ONLY ONE tag name from the candidates list
- Use only the exact tag text from the candidates (no variations)
- Select tags semantically closest to "${originalTag}"
- Prioritize exact semantic matches over partial matches
- Reject character names, franchises, or other contextually inappropriate tags
- For compound concepts, prefer tags that capture the core visual meaning
- Only combine multiple tags if they together represent the original concept better than any single tag
- Context is for image generation - focus on visual, descriptive elements
- No explanations, reasoning, or additional text

OUTPUT FORMAT: Return only the selected tag name (or comma-separated tags if multiple), nothing else.`;

    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Background selection prompt:', selectionPrompt);
    }

    // Create isolated abort controller to prevent response mixing
    const controller = new AbortController();
    
    // Track this LLM operation with its abort controller
    const operationId = startLLMOperation(`select_background_${originalTag}`, controller);
    
    try {
        const result = await globalContext.generateQuietPrompt(
            selectionPrompt, false, false, null, null, null, null, controller.signal
        );
        return parseLLMTagSelection(result, candidates);
    } finally {
        endLLMOperation(operationId);
    }
}

// Utility function to remove LLM thinking tags from responses
function stripThinkTags(text) {
    if (!text) return '';
    
    // Comprehensive regex to handle various think tag formats:
    // <think>, < think >, <THINK>, < THINK >, etc.
    return text.replace(/<\s*think[\s>][\s\S]*?<\/\s*think\s*>/gi, '').trim();
}

// Semantic validation function to prevent inappropriate tag selections
async function validateTagSelection(originalTag, selectedTag, allCandidates, context = '') {
    // Skip validation for exact matches or very short tags
    if (originalTag === selectedTag || selectedTag.length <= 3) {
        return { isValid: true, reason: 'exact_match_or_short' };
    }
    
    // Skip validation if only one candidate available
    if (allCandidates.length <= 1) {
        return { isValid: true, reason: 'single_candidate' };
    }
    
    // Simple pattern detection for obvious mismatches
    const original = originalTag.toLowerCase();
    const selected = selectedTag.toLowerCase();
    
    // Check for lighting→smoking confusion
    if ((original.includes('lighting') || original.includes('light')) && 
        (selected.includes('cigarette') || selected.includes('smoke'))) {
        console.log(`[TAG-AUTO] Auto-rejecting lighting→smoking confusion: "${originalTag}" → "${selectedTag}"`);
        return { isValid: false, reason: 'lighting_smoking_confusion' };
    }
    
    // Check for body part→clothing confusion  
    if ((original.includes('nipple') || original.includes('breast')) &&
        (selected.includes('hair') || selected.includes('shirt') || selected.includes('dress'))) {
        console.log(`[TAG-AUTO] Auto-rejecting body→clothing confusion: "${originalTag}" → "${selectedTag}"`);
        return { isValid: false, reason: 'body_clothing_confusion' };
    }
    
    const prompt = `You are a semantic validator for danbooru/e621 tags. Check if this tag selection makes sense.

ORIGINAL TAG: "${originalTag}"
SELECTED TAG: "${selectedTag}"
ALL AVAILABLE CANDIDATES: ${allCandidates.join(', ')}
CONTEXT: ${context}

VALIDATION RULES:
1. The selected tag should capture the core visual/descriptive meaning of the original
2. Reject selections that change semantic category (e.g., lighting → smoking, body parts → clothing)
3. Reject selections that are contextually inappropriate 
4. Consider if other candidates would be better matches

EXAMPLES OF INVALID SELECTIONS:
- "bright_lighting" → "lighting cigarette" (lighting context changed to smoking)
- "pink_nipples" → "blonde hair" (body part changed to hair color)
- "indoor" → "white dress" (location changed to clothing)
- "knee_scrape" → "naked shirt" (injury changed to clothing item)
- "hugging_own_knees" → "lighting practice" (action changed to lighting context)
- "fully_nude" → "light bulb" (nudity changed to object)
- "dropped" → "dropped food" (person falling changed to food falling)

EXAMPLES OF VALID SELECTIONS:
- "metal_floor" → "floor" (simplified but kept meaning)
- "shivering" → "trembling" (good synonym)
- "bare_foot" → "barefoot" (format correction)
- "wide_eyes" → "wide-eyed" (format correction, same meaning)
- "hair_over_shoulder" → "hair over shoulder" (underscore to space conversion)

Answer ONLY "VALID" if the selection makes semantic sense, or "INVALID" if it doesn't.
If INVALID, suggest the best alternative from the candidates list.

FORMAT: 
VALID
OR
INVALID: [best_alternative_tag]`;

    try {
        // Create isolated abort controller to prevent response mixing
        const controller = new AbortController();
        
        // Track this LLM operation with its abort controller
        const operationId = startLLMOperation(`validate_${originalTag}`, controller);
        
        try {
            const result = await globalContext.generateQuietPrompt(
                prompt, false, false, null, null, null, null, controller.signal
            );
            
            const cleanResult = stripThinkTags(result);
            
            if (cleanResult.toUpperCase().startsWith('VALID')) {
                console.log(`[TAG-AUTO] Validation PASSED for "${originalTag}" → "${selectedTag}"`);
                return { isValid: true, reason: 'llm_validation_passed' };
            } else if (cleanResult.toUpperCase().startsWith('INVALID')) {
                const suggestionMatch = cleanResult.match(/INVALID:\s*(.+)/i);
                const suggestion = suggestionMatch ? suggestionMatch[1].trim() : null;
                
                console.log(`[TAG-AUTO] Validation FAILED for "${originalTag}" → "${selectedTag}"`);
                if (suggestion) {
                    console.log(`[TAG-AUTO] Validation suggests alternative: "${suggestion}"`);
                }
                
                return { 
                    isValid: false, 
                    reason: 'llm_validation_failed',
                    suggestion: suggestion 
                };
            } else {
                // Unclear response, assume valid
                console.log(`[TAG-AUTO] Validation unclear for "${originalTag}" → "${selectedTag}", assuming valid`);
                return { isValid: true, reason: 'unclear_response' };
            }
        } finally {
            endLLMOperation(operationId);
        }
    } catch (error) {
        console.warn(`[TAG-AUTO] Validation error for "${originalTag}" → "${selectedTag}":`, error);
        return { isValid: true, reason: 'validation_error' }; // Assume valid on error
    }
}

// Main tag correction function
// Architecture: Single profile switch for entire batch operation
// - Avoids hundreds of profile switches per prompt
// - Prevents race conditions and infinite loops
// - Much more efficient and reliable
async function correctTagsWithContext(prompt, generationType) {
    console.log('[TAG-AUTO] Extension enabled check:', extensionSettings.enabled);
    
    if (!extensionSettings.enabled) {
        console.log('[TAG-AUTO] Extension disabled, returning original prompt');
        return prompt;
    }

    console.log('[TAG-AUTO] Starting tag correction...');
    console.log('[TAG-AUTO] Original prompt:', prompt);
    console.log('[TAG-AUTO] Generation type:', generationType);

    // Switch to tag profile once for the entire operation
    console.log('[TAG-AUTO] Switching to tag profile for batch processing');
    return await withTagProfile(async () => {
        return await processTagsInBatch(prompt, generationType);
    });
}

// Process all tags under a single profile switch with optimized parallel processing
async function processTagsInBatch(prompt, generationType) {
    // Clean the prompt by removing thinking tags and explanatory content
    let cleanPrompt = stripThinkTags(prompt);
    
    // Look for content after the last "< think>" or similar markers (case insensitive)
    let lastThinkIndex = -1;
    let skipLength = 0;
    
    // Check all variations of think markers
    const spaceThinkLower = cleanPrompt.lastIndexOf('< think>');
    const spaceThinkUpper = cleanPrompt.lastIndexOf('< THINK>');
    const openThinkLower = cleanPrompt.lastIndexOf('<think>');
    const openThinkUpper = cleanPrompt.lastIndexOf('<THINK>');
    const closeThinkLower = cleanPrompt.lastIndexOf('</think>');
    const closeThinkUpper = cleanPrompt.lastIndexOf('</THINK>');
    
    const spaceThink = Math.max(spaceThinkLower, spaceThinkUpper);
    const openThink = Math.max(openThinkLower, openThinkUpper);
    const closeThink = Math.max(closeThinkLower, closeThinkUpper);
    
    if (spaceThink > lastThinkIndex) {
        lastThinkIndex = spaceThink;
        skipLength = 8; // "< think>" or "< THINK>" length
    }
    if (openThink > lastThinkIndex) {
        lastThinkIndex = openThink;
        skipLength = 7; // "<think>" or "<THINK>" length
    }
    if (closeThink > lastThinkIndex) {
        lastThinkIndex = closeThink;
        skipLength = 8; // "</think>" or "</THINK>" length
    }
    
    if (lastThinkIndex !== -1) {
        cleanPrompt = cleanPrompt.substring(lastThinkIndex + skipLength).trim();
    }
    
    // If no think markers, try to find the last sentence that looks like tags
    if (!cleanPrompt.includes(',')) {
        const sentences = prompt.split(/[.!?]+/);
        for (let i = sentences.length - 1; i >= 0; i--) {
            const sentence = sentences[i].trim();
            if (sentence.includes(',') && /^[a-zA-Z0-9_\s,]+$/.test(sentence)) {
                cleanPrompt = sentence;
                break;
            }
        }
    }
    
    // Remove any leading/trailing punctuation but preserve special tags like [ASPECT:tall]
    cleanPrompt = cleanPrompt.replace(/^[^a-zA-Z0-9_\[\]]*/, '').replace(/[^a-zA-Z0-9_\s,\[\]:]*$/, '');
    
    console.log('[TAG-AUTO] Cleaned prompt:', cleanPrompt);

    // Split prompt into individual tags
    const tags = cleanPrompt.split(',').map(t => t.trim()).filter(t => t.length > 0);
    
    // Get processing strategy based on generation type
    const strategy = getProcessingStrategy(generationType);
    
    console.log(`[TAG-AUTO] Processing ${tags.length} tags, strategy: ${strategy.strategy}, generation type: ${generationType}`);
    console.log('[TAG-AUTO] Tags to process:', tags);

    // Use optimized batch processing for better performance
    const correctedTags = await processBatchedParallel(tags, strategy, generationType);
    
    // Flatten and deduplicate tags
    const flattenedTags = correctedTags.flatMap(tag => 
        tag.split(',').map(t => t.trim()).filter(t => t.length > 0)
    );
    const uniqueTags = [...new Set(flattenedTags)];
    
    const result = uniqueTags.join(', ');
    
    console.log('[TAG-AUTO] Batch parallel processing completed!');
    console.log('[TAG-AUTO] FINAL RESULT:', result);
    
    return result;
}

// Optimized batch processing with parallel API calls and sequential LLM calls
async function processBatchedParallel(tags, strategy, generationType) {
    const BATCH_SIZE = 8; // Process 8 tags per batch for optimal balance
    const correctedTags = [];
    const processingStats = {
        totalTags: tags.length,
        processedTags: 0,
        successfulCorrections: 0,
        apiFailures: 0,
        llmFailures: 0,
        skippedTags: 0
    };
    
    // Split tags into batches
    const batches = [];
    for (let i = 0; i < tags.length; i += BATCH_SIZE) {
        batches.push(tags.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`[TAG-AUTO] Processing ${tags.length} tags in ${batches.length} batches of ${BATCH_SIZE}`);
    
    // Process each batch with error isolation
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`[TAG-AUTO] Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} tags`);
        
        try {
            const batchResults = await processSingleBatchWithErrorHandling(
                batch, 
                strategy, 
                generationType, 
                batchIndex + 1,
                processingStats
            );
            correctedTags.push(...batchResults);
            
        } catch (error) {
            console.error(`[TAG-AUTO] Batch ${batchIndex + 1} failed completely:`, error);
            // Add original tags as fallback for entire batch
            correctedTags.push(...batch);
            processingStats.processedTags += batch.length;
            processingStats.apiFailures += batch.length;
        }
        
        // Brief pause between batches to ensure LLM state isolation
        if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Progress logging
        const progressPercent = Math.round((processingStats.processedTags / processingStats.totalTags) * 100);
        console.log(`[TAG-AUTO] Progress: ${processingStats.processedTags}/${processingStats.totalTags} tags (${progressPercent}%)`);
    }
    
    // Final processing summary
    logProcessingSummary(processingStats);
    
    return correctedTags;
}

// Enhanced single batch processing with comprehensive error handling
async function processSingleBatchWithErrorHandling(tags, strategy, generationType, batchNumber, stats) {
    console.log(`[TAG-AUTO] Batch ${batchNumber}: Starting parallel API search phase`);
    
    // Phase 1: Parallel API calls with individual error handling
    const apiResultsPromises = tags.map(async (tag, index) => {
        try {
            return await processTagForApiSearch(tag, index, batchNumber, strategy);
        } catch (error) {
            console.warn(`[TAG-AUTO] Batch ${batchNumber}[${index}]: API search failed for "${tag}":`, error);
            stats.apiFailures++;
            return { tag, type: 'error', result: tag, error };
        }
    });
    
    // Wait for all API calls to complete with timeout protection
    let apiResults;
    try {
        // Add timeout to prevent hanging batch operations
        apiResults = await Promise.race([
            Promise.all(apiResultsPromises),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Batch API timeout')), 120000)
            )
        ]);
        console.log(`[TAG-AUTO] Batch ${batchNumber}: API search phase completed`);
    } catch (error) {
        console.error(`[TAG-AUTO] Batch ${batchNumber}: API search phase timed out:`, error);
        // Fallback: create error results for all tags
        apiResults = tags.map(tag => ({ tag, type: 'error', result: tag, error }));
        stats.apiFailures += tags.length;
    }
    
    // Phase 2: Sequential LLM processing with error isolation
    console.log(`[TAG-AUTO] Batch ${batchNumber}: Starting sequential LLM selection phase`);
    const finalResults = [];
    
    for (let i = 0; i < apiResults.length; i++) {
        const apiResult = apiResults[i];
        const tagIndex = `${batchNumber}[${i}]`;
        
        try {
            const result = await processTagForLLMSelection(apiResult, tagIndex, generationType, stats);
            finalResults.push(result);
            stats.processedTags++;
            
        } catch (error) {
            console.warn(`[TAG-AUTO] Batch ${tagIndex}: LLM processing failed for "${apiResult.tag}":`, error);
            finalResults.push(apiResult.tag); // Always fallback to original
            stats.llmFailures++;
            stats.processedTags++;
        }
        
        // Small delay between LLM calls to ensure response isolation
        if (i < apiResults.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 75));
        }
    }
    
    console.log(`[TAG-AUTO] Batch ${batchNumber}: Sequential LLM phase completed`);
    return finalResults;
}

// Process individual tag for API search phase
async function processTagForApiSearch(tag, index, batchNumber, strategy) {
    // Skip metadata tags in brackets (e.g., "[ASPECT:wide]", "[RESOLUTION:1024x1024]")
    if (tag.startsWith('[') && tag.endsWith(']')) {
        console.log(`[TAG-AUTO] Batch ${batchNumber}[${index}]: Skipping metadata tag: "${tag}"`);
        return { tag, type: 'metadata', result: tag };
    }
    
    // Handle mixed metadata + tag (e.g., "[ASPECT:square] padded_room")
    if (tag.includes('[') && tag.includes(']')) {
        const metadataMatch = tag.match(/(\[.*?\])\s*(.+)/);
        if (metadataMatch) {
            const [, metadata, actualTag] = metadataMatch;
            console.log(`[TAG-AUTO] Batch ${batchNumber}[${index}]: Processing mixed tag: metadata="${metadata}" tag="${actualTag}"`);
            
            const response = await searchTagCandidatesWithFallback(actualTag, strategy.candidateLimit);
            return { 
                tag, 
                type: 'mixed', 
                metadata, 
                actualTag, 
                result: response,
                hasApiResults: response.candidates && response.candidates.length > 0
            };
        }
    }
    
    // Skip tags that are likely weights/parameters (e.g., "(from_side:1.1)")
    if (tag.includes(':') && tag.includes('(')) {
        console.log(`[TAG-AUTO] Batch ${batchNumber}[${index}]: Skipping parameter tag: "${tag}"`);
        return { tag, type: 'parameter', result: tag };
    }

    // Regular tag processing
    console.log(`[TAG-AUTO] Batch ${batchNumber}[${index}]: API searching "${tag}"`);
    const response = await searchTagCandidatesWithFallback(tag, strategy.candidateLimit);
    
    return { 
        tag, 
        type: 'regular', 
        result: response,
        hasApiResults: response.candidates && response.candidates.length > 0
    };
}

// Process individual tag for LLM selection phase
async function processTagForLLMSelection(apiResult, tagIndex, generationType, stats) {
    // Handle different tag types
    if (apiResult.type === 'metadata' || apiResult.type === 'parameter') {
        console.log(`[TAG-AUTO] Batch ${tagIndex}: Using direct result for ${apiResult.type} tag: "${apiResult.result}"`);
        stats.skippedTags++;
        return apiResult.result;
    }
    
    if (apiResult.type === 'error') {
        console.log(`[TAG-AUTO] Batch ${tagIndex}: Using fallback for error tag: "${apiResult.result}"`);
        return apiResult.result;
    }
    
    if (apiResult.type === 'mixed') {
        if (apiResult.hasApiResults) {
            console.log(`[TAG-AUTO] Batch ${tagIndex}: LLM selecting for mixed tag "${apiResult.actualTag}" with ${apiResult.result.candidates.length} candidates`);
            
            const bestTag = await selectBestTagWithContext(
                apiResult.result.candidates, 
                apiResult.actualTag, 
                generationType
            );
            
            const finalTag = `${apiResult.metadata} ${bestTag}`;
            console.log(`[TAG-AUTO] Batch ${tagIndex}: LLM selected "${bestTag}" -> final: "${finalTag}"`);
            stats.successfulCorrections++;
            return finalTag;
        } else {
            console.log(`[TAG-AUTO] Batch ${tagIndex}: No candidates for mixed tag, keeping original: "${apiResult.tag}"`);
            return apiResult.tag;
        }
    }
    
    if (apiResult.type === 'regular') {
        if (apiResult.hasApiResults) {
            console.log(`[TAG-AUTO] Batch ${tagIndex}: LLM selecting for "${apiResult.tag}" with ${apiResult.result.candidates.length} candidates`);
            
            // Special handling for compound tags that were broken down into components
            const result = await handleCompoundTagSelection(apiResult, generationType);
            
            console.log(`[TAG-AUTO] Batch ${tagIndex}: Selected "${result}" for "${apiResult.tag}"`);
            stats.successfulCorrections++;
            return result;
        } else {
            console.log(`[TAG-AUTO] Batch ${tagIndex}: No candidates found, keeping original: "${apiResult.tag}"`);
            return apiResult.tag;
        }
    }
    
    // Fallback case
    return apiResult.tag;
}

// Handle compound tag selection with smart combination logic
async function handleCompoundTagSelection(apiResult, generationType) {
    const originalTag = apiResult.tag;
    const candidates = apiResult.result.candidates;
    
    // Check if this looks like a compound tag that was broken down
    const isCompoundTag = originalTag.includes('_') && candidates.length >= 2;
    
    if (isCompoundTag) {
        const components = originalTag.split('_');
        console.log(`[TAG-AUTO] Detected compound tag "${originalTag}" with components: [${components.join(', ')}]`);
        
        // Try to find candidates that represent each component
        const componentMatches = [];
        
        for (const component of components) {
            const matchingCandidate = candidates.find(candidate => 
                candidate.toLowerCase().includes(component.toLowerCase()) ||
                component.toLowerCase().includes(candidate.toLowerCase())
            );
            
            if (matchingCandidate) {
                componentMatches.push(matchingCandidate);
                console.log(`[TAG-AUTO] Found component match: "${component}" -> "${matchingCandidate}"`);
            }
        }
        
        // If we found matches for multiple components, combine them intelligently
        if (componentMatches.length >= 2) {
            // Remove duplicates while preserving order
            const uniqueMatches = [...new Set(componentMatches)];
        }
        
        // If component matching didn't work well, fall back to single best match
        console.log(`[TAG-AUTO] Component matching insufficient, using single best match for "${originalTag}"`);
    }
    
    // Standard single tag selection
    return await selectBestTagWithContext(candidates, originalTag, generationType);
}

// Log processing summary with performance metrics
function logProcessingSummary(stats) {
    const successRate = Math.round((stats.successfulCorrections / stats.totalTags) * 100);
    const apiFailureRate = Math.round((stats.apiFailures / stats.totalTags) * 100);
    const llmFailureRate = Math.round((stats.llmFailures / stats.totalTags) * 100);
    
    console.log(`[TAG-AUTO] ===== PROCESSING SUMMARY =====`);
    console.log(`[TAG-AUTO] Total tags: ${stats.totalTags}`);
    console.log(`[TAG-AUTO] Processed: ${stats.processedTags}`);
    console.log(`[TAG-AUTO] Successful corrections: ${stats.successfulCorrections} (${successRate}%)`);
    console.log(`[TAG-AUTO] API failures: ${stats.apiFailures} (${apiFailureRate}%)`);
    console.log(`[TAG-AUTO] LLM failures: ${stats.llmFailures} (${llmFailureRate}%)`);
    console.log(`[TAG-AUTO] Skipped tags: ${stats.skippedTags}`);
    console.log(`[TAG-AUTO] ==============================`);
}


// Hook into SillyTavern's image generation pipeline
let originalGetPrompt = null;
let originalGeneratePicture = null;
window.globalPrompt = null;

function hookImageGeneration() {
    if (extensionSettings.debug) {
        console.log('Tag Autocompletion: Setting up clean event hooks...');
    }

    function setupEventHook() {
        const context = window.SillyTavern?.getContext();
        const eventSource = context?.eventSource;
        
        console.log('[TAG-AUTO] Debug info:');
        console.log('[TAG-AUTO] - SillyTavern:', !!window.SillyTavern);
        console.log('[TAG-AUTO] - getContext:', !!window.SillyTavern?.getContext);
        console.log('[TAG-AUTO] - context:', !!context);
        console.log('[TAG-AUTO] - eventSource:', !!eventSource);
        console.log('[TAG-AUTO] - eventSource type:', typeof eventSource);
        console.log('[TAG-AUTO] - event_types available:', !!context.event_types);
        console.log('[TAG-AUTO] - SD_PROMPT_PROCESSING via context:', context.event_types?.SD_PROMPT_PROCESSING);
        console.log('[TAG-AUTO] - window.event_types available:', !!window.event_types);
        console.log('[TAG-AUTO] - SD_PROMPT_PROCESSING via window:', window.event_types?.SD_PROMPT_PROCESSING);
        
        if (eventSource) {
            // Test if we can listen to any events
            eventSource.on('message_sent', () => {
                console.log('[TAG-AUTO] Test event: message_sent fired');
            });
            
            // Use the hardcoded string since event_types constant isn't accessible to extensions
            const eventName = 'sd_prompt_processing';
            console.log('[TAG-AUTO] Using event name:', eventName);
            
            eventSource.on(eventName, (data) => {
                return new Promise(async (resolve, reject) => {
                    try {
                        console.log('[TAG-AUTO] *** SD PROMPT PROCESSING EVENT TRIGGERED ***');
                        console.log('[TAG-AUTO] Event data:', data);
                        console.log('[TAG-AUTO] Original prompt length:', data.prompt?.length || 0);
                        console.log('[TAG-AUTO] Original prompt:', data.prompt);
                        console.log('[TAG-AUTO] Generation type:', data.generationType);
                        console.log('[TAG-AUTO] Extension enabled:', extensionSettings.enabled);
                        
                        // Debug: Check what profile is active when the event fires
                        const currentProfile = getCurrentProfile();
                        console.log('[TAG-AUTO] Current profile when event fires:', currentProfile?.name || 'None');
                        
                        if (extensionSettings.enabled && data.prompt) {
                            try {
                                window.globalPrompt = data.prompt;
                                console.log('[TAG-AUTO] Starting tag correction...');
                                const corrected = await correctTagsWithContext(data.prompt, data.generationType);
                                data.prompt = corrected;
                                
                                console.log('[TAG-AUTO] Prompt correction complete!');
                                console.log('[TAG-AUTO] Final prompt:', corrected);
                                
                                // Wait for profile restoration to complete
                                console.log('[TAG-AUTO] Waiting for profile operations to complete...');
                                while (profileSwitchInProgress) {
                                    await new Promise(resolve => setTimeout(resolve, 50));
                                }
                                
                                // Wait for ALL LLM operations to complete
                                await waitForAllLLMOperations();
                                
                                console.log('[TAG-AUTO] Extension processing finished - image generation can proceed');
                                resolve(); // Resolve AFTER all operations complete including profile restoration
                            } catch (error) {
                                console.error('[TAG-AUTO] Error during correction:', error);
                                console.warn('[TAG-AUTO] Tag correction failed - using original prompt');
                                
                                // Wait for profile cleanup even on error
                                while (profileSwitchInProgress) {
                                    await new Promise(resolve => setTimeout(resolve, 50));
                                }
                                
                                // Wait for ALL LLM operations to complete even on error
                                await waitForAllLLMOperations();
                                
                                // Don't modify data.prompt - let original prompt through
                                resolve(); // Resolve even on error
                            }
                        } else {
                            console.log('[TAG-AUTO] Skipping correction - extension disabled or no prompt');
                            resolve(); // Resolve immediately if skipping
                        }
                    } catch (error) {
                        console.error('[TAG-AUTO] Unexpected error in event handler:', error);
                        resolve(); // Resolve even on error to prevent hanging
                    }
                });
            });
            
            if (extensionSettings.debug) {
                console.log('Tag Autocompletion: Successfully hooked into SD prompt processing event');
            }
            return true;
        } else {
            console.error('[TAG-AUTO] Failed to get eventSource!');
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
    const isEnabled = $('#tag_autocomplete_enabled').prop('checked');
    
    if (isEnabled && !profileCheckPassed) {
        // Prevent enabling if profile doesn't exist
        $('#tag_autocomplete_enabled').prop('checked', false);
        showProfileError();
        return;
    }
    
    extensionSettings.enabled = isEnabled;
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

// Refresh profile check
function refreshProfileCheck() {
    const requiredProfile = checkProfileExists();
    profileCheckPassed = !!requiredProfile;
    
    const status = $('#tag_autocomplete_profile_status');
    if (profileCheckPassed) {
        status.removeClass('warning_message').addClass('success_message')
            .text(`✓ Profile "${REQUIRED_PROFILE_NAME}" found`);
    } else {
        status.removeClass('success_message').addClass('warning_message')
            .text(`✗ Profile "${REQUIRED_PROFILE_NAME}" not found`);
    }
    
    // Disable extension if profile is missing
    if (!profileCheckPassed && extensionSettings.enabled) {
        extensionSettings.enabled = false;
        $('#tag_autocomplete_enabled').prop('checked', false);
        saveSettings();
        onExtensionDisabled();
    }
    
    if (extensionSettings.debug) {
        console.log(`[TAG-AUTO] Profile check refreshed: ${profileCheckPassed ? 'PASSED' : 'FAILED'}`);
    }
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
                    <button id="tag_autocomplete_refresh_profile" class="menu_button" type="button">Check Profile</button>
                </div>
                <div class="flex-container">
                    <small id="tag_autocomplete_test_status"></small>
                </div>
                <div class="flex-container">
                    <small id="tag_autocomplete_profile_status"></small>
                </div>
                <small class="notes">
                    <strong>Requirements:</strong>
                    <br>1. A running Tag Autocompletion API server
                    <br>2. A connection profile named "${REQUIRED_PROFILE_NAME}" configured with your preferred API for LLM calls
                    <br><br>The extension will automatically correct Danbooru tags in image generation prompts using context-aware selection.
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
    $('#tag_autocomplete_refresh_profile').on('click', refreshProfileCheck);
    
    // Load current settings into UI
    $('#tag_autocomplete_enabled').prop('checked', extensionSettings.enabled);
    $('#tag_autocomplete_api_endpoint').val(extensionSettings.apiEndpoint);
    $('#tag_autocomplete_timeout').val(extensionSettings.timeout);
    $('#tag_autocomplete_debug').prop('checked', extensionSettings.debug);
    
    // Show initial profile status
    setTimeout(refreshProfileCheck, 100);
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

// Expose emergency reset functions globally for debugging
window.tagAutoResetProfileSwitch = resetProfileSwitchState;
window.tagAutoResetAllOperations = resetAllOperations;
window.tagAutoStatus = function() {
    console.log('[TAG-AUTO] Current status:');
    console.log('- Active LLM operations:', activeLLMOperations.size, Array.from(activeLLMOperations));
    console.log('- Active abort controllers:', activeAbortControllers.size, Array.from(activeAbortControllers.keys()));
    console.log('- Profile switch in progress:', profileSwitchInProgress);
};


// Initialize the extension
await init();