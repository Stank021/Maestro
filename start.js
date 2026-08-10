module.exports = async (kernel) => {
  let port = await kernel.port()
  // SERVER_NAME is intentionally NOT set here. The host-binding
  // decision lives in launch.py, which reads PINOKIO_SHARE_LOCAL
  // from the merged shell env (per-app ENVIRONMENT overrides global
  // there). kernel.envs in this start.js context only exposes the
  // global ENVIRONMENT, so a per-app override of PINOKIO_SHARE_LOCAL
  // wouldn't be visible if we made the decision here. See launch.py
  // bottom for the full priority chain.
  return {
    requires: {
      bundle: "ai",
    },
    daemon: true,
    run: [
      // SAM service starts on demand (launched by the backend when inpaint is used)
      // — not started here to avoid holding a CUDA context that wastes VRAM
      {
        method: "shell.run",
        params: {
          // app/env is a conda env on Windows (Python 3.11, CUDA 13 kernels);
          // Linux keeps the uv venv. conda.path resolves relative to `path`.
          conda: kernel.platform === 'win32' ? { path: "env" } : undefined,
          venv: kernel.platform === 'win32' ? undefined : "env",
          env: {
            SERVER_PORT: port
          },
          path: "app",
          message: [
            "python launch.py {{args.compile ? '--compile' : ''}}"
          ],
          on: [{
            "event": "/(http:\/\/[0-9.:]+)/",
            "done": true
          }]
        }
      },
      {
        method: "local.set",
        params: {
          url: "{{input.event[1]}}"
        }
      }
    ]
  }
}
