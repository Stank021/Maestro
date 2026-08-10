// SAM 3.1 Segmentation Service — Install Script
// Creates a separate Python 3.12 conda env and installs SAM 3.1 + dependencies.
// Called by install.js and update.js.
module.exports = {
  run: [
    // Step 1: Clone SAM 3 repo if not already present
    {
      when: "{{!exists('app/services/sam/sam3')}}",
      method: "shell.run",
      params: {
        message: "git clone https://github.com/facebookresearch/sam3.git app/services/sam/sam3"
      }
    },
    // Step 1b: Pull latest if repo already exists
    {
      when: "{{exists('app/services/sam/sam3')}}",
      method: "shell.run",
      params: {
        path: "app/services/sam/sam3",
        message: "git pull"
      }
    },
    // Step 2: Install PyTorch (CUDA 12.8) in a Python 3.12 conda env
    {
      method: "shell.run",
      params: {
        conda: {
          path: "app/services/sam/env",
          python: "3.12"
        },
        message: [
          "pip install torch torchvision \"numpy>=1.26,<2\" --index-url https://download.pytorch.org/whl/cu128 --extra-index-url https://pypi.org/simple"
        ]
      }
    },
    // Step 3: Install SAM 3 package + all microservice deps from requirements.txt
    // Both are passed to a SINGLE pip invocation on purpose: sam3 pins numpy<2 and
    // requirements.txt pins the NumPy-1-ABI builds of opencv/scipy. Installing them as
    // two separate commands lets the second one silently clobber the first's numpy
    // (pip only warns on the resulting conflict), which leaves the env unimportable.
    {
      method: "shell.run",
      params: {
        conda: {
          path: "app/services/sam/env",
          python: "3.12"
        },
        message: [
          "pip install -r app/services/sam/requirements.txt app/services/sam/sam3"
        ]
      }
    },
    // Note: SAM 3.1 model checkpoints (~1.7GB each for base + multiplex) are downloaded
    // automatically on first use. The service tries the official facebook/sam3 repo first,
    // and falls back to ungated mirrors (jetjodh/sam3, jetjodh/sam3.1) if gated access
    // is not available.
  ]
}
