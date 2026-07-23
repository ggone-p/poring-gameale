from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path


MODEL_CACHE_NAME = "models--ZhengPeng7--BiRefNet_dynamic"


def emit(event: str, **payload: object) -> None:
    print(json.dumps({"event": event, **payload}, ensure_ascii=False), flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Local BiRefNet background-removal demo")
    parser.add_argument("input", type=Path, nargs="?")
    parser.add_argument("output", type=Path, nargs="?")
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--model", default="ZhengPeng7/BiRefNet_dynamic")
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--max-side", type=int, default=1536)
    return parser.parse_args()


def inference_size(width: int, height: int, max_side: int) -> tuple[int, int]:
    scale = min(1.0, max_side / max(width, height))
    scaled_width = max(32, int(round(width * scale / 32) * 32))
    scaled_height = max(32, int(round(height * scale / 32) * 32))
    return scaled_width, scaled_height


def ensure_model(model_id: str, cache_dir: Path) -> None:
    if (cache_dir / MODEL_CACHE_NAME).exists():
        return

    from huggingface_hub import snapshot_download
    from tqdm.auto import tqdm

    class DownloadProgress(tqdm):
        last_percent = -1

        def update(self, amount: int | float = 1) -> bool | None:
            displayed = super().update(amount)
            if self.total and self.total > 1024 * 1024:
                percent = max(0, min(100, int(self.n * 100 / self.total)))
                if percent != DownloadProgress.last_percent:
                    DownloadProgress.last_percent = percent
                    emit(
                        "download-progress",
                        message=f"正在下载 BiRefNet 模型 {percent}%",
                        progress=percent,
                        determinate=True,
                    )
            return displayed

    emit("download-progress", message="正在连接模型下载服务", progress=0, determinate=True)
    snapshot_download(
        model_id,
        cache_dir=str(cache_dir),
        max_workers=1,
        tqdm_class=DownloadProgress,
    )
    emit("download-progress", message="模型下载完成", progress=100, determinate=True)


def ensure_model(model_id: str, cache_dir: Path) -> None:
    model_dir = cache_dir / MODEL_CACHE_NAME
    snapshots_dir = model_dir / "snapshots"
    if snapshots_dir.exists() and any(snapshots_dir.iterdir()):
        return

    from huggingface_hub import snapshot_download
    from tqdm.auto import tqdm

    class DownloadProgress(tqdm):
        last_percent = -1

        def update(self, amount: int | float = 1) -> bool | None:
            displayed = super().update(amount)
            if self.total and self.total > 1024 * 1024:
                percent = max(0, min(100, int(self.n * 100 / self.total)))
                if percent != DownloadProgress.last_percent:
                    DownloadProgress.last_percent = percent
                    emit(
                        "download-progress",
                        message=f"正在下载 BiRefNet 模型 {percent}%",
                        progress=percent,
                        determinate=True,
                    )
            return displayed

    emit("download-progress", message="正在连接 BiRefNet 开源模型下载服务", progress=0, determinate=False)
    snapshot_download(
        model_id,
        cache_dir=str(cache_dir),
        max_workers=1,
        tqdm_class=DownloadProgress,
    )
    emit("download-progress", message="BiRefNet 模型下载完成", progress=100, determinate=True)


def main() -> int:
    args = parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(args.cache_dir))
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    if args.prepare_only:
        ensure_model(args.model, args.cache_dir)
        return 0
    if args.input is None or args.output is None:
        raise ValueError("input and output are required unless --prepare-only is used")
    if not args.input.is_file():
        raise FileNotFoundError(f"Input image not found: {args.input}")

    args.output.parent.mkdir(parents=True, exist_ok=True)

    started = time.perf_counter()

    import torch
    from PIL import Image
    from torchvision import transforms
    from transformers import AutoModelForImageSegmentation

    ensure_model(args.model, args.cache_dir)
    emit("loading", message="正在加载 BiRefNet 模型", progress=12, determinate=False)
    model = AutoModelForImageSegmentation.from_pretrained(
        args.model,
        trust_remote_code=True,
        cache_dir=str(args.cache_dir),
        local_files_only=True,
    )
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device.type == "cuda":
        model = model.to(device).half()
    else:
        model = model.to(device)
    model.eval()

    image = Image.open(args.input).convert("RGB")
    original_size = image.size
    target_size = inference_size(*original_size, args.max_side)
    transform = transforms.Compose(
        [
            transforms.Resize((target_size[1], target_size[0]), antialias=True),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )

    emit(
        "processing",
        message=f"正在使用 {'GPU' if device.type == 'cuda' else 'CPU'} 识别主体边缘",
        progress=42,
        determinate=False,
        width=target_size[0],
        height=target_size[1],
        device=device.type,
    )
    input_tensor = transform(image).unsqueeze(0).to(device)
    if device.type == "cuda":
        input_tensor = input_tensor.half()
    with torch.inference_mode():
        prediction = model(input_tensor)[-1].sigmoid().cpu()[0].squeeze()

    emit("postprocessing", message="正在生成透明通道", progress=84, determinate=False)
    mask = transforms.ToPILImage()(prediction).resize(original_size, Image.Resampling.LANCZOS)
    result = image.copy()
    result.putalpha(mask)
    emit("saving", message="正在保存透明 PNG", progress=95, determinate=True)
    result.save(args.output, format="PNG", optimize=True)

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    emit(
        "complete",
        message="抠图完成",
        progress=100,
        determinate=True,
        outputPath=str(args.output.resolve()),
        width=original_size[0],
        height=original_size[1],
        elapsedMs=elapsed_ms,
        size=args.output.stat().st_size,
        device=device.type,
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        emit("error", message=str(error), errorType=type(error).__name__)
        raise
