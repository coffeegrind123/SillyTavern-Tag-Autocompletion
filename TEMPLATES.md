# Modified Image Prompt Templates with Metadata - Complete Fixed Version

## Instructions for LLM Integration

Each template now includes metadata tags that the ComfyUI node will parse. The LLM must choose from these exact values:

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

The LLM should choose appropriate values based on the context and desired output.

---

## Template Functions

### Character ("Yourself")
```
In the next response, generate a detailed comma-separated list of danbooru/e621 tags describing {{char}}. Follow this exact process:

**CRITICAL: Process the ENTIRE content and convert everything to tags - do NOT stop processing until complete**

1. First, internally assemble details about {{char}} from the conversation
2. Convert all information into short tag phrases using actual danbooru/e621 tags
3. Output ONLY the tags in this order (no category labels, no colons):
   - Character count (1girl, 1boy, etc.)
   - Full character name and series: character name \(series name\)
   - Hair: color, style, length, accessories
   - Eyes: color, shape, expression
   - Facial features: expression, markings
   - Body: breast size, body type, skin details
   - Clothing: garments with colors, patterns, shapes (describe what IS worn)
   - Accessories: jewelry, glasses, belts, watches (only if present)
   - Pose: stance, position, gestures
   - Actions: activities, positioning
   - Background: environment details

Rules:
- Use only lowercase english, comma-separated with spaces
- Start with 'full body portrait,'
- Use actual danbooru/e621 tags only (no custom phrases, no category prefixes)
- Each tag used only once
- Pure tag output: "1girl, long hair, blue eyes, school uniform, standing, smile"
- NOT: "character: 1girl, hair: long hair, eyes: blue eyes"
- **CRITICAL: NEVER use any tags starting with "no_" (no_bra, no_panties, no_clothing, no_jewelry, no_furniture, no_windows, etc.)**
- **BANNED WORDS: no_, without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)**
- **Instead of "no_clothing" use: nude, naked, undressed**
- **Instead of "no_furniture" use: empty_room, simple_background, minimal_setting**
- **Instead of "no_objects" use: clean_space, plain_background, simple_room**
- Rich detail for all visible aspects, aim for 30-40 tags
- Do not include personality, thoughts, emotions, or dialogue
- Do not reply as {{char}} or continue the story
- Focus exclusively on what IS visible, present, and actively described

Choose aspect ratio:
ASPECT: too_tall, tall_wallpaper, tall, square, wide, wide_wallpaper, too_wide, portrait, landscape, vertical, horizontal, 9:16, 2:3, 3:4, 1:1, 4:3, 3:2, 16:9 (use 'portrait' or 'tall' for full body shots)

Example: [ASPECT:portrait]
```

### User ("Me")  
```
Ignore previous instructions. Generate a detailed comma-separated list of danbooru/e621 tags describing {{user}}'s physical appearance from {{char}}'s perspective. Follow this exact process:

**CRITICAL: Process the ENTIRE content and convert everything to tags - do NOT stop processing until complete**

1. First, internally assemble details about {{user}} from the conversation
2. Convert all information into short tag phrases using actual danbooru/e621 tags
3. Output ONLY the tags in this order (no category labels, no colons):
   - Character count (1girl, 1boy, etc.)
   - Hair: color, style, length, accessories
   - Eyes: color, shape, expression
   - Facial features: expression, markings
   - Body: breast size, body type, skin details
   - Clothing: garments with colors, patterns, shapes (describe what IS worn)
   - Accessories: jewelry, glasses, belts, watches (only if present)
   - Pose: stance, position, gestures
   - Actions: activities, positioning

Rules:
- Use only lowercase english, comma-separated with spaces
- Start with 'full body portrait,'
- Use actual danbooru/e621 tags only (no custom phrases, no category prefixes)
- Each tag used only once
- Pure tag output: "1girl, long hair, blue eyes, school uniform, standing, smile"
- NOT: "character: 1girl, hair: long hair, eyes: blue eyes"
- **CRITICAL: NEVER use any tags starting with "no_" (no_bra, no_panties, no_clothing, no_jewelry, no_furniture, no_windows, etc.)**
- **BANNED WORDS: no_, without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)**
- **Instead of "no_clothing" use: nude, naked, undressed**
- **Instead of "no_furniture" use: empty_room, simple_background, minimal_setting**
- **Instead of "no_objects" use: clean_space, plain_background, simple_room**
- Rich detail for all visible aspects, aim for 30-40 tags
- Do not include personality, thoughts, emotions, or dialogue
- Do not reply as {{char}} or continue the story
- Focus exclusively on what IS visible, present, and actively described

Choose aspect ratio:
ASPECT: too_tall, tall_wallpaper, tall, square, wide, wide_wallpaper, too_wide, portrait, landscape, vertical, horizontal, 9:16, 2:3, 3:4, 1:1, 4:3, 3:2, 16:9 (use 'portrait' or 'tall' for full body shots)

Example: [ASPECT:portrait]
```

