# DeepSeek-Optimized Image Prompt Templates with Metadata

## Instructions for LLM Integration

Each template includes metadata tags that the ComfyUI node will parse. Choose from these exact values:

**RATING OPTIONS:** `general`, `sensitive`, `questionable`, `explicit`
**LENGTH OPTIONS:** `very_short`, `short`, `long`, `very_long`
**ASPECT OPTIONS:** 
- API values: `too_tall`, `tall_wallpaper`, `tall`, `square`, `wide`, `wide_wallpaper`, `too_wide`
- Alternative names: `portrait`, `landscape`, `vertical`, `horizontal`  
- Ratio format: `9:16`, `2:3`, `3:4`, `1:1`, `4:3`, `3:2`, `16:9`
- Or use direct resolution: `[RESOLUTION:WxH]` (e.g., `[RESOLUTION:1024x1024]`)

**Resolution Mapping:**
- `too_tall` / `9:16` → 768×1344
- `tall_wallpaper` / `2:3` / `vertical` → 832×1216  
- `tall` / `3:4` / `portrait` → 896×1152
- `square` / `1:1` → 1024×1024
- `wide` / `4:3` / `landscape` → 1152×896
- `wide_wallpaper` / `3:2` / `horizontal` → 1216×832
- `too_wide` / `16:9` → 1344×768

---

## Template Functions

### Character ("Yourself")
```
You must generate a detailed comma-separated list of danbooru/e621 tags describing {{char}}. Process ALL conversation content about {{char}} and convert everything into proper tags. Do not stop until you have processed the complete character description.

EXAMPLE INPUT: A conversation about a blonde anime girl in a school uniform who is standing and smiling.
EXAMPLE OUTPUT: full body portrait, 1girl, long blonde hair, blue eyes, school uniform, white shirt, blue skirt, standing, smile, looking at viewer, outdoor, school background

OUTPUT FORMAT: Start with "full body portrait," then list all tags in lowercase english, comma-separated with spaces.

TAG ORDER:
1. Character count (1girl, 1boy, etc.)
2. Full character name and series: character name \(series name\)
3. Hair: color, style, length, accessories
4. Eyes: color, shape, expression
5. Facial features: expression, markings
6. Body: breast size, body type, skin details
7. Clothing: garments with colors, patterns, shapes (describe what IS worn)
8. Accessories: jewelry, glasses, belts, watches (only if present)
9. Pose: stance, position, gestures
10. Actions: activities, positioning
11. Background: environment details

CRITICAL RULES:
- Use only actual danbooru/e621 tags (no custom phrases)
- Each tag used only once
- NEVER use tags starting with "no_" (no_bra, no_panties, no_clothing, etc.)
- NEVER use: without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)
- Instead of "no_clothing" use: nude, naked, undressed
- Instead of "no_furniture" use: empty_room, simple_background, minimal_setting
- Aim for 30-40 tags with rich detail
- Focus only on what IS visible, present, and actively described
- Do not include personality, thoughts, emotions, or dialogue
- Do not reply as {{char}} or continue the story

Choose aspect ratio: [ASPECT:portrait] (use 'portrait' or 'tall' for full body shots)
```

### User ("Me")  
```
You must generate a detailed comma-separated list of danbooru/e621 tags describing {{user}}'s physical appearance from {{char}}'s perspective. Process ALL conversation content about {{user}} and convert everything into proper tags. Do not stop until you have processed the complete user description.

EXAMPLE INPUT: A conversation where the user is described as a tall man with dark hair wearing casual clothes.
EXAMPLE OUTPUT: full body portrait, 1boy, tall, short black hair, brown eyes, casual clothing, jeans, t-shirt, standing, confident expression, looking forward

OUTPUT FORMAT: Start with "full body portrait," then list all tags in lowercase english, comma-separated with spaces.

TAG ORDER:
1. Character count (1girl, 1boy, etc.)
2. Hair: color, style, length, accessories
3. Eyes: color, shape, expression
4. Facial features: expression, markings
5. Body: breast size, body type, skin details
6. Clothing: garments with colors, patterns, shapes (describe what IS worn)
7. Accessories: jewelry, glasses, belts, watches (only if present)
8. Pose: stance, position, gestures
9. Actions: activities, positioning

CRITICAL RULES:
- Use only actual danbooru/e621 tags (no custom phrases)
- Each tag used only once
- NEVER use tags starting with "no_" (no_bra, no_panties, no_clothing, etc.)
- NEVER use: without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)
- Instead of "no_clothing" use: nude, naked, undressed
- Instead of "no_furniture" use: empty_room, simple_background, minimal_setting
- Aim for 30-40 tags with rich detail
- Focus only on what IS visible, present, and actively described
- Do not include personality, thoughts, emotions, or dialogue
- Do not reply as {{char}} or continue the story

Choose aspect ratio: [ASPECT:portrait] (use 'portrait' or 'tall' for full body shots)
```

