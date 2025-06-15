# SillyTavern Tag Autocompletion - Docker Patch Installation

## Overview
This patch adds extension hooks to SillyTavern's Stable Diffusion extension, allowing the Tag Autocompletion extension to intercept and modify image generation prompts before they're sent to ComfyUI/SD WebUI.

## What Gets Patched
**File:** `/public/scripts/extensions/stable-diffusion/index.js`  
**Changes:** Adds 7 lines of code to emit an extension event with async support

## Installation Methods

### Method 1: Apply Patch in Running Docker Container

```bash
# 1. Copy patch files to container
docker cp sillytavern-extension-hooks.patch your-container-name:/tmp/
docker cp apply-patch.sh your-container-name:/tmp/

# 2. Enter container and apply patch
docker exec -it your-container-name bash
cd /tmp
chmod +x apply-patch.sh
./apply-patch.sh /app

# 3. Exit and restart container
exit
docker restart your-container-name
```

### Method 2: Volume Mount (if SillyTavern directory is mounted)

```bash
# If your SillyTavern files are mounted to host
./apply-patch.sh /path/to/mounted/sillytavern

# Restart container
docker restart your-container-name
```

### Method 3: Custom Dockerfile Build

```dockerfile
FROM your-base-sillytavern-image

# Copy patch files
COPY sillytavern-extension-hooks.patch /tmp/
COPY apply-patch.sh /tmp/

# Apply patch during build
RUN cd /tmp && \
    chmod +x apply-patch.sh && \
    ./apply-patch.sh /app && \
    rm -f /tmp/sillytavern-extension-hooks.patch /tmp/apply-patch.sh

# Continue with your usual setup...
```

## What the Patch Does

The patch modifies the `generatePicture` function in the Stable Diffusion extension:

**Before:**
```javascript
const prompt = await getPrompt(generationType, message, trigger, quietPrompt, combineNegatives);
console.log('Processed image prompt:', prompt);
```

**After:**
```javascript
let prompt = await getPrompt(generationType, message, trigger, quietPrompt, combineNegatives);
console.log('Processed image prompt:', prompt);

// Extension hook for prompt processing
if (window.eventSource) {
    const extensionData = { prompt, generationType, message, trigger };
    await window.eventSource.emit('sd_prompt_processing', extensionData);
    prompt = extensionData.prompt; // Allow extensions to modify the prompt
}
```

## Extension Hook Details

The patch creates an extension point that:

- ✅ **Emits `sd_prompt_processing` event** with prompt data
- ✅ **Waits for async extensions** to process the prompt  
- ✅ **Allows prompt modification** via `extensionData.prompt`
- ✅ **Provides context** (generationType, message, trigger)
- ✅ **Race-condition safe** with proper async/await

## Verification

After applying the patch and restarting:

1. **Check patch was applied:**
   ```bash
   docker exec your-container grep -A 5 "sd_prompt_processing" /app/public/scripts/extensions/stable-diffusion/index.js
   ```

2. **Install Tag Autocompletion extension and enable debug mode**

3. **Test image generation:**
   ```
   /sd last
   ```

4. **Check browser console for:**
   ```
   Tag Autocompletion: SD prompt processing event triggered
   Tag Autocompletion: Original prompt: [ASPECT:wide], public, crowd...
   Tag Autocompletion: Corrected prompt: [ASPECT:wide], public space, crowd...
   ```

## Troubleshooting

### Patch Application Fails

**Check SillyTavern version compatibility:**
```bash
# The patch targets the specific line numbers in the current version
# If it fails, the Stable Diffusion extension may have changed
docker exec your-container head -n 2470 /app/public/scripts/extensions/stable-diffusion/index.js | tail -n 10
```

**Manual application if needed:**
```bash
# Edit the file directly if patch fails
docker exec -it your-container nano /app/public/scripts/extensions/stable-diffusion/index.js
# Navigate to line ~2468 and add the extension hook code manually
```

### Extension Not Working

**Check extension is loaded:**
```bash
# Browser console should show:
Tag Autocompletion: Successfully hooked into SD prompt processing event
```

**Check API server is running:**
```bash
curl -X POST "http://localhost:8000/search_tag" \
  -H "Content-Type: application/json" \
  -d '{"query": "blonde_hair", "limit": 5}'
```

### Restore Original Code

The script creates automatic backups:
```bash
# Find backup files
docker exec your-container ls -la /app/public/scripts/extensions/stable-diffusion/index.js.backup.*

# Restore original
docker exec your-container cp /app/public/scripts/extensions/stable-diffusion/index.js.backup.YYYYMMDD_HHMMSS /app/public/scripts/extensions/stable-diffusion/index.js

# Restart
docker restart your-container
```

## Safety & Compatibility

- ✅ **Minimal changes:** Only 7 lines added
- ✅ **Non-breaking:** Existing functionality unchanged
- ✅ **Automatic backups:** Original file preserved
- ✅ **Graceful fallback:** Extension hook is optional
- ✅ **Version detection:** Script checks compatibility

This patch enables clean extension development for SillyTavern image generation without breaking existing functionality.