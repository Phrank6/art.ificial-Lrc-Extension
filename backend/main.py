import base64
import io
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from processing import (
    EditParams,
    CropParams,
    load_image,
    process_image,
    apply_crop,
    image_to_base64,
)

app = FastAPI(title="Photo Editor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ProcessRequest(BaseModel):
    image_b64: str
    filename: str
    params: dict = {}


class CropRequest(BaseModel):
    image_b64: str
    filename: str
    crop: dict = {}


def decode_image(image_b64: str, filename: str):
    try:
        file_bytes = base64.b64decode(image_b64)
        return load_image(file_bytes, filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode image: {str(e)}")


@app.post("/process")
async def process_endpoint(req: ProcessRequest):
    img = decode_image(req.image_b64, req.filename)

    # Build EditParams from dict, ignoring unknown keys
    edit_fields = {k: v for k, v in req.params.items() if hasattr(EditParams, k) or k in EditParams.__dataclass_fields__}
    params = EditParams(**{k: v for k, v in req.params.items() if k in EditParams.__dataclass_fields__})

    result = process_image(img, params)
    return {"result_b64": image_to_base64(result)}


@app.post("/process-crop")
async def process_crop_endpoint(req: CropRequest):
    img = decode_image(req.image_b64, req.filename)
    ratio = req.crop.get("ratio", None)
    rotation = float(req.crop.get("rotation", 0.0))
    result = apply_crop(img, ratio, rotation)
    return {"result_b64": image_to_base64(result)}


@app.get("/health")
async def health():
    return {"status": "ok"}