### Scenario ("The Whole Story")
```
You must generate a detailed comma-separated list of danbooru/e621 tags describing the current scene. Process ALL recent conversation events and convert everything into proper tags. Do not stop until you have processed the complete scene description.

EXAMPLE INPUT: A conversation taking place in a bedroom at night with two characters sitting on a bed talking.
EXAMPLE OUTPUT: indoor, bedroom, night, dim lighting, 2girls, sitting, bed, pillows, wooden floor, window, moonlight, conversation, casual clothing, long hair, facing each other

OUTPUT FORMAT: List all tags in lowercase english, comma-separated with spaces.

TAG ORDER:
1. Background: location type, setting details
2. Environment: time of day, weather, lighting, atmosphere
3. Character count: number and gender (2girls, 1boy, etc.)
4. Character appearances: hair, eyes, clothing, poses (describe what IS worn/visible)
5. Interactions: positioning, contact, activities
6. Objects: furniture, items, decorations (only what IS present)
7. Actions: what characters are doing
8. Sexual activity: specific descriptions if applicable

CRITICAL RULES:
- Use only actual danbooru/e621 tags (no custom phrases)
- Each tag used only once
- NEVER use tags starting with "no_" (no_bra, no_panties, no_clothing, etc.)
- NEVER use: without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)
- Instead of "no_clothing" use: nude, naked, undressed
- Instead of "no_furniture" use: empty_room, simple_background, minimal_setting
- Aim for 40+ tags with rich detail
- Focus only on what IS visible, present, and actively described
- Prioritize specific descriptions of any sexual activities
- Do not reply as {{char}} or continue the story

Choose aspect ratio: [ASPECT:wide] (use 'wide' or 'landscape' for scene/environment shots)
```

### Last Message (Detailed)
```
You must generate a detailed comma-separated list of danbooru/e621 tags describing the visual details from the last chat message. Process ALL content from the last message and convert everything into proper tags. Do not stop until you have processed the complete message content.

EXAMPLE INPUT: Last message describes a character removing their jacket in a bedroom.
EXAMPLE OUTPUT: bedroom, 1girl, from behind, undressing, removing jacket, long hair, standing, bed visible, wooden floor, warm lighting

OUTPUT FORMAT: List all tags in lowercase english, comma-separated with spaces.

TAG ORDER:
1. Background: location, setting
2. Character count: number and gender (1girl, 1boy, 2girls, etc.)
3. Camera angle: perspective, point of view
4. Primary action: main activity
5. Character appearances: hair, eyes, clothing, expressions, poses (describe what IS worn/visible)
6. Interactions: physical contact, positioning
7. Sexual activity: specific descriptions if applicable
8. Objects: items, furniture, accessories (only what IS present)

CRITICAL RULES:
- Use only actual danbooru/e621 tags (no custom phrases)
- Each tag used only once
- NEVER use tags starting with "no_" (no_bra, no_panties, no_clothing, etc.)
- NEVER use: without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)
- Instead of "no_clothing" use: nude, naked, undressed
- Instead of "no_furniture" use: empty_room, simple_background, minimal_setting
- Aim for 30-40 tags with rich detail
- Use pronouns (he, she, male, female) instead of character names
- Ignore dialogue, thoughts, emotions - only visual elements
- Focus only on what IS visible, present, and actively described
- Prioritize specific sexual descriptions if applicable

Choose aspect ratio: [ASPECT:square] (choose based on scene composition)
```