### Scenario ("The Whole Story")
```
Ignore previous instructions. Generate a detailed comma-separated list of danbooru/e621 tags describing the current scene. Follow this exact process:

**CRITICAL: Process the ENTIRE content and convert everything to tags - do NOT stop processing until complete**

1. First, internally assemble a short story from recent conversation events
2. Identify the central scene and all characters present
3. Convert all visual information into short tag phrases using actual danbooru/e621 tags
4. Output ONLY the tags in this order (no category labels, no colons):
   - Background: location type, setting details
   - Environment: time of day, weather, lighting, atmosphere
   - Character count: number and gender (2girls, 1boy, etc.)
   - Character appearances: hair, eyes, clothing, poses (describe what IS worn/visible)
   - Interactions: positioning, contact, activities
   - Objects: furniture, items, decorations (only what IS present)
   - Actions: what characters are doing
   - Sexual activity: specific descriptions if applicable

Rules:
- Use only lowercase english, comma-separated with spaces
- Use actual danbooru/e621 tags only (no custom phrases, no category prefixes)
- Each tag used only once
- Pure tag output: "indoor, bedroom, 2girls, long hair, kissing, bed"
- NOT: "location: indoor, characters: 2girls, action: kissing"
- **CRITICAL: NEVER use any tags starting with "no_" (no_bra, no_panties, no_clothing, no_jewelry, no_furniture, no_windows, etc.)**
- **BANNED WORDS: no_, without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)**
- **Instead of "no_clothing" use: nude, naked, undressed**
- **Instead of "no_furniture" use: empty_room, simple_background, minimal_setting**
- **Instead of "no_objects" use: clean_space, plain_background, simple_room**
- Rich detail for all visible aspects, aim for 40+ tags
- Prioritize specific descriptions of any sexual activities
- Do not reply as {{char}} or continue the story
- Focus exclusively on what IS visible, present, and actively described

Choose aspect ratio:
ASPECT: too_tall, tall_wallpaper, tall, square, wide, wide_wallpaper, too_wide, portrait, landscape, vertical, horizontal, 9:16, 2:3, 3:4, 1:1, 4:3, 3:2, 16:9 (use 'wide' or 'landscape' for scene/environment shots)

Example: [ASPECT:wide]
```

