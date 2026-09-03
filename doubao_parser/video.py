import html
import json
import re
import urllib.parse
from typing import Any

import httpx

from doubao_parser.video_crypto import decode_main_url

DOUBAO_HEADERS = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,en-GB;q=0.6",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0",
}

FALLBACK_API_PARAMS = {"codec_type": "8", "logo_type": "unwatermarked"}
FALLBACK_API_HOST_SUFFIXES = (".snssdk.com", ".douyinvod.com")


def _build_unwatermarked_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    hostname = (parsed.hostname or "").lower()
    trusted_host = any(
        hostname == suffix.removeprefix(".") or hostname.endswith(suffix) for suffix in FALLBACK_API_HOST_SUFFIXES
    )
    if parsed.scheme != "https" or not trusted_host or not parsed.path.startswith("/video/fplay/"):
        raise ValueError("页面中的 fallback_api 不是受信任的豆包视频接口")

    query = [
        (key, value)
        for key, value in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        if key not in FALLBACK_API_PARAMS
    ]
    query.extend(FALLBACK_API_PARAMS.items())
    return urllib.parse.urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path, urllib.parse.urlencode(query), parsed.fragment)
    )


def _extract_fallback_apis(page_html: str) -> list[str]:
    apis: dict[str, None] = {}
    parsed_script = False

    def add_api(candidate: str) -> None:
        candidate = html.unescape(candidate).replace(r"\u0026", "&").replace(r"\/", "/")
        try:
            _build_unwatermarked_url(candidate)
        except ValueError:
            return
        apis[candidate] = None

    def walk(value: Any, depth: int = 0) -> None:
        if depth > 30 or value is None:
            return
        if isinstance(value, dict):
            fallback_api = value.get("fallback_api")
            if isinstance(fallback_api, str):
                add_api(fallback_api)
            for child in value.values():
                walk(child, depth + 1)
        elif isinstance(value, list):
            for child in value:
                walk(child, depth + 1)
        elif isinstance(value, str) and value.lstrip().startswith(("{", "[")):
            try:
                walk(json.loads(value), depth + 1)
            except json.JSONDecodeError:
                pass

    source_pattern = re.compile(r'data-script-src="(?:modern-run-router-data-fn|modern-run-window-fn)"')
    for script_match in re.finditer(r"<script\b[^>]*>", page_html, re.DOTALL):
        script_tag = script_match.group(0)
        if not source_pattern.search(script_tag):
            continue
        args_match = re.search(r'data-fn-args="(.*?)"', script_tag, re.DOTALL)
        if not args_match:
            continue
        try:
            walk(json.loads(html.unescape(args_match.group(1))))
            parsed_script = True
        except json.JSONDecodeError:
            continue

    if not parsed_script:
        raise KeyError("无法解析页面数据，请确认链接是否有效")
    return list(apis)


def _parse_doubao_video_response(payload: dict, fallback_api: str) -> dict:
    video_info = payload.get("video_info") or (payload.get("data") or {}).get("video_info") or payload
    data = video_info.get("data") or video_info if isinstance(video_info, dict) else {}
    if not isinstance(data, dict):
        raise KeyError("fallback_api 响应缺少视频数据")

    video_list = data.get("video_list")
    if isinstance(video_list, dict):
        candidates = video_list.values()
    elif isinstance(video_list, list):
        candidates = video_list
    else:
        candidates = (data,)

    def number(value: Any) -> float:
        try:
            return float(value or 0)
        except (TypeError, ValueError):
            return 0

    entries = [
        entry
        for entry in candidates
        if isinstance(entry, dict) and isinstance(entry.get("main_url") or entry.get("play_url"), str)
    ]
    if not entries:
        raise KeyError("fallback_api 响应中没有 main_url")

    entry = max(
        entries,
        key=lambda item: (
            number(item.get("vwidth") or item.get("width")) * number(item.get("vheight") or item.get("height")),
            number(item.get("bitrate") or item.get("real_bitrate")),
        ),
    )
    token = str(entry.get("main_url") or entry.get("play_url")).strip()
    key_seed = data.get("key_seed") or video_info.get("key_seed") or payload.get("key_seed") or ""
    video_url = decode_main_url(token, str(key_seed))
    if not video_url:
        raise ValueError("fallback_api 的 main_url 解密失败")

    width = number(entry.get("vwidth") or entry.get("width") or data.get("vwidth") or data.get("width"))
    height = number(entry.get("vheight") or entry.get("height") or data.get("vheight") or data.get("height"))
    return {
        "vid": data.get("vid") or data.get("video_id") or entry.get("vid") or entry.get("video_id") or fallback_api,
        "width": int(width),
        "height": int(height),
        "definition": entry.get("definition") or data.get("definition") or "",
        "duration": number(entry.get("duration") or data.get("duration") or data.get("video_duration")),
        "codec_type": entry.get("codec_type") or data.get("codec_type") or "",
        "poster_url": data.get("poster_url") or data.get("poster") or "",
        "url": video_url,
    }


