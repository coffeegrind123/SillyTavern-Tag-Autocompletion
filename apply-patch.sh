#!/bin/sh

# Script to apply SillyTavern extension hooks patch
# Usage: ./apply-patch.sh [path-to-sillytavern]

SILLYTAVERN_PATH=${1:-"/home/node/app"}
PATCH_FILE="sillytavern-extension-hooks.patch"

echo "🚀 Applying SillyTavern extension hooks patch..."
echo "📁 SillyTavern path: $SILLYTAVERN_PATH"

# Check if SillyTavern directory exists
if [ ! -d "$SILLYTAVERN_PATH" ]; then
    echo "❌ Error: SillyTavern directory not found at $SILLYTAVERN_PATH"
    echo "Usage: $0 [path-to-sillytavern]"
    exit 1
fi

# Check if patch file exists
if [ ! -f "$PATCH_FILE" ]; then
    echo "❌ Error: Patch file $PATCH_FILE not found"
    exit 1
fi

# Check if the target file exists
TARGET_FILE="$SILLYTAVERN_PATH/public/scripts/extensions/stable-diffusion/index.js"
if [ ! -f "$TARGET_FILE" ]; then
    echo "❌ Error: Target file not found: $TARGET_FILE"
    echo "Make sure this is a valid SillyTavern installation with the Stable Diffusion extension"
    exit 1
fi

# Check if patch is already applied
if grep -q "sd_prompt_processing" "$TARGET_FILE"; then
    echo "⚠️  Patch appears to already be applied!"
    echo "Checking for exact match..."
    if grep -A 2 -B 2 "sd_prompt_processing" "$TARGET_FILE" | grep -q "extensionData.prompt"; then
        echo "✅ Patch is already correctly applied. Nothing to do."
        exit 0
    else
        echo "⚠️  Partial or different version detected. Proceeding with caution..."
    fi
fi

# Create backup
BACKUP_FILE="${TARGET_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
echo "💾 Creating backup: $BACKUP_FILE"
cp "$TARGET_FILE" "$BACKUP_FILE"

# Apply patch
echo "🔧 Applying patch..."
cd "$SILLYTAVERN_PATH"

if patch -p1 --dry-run < "$OLDPWD/$PATCH_FILE" > /dev/null 2>&1; then
    patch -p1 < "$OLDPWD/$PATCH_FILE"
    echo "✅ Patch applied successfully!"
    echo "📦 Backup created at: $BACKUP_FILE"
    
    # Verify the patch was applied correctly
    if grep -q "sd_prompt_processing" "$TARGET_FILE"; then
        echo "✅ Verification passed: Extension hook found in patched file"
    else
        echo "⚠️  Warning: Could not verify patch application"
    fi
else
    echo "❌ Patch dry-run failed. The patch may not be compatible with this version of SillyTavern."
    echo "📋 Possible reasons:"
    echo "   - Different SillyTavern version"
    echo "   - File has been modified"
    echo "   - Patch already applied"
    echo ""
    echo "🔍 You can manually inspect the differences:"
    echo "   patch -p1 --dry-run < '$OLDPWD/$PATCH_FILE'"
    rm "$BACKUP_FILE"
    exit 1
fi

echo ""
echo "🎉 SillyTavern is now ready for Tag Autocompletion extension!"
echo ""
echo "📋 Next steps:"
echo "1. 🔄 Restart SillyTavern (docker restart container-name)"
echo "2. 📁 Install the Tag Autocompletion extension"
echo "3. 🔧 Enable extension and configure your API endpoint"
echo "4. 🐛 Enable debug mode to see the extension working"
echo "5. 🖼️  Test with: /sd last"
echo ""
echo "🔄 To restore original SillyTavern:"
echo "   cp '$BACKUP_FILE' '$TARGET_FILE'"