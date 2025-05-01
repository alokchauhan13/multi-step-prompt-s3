# Setting Up a Virtual Environment and Jupyter Kernel for VSCode

## Step 1: Create a Virtual Environment
1. uv init
2. uv add google-genai
3. uv add python-dotenv
4. uv add --dev ipykernel

## Step 2: Install Required Dependencies
1. uv sync --dev

## Step 3: Add Jupyter Kernel for VSCode

1. Add the virtual environment as a Jupyter kernel:
    ```bash
    uv run ipython kernel install --user --env VIRTUAL_ENV $(pwd)/.venv --name=multi-step-prompt-S3
    ```
2. You may need to **restart VSCode**.

## Step 4: Use the Kernel in VSCode
1. Open VSCode and navigate to your Jupyter Notebook file.
2. In the top-right corner of the notebook interface, select the kernel dropdown.
3. Choose the kernel `multi-step-prompt-S3`.

Your virtual environment is now set up and ready to use with Jupyter Notebooks in VSCode.