### Portrait ("Your Face")
```
You must generate a detailed comma-separated list of danbooru/e621 tags describing {{char}}'s head and upper body. Process ALL conversation content about {{char}}'s facial features and convert everything into proper tags. Do not stop until you have processed the complete facial description.

EXAMPLE INPUT: A conversation about a character with blue eyes, blonde hair, wearing a white shirt and smiling.
EXAMPLE OUTPUT: close up facial portrait, 1girl, blonde hair, long hair, blue eyes, gentle smile, white shirt, looking at viewer, soft lighting

OUTPUT FORMAT: Start with "close up facial portrait," then list all tags in lowercase english, comma-separated with spaces.

TAG ORDER:
1. Portrait type: close up, facial portrait, upper body
2. Character name and series: character name \(series name\) if applicable
3. Hair: color, style, length, accessories
4. Eyes: color, shape, expression, special features
5. Facial features: expression, mouth, eyebrows, markings
6. Upper body clothing: garments, colors, patterns, accessories (describe what IS worn)
7. Accessories: jewelry, glasses, headwear (only if present)

CRITICAL RULES:
- Use only actual danbooru/e621 tags (no custom phrases)
- Each tag used only once
- NEVER use tags starting with "no_" (no_bra, no_panties, no_clothing, etc.)
- NEVER use: without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)
- Instead of "no_clothing" use: nude, naked, undressed
- Instead of "no_furniture" use: empty_room, simple_background, minimal_setting
- Aim for 25-35 tags with rich facial detail
- Do not describe below the neck except upper body clothing
- Focus only on what IS visible, present, and actively described

Choose aspect ratio: [ASPECT:square] (use 'square' for close-up portraits)
```

### Background
```
You must generate a detailed comma-separated list of danbooru/e621 tags describing {{char}}'s surroundings and environment. Process ALL conversation content about the current setting and convert everything into proper tags. Do not stop until you have processed the complete environment description.

EXAMPLE INPUT: A conversation taking place in a cozy coffee shop during the afternoon.
EXAMPLE OUTPUT: background, indoor, coffee shop, afternoon, natural lighting, wooden tables, chairs, windows, warm atmosphere, casual setting, plants, menu board

OUTPUT FORMAT: Start with "background," then list all tags in lowercase english, comma-separated with spaces.

TAG ORDER:
1. Background type: indoor, outdoor, specific location
2. Location details: room type, landscape, building, setting
3. Time details: day, night, time period, season
4. Weather: sky condition, atmospheric effects
5. Lighting: natural light, artificial light, mood lighting, shadows
6. Objects: furniture, decorations, plants, items (only what IS present)
7. Atmosphere: mood, style, ambiance
8. Architectural: walls, floors, ceilings, structural details

CRITICAL RULES:
- Use only actual danbooru/e621 tags (no custom phrases)
- Each tag used only once
- NEVER use tags starting with "no_" (no_bra, no_panties, no_clothing, etc.)
- NEVER use: without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)
- Instead of "no_clothing" use: nude, naked, undressed
- Instead of "no_furniture" use: empty_room, simple_background, minimal_setting
- Aim for 25-35 tags with rich environmental detail
- Do not include character descriptions
- Do not reply as {{user}} or continue the story
- Focus only on what IS visible, present, and actively described

Choose aspect ratio: [ASPECT:wide] (use 'wide' or 'landscape' for backgrounds)
```

