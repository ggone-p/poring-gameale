$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $ProjectRoot '.birefnet-demo\.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $Python)) {
  python -m uv venv (Join-Path $ProjectRoot '.birefnet-demo\.venv') --python 3.11
}

$TorchIndex = if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
  'https://download.pytorch.org/whl/cu128'
} else {
  'https://download.pytorch.org/whl/cpu'
}

python -m uv pip install --python $Python torch torchvision --index-url $TorchIndex
python -m uv pip install --python $Python 'transformers>=4.46,<5' pillow safetensors huggingface-hub timm kornia einops

Write-Host 'BiRefNet demo runtime is ready.'
