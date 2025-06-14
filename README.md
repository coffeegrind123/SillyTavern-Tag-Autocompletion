# SillyTavern Tag Autocompletion Extension

A SillyTavern extension that provides Danbooru tag validation and correction for improved LLM-generated image prompts. This extension automatically corrects and optimizes tags in image generation prompts using a fast tag search API and context-aware selection.

## Features

- **Automatic Tag Correction**: Validates and corrects Danbooru tags in real-time
- **Context-Aware Selection**: Uses different strategies based on generation type (Character, Last Message, Scenario)
- **Fast Performance**: In-memory tag search with database fallback
- **Graceful Fallbacks**: Always preserves original tags if API is unavailable
- **Debug Mode**: Detailed logging for troubleshooting

## Installation

1. Copy the `SillyTavern-Tag-Autocompletion` folder to your SillyTavern `extensions/third-party/` directory
2. Restart SillyTavern
3. Go to Extensions > Tag Autocompletion in settings
4. Configure the API endpoint and enable the extension

## Requirements

This extension requires a running Tag Autocompletion API server. The API should implement the following endpoint:

### API Endpoint: `POST /search_tag`

**Request:**
```json
{
    "query": "blonde_hair",
    "limit": 5
}
```

**Response:**
```json
{
    "query": "blonde_hair",
    "candidates": [
        "blonde hair",
        "blonde woman", 
        "yellow hair",
        "blonde character",
        "light hair"
    ]
}
```

## Configuration

### Settings

- **Enable Tag Autocompletion**: Toggle the extension on/off
- **API Endpoint**: URL of the tag search API (default: `http://localhost:8000`)
- **Timeout**: Request timeout in milliseconds (default: 5000ms)
- **Debug Mode**: Enable detailed console logging

### Generation Type Strategies

The extension adapts its behavior based on the SillyTavern generation type:

| Generation Type | Context Level | Candidates | Strategy |
|----------------|---------------|------------|----------|
| Character/Face | Rich (full chat + character) | 5 | Comprehensive character-aware |
| Last Message | Limited (recent scene only) | 3 | Fast scene-focused |
| Scenario | Medium (recent events) | 4 | Balanced context-aware |

## How It Works

1. **Hook Integration**: Intercepts the `getPrompt()` function where both processed prompt and generation type are available
2. **Tag Processing**: Splits the prompt into individual comma-delimited tags
3. **API Search**: Queries the API for each tag to get candidate corrections
4. **Context Selection**: Uses SillyTavern's LLM to select the best tag based on available context
5. **Prompt Reconstruction**: Rejoins corrected tags and continues to image generation

## Example

### Input Prompt:
```
school_corridor, 1male, (from_side:1.1), lavender_hair, short_hair, blunt_bangs, light_brown_eyes, thighhighs
```

### Processing:
- `school_corridor` → API: `["school hallway", "corridor", "school interior"]` → LLM picks: `"school hallway"`
- `1male` → API: `["1boy", "solo male", "male focus"]` → LLM picks: `"1boy"`
- `lavender_hair` → API: `["purple hair", "lavender hair", "light purple hair"]` → LLM picks: `"purple hair"`
- `thighhighs` → API: `["thigh highs", "stockings", "knee highs"]` → LLM picks: `"thigh highs"`

### Output Prompt:
```
school hallway, 1boy, (from_side:1.1), purple hair, short hair, blunt bangs, brown eyes, thigh highs
```

## Error Handling

The extension includes comprehensive error handling:

- **API Unavailable**: Falls back to original tags
- **Timeout**: Returns original tag after timeout
- **No Matches**: Keeps original tag
- **LLM Selection Fails**: Uses first candidate or original tag
- **Malformed Response**: Graceful degradation with logging

## Development

### File Structure
```
SillyTavern-Tag-Autocompletion/
├── manifest.json          # Extension metadata
├── index.js              # Main extension script
├── style.css             # Extension styles
└── README.md             # Documentation
```

### Debug Mode

Enable debug mode in settings to see detailed console logs:
- Tag processing steps
- API request/response details
- Context selection decisions
- Error messages and fallbacks

## Performance

- **95% of queries**: < 0.1ms (in-memory exact/alias match)
- **4% of queries**: < 2ms (database fuzzy search)
- **1% of queries**: No match found
- **Concurrent requests**: 100+ per second
- **Memory usage**: < 2MB for tag data

## License

This extension is released under the same license as SillyTavern.

## Contributing

Contributions are welcome! Please ensure:
- Code follows existing style conventions
- Error handling preserves original functionality
- Performance optimizations don't break compatibility
- Debug logging is informative but not verbose

## Troubleshooting

### Common Issues

1. **Extension not working**: Check that the API endpoint is correct and accessible
2. **Slow performance**: Verify API response times and consider adjusting timeout
3. **Tags not being corrected**: Enable debug mode to see what's happening
4. **API connection failed**: Ensure the tag search API is running and accessible

### Debug Information

Enable debug mode and check the browser console for detailed information about:
- Hook installation status
- API request/response cycles
- Tag processing decisions
- Error conditions and fallbacks