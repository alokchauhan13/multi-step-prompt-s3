# Advance Focus guard Google chrome extension.

## Advance focus guard extension folder structure:

## Basic Structure:
I set up the complete folder structure for the extension with CSS, JavaScript, and images folders.

## Core Files:

- manifest.json: Configuration file that defines the extension metadata, permissions, and components
- popup.html: The main extension popup interface with user input fields and controls
- css/popup.css: Styling for the popup interface
- css/content.css: Styling for the page mask overlay
- js/popup.js: Logic for the popup UI, handling user interactions
- js/content.js: Content script that runs on web pages for masking and content extraction
- js/background.js: Background script handling the core functionality including - database operations, API calls, and coordination

## Functionality Implemented:

- User activity input and monitoring duration settings
- API key management with default key support
- Page classification using Gemini API
- IndexedDB integration for storing user inputs, evaluations, and intents
- Page masking for non-relevant websites
- Intent tracking for non-relevant pages

## Generating different size chrome extension images

[Chrome Extension Icon Generator](https://alexleybourne.github.io/chrome-extension-icon-generator/)

## Example user description:

I will be working on developing chrome extension with the help of AI and LLMs. I will be studying about protein design and ligand design.

## Setting Up a Virtual Environment and Jupyter Kernel for VSCode

### Step 1: Create a Virtual Environment
1. uv init
2. uv add google-genai
3. uv add python-dotenv
4. uv add --dev ipykernel

### Step 2: Install Required Dependencies
1. uv sync --dev

### Step 3: Add Jupyter Kernel for VSCode

1. Add the virtual environment as a Jupyter kernel:
    ```bash
    uv run ipython kernel install --user --env VIRTUAL_ENV $(pwd)/.venv --name=multi-step-prompt-S3
    ```
    
    `Kernel reference got created at : C:\Users\<----->\AppData\Roaming\jupyter\kernels\multi-step-prompt-s3`


2. You may need to **restart VSCode**.

### Step 4: Use the Kernel in VSCode
1. Open VSCode and navigate to your Jupyter Notebook file.
2. In the top-right corner of the notebook interface, select the kernel dropdown.
3. Choose the kernel `multi-step-prompt-S3`.

Your virtual environment is now set up and ready to use with Jupyter Notebooks in VSCode.