### Last Message (Detailed)
```
Ignore previous instructions. Generate a detailed comma-separated list of danbooru/e621 tags describing the visual details from the last chat message. Follow this exact process:

**CRITICAL: Process the ENTIRE content and convert everything to tags - do NOT stop processing until complete**

1. First, internally assemble a scene from the last message content
2. Convert all visual information into short tag phrases using actual danbooru/e621 tags
3. Output ONLY the tags in this order (no category labels, no colons):
   - Background: location, setting
   - Character count: number and gender (1girl, 1boy, 2girls, etc.)
   - Camera angle: perspective, point of view
   - Primary action: main activity
   - Character appearances: hair, eyes, clothing, expressions, poses (describe what IS worn/visible)
   - Interactions: physical contact, positioning
   - Sexual activity: specific descriptions if applicable
   - Objects: items, furniture, accessories (only what IS present)

Rules:
- Use only lowercase english, comma-separated with spaces
- Use actual danbooru/e621 tags only (no custom phrases, no category prefixes)
- Each tag used only once
- Pure tag output: "bedroom, 1girl, from behind, undressing, long hair"
- NOT: "location: bedroom, character: 1girl, action: undressing"
- **CRITICAL: NEVER use any tags starting with "no_" (no_bra, no_panties, no_clothing, no_jewelry, no_furniture, no_windows, etc.)**
- **BANNED WORDS: no_, without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)**
- **Instead of "no_clothing" use: nude, naked, undressed**
- **Instead of "no_furniture" use: empty_room, simple_background, minimal_setting**
- **Instead of "no_objects" use: clean_space, plain_background, simple_room**
- Aim for 30-40 tags with rich detail
- Use pronouns (he, she, male, female) instead of character names
- Ignore dialogue, thoughts, emotions - only visual elements
- Prioritize specific sexual descriptions if applicable
- Focus exclusively on what IS visible, present, and actively described

Choose aspect ratio:
ASPECT: too_tall, tall_wallpaper, tall, square, wide, wide_wallpaper, too_wide, portrait, landscape, vertical, horizontal, 9:16, 2:3, 3:4, 1:1, 4:3, 3:2, 16:9 (choose based on scene composition)

Example: [ASPECT:square]
```

### Portrait ("Your Face")
```
In the next response, generate a detailed comma-separated list of danbooru/e621 tags describing {{char}}'s head and upper body. Follow this exact process:

**CRITICAL: Process the ENTIRE content and convert everything to tags - do NOT stop processing until complete**

1. First, internally assemble details about {{char}}'s facial features
2. Convert all information into short tag phrases using actual danbooru/e621 tags
3. Output ONLY the tags in this order (no category labels, no colons):
   - Portrait type: close up, facial portrait, upper body
   - Character name and series: character name \(series name\) if applicable
   - Hair: color, style, length, accessories
   - Eyes: color, shape, expression, special features
   - Facial features: expression, mouth, eyebrows, markings
   - Upper body clothing: garments, colors, patterns, accessories (describe what IS worn)
   - Accessories: jewelry, glasses, headwear (only if present)

Rules:
- Use only lowercase english, comma-separated with spaces
- Start with 'close up facial portrait,'
- Use actual danbooru/e621 tags only (no custom phrases, no category prefixes)
- Each tag used only once
- Pure tag output: "close up facial portrait, 1girl, blonde hair, blue eyes, smile"
- NOT: "type: close up, hair: blonde hair, eyes: blue eyes"
- **CRITICAL: NEVER use any tags starting with "no_" (no_bra, no_panties, no_clothing, no_jewelry, no_furniture, no_windows, etc.)**
- **BANNED WORDS: no_, without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)**
- **Instead of "no_clothing" use: nude, naked, undressed**
- **Instead of "no_furniture" use: empty_room, simple_background, minimal_setting**
- **Instead of "no_objects" use: clean_space, plain_background, simple_room**
- Rich detail for facial features, aim for 25-35 tags
- Do not describe below the neck except upper body clothing
- Focus exclusively on what IS visible, present, and actively described

Choose aspect ratio:
ASPECT: too_tall, tall_wallpaper, tall, square, wide, wide_wallpaper, too_wide, portrait, landscape, vertical, horizontal, 9:16, 2:3, 3:4, 1:1, 4:3, 3:2, 16:9 (use 'square' for close-up portraits)

Example: [ASPECT:square]
```

