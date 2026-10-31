"""YouTube MCP server — scrape public YouTube data without an API key.

Tools:
  search_videos        keyword search
  get_video_info       title, views, likes, channel, description, tags, chapters...
  get_transcript       captions/subtitles as text (great for summarising)
  get_channel_videos   latest uploads from a channel
  get_channel_info     subscriber count, description, links
  get_comments         top comments on a video
  get_playlist_videos  videos in a playlist
"""
from __future__ import annotations

import re
from typing import Any

import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi

try:  # mcp >= 2.x
    from mcp.server.mcpserver import MCPServer as _Server
except ImportError:  # mcp 1.x
    from mcp.server.fastmcp import FastMCP as _Server

mcp = _Server("youtube")

_BASE_OPTS = {"quiet": True, "no_warnings": True, "skip_download": True, "noprogress": True}


def _extract(url: str, **extra: Any) -> dict:
    with yt_dlp.YoutubeDL({**_BASE_OPTS, **extra}) as ydl:
        return ydl.extract_info(url, download=False) or {}


def _video_id(url_or_id: str) -> str:
    m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/|live/)([\w-]{11})", url_or_id)
    if m:
        return m.group(1)
    if re.fullmatch(r"[\w-]{11}", url_or_id.strip()):
        return url_or_id.strip()
    raise ValueError(f"Could not find a video ID in: {url_or_id}")


def _channel_url(channel: str) -> str:
    c = channel.strip()
    if c.startswith("http"):
        return c.rstrip("/")
    if c.startswith("UC") and len(c) == 24:
        return f"https://www.youtube.com/channel/{c}"
    return f"https://www.youtube.com/@{c.lstrip('@')}"


def _flat_entry(e: dict) -> dict:
    vid = e.get("id")
    return {
        "title": e.get("title"),
        "url": e.get("url") if str(e.get("url", "")).startswith("http") else f"https://www.youtube.com/watch?v={vid}",
        "video_id": vid,
        "channel": e.get("channel") or e.get("uploader"),
        "views": e.get("view_count"),
        "duration_sec": e.get("duration"),
        "upload_date": e.get("upload_date"),
        "description": (e.get("description") or "")[:300] or None,
    }


@mcp.tool()
def search_videos(query: str, max_results: int = 10) -> list[dict]:
    """Search YouTube for videos matching a keyword query.

    Args:
        query: search terms, e.g. "ERP for construction companies UAE"
        max_results: number of results (1-50)
    """
    n = max(1, min(max_results, 50))
    info = _extract(f"ytsearch{n}:{query}", extract_flat="in_playlist")
    return [_flat_entry(e) for e in info.get("entries", []) if e]


@mcp.tool()
def get_video_info(video: str) -> dict:
    """Get full metadata for a video: title, channel, views, likes, comments count,
    upload date, duration, description, tags, categories, chapters.

    Args:
        video: video URL or 11-character video ID
    """
    vid = _video_id(video)
    i = _extract(f"https://www.youtube.com/watch?v={vid}")
    return {
        "video_id": vid,
        "url": i.get("webpage_url"),
        "title": i.get("title"),
        "channel": i.get("channel"),
        "channel_url": i.get("channel_url"),
        "channel_subscribers": i.get("channel_follower_count"),
        "upload_date": i.get("upload_date"),
        "duration_sec": i.get("duration"),
        "views": i.get("view_count"),
        "likes": i.get("like_count"),
        "comment_count": i.get("comment_count"),
        "is_live": i.get("is_live"),
        "categories": i.get("categories"),
        "tags": i.get("tags"),
        "chapters": [
            {"title": c.get("title"), "start_sec": c.get("start_time")} for c in (i.get("chapters") or [])
        ],
        "thumbnail": i.get("thumbnail"),
        "description": i.get("description"),
    }


@mcp.tool()
def get_transcript(video: str, languages: list[str] | None = None, with_timestamps: bool = False) -> dict:
    """Get the transcript (captions) of a video as text.

    Args:
        video: video URL or ID
        languages: preferred language codes in order, e.g. ["en", "ar"]. Default ["en"].
        with_timestamps: if true, prefix each line with [mm:ss]
    """
    vid = _video_id(video)
    api = YouTubeTranscriptApi()
    langs = languages or ["en"]
    try:
        fetched = api.fetch(vid, languages=langs)
    except Exception:
        # fall back to whatever transcript exists (auto-generated or other language)
        tlist = api.list(vid)
        t = next(iter(tlist), None)
        if t is None:
            return {"video_id": vid, "error": "No transcript available for this video."}
        fetched = t.fetch()

    lines = []
    for s in fetched:
        if with_timestamps:
            m, sec = divmod(int(s.start), 60)
            lines.append(f"[{m:02d}:{sec:02d}] {s.text}")
        else:
            lines.append(s.text)
    return {
        "video_id": vid,
        "language": getattr(fetched, "language_code", None),
        "auto_generated": getattr(fetched, "is_generated", None),
        "transcript": ("\n" if with_timestamps else " ").join(lines),
    }


@mcp.tool()
def get_channel_videos(channel: str, max_results: int = 20, tab: str = "videos") -> list[dict]:
    """List the latest uploads from a channel.

    Args:
        channel: channel URL, @handle, or channel ID (UC...)
        max_results: number of videos (1-200)
        tab: "videos", "shorts" or "streams"
    """
    n = max(1, min(max_results, 200))
    info = _extract(f"{_channel_url(channel)}/{tab}", extract_flat="in_playlist", playlistend=n)
    return [_flat_entry(e) for e in (info.get("entries") or [])[:n] if e]


@mcp.tool()
def get_channel_info(channel: str) -> dict:
    """Get channel details: name, subscriber count, description, links.

    Args:
        channel: channel URL, @handle, or channel ID (UC...)
    """
    i = _extract(_channel_url(channel), extract_flat=True, playlistend=1)
    return {
        "channel": i.get("channel") or i.get("title"),
        "channel_id": i.get("channel_id"),
        "url": i.get("channel_url") or i.get("webpage_url"),
        "subscribers": i.get("channel_follower_count"),
        "description": i.get("description"),
        "tags": i.get("tags"),
    }


@mcp.tool()
def get_comments(video: str, max_comments: int = 50, sort: str = "top") -> list[dict]:
    """Get comments on a video.

    Args:
        video: video URL or ID
        max_comments: number of comments (1-500)
        sort: "top" or "new"
    """
    vid = _video_id(video)
    n = max(1, min(max_comments, 500))
    i = _extract(
        f"https://www.youtube.com/watch?v={vid}",
        getcomments=True,
        extractor_args={"youtube": {"max_comments": [str(n)], "comment_sort": [sort]}},
    )
    return [
        {
            "author": c.get("author"),
            "text": c.get("text"),
            "likes": c.get("like_count"),
            "is_reply": c.get("parent") not in (None, "root"),
            "posted": c.get("_time_text"),
        }
        for c in (i.get("comments") or [])[:n]
    ]


@mcp.tool()
def get_playlist_videos(playlist: str, max_results: int = 50) -> list[dict]:
    """List videos in a playlist.

    Args:
        playlist: playlist URL or ID (PL...)
        max_results: number of videos (1-500)
    """
    url = playlist if playlist.startswith("http") else f"https://www.youtube.com/playlist?list={playlist}"
    n = max(1, min(max_results, 500))
    info = _extract(url, extract_flat="in_playlist", playlistend=n)
    return [_flat_entry(e) for e in (info.get("entries") or [])[:n] if e]


if __name__ == "__main__":
    mcp.run()