### Character (Multimodal Mode)
```
You must generate an exhaustive comma-separated list of danbooru/e621 tags describing the character's appearance in this image. Analyze ALL visual details in the image and convert everything into proper tags. Do not stop until you have processed every visible element.

EXAMPLE INPUT: An image showing an anime girl with long red hair in a blue dress standing in a garden.
EXAMPLE OUTPUT: full body portrait, 1girl, long red hair, blue dress, standing, garden, flowers, trees, sunlight, looking at viewer, gentle expression

OUTPUT FORMAT: Start with "full body portrait," then list all tags in lowercase english, comma-separated with spaces.

TAG ORDER:
1. Character count (1girl, 1boy, etc.)
2. Character identity: name \(source\) if recognizable
3. Hair: color, style, length, accessories
4. Eyes: color, shape, expression, special features
5. Facial features: expression, markings, mouth
6. Body: breast size, body type, skin details, anatomy
7. Clothing: garments, colors, styles, conditions, patterns (describe what IS worn)
8. Pose: position, gesture, body language
9. Objects: held items, accessories, background elements (only what IS present)
10. Actions: activities, movements, interactions

CRITICAL RULES:
- Use only actual danbooru/e621 tags (no custom phrases)
- Each tag used only once
- NEVER use tags starting with "no_" (no_bra, no_panties, no_clothing, etc.)
- NEVER use: without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)
- Instead of "no_clothing" use: nude, naked, undressed
- Instead of "no_furniture" use: empty_room, simple_background, minimal_setting
- Aim for 40+ tags with exhaustive detail
- Analyze and describe everything visible in the image
- Focus only on what IS visible, present, and actively described

Choose aspect ratio: [ASPECT:portrait] (match the input image aspect ratio)
```

### User (Multimodal Mode)
```
You must generate an exhaustive comma-separated list of danbooru/e621 tags describing the character's appearance in this image. Analyze ALL visual details in the image and convert everything into proper tags. Do not stop until you have processed every visible element.

EXAMPLE INPUT: An image showing a person with short brown hair wearing a red jacket.
EXAMPLE OUTPUT: full body portrait, 1boy, short brown hair, red jacket, jeans, standing, urban background, looking forward, confident pose

OUTPUT FORMAT: Start with "full body portrait," then list all tags in lowercase english, comma-separated with spaces.

TAG ORDER:
1. Character count (1girl, 1boy, etc.)
2. Hair: color, style, length, accessories
3. Eyes: color, shape, expression, special features
4. Facial features: expression, markings, mouth
5. Body: breast size, body type, skin details, anatomy
6. Clothing: garments, colors, styles, conditions, patterns (describe what IS worn)
7. Pose: position, gesture, body language
8. Objects: held items, accessories, background elements (only what IS present)
9. Actions: activities, movements, interactions

CRITICAL RULES:
- Use only actual danbooru/e621 tags (no custom phrases)
- Each tag used only once
- NEVER use tags starting with "no_" (no_bra, no_panties, no_clothing, etc.)
- NEVER use: without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)
- Instead of "no_clothing" use: nude, naked, undressed
- Instead of "no_furniture" use: empty_room, simple_background, minimal_setting
- Aim for 40+ tags with exhaustive detail
- Analyze and describe everything visible in the image
- Focus only on what IS visible, present, and actively described

Choose aspect ratio: [ASPECT:portrait] (match the input image aspect ratio)
```

### Portrait (Multimodal Mode)
```
You must generate an exhaustive comma-separated list of danbooru/e621 tags describing the character's head and upper body in this image. Analyze ALL facial and upper body details in the image and convert everything into proper tags. Do not stop until you have processed every visible facial element.

EXAMPLE INPUT: A close-up image of a character with green eyes and black hair wearing a white shirt.
EXAMPLE OUTPUT: close up facial portrait, 1girl, black hair, short hair, green eyes, white shirt, looking at viewer, neutral expression, soft lighting

OUTPUT FORMAT: Start with "close up facial portrait," then list all tags in lowercase english, comma-separated with spaces.

TAG ORDER:
1. Portrait type: close up, facial portrait, upper body
2. Hair: color, style, length, accessories
3. Eyes: color, shape, expression, special features
4. Facial features: expression, mouth, eyebrows, markings, skin
5. Upper body clothing: garments, accessories, colors, patterns (describe what IS worn)
6. Accessories: jewelry, headwear, glasses (only if present)
7. Lighting: how light affects the face and upper body

CRITICAL RULES:
- Use only actual danbooru/e621 tags (no custom phrases)
- Each tag used only once
- NEVER use tags starting with "no_" (no_bra, no_panties, no_clothing, etc.)
- NEVER use: without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)
- Instead of "no_clothing" use: nude, naked, undressed
- Instead of "no_furniture" use: empty_room, simple_background, minimal_setting
- Aim for 35+ tags with exhaustive facial detail
- Focus only on head and upper body elements
- Focus only on what IS visible, present, and actively described

Choose aspect ratio: [ASPECT:square] (use 'square' for close-up portraits)
```

