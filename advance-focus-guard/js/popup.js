// Debug logging function
const debug = (message) => {
    console.log(`[Advance Focus Guard] ${message}`);
};

// DOM Elements
const guardButton = document.getElementById('guard-button');
const activityDescription = document.getElementById('activity-description');
const monitoringDuration = document.getElementById('monitoring-duration');
const apiKeyInput = document.getElementById('api-key');
const togglePasswordButton = document.getElementById('toggle-password');
const wordCount = document.getElementById('word-count');
const statusMessage = document.getElementById('status-message');
const pageInfo = document.getElementById('page-info');
const intentSection = document.getElementById('intent-section');
const pageCategoryClassification = document.getElementById('page-category-classification');
const intentButtons = document.querySelectorAll('.intent-button');
const generateReportButton = document.getElementById('generate-report-button');

// Global state
let isGuarding = false;
let currentTabId = null;
let currentUrl = '';

// Constants
const DEFAULT_API_KEY = 'AIzaSyDK-YKOAcFCc4C1b0i2YHGZmaDlhHgeFVU';
const STORAGE_KEYS = {
    API_KEY: 'gemini_api_key',
    ACTIVITY: 'activity_description',
    DURATION: 'monitoring_duration',
    IS_GUARDING: 'is_guarding',
    GUARD_START_TIME: 'guard_start_time'
};

// Initialize extension
document.addEventListener('DOMContentLoaded', async () => {
    debug('Extension popup opened');
    await loadStoredSettings();
    await getCurrentTab();
    setupEventListeners();
    updateUIBasedOnGuardingState();
});

// Load settings from storage
async function loadStoredSettings() {
    try {
        const data = await chrome.storage.local.get([
            STORAGE_KEYS.API_KEY, 
            STORAGE_KEYS.ACTIVITY, 
            STORAGE_KEYS.DURATION,
            STORAGE_KEYS.IS_GUARDING,
            STORAGE_KEYS.GUARD_START_TIME
        ]);
        
        debug('Loaded stored settings');
        
        // Set API key (use default if not set)
        if (data[STORAGE_KEYS.API_KEY]) {
            apiKeyInput.value = data[STORAGE_KEYS.API_KEY];
        } else {
            apiKeyInput.value = DEFAULT_API_KEY;
            await chrome.storage.local.set({ [STORAGE_KEYS.API_KEY]: DEFAULT_API_KEY });
        }
        
        // Set activity description
        if (data[STORAGE_KEYS.ACTIVITY]) {
            activityDescription.value = data[STORAGE_KEYS.ACTIVITY];
            updateWordCount();
        }
        
        // Set monitoring duration
        if (data[STORAGE_KEYS.DURATION]) {
            monitoringDuration.value = data[STORAGE_KEYS.DURATION];
        }
        
        // Set guarding state
        isGuarding = data[STORAGE_KEYS.IS_GUARDING] || false;
        
        // Check if guarding duration has expired
        if (isGuarding && data[STORAGE_KEYS.GUARD_START_TIME]) {
            const startTime = data[STORAGE_KEYS.GUARD_START_TIME];
            const currentTime = Date.now();
            const durationMs = parseInt(data[STORAGE_KEYS.DURATION]) * 60 * 1000;
            
            if (currentTime - startTime > durationMs) {
                debug('Guarding duration expired, stopping guard');
                isGuarding = false;
                await chrome.storage.local.set({ [STORAGE_KEYS.IS_GUARDING]: false });
            }
        }
    } catch (error) {
        debug(`Error loading stored settings: ${error.message}`);
        showStatusMessage(`Error loading settings: ${error.message}`, true);
    }
}

// Get the current tab information
async function getCurrentTab() {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
            currentTabId = tabs[0].id;
            currentUrl = tabs[0].url;
            debug(`Current tab: ${currentTabId}, URL: ${currentUrl}`);
            
            // Load page classification if guarding is active
            if (isGuarding && currentUrl && !currentUrl.startsWith('chrome://')) {
                await loadPageClassification();
            }
        }
    } catch (error) {
        debug(`Error getting current tab: ${error.message}`);
    }
}