### Background
```
Ignore previous instructions. Generate a detailed comma-separated list of danbooru/e621 tags describing {{char}}'s surroundings and environment. Follow this exact process:

**CRITICAL: Process the ENTIRE content and convert everything to tags - do NOT stop processing until complete**

1. First, internally assemble details about the current setting
2. Convert all environmental information into short tag phrases using actual danbooru/e621 tags
3. Output ONLY the tags in this order (no category labels, no colons):
   - Background type: indoor, outdoor, specific location
   - Location details: room type, landscape, building, setting
   - Time details: day, night, time period, season
   - Weather: sky condition, atmospheric effects
   - Lighting: natural light, artificial light, mood lighting, shadows
   - Objects: furniture, decorations, plants, items (only what IS present)
   - Atmosphere: mood, style, ambiance
   - Architectural: walls, floors, ceilings, structural details

Rules:
- Use only lowercase english, comma-separated with spaces
- Start with 'background,'
- Use actual danbooru/e621 tags only (no custom phrases, no category prefixes)
- Each tag used only once
- Pure tag output: "background, indoor, bedroom, night, dim lighting, wooden floor"
- NOT: "type: indoor, time: night, lighting: dim lighting"
- **CRITICAL: NEVER use any tags starting with "no_" (no_bra, no_panties, no_clothing, no_jewelry, no_furniture, no_windows, etc.)**
- **BANNED WORDS: no_, without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)**
- **Instead of "no_clothing" use: nude, naked, undressed**
- **Instead of "no_furniture" use: empty_room, simple_background, minimal_setting**
- **Instead of "no_objects" use: clean_space, plain_background, simple_room**
- Rich environmental detail, aim for 25-35 tags
- Do not include character descriptions
- Do not reply as {{user}} or continue the story
- Focus exclusively on what IS visible, present, and actively described

Choose aspect ratio:
ASPECT: too_tall, tall_wallpaper, tall, square, wide, wide_wallpaper, too_wide, portrait, landscape, vertical, horizontal, 9:16, 2:3, 3:4, 1:1, 4:3, 3:2, 16:9 (use 'wide' or 'landscape' for backgrounds)

Example: [ASPECT:wide]
```

### Character (Multimodal Mode)
```
Generate an exhaustive comma-separated list of danbooru/e621 tags describing the character's appearance in this image. Follow this exact process:

**CRITICAL: Process the ENTIRE content and convert everything to tags - do NOT stop processing until complete**

1. First, internally analyze every visual detail in the image
2. Convert all information into short tag phrases using actual danbooru/e621 tags
3. Output ONLY the tags (no category labels, no colons):
   - Character count (1girl, 1boy, etc.)
   - Character identity: name \(source\) if recognizable
   - Hair: color, style, length, accessories
   - Eyes: color, shape, expression, special features
   - Facial features: expression, markings, mouth
   - Body: breast size, body type, skin details, anatomy
   - Clothing: garments, colors, styles, conditions, patterns (describe what IS worn)
   - Pose: position, gesture, body language
   - Objects: held items, accessories, background elements (only what IS present)
   - Actions: activities, movements, interactions

Rules:
- Use only lowercase english, comma-separated with spaces
- Start with 'full body portrait,'
- Use actual danbooru/e621 tags only (no custom phrases, no category prefixes)
- Each tag used only once
- Pure tag output: "1girl, long hair, blue dress, standing, holding flower"
- NOT: "character: 1girl, clothing: blue dress, action: standing"
- **CRITICAL: NEVER use any tags starting with "no_" (no_bra, no_panties, no_clothing, no_jewelry, no_furniture, no_windows, etc.)**
- **BANNED WORDS: no_, without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)**
- **Instead of "no_clothing" use: nude, naked, undressed**
- **Instead of "no_furniture" use: empty_room, simple_background, minimal_setting**
- **Instead of "no_objects" use: clean_space, plain_background, simple_room**
- Exhaustive detail for all visible elements, aim for 40+ tags
- Analyze and describe everything visible in the image
- Focus exclusively on what IS visible, present, and actively described

Choose aspect ratio:
ASPECT: too_tall, tall_wallpaper, tall, square, wide, wide_wallpaper, too_wide, portrait, landscape, vertical, horizontal, 9:16, 2:3, 3:4, 1:1, 4:3, 3:2, 16:9 (match the input image aspect ratio)

Example: [ASPECT:portrait]
```

