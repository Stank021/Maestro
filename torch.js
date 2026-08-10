module.exports = {
  run: [
    // windows nvidia
    {
      "when": "{{platform === 'win32'}}",
      "method": "shell.run",
      "params": {
        // app/env is a conda env (Python 3.11), not a uv venv — the NVFP4 /
        // GGUF / nunchaku kernel wheels are all cp311, and Pinokio's base
        // Python is 3.10. `conda.path` resolves relative to `path`, so this
        // is app/env. Pinokio activates it if it exists and creates it if not.
        "conda": { "path": "env", "python": "3.11.14" },
        "path": "{{args && args.path ? args.path : 'app'}}",
        // CUDA 13.0 / Python 3.11 stack. torch is pinned to 2.10.0 exactly:
        // lightx2v_kernel (NVFP4), the GGUF llama.cpp kernels and nunchaku are
        // all C++ extensions built against torch 2.10's ABI, so a torch minor
        // bump silently un-registers their ops and everything falls back.
        // triton is pinned to the 3.6 series for the same reason — torch 2.10
        // requires triton==3.6.0, and `-U triton-windows` overshoots to 3.7.
        //
        // xformers is deliberately absent: the only build for torch 2.10 is
        // cu128-linked, and the code paths that use it (LTX2, hyvideo) fall
        // through cleanly to sage2 / flash-attn / torch SDPA, which are faster
        // on Blackwell anyway.
        "message": [
          "uv pip install torch==2.10.0 torchvision==0.25.0 torchaudio==2.10.0 --index-url https://download.pytorch.org/whl/cu130 --force-reinstall",
          "uv pip install triton-windows==3.6.0.post26",
          "uv pip install https://github.com/woct0rdho/SageAttention/releases/download/v2.2.0-windows.post4/sageattention-2.2.0+cu130torch2.9.0andhigher.post4-cp39-abi3-win_amd64.whl",
          "uv pip install https://github.com/deepbeepmeep/kernels/releases/download/Flash2/flash_attn-2.8.3-cp311-cp311-win_amd64.whl",
          // NVFP4 tensor-core kernels for RTX 50xx / sm120+. Without this the
          // NVFP4 models still load, but every linear dequantizes 4-bit weights
          // to bf16 on every forward pass with no cache — slower than running
          // bf16 outright, for identical quality. Harmless on older GPUs: the
          // sm120 guard in shared/qtypes/nvfp4.py just declines to use it.
          "uv pip install https://github.com/deepbeepmeep/kernels/releases/download/Light2xv/lightx2v_kernel-0.0.2+torch2.10.0-cp311-abi3-win_amd64.whl",
          // Nunchaku INT4/FP4 kernels (Qwen 2509, Z Image).
          "uv pip install https://github.com/nunchaku-ai/nunchaku/releases/download/v1.2.1/nunchaku-1.2.1+cu13.0torch2.10-cp311-cp311-win_amd64.whl"
        ]
      }
    },
    // linux nvidia
    {
      // Linux stays on the Python 3.10 uv venv + CUDA 12.8: PyTorch publishes
      // no cu130 Linux wheels yet and the sage/flash wheels below are cp310.
      "when": "{{platform === 'linux'}}",
      "method": "shell.run",
      "params": {
        "venv": "env",
        "path": "{{args && args.path ? args.path : 'app'}}",
        "message": [
          "uv pip install torch==2.7.0 torchvision==0.22.0 torchaudio==2.7.0 {{args && args.xformers ? 'xformers==0.0.30' : ''}} --index-url https://download.pytorch.org/whl/cu128 --force-reinstall",
          "uv pip install https://huggingface.co/MonsterMMORPG/SECourses_Premium_Flash_Attention/resolve/main/sageattention-2.1.1-cp310-cp310-linux_x86_64.whl",
          "uv pip install https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.7.16/flash_attn-2.7.4+cu128torch2.7-cp310-cp310-linux_x86_64.whl",
          "uv pip install numpy==2.1.2"
        ]
      }
    },
    // Marker file so update.js can skip this script on routine updates
    // (torch + triton + sage + flash already installed, no version bump).
    // Saves ~60-120s of unnecessary re-download every time the user runs
    // Update with nothing new to install.
    //
    // When bumping ANY version above (torch / triton / sage / flash), ALSO
    // bump the `_v1` suffix here AND in update.js's gate to force a
    // reinstall on the next update. The old marker becomes stale and the
    // `!exists(new_marker)` gate evaluates true → this script runs → new
    // marker written. Old marker stays as harmless cruft until reset.js.
    {
      "method": "fs.write",
      "params": {
        "path": "app/env/.maestro_torch_v2.installed",
        "text": "torch + triton + sage + flash + lightx2v(NVFP4) + nunchaku installed by torch.js. Delete this file to force update.js to re-run torch.js on the next Update."
      }
    }
  ]
}