### Free Mode (LLM-Extended)
```
You must generate an exhaustive comma-separated list of danbooru/e621 tags describing the appearance of "{0}" in great detail. Process ALL available information about the subject and convert everything into proper tags. Do not stop until you have processed the complete subject description.

EXAMPLE INPUT: Request to describe "a magical forest scene with elves"
EXAMPLE OUTPUT: fantasy forest, magical atmosphere, 2girls, elf ears, long hair, nature setting, trees, magical lighting, fantasy clothing, standing, mystical background

OUTPUT FORMAT: Start with appropriate image type prefix, then list all tags in lowercase english, comma-separated with spaces.

TAG ORDER:
1. Character/subject count and type
2. Identity: character name \(source\) if applicable, or subject type
3. Physical appearance: hair, eyes, body, features
4. Clothing: garments, accessories, colors, patterns, styles (describe what IS worn)
5. Scene: setting, pose, actions, interactions, objects (only what IS present)
6. Sexual activity: specific descriptions if applicable
7. Background: environment, lighting, atmosphere

CRITICAL RULES:
- Use only actual danbooru/e621 tags (no custom phrases)
- Each tag used only once
- NEVER use tags starting with "no_" (no_bra, no_panties, no_clothing, etc.)
- NEVER use: without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)
- Instead of "no_clothing" use: nude, naked, undressed
- Instead of "no_furniture" use: empty_room, simple_background, minimal_setting
- Aim for 40+ tags with rich detail
- Focus only on what IS visible, present, and actively described
- Prioritize specific sexual descriptions if theme involves sexual content

Choose aspect ratio: [ASPECT:portrait] (choose based on subject type)
```

---

## CRITICAL: Negative Tag Prevention Guide

NEVER USE THESE PATTERNS:
- `no_clothing, no_bra, no_panties, no_shoes, no_socks`
- `no_jewelry, no_makeup, no_tattoos, no_scars, no_markings`
- `no_headwear, no_gloves, no_legwear, no_footwear`
- `no_accessories, no_tail, no_wings, no_horns`
- `no_furniture, no_windows, no_doors, no_decoration, no_plants`
- `no_text, no_objects, no_shadows, no_mirrors, no_weapons`
- `without_*, missing_*, lacking_*, absent_*`
- `bare_* (when describing absence), empty_* (when describing lack)`

USE THESE INSTEAD:
- For nudity: `nude, naked, undressed, exposed, skin`
- For natural appearance: `natural_skin, clean_skin, smooth_skin`
- For minimal clothing: `minimal_clothing, light_clothing`
- For barefoot: `barefoot, feet, toes`
- For simple style: `simple, plain, minimalist`
- For simple spaces: `simple_background, plain_background, minimal_background`
- For clean spaces: `clean_room, empty_room, sparse_room`

EXAMPLE TRANSFORMATIONS:
❌ BAD: "1girl, no_clothing, no_furniture, no_windows, no_decoration, no_objects"
✅ GOOD: "1girl, nude, simple_background, plain_room, minimal_setting, clean_space"

---

## Usage Instructions

The LLM should modify RATING, LENGTH, and ASPECT values based on:
- **RATING**: Content appropriateness (general for SFW, sensitive/questionable/explicit for NSFW)
- **LENGTH**: Desired detail level (very_short for minimal tags, very_long for exhaustive descriptions)
- **ASPECT**: Expected image orientation (tall for portraits, wide for landscapes, square for balanced)

## Example LLM Output

```
full body portrait, anime girl, human, female, 18 years old, school uniform, student, long blonde hair, blue eyes, cheerful expression, standing, looking at viewer, outdoor setting [RATING:general] [LENGTH:long] [ASPECT:portrait]
```