### User (Multimodal Mode)
```
Generate an exhaustive comma-separated list of danbooru/e621 tags describing the character's appearance in this image. Follow this exact process:

**CRITICAL: Process the ENTIRE content and convert everything to tags - do NOT stop processing until complete**

1. First, internally analyze every visual detail in the image
2. Convert all information into short tag phrases using actual danbooru/e621 tags
3. Output ONLY the tags (no category labels, no colons):
   - Character count (1girl, 1boy, etc.)
   - Hair: color, style, length, accessories
   - Eyes: color, shape, expression, special features
   - Facial features: expression, markings, mouth
   - Body: breast size, body type, skin details, anatomy
   - Clothing: garments, colors, styles, conditions, patterns (describe what IS worn)
   - Pose: position, gesture, body language
   - Objects: held items, accessories, background elements (only what IS present)
   - Actions: activities, movements, interactions

Rules:
- Use only lowercase english, comma-separated with spaces
- Start with 'full body portrait,'
- Use actual danbooru/e621 tags only (no custom phrases, no category prefixes)
- Each tag used only once
- Pure tag output: "1girl, long hair, blue dress, standing, holding flower"
- NOT: "character: 1girl, clothing: blue dress, action: standing"
- **CRITICAL: NEVER use any tags starting with "no_" (no_bra, no_panties, no_clothing, no_jewelry, no_furniture, no_windows, etc.)**
- **BANNED WORDS: no_, without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)**
- **Instead of "no_clothing" use: nude, naked, undressed**
- **Instead of "no_furniture" use: empty_room, simple_background, minimal_setting**
- **Instead of "no_objects" use: clean_space, plain_background, simple_room**
- Exhaustive detail for all visible elements, aim for 40+ tags
- Analyze and describe everything visible in the image
- Focus exclusively on what IS visible, present, and actively described

Choose aspect ratio:
ASPECT: too_tall, tall_wallpaper, tall, square, wide, wide_wallpaper, too_wide, portrait, landscape, vertical, horizontal, 9:16, 2:3, 3:4, 1:1, 4:3, 3:2, 16:9 (match the input image aspect ratio)

Example: [ASPECT:portrait]
```

### Portrait (Multimodal Mode)
```
Generate an exhaustive comma-separated list of danbooru/e621 tags describing the character's head and upper body in this image. Follow this exact process:

**CRITICAL: Process the ENTIRE content and convert everything to tags - do NOT stop processing until complete**

1. First, internally analyze every facial and upper body detail in the image
2. Convert all information into short tag phrases using actual danbooru/e621 tags
3. Output ONLY the tags (no category labels, no colons):
   - Portrait type: close up, facial portrait, upper body
   - Hair: color, style, length, accessories
   - Eyes: color, shape, expression, special features
   - Facial features: expression, mouth, eyebrows, markings, skin
   - Upper body clothing: garments, accessories, colors, patterns (describe what IS worn)
   - Accessories: jewelry, headwear, glasses (only if present)
   - Lighting: how light affects the face and upper body

Rules:
- Use only lowercase english, comma-separated with spaces
- Start with 'close up facial portrait,'
- Use actual danbooru/e621 tags only (no custom phrases, no category prefixes)
- Each tag used only once
- Pure tag output: "close up facial portrait, 1girl, blonde hair, blue eyes, smile"
- NOT: "type: close up, hair: blonde hair, expression: smile"
- **CRITICAL: NEVER use any tags starting with "no_" (no_bra, no_panties, no_clothing, no_jewelry, no_furniture, no_windows, etc.)**
- **BANNED WORDS: no_, without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)**
- **Instead of "no_clothing" use: nude, naked, undressed**
- **Instead of "no_furniture" use: empty_room, simple_background, minimal_setting**
- **Instead of "no_objects" use: clean_space, plain_background, simple_room**
- Exhaustive facial detail, aim for 35+ tags
- Focus only on head and upper body elements
- Focus exclusively on what IS visible, present, and actively described

Choose aspect ratio:
ASPECT: too_tall, tall_wallpaper, tall, square, wide, wide_wallpaper, too_wide, portrait, landscape, vertical, horizontal, 9:16, 2:3, 3:4, 1:1, 4:3, 3:2, 16:9 (use 'square' for close-up portraits)

Example: [ASPECT:square]
```