// Load page classification from IndexedDB
async function loadPageClassification() {
    try {
        // Send message to background script to get classification
        const response = await chrome.runtime.sendMessage({
            action: 'getPageClassification',
            tabId: currentTabId,
            url: currentUrl
        });
        
        if (response && response.success) {
            debug(`Loaded classification: ${JSON.stringify(response.data)}`);
            updatePageClassificationUI(response.data);
        } else {
            debug('No classification data found for current page');
        }
    } catch (error) {
        debug(`Error loading page classification: ${error.message}`);
    }
}

// Update page classification UI
function updatePageClassificationUI(classificationData) {
    if (!classificationData) return;
    
    pageInfo.classList.remove('hidden');
    
    const { category, classification } = classificationData;
    const classText = `${category}/${classification}`;
    
    pageCategoryClassification.textContent = classText;
    pageCategoryClassification.classList.remove('relevant', 'non-relevant');
    pageCategoryClassification.classList.add(classification === 'relevant' ? 'relevant' : 'non-relevant');
    
    // Show intent section for non-relevant pages
    if (classification === 'non-relevant') {
        intentSection.classList.remove('hidden');
        loadPageIntent();
    } else {
        intentSection.classList.add('hidden');
    }
}

// Load page intent from IndexedDB
async function loadPageIntent() {
    try {
        // Send message to background script to get intent
        const response = await chrome.runtime.sendMessage({
            action: 'getPageIntent',
            tabId: currentTabId,
            url: currentUrl
        });
        
        if (response && response.success && response.data) {
            debug(`Loaded intent: ${response.data.intent}`);
            
            // Update UI to show selected intent
            intentButtons.forEach(button => {
                const intent = button.dataset.intent;
                if (intent === response.data.intent) {
                    button.classList.add('selected');
                } else {
                    button.classList.remove('selected');
                }
            });
        } else {
            debug('No intent data found for current page');
            // Reset all buttons
            intentButtons.forEach(button => button.classList.remove('selected'));
        }
    } catch (error) {
        debug(`Error loading page intent: ${error.message}`);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Guard button click
    guardButton.addEventListener('click', toggleGuarding);
    
    // Word count for activity description
    activityDescription.addEventListener('input', updateWordCount);
    
    // Toggle password visibility
    togglePasswordButton.addEventListener('click', togglePasswordVisibility);
    
    // Save API key when changed
    apiKeyInput.addEventListener('change', saveApiKey);
    
    // Intent button clicks
    intentButtons.forEach(button => {
        button.addEventListener('click', () => setPageIntent(button.dataset.intent));
    });

    // Generate Report button
    generateReportButton.addEventListener('click', generateReport);
}

// Toggle guarding state
async function toggleGuarding() {
    try {
        if (isGuarding) {
            // Stop guarding
            isGuarding = false;
            await chrome.storage.local.set({ [STORAGE_KEYS.IS_GUARDING]: false });
            debug('Stopped guarding');
            
            // Send message to background script to stop guarding
            await chrome.runtime.sendMessage({ action: 'stopGuarding' });
            
            updateUIBasedOnGuardingState();
            showStatusMessage('Guarding stopped', false);
        } else {
            // Start guarding
            const activity = activityDescription.value.trim();
            const duration = parseInt(monitoringDuration.value);
            
            // Validate inputs
            if (!activity) {
                showStatusMessage('Please describe what you are working on', true);
                return;
            }
            
            if (isNaN(duration) || duration <= 0) {
                showStatusMessage('Please enter a valid monitoring duration', true);
                return;
            }
            
            // Save settings
            await chrome.storage.local.set({
                [STORAGE_KEYS.ACTIVITY]: activity,
                [STORAGE_KEYS.DURATION]: duration,
                [STORAGE_KEYS.IS_GUARDING]: true,
                [STORAGE_KEYS.GUARD_START_TIME]: Date.now()
            });
            
            isGuarding = true;
            debug(`Started guarding for ${duration} minutes`);
            
            // Send message to background script to start guarding
            await chrome.runtime.sendMessage({
                action: 'startGuarding',
                data: {
                    activity,
                    duration
                }
            });
            
            updateUIBasedOnGuardingState();
            showStatusMessage('Guarding started. Give it 15 seconds to evaluate the current page.', false);
            
            // If we're on a valid page, trigger evaluation
            if (currentTabId && currentUrl && !currentUrl.startsWith('chrome://')) {
                await chrome.runtime.sendMessage({
                    action: 'evaluatePage',
                    tabId: currentTabId,
                    url: currentUrl
                });
            }
        }
    } catch (error) {
        debug(`Error toggling guarding: ${error.message}`);
        showStatusMessage(`Error: ${error.message}`, true);
    }
}

// Set page intent
async function setPageIntent(intent) {
    try {
        debug(`Setting page intent to: ${intent}`);
        
        // Send message to background script to save intent
        await chrome.runtime.sendMessage({
            action: 'setPageIntent',
            tabId: currentTabId,
            url: currentUrl,
            intent: intent
        });
        
        // Update UI
        intentButtons.forEach(button => {
            if (button.dataset.intent === intent) {
                button.classList.add('selected');
            } else {
                button.classList.remove('selected');
            }
        });
        
        showStatusMessage(`Intent set to: ${intent}`, false);
    } catch (error) {
        debug(`Error setting page intent: ${error.message}`);
        showStatusMessage(`Error setting intent: ${error.message}`, true);
    }
}

// Update word count for activity description
function updateWordCount() {
    const text = activityDescription.value;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    document.getElementById('word-count').textContent = `${wordCount}/120 words`;
}

// Toggle password visibility for API key
function togglePasswordVisibility() {
    const type = apiKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
    apiKeyInput.setAttribute('type', type);
    togglePasswordButton.textContent = type === 'password' ? '👁️' : '🔒';
}

// Save API key
async function saveApiKey() {
    try {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            await chrome.storage.local.set({ [STORAGE_KEYS.API_KEY]: apiKey });
            debug('API key saved');
            showStatusMessage('API key saved', false);
        } else {
            // If empty, set to default
            apiKeyInput.value = DEFAULT_API_KEY;
            await chrome.storage.local.set({ [STORAGE_KEYS.API_KEY]: DEFAULT_API_KEY });
            debug('Set to default API key');
            showStatusMessage('Using default API key', false);
        }
    } catch (error) {
        debug(`Error saving API key: ${error.message}`);
        showStatusMessage(`Error saving API key: ${error.message}`, true);
    }
}

