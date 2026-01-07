from typing import Optional
from urllib.parse import parse_qs, urlparse

import httpx


def get_query_params(url: str, param_name: Optional[str] = None) -> dict | list[str]:
    parsed_url = urlparse(url)
    query_params = parse_qs(parsed_url.query)

    if param_name is None:
        return query_params
    else:
        values = query_params.get(param_name, [])
        return values


async def doubao_video_parse(url: str, return_raw: bool = False):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36 NetType/WIFI MicroMessenger/7.0.20.1781(0x6700143B) "
        "WindowsWechat(0x63090c33) XWEB/14315 Flue",
        "origin": "https://www.doubao.com",
    }

    params = {
        "version_code": "20800",
        "language": "zh-CN",
        "device_platform": "web",
        "aid": "497858",
        "real_aid": "497858",
        "pkg_type": "release_version",
        "device_id": "",
        "pc_version": "2.51.7",
        "region": "",
        "sys_region": "",
        "samantha_web": "1",
        "use-olympus-account": "1",
        "web_tab_id": "",
    }

    try:
        share_id_list = get_query_params(url, "share_id")
        vid_list = get_query_params(url, "video_id")

        if not share_id_list:
            raise ValueError("链接中缺少 share_id 参数，请检查链接是否正确")
        if not vid_list:
            raise ValueError("链接中缺少 video_id 参数，请检查链接是否正确")

        share_id = share_id_list[0]
        vid = vid_list[0]
    except (IndexError, TypeError) as e:
        raise ValueError("链接格式不正确，请确保使用豆包视频分享链接")

    json_data = {
        "share_id": share_id,
        "vid": vid,
        "creation_id": "",
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://www.doubao.com/creativity/share/get_video_share_info",
                params=params,
                headers=headers,
                json=json_data,
            )

            result = response.json()

            if "data" not in result:
                raise KeyError("API返回数据格式异常，可能链接已失效")

            if "play_info" not in result["data"]:
                raise KeyError("无法获取视频播放信息，请检查链接是否有效")

            if return_raw:
                return result

            play_info = result["data"]["play_info"]

            return {
                "url": play_info["main"],
                "width": play_info["width"],
                "height": play_info["height"],
                "definition": play_info["definition"],
                "poster_url": play_info["poster_url"],
            }
    except httpx.RequestError as e:
        raise ValueError(f"网络请求失败，请检查网络连接: {str(e)}")
    except KeyError as e:
        raise KeyError(f"视频解析失败: {str(e)}")


if __name__ == "__main__":
    import asyncio

    _url = "https://www.doubao.com/video-sharing?share_id=35083351704233730&video_id=v0269cg10004d5e6oefog65smlkr0jl0"
    print(asyncio.run(doubao_video_parse(_url)))