### Free Mode (LLM-Extended)
```
Ignore previous instructions. Generate an exhaustive comma-separated list of danbooru/e621 tags describing the appearance of "{0}" in great detail. Follow this exact process:

**CRITICAL: Process the ENTIRE content and convert everything to tags - do NOT stop processing until complete**

1. First, internally assemble a detailed description of the subject
2. Convert nicknames to full character names if applicable
3. Convert all information into short tag phrases using actual danbooru/e621 tags
4. Output ONLY the tags (no category labels, no colons):
   - Character/subject count and type
   - Identity: character name \(source\) if applicable, or subject type
   - Physical appearance: hair, eyes, body, features
   - Clothing: garments, accessories, colors, patterns, styles (describe what IS worn)
   - Scene: setting, pose, actions, interactions, objects (only what IS present)
   - Sexual activity: specific descriptions if applicable
   - Background: environment, lighting, atmosphere

Rules:
- Use only lowercase english, comma-separated with spaces
- Start with {{charPrefix}} if subject is associated with {{char}}, otherwise appropriate image type
- Use actual danbooru/e621 tags only (no custom phrases, no category prefixes)
- Each tag used only once
- Pure tag output: "1girl, long hair, school uniform, classroom, sitting, reading"
- NOT: "character: 1girl, clothing: school uniform, action: reading"
- **CRITICAL: NEVER use any tags starting with "no_" (no_bra, no_panties, no_clothing, no_jewelry, no_furniture, no_windows, etc.)**
- **BANNED WORDS: no_, without_, missing_, lacking_, absent_, bare_ (when describing absence), empty_ (when describing lack)**
- **Instead of "no_clothing" use: nude, naked, undressed**
- **Instead of "no_furniture" use: empty_room, simple_background, minimal_setting**
- **Instead of "no_objects" use: clean_space, plain_background, simple_room**
- Rich detail for all aspects, aim for 40+ tags
- Prioritize specific sexual descriptions if theme involves sexual content
- Focus exclusively on what IS visible, present, and actively described

Choose aspect ratio:
ASPECT: too_tall, tall_wallpaper, tall, square, wide, wide_wallpaper, too_wide, portrait, landscape, vertical, horizontal, 9:16, 2:3, 3:4, 1:1, 4:3, 3:2, 16:9 (choose based on subject type)

Example: [ASPECT:portrait]
```

---

## CRITICAL: Negative Tag Prevention Guide

**❌ NEVER USE THESE PATTERNS:**

**Clothing/Body:**
- `no_clothing, no_bra, no_panties, no_shoes, no_socks`
- `no_jewelry, no_makeup, no_tattoos, no_scars, no_markings`
- `no_headwear, no_gloves, no_legwear, no_footwear`
- `no_accessories, no_tail, no_wings, no_horns`

**Environment/Objects:**
- `no_furniture, no_windows, no_doors, no_decoration, no_plants`
- `no_text, no_objects, no_shadows, no_mirrors, no_weapons`
- `no_restraints, no_smoke, no_water, no_food, no_drinks`
- `no_toys, no_bed, no_chair, no_table`