// Update UI based on guarding state
function updateUIBasedOnGuardingState() {
    if (isGuarding) {
        guardButton.textContent = 'Stop Guarding';
        guardButton.classList.add('stop');
        activityDescription.readOnly = true;
        monitoringDuration.readOnly = true;
    } else {
        guardButton.textContent = 'Guard';
        guardButton.classList.remove('stop');
        activityDescription.readOnly = false;
        monitoringDuration.readOnly = false;
        pageInfo.classList.add('hidden');
        intentSection.classList.add('hidden');
    }
}

// Show status message
function showStatusMessage(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle('error', isError);
    statusMessage.classList.toggle('success', !isError);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.classList.remove('error', 'success');
    }, 5000);
}

// Generate analytics report
async function generateReport() {
    try {
        debug('Generating analytics report');
        showStatusMessage('Generating report...', false);
        
        // Send message to background script to generate report
        const response = await chrome.runtime.sendMessage({ action: 'generateReport' });
        
        if (response && response.success) {
            debug('Report generated successfully');
            showStatusMessage('Report generated successfully', false);
        } else {
            debug(`Error generating report: ${response?.error || 'Unknown error'}`);
            showStatusMessage(`Error generating report: ${response?.error || 'Unknown error'}`, true);
        }
    } catch (error) {
        debug(`Error generating report: ${error.message}`);
        showStatusMessage(`Error generating report: ${error.message}`, true);
    }
}