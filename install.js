module.exports = {
  requires: {
    bundle: "ai"
  },
  run: [
    {
      when: "{{gpu !== 'nvidia'}}",
      method: "notify",
      params: {
        html: "This app requires an NVIDIA GPU on Windows or Linux."
      },
      next: null
    },
    // Optional HuggingFace login. Maestro's default models are all on
    // PUBLIC repos, so this is NOT required — but a token lifts HuggingFace's
    // anonymous rate limits (helpful for the large model downloads) and
    // unlocks any gated models you add later. Non-blocking (wait: false):
    // Pinokio stores the token at HF_TOKEN_PATH; skip it and downloads fall
    // back to anonymous (launch.py is tolerant of an absent/blocked token).
    {
      method: "hf.login",
      params: { wait: false }
    },
    // Windows uses a Python 3.11 conda env rather than a uv venv off Pinokio's
    // base Python 3.10. Every accelerator wheel in the CUDA 13 stack — the
    // lightx2v NVFP4 kernels, the GGUF llama.cpp kernels, nunchaku, flash-attn
    // — is published cp311 only, and without them the quantized models fall
    // back to slow Python paths. `conda.path` resolves relative to `path`, so
    // this is app/env; Pinokio creates it if absent and activates it if not.
    {
      when: "{{platform === 'win32'}}",
      method: "shell.run",
      params: {
        conda: { path: "env", python: "3.11.14" },
        path: "app",
        message: [
          "uv pip install -r requirements.txt --index-strategy unsafe-best-match",
          "uv pip install hf-xet pip"
        ]
      }
    },
    // Linux keeps the original uv venv on Python 3.10: the published Linux
    // sage/flash wheels are cp310-only and PyTorch has no CUDA 13 Linux wheels
    // yet, so there is nothing to gain and an existing install to break.
    {
      when: "{{platform !== 'win32'}}",
      method: "shell.run",
      params: {
        venv: "env",
        path: "app",
        message: [
          "uv pip install -r requirements.txt --index-strategy unsafe-best-match",
          "uv pip install hf-xet pip"
        ]
      }
    },
    {
      method: "script.start",
      params: {
        uri: "torch.js",
        params: {
          path: "app"
        }
      }
    },
    // Install pre-built llama.cpp CUDA kernels for GGUF models if a
    // wheel matches the current Python / PyTorch / CUDA combo. Without
    // this, mmgp prints "[GGUF][llama.cpp CUDA] kernels unavailable,
    // using fallback" at every startup. The helper script is a soft
    // no-op when no matching wheel exists (e.g. Linux, or unreleased
    // version combo) — the fallback path still works for GGUF models,
    // and the default INT8 / BF16 variants don't use these kernels at
    // all. Idempotent on re-runs.
    {
      when: "{{platform === 'win32'}}",
      method: "shell.run",
      params: {
        conda: { path: "env" },
        path: "app",
        message: "python scripts/install_gguf_kernels.py"
      }
    },
    {
      when: "{{platform !== 'win32'}}",
      method: "shell.run",
      params: {
        venv: "env",
        path: "app",
        message: "python scripts/install_gguf_kernels.py"
      }
    },
    // Fetch the seed-vc voice-conversion component (GPL-3.0). It lives in
    // its own repository and is cloned into place at install time instead
    // of being tracked in this repo, so the GPL-licensed tree keeps its own
    // license and distribution channel. Pinned to a tag for reproducible
    // installs — bump the tag here AND in update.js when shipping a new
    // component version.
    {
      when: "{{!exists('app/postprocessing/seedvc/__init__.py')}}",
      method: "shell.run",
      params: {
        message: "git clone --depth 1 --branch v1.0.0 https://github.com/Blizaine/maestro-seedvc app/postprocessing/seedvc"
      }
    },
    {
      when: "{{exists('ui/package.json')}}",
      method: "shell.run",
      params: {
        path: "ui",
        message: [
          "npm install",
          "npm run build"
        ]
      }
    },
    // SAM 3.1 segmentation service (used by experimental Inpaint mode)
    // is intentionally NOT installed here. It adds ~5+ minutes to a
    // fresh install (separate Python 3.12 conda env, torch wheels,
    // SAM 3 source, etc.) but is only needed for the inpaint feature
    // which most users won't touch — and which is gated behind the
    // experimental flag in Settings → Services anyway. Users who want
    // it can run "Install Inpaint Support" from the Pinokio menu when
    // they're ready, which fires sam_install.js.
    {
      method: 'input',
      params: {
        title: 'Installation completed',
        description: 'Click "Start" to get started'
      }
    }
  ]
}
