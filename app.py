import os

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, HttpUrl

from doubao_parser.image import doubao_image_parse
from doubao_parser.video import doubao_video_parse

app = FastAPI(title="无印豆包 API", description="从豆包对话链接中提取图片和视频资源", version="1.0.0")

if os.path.exists("icons"):
    app.mount("/icons", StaticFiles(directory="icons"), name="icons")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DouBaoRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"example": {"url": "https://www.doubao.com/thread/aef4c7a4c78c2", "return_raw": False}}
    )

    url: HttpUrl
    return_raw: bool = False


class DouBaoResponse(BaseModel):
    success: bool
    image_count: int
    images: list[dict]


class VideoRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {"url": "https://www.doubao.com/video-sharing?share_id=xxx&video_id=xxx", "return_raw": False}
        }
    )

    url: HttpUrl
    return_raw: bool = False


class VideoResponse(BaseModel):
    success: bool
    video: dict


@app.get("/", summary="首页", include_in_schema=False)
async def root():
    if os.path.exists("index.html"):
        return FileResponse("index.html")
    return {
        "message": "Doubao Parser - Extract images and videos from Doubao links",
        "docs": "/docs",
        "version": "1.0.0",
    }


@app.post("/parse", summary="解析豆包对话图片")
async def parse_doubao(request: DouBaoRequest):
    try:
        result = await doubao_image_parse(str(request.url), return_raw=request.return_raw)

        if request.return_raw:
            return {"success": True, "data": result}

        return DouBaoResponse(success=True, image_count=len(result), images=result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Exception: {e}")
        raise HTTPException(status_code=500, detail="图片解析失败，请检查链接是否正确")


@app.get("/parse", summary="解析豆包对话图片(GET)")
async def parse_doubao_get(url: str, return_raw: bool = False):
    try:
        result = await doubao_image_parse(url, return_raw=return_raw)

        if return_raw:
            return {"success": True, "data": result}

        return DouBaoResponse(success=True, image_count=len(result), images=result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Exception: {e}")
        raise HTTPException(status_code=500, detail="图片解析失败，请检查链接是否正确")


@app.post("/parse-video", summary="解析豆包视频")
async def parse_video(request: VideoRequest):
    try:
        video_data = await doubao_video_parse(str(request.url), return_raw=request.return_raw)

        if request.return_raw:
            return {"success": True, "data": video_data}

        return VideoResponse(success=True, video=video_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Exception: {e}")
        raise HTTPException(status_code=500, detail="视频解析失败，请检查链接是否正确")


@app.get("/parse-video", summary="解析豆包视频(GET)")
async def parse_video_get(url: str, return_raw: bool = False):
    try:
        video_data = await doubao_video_parse(url, return_raw=return_raw)

        if return_raw:
            return {"success": True, "data": video_data}

        return VideoResponse(success=True, video=video_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Exception: {e}")
        raise HTTPException(status_code=500, detail="视频解析失败，请检查链接是否正确")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