**General Patterns:**
- `without_*, missing_*, lacking_*, absent_*`
- `bare_* (when describing absence), empty_* (when describing lack)`

**✅ USE THESE INSTEAD:**

**For nudity:** `nude, naked, undressed, exposed, skin`
**For natural appearance:** `natural_skin, clean_skin, smooth_skin`
**For minimal clothing:** `minimal_clothing, light_clothing`
**For barefoot:** `barefoot, feet, toes`
**For simple style:** `simple, plain, minimalist`
**For young appearance:** `young, youthful, petite, small_breasts`

**For environments:** 
- **Simple spaces:** `simple_background, plain_background, minimal_background`
- **Clean spaces:** `clean_room, empty_room, sparse_room`
- **Basic lighting:** `even_lighting, soft_lighting, bright_lighting`
- **Wall types:** `white_wall, plain_wall, solid_wall`
- **Floor types:** `wooden_floor, concrete_floor, tile_floor`

**Example Transformations:**
```
❌ BAD: "1girl, no_clothing, no_furniture, no_windows, no_decoration, no_objects"
✅ GOOD: "1girl, nude, simple_background, plain_room, minimal_setting, clean_space"

❌ BAD: "background, no_bed, no_chair, no_table, no_plants, no_decoration"
✅ GOOD: "background, empty_room, plain_walls, simple_interior, minimal_design"
```

**When describing nude characters, focus on:**
- Body characteristics: `nude, pale_skin, small_breasts, slender, petite`
- Poses and expressions: `standing, grinning, looking_at_viewer, spreading`
- Physical details: `long_hair, black_hair, unkempt_hair`
- Scene elements: `white_background, bright_lighting, from_below`

**When describing simple environments, focus on:**
- Space type: `indoor, room, studio, simple_background`
- Surface details: `white_wall, concrete_floor, steel_floor`
- Lighting: `bright_lighting, even_lighting, studio_lighting`
- Atmosphere: `clean, minimal, simple, plain`

**The goal is rich, positive descriptions that tell the AI what TO include, not what to exclude.**

---

## Usage Instructions

1. The LLM should modify the RATING, LENGTH, and ASPECT values based on:
   - **RATING**: Content appropriateness (general for SFW, sensitive/questionable/explicit for NSFW)
   - **LENGTH**: Desired detail level (very_short for minimal tags, very_long for exhaustive descriptions)
   - **ASPECT**: Expected image orientation (tall for portraits, wide for landscapes, square for balanced)

2. The ComfyUI node will parse these metadata tags and use them as API parameters

3. If no metadata is found, the node will use the fallback values set in the interface

## Example LLM Output

**Using aspect ratio:**
```
full body portrait, anime girl, human, female, 18 years old, school uniform, student, long blonde hair, blue eyes, cheerful expression, standing, looking at viewer, outdoor setting [RATING:general] [LENGTH:long] [ASPECT:portrait]
```

**Using ratio format:**
```
close up facial portrait, anime boy, spiky black hair, determined eyes, school uniform, confident smile [RATING:general] [LENGTH:short] [ASPECT:1:1]
```

**Using direct resolution:**
```
background, fantasy forest, morning light, mystical atmosphere, dynamic lighting, ethereal mood [RATING:general] [LENGTH:short] [RESOLUTION:1344x768]
```

**Adult content:**
```
1girl, nude, long hair, standing, looking at viewer, spreading, bedroom, intimate pose [RATING:explicit] [LENGTH:long] [ASPECT:portrait]
```

This would be parsed as:
- Rating: general/explicit
- Length: long/short
- Resolution: 896×1152 / 1024×1024 / 1344×768
- Clean prompt: "full body portrait, anime girl, human, female..." (with all descriptive tags preserved)
