import json
import re

import httpx


async def doubao_image_parse(url: str, return_raw: bool = False):
    if "doubao.com/thread/" not in url:
        raise ValueError("链接格式不正确，请使用豆包对话链接（包含 /thread/）")

    headers = {
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers)
            html_str = response.text
    except httpx.RequestError as e:
        raise ValueError(f"网络请求失败，请检查网络连接: {str(e)}")

    match_json_str = re.search(
        'data-script-src="modern-run-router-data-fn" data-fn-args="(.*?)" nonce="', html_str, re.DOTALL
    )

    if not match_json_str:
        raise KeyError("无法解析页面数据，请确认链接是否有效")

    try:
        json_str = match_json_str.group(1).replace("&quot;", '"')
        json_data = json.loads(json_str)

        if return_raw:
            return json_data

        image_list = []
        for data in json_data:
            if isinstance(data, dict) and data.get("data"):
                message_snapshot = data["data"]["message_snapshot"]["message_list"]
                for message in message_snapshot:
                    if not message.get("content_block"):
                        continue

                    for m2 in message["content_block"]:
                        json_data2 = json.loads(m2["content_v2"])
                        if "creation_block" in json_data2:
                            creations = json_data2["creation_block"]["creations"]
                            for image in creations:
                                image_raw = image["image"]["image_ori_raw"]
                                image_raw["url"] = image_raw["url"].replace("&amp;", "&")
                                image_list.append(image_raw)
    except KeyError as e:
        print(f"Exception: {e}")
        raise KeyError("页面结构发生变化，无法解析图片数据")
    except json.JSONDecodeError:
        raise ValueError("页面数据格式错误，无法解析")

    return image_list


async def qianwen_image_parse(url: str, return_raw: bool = False):
    if "qianwen.com/share/chat/" not in url:
        raise ValueError("链接格式不正确，请使用豆包对话链接（包含 qianwen.com/share/chat/）")

    headers = {
        "origin": "https://www.qianwen.com",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/146.0.0.0 Safari/537.36 Edg/146.0.0.0",
    }

    try:
        share_id = url.split("?")[0].rsplit("chat/", maxsplit=1)[-1]
        json_data = {
            "share_id": share_id,
            "biz_id": "ai_qwen",
        }

        async with httpx.AsyncClient() as client:
            api = "https://chat2-api.qianwen.com/api/v1/share/info"
            response = await client.post(api, json=json_data, headers=headers)
            json_data = response.json()
            if return_raw:
                return json_data
    except httpx.RequestError as e:
        raise ValueError(f"网络请求失败，请检查网络连接: {str(e)}")

    try:
        image_list = []
        record_list = json_data["data"]["session"]["record_list"]
        for record in record_list:
            response_messages = record["response_messages"]
            for message in response_messages:
                if message["mime_type"] == "multi_load/iframe" and message["status"] == "complete":
                    multi_load = message["meta_data"]["multi_load"]
                    for item in multi_load:
                        display_list = item["content"]["display_list"]
                        for i in display_list:
                            image_info = i["image"][0]
                            image_list.append(image_info)
    except KeyError as e:
        print(f"Exception: {e}")
        raise KeyError("页面结构发生变化，无法解析图片数据")
    except json.JSONDecodeError:
        raise ValueError("页面数据格式错误，无法解析")

    return image_list


if __name__ == "__main__":
    import asyncio

    print(asyncio.run(doubao_image_parse("https://www.doubao.com/thread/aef4c7a4c78c2")))
    # print(asyncio.run(qianwen_image_parse("https://www.qianwen.com/share/chat/1b7641042a7c4f2fae8111f732c31f7f")))
