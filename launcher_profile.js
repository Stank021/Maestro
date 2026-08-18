"use strict"

// Keep launcher-side hardware routing in one place. Pinokio exposes both a
// normalized GPU model and a CUDA architecture target before Python/PyTorch
// exists, so this works for fresh installs as well as upgrades.
const isRtx50 = (kernel = {}) => {
  const target = String(kernel.gpu_target || "").toLowerCase()
  const model = String(kernel.gpu_model || "").toLowerCase()
  return kernel.gpu === "nvidia" && (
    target === "sm_120" || /(?:geforce\s+)?rtx\s*50\d{2}/i.test(model)
  )
}

const isRtx40 = (kernel = {}) => {
  const target = String(kernel.gpu_target || "").toLowerCase()
  const model = String(kernel.gpu_model || "").toLowerCase()
  return kernel.gpu === "nvidia" && (
    target === "sm_89" || /(?:geforce\s+)?rtx\s*40\d{2}/i.test(model)
  )
}

const isSolCapable = (kernel = {}) => {
  const target = String(kernel.gpu_target || "").toLowerCase()
  return kernel.gpu === "nvidia" && (
    ["sm_89", "sm_90", "sm_100", "sm_120"].includes(target)
    || isRtx40(kernel)
    || isRtx50(kernel)
  )
}

const needsCuda13DriverUpdate = (kernel = {}) => {
  if (kernel.gpu !== "nvidia" || !kernel.gpu_driver) return false
  const driver = Number.parseFloat(String(kernel.gpu_driver))
  return Number.isFinite(driver) && driver < 580
}

// LOCAL DEVIATION FROM UPSTREAM — see runtimeShell() below.
//
// Upstream builds the RTX 50 runtime as a fresh uv venv at app/env-rtx50 and
// drives it with Pinokio's `venv:` / `venv_python:` parameters. This install
// predates that: its Python 3.11 / CUDA 13 runtime is a *conda* env already
// sitting at app/env, built before upstream supported `venv_python`, and it
// satisfies every requirement in scripts/verify_sol_runtime.py today
// (Python 3.11.14, torch 2.10.0+cu130, CUDA 13.0, Triton 3.6, sm_120).
//
// Pointing the RTX 50 profile back at that env avoids a redundant multi-
// gigabyte rebuild of a runtime we already have. `conda: true` tells
// runtimeShell() to activate it with `conda:` rather than `venv:`, which
// would not work against a conda layout (no pyvenv.cfg).
//
// To adopt upstream's layout later: restore env/marker/flashMarker to the
// env-rtx50 values, drop `conda: true`, run Update once, then delete the old
// app/env. Nothing else in these scripts needs to change.
// Needed as a literal by the detection guard in torch.js: when GPU detection
// has not populated yet, legacyRuntimeProfile() returns the non-RTX 50 profile,
// whose marker is a different file. The guard has to ask about *this* marker
// specifically to notice the contradiction.
const RTX50_MARKER = "app/env/.maestro_torch_rtx50_v2.installed"

const legacyRuntimeProfile = (kernel = {}) => {
  if (isRtx50(kernel)) {
    return {
      env: "env",
      python: "3.11",
      conda: true,
      // v2 pins Triton 3.6 for the integrated H3 Sol Engine path. The marker
      // bump makes v1.7.5 Update migrate existing RTX 50 environments once.
      marker: RTX50_MARKER,
      flashMarker: "app/env/.maestro_flash_2_8_3_v1.installed",
      label: "RTX 50 / CUDA 13",
    }
  }
  // `conda: true` here too: app/env is a conda env on this install no matter
  // which profile selects it. GPU detection is not populated for the first
  // ~30s after the Pinokio kernel starts, so a Start clicked right after a
  // reboot lands in this branch with gpu_target empty. Without `conda: true`
  // that combination activates a conda layout via `venv:` and dies on the
  // missing env/Scripts/activate.
  return {
    env: "env",
    python: "3.10",
    conda: true,
    marker: "app/env/.maestro_torch_v1.installed",
    flashMarker: "app/env/.maestro_flash_2_7_4_v1.installed",
    label: "CUDA 12.8 legacy",
  }
}

const solRuntimeProfile = (kernel = {}) => {
  if (isRtx50(kernel)) return legacyRuntimeProfile(kernel)
  return {
    env: "env-sol",
    python: "3.11",
    marker: "app/env-sol/.maestro_sol_runtime_v1.installed",
    flashMarker: "app/env-sol/.maestro_sol_flash_2_8_3_v1.installed",
    label: "H3 Sol Engine / CUDA 13",
  }
}

// The tested CUDA 13 / Python 3.11 environment is now Maestro's preferred
// runtime on GPUs supported by H3 Sol Engine. Existing RTX 40 installations
// retain app/env as a recovery path; start.js falls back to it automatically
// until the normal Update flow finishes this side-by-side migration.
const runtimeProfile = (kernel = {}) => (
  isSolCapable(kernel) && !needsCuda13DriverUpdate(kernel)
    ? solRuntimeProfile(kernel)
    : legacyRuntimeProfile(kernel)
)

// Build the shell.run keys that activate a runtime profile's environment.
// Upstream inlines `venv: runtime.env, venv_python: runtime.python` at every
// call site; routing it through here instead keeps the conda deviation above
// in one place, so each launcher script carries a one-line local diff rather
// than a bespoke conditional. `env` / `python` may be overridden by callers
// that pick between a preferred and a recovery runtime at template time.
const runtimeShell = (runtime = {}, { env, python } = {}) => {
  const target = env || runtime.env
  const version = python || runtime.python
  return runtime.conda
    ? { conda: { path: target, python: version } }
    : { venv: target, venv_python: version }
}

module.exports = {
  RTX50_MARKER,
  isRtx40,
  isRtx50,
  isSolCapable,
  needsCuda13DriverUpdate,
  legacyRuntimeProfile,
  runtimeProfile,
  runtimeShell,
  solRuntimeProfile,
}