async def doubao_video_parse(url: str, return_raw: bool = False) -> list | dict:
    if "/thread/" not in url:
        raise ValueError("新无水印解析仅支持包含视频的豆包对话分享链接（/thread/）")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
            page_response = await client.get(url, headers=DOUBAO_HEADERS)
            page_response.raise_for_status()
            fallback_apis = _extract_fallback_apis(page_response.text)
            if not fallback_apis:
                raise KeyError("页面中未找到视频 fallback_api，请确认分享链接包含可用视频")

            video_list = []
            errors = []
            seen_videos: set[str] = set()
            for fallback_api in fallback_apis:
                try:
                    response = await client.get(_build_unwatermarked_url(fallback_api), headers=DOUBAO_HEADERS)
                    response.raise_for_status()
                    payload = response.json()
                    if return_raw:
                        return payload

                    result = _parse_doubao_video_response(payload, fallback_api)
                    identity = str(result["vid"] or result["url"])
                    if identity not in seen_videos:
                        seen_videos.add(identity)
                        video_list.append(result)
                except (httpx.HTTPError, json.JSONDecodeError, KeyError, ValueError) as exc:
                    errors.append(str(exc))

            if not video_list:
                detail = errors[0] if errors else "未知错误"
                raise KeyError(f"视频解析失败: {detail}")
            return video_list
    except httpx.RequestError as e:
        raise ValueError(f"网络请求失败，请检查网络连接: {str(e)}") from e
    except httpx.HTTPStatusError as e:
        raise ValueError(f"视频服务请求失败（HTTP {e.response.status_code}）") from e
    except json.JSONDecodeError as e:
        raise ValueError("视频服务返回的数据格式错误") from e


async def get_redirect_url(url: str) -> str:
    headers = {
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/145.0.0.0 Safari/537.36",
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers, follow_redirects=True)
        return str(response.url)


async def yunque_video_parse(url: str, return_raw: bool = False) -> list:

    headers = {
        "content-type": "application/json",
        "origin": "https://xiaoyunque.jianying.com",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/145.0.0.0 Safari/537.36",
    }

    redirect_url = await get_redirect_url(url)
    query = urllib.parse.urlparse(redirect_url).query
    params_dict = urllib.parse.parse_qs(str(query))
    share_id = params_dict["share_id"][0]
    share_sec_did = params_dict["share_sec_did"][0]
    share_sec_uid = params_dict["share_sec_uid"][0]

    json_data = {
        "query_params": {
            "content_type": "video",
            "home_input_type": "VIDEO_PART",
            "scene": "agent_tool",
            "share_campaign_key": "pippit_invite_fission",
            "share_id": share_id,
            "share_sec_did": share_sec_did,
            "share_sec_uid": share_sec_uid,
        },
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://xiaoyunque.jianying.com/luckycat/cn/jianying/campaign/v1/pippit/share/landing_page",
            headers=headers,
            json=json_data,
        )
        result = response.json()
        if "data" not in result:
            raise KeyError("API返回数据格式异常，可能链接已失效")

        if "page_info" not in result["data"]:
            raise KeyError("无法获取视频播放信息，请检查链接是否有效")

        if return_raw:
            return result

        play_info = result["data"]["page_info"]
        video_info_list = play_info["generate_page"]["item_info"]["video_info"]
        video_info = video_info_list[0]
        return [
            {
                "url": video_info["video_url"],
                "width": video_info["width"],
                "height": video_info["height"],
                "definition": f"{video_info['width']}p",
                "poster_url": video_info["cover_url"],
            }
        ]


if __name__ == "__main__":
    import asyncio

    _url = "https://www.doubao.com/thread/w3de509c584a4e3da"
    print(asyncio.run(doubao_video_parse(_url)))
