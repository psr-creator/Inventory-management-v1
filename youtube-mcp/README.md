# YouTube MCP Server

Pulls public YouTube data into Claude without an API key. It uses `yt-dlp` and `youtube-transcript-api`.

| Tool | What it returns |
|---|---|
| `search_videos` | Keyword search results (title, channel, views, duration, link) |
| `get_video_info` | Full metadata: views, likes, comment count, upload date, tags, chapters, description |
| `get_transcript` | Captions as plain text, optionally with timestamps |
| `get_channel_videos` | Latest uploads, shorts or streams from a channel |
| `get_channel_info` | Subscriber count, description, channel ID |
| `get_comments` | Top or newest comments |
| `get_playlist_videos` | Videos in a playlist |

## Setup (run on your own machine)

```bash
cd youtube-mcp
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Add to Claude Code
```bash
claude mcp add youtube -- /full/path/to/youtube-mcp/.venv/bin/python /full/path/to/youtube-mcp/server.py
```

### Add to Claude Desktop
Edit `claude_desktop_config.json`. On macOS it is in `~/Library/Application Support/Claude/`. On Windows it is in `%APPDATA%\Claude\`.
```json
{
  "mcpServers": {
    "youtube": {
      "command": "/full/path/to/youtube-mcp/.venv/bin/python",
      "args": ["/full/path/to/youtube-mcp/server.py"]
    }
  }
}
```
Restart Claude after you save the file.

## Example prompts
- "Search YouTube for 'ERP for construction companies UAE' and list the top 10 by views"
- "Get the transcript of <url> and summarise the main pain points mentioned"
- "Pull the 50 top comments on <url>. What are viewers complaining about?"
- "List the last 20 videos from @SAP and their view counts"

## Notes
- Only public data is fetched. Keep volumes reasonable, because YouTube may rate-limit or block heavy scraping.
- If something stops working, YouTube has probably changed its site. Update with `pip install -U yt-dlp youtube-transcript-api`.
