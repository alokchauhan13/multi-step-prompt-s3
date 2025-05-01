// Debug logging function
const debug = (message) => {
    console.log(`[Advance Focus Guard - Background] ${message}`);
};

// IndexedDB setup
const DB_NAME = 'AdvanceFocusGuardDB';
const DB_VERSION = 1;
const STORES = {
    USER_INPUTS: 'userInputs',
    EVALUATIONS: 'evaluations',
    INTENTS: 'intents'
};

// Always relevant website categories
const ALWAYS_RELEVANT_CATEGORIES = [
    'Educational', 
    'Learning platforms', 
    'College or University', 
    'Scientific Research Platforms', 
    'Wikis and Encyclopedias',
    'Project Management Tools',
    'Software Documentation Sites',
    'AI-generated Content Platforms',
    'Bank',
    'Finance and Investment',
    'Government Websites'
];

// Global state
let db = null;
let isGuarding = false;
let currentActivity = '';
let currentInputId = null;
let pendingEvaluations = new Map();
let evaluationDelayTimers = new Map();

// Initialize extension
(function() {
    debug('Background script started');
    initializeDatabase();
    checkGuardingState();
    setupListeners();
})();

// Set up listeners
function setupListeners() {
    // Listen for messages from popup and content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        debug(`Received message: ${JSON.stringify(message)}`);
        
        // Handle different message actions
        switch(message.action) {
            case 'startGuarding':
                handleStartGuarding(message.data, sendResponse);
                return true;
                
            case 'stopGuarding':
                handleStopGuarding(sendResponse);
                return true;
                
            case 'evaluatePage':
                if (isGuarding) {
                    const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
                    if (tabId) {
                        handleEvaluatePage(tabId, message.url || (sender.tab ? sender.tab.url : ''), sendResponse);
                    } else {
                        sendResponse({ success: false, error: 'No tab ID provided for evaluation' });
                    }
                } else {
                    sendResponse({ success: false, error: 'Not currently guarding' });
                }
                return true;
                
            case 'getPageClassification':
                handleGetPageClassification(message.tabId, message.url, sendResponse);
                return true;
                
            case 'getPageIntent':
                handleGetPageIntent(message.tabId, message.url, sendResponse);
                return true;
                
            case 'setPageIntent':
                handleSetPageIntent(message.tabId, message.url, message.intent, sendResponse);
                return true;
                
            case 'generateReport':
                handleGenerateReport(sendResponse);
                return true;
        }
    });
    
    // Listen for tab changes
    chrome.tabs.onActivated.addListener(activeInfo => {
        if (isGuarding) {
            debug(`Tab activated: ${activeInfo.tabId}`);
            chrome.tabs.get(activeInfo.tabId, tab => {
                if (tab && tab.url && !tab.url.startsWith('chrome://')) {
                    const url = tab.url;
                    debug(`Checking evaluation for tab: ${tab.id}, url: ${url}`);
                    
                    // Check if the page has been evaluated recently
                    getEvaluation(tab.id, url).then(evaluation => {
                        if (!evaluation) {
                            debug(`No evaluation found for ${url}, starting evaluation`);
                            schedulePageEvaluation(tab.id, url);
                        } else {
                            debug(`Found evaluation: ${JSON.stringify(evaluation)}`);
                            
                            // If evaluation is older than 5 minutes, re-evaluate
                            const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                            if (evaluation.timestamp < fiveMinutesAgo) {
                                debug(`Evaluation is older than 5 minutes, re-evaluating`);
                                schedulePageEvaluation(tab.id, url);
                            } else if (evaluation.classification === 'non-relevant') {
                                // Apply mask for non-relevant pages
                                applyMaskToTab(tab.id);
                            }
                        }
                    }).catch(err => {
                        debug(`Error checking evaluation: ${err.message}`);
                    });
                }
            });
        }
    });
    
    // Listen for navigation
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (isGuarding && changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
            debug(`Tab updated: ${tabId}, url: ${tab.url}`);
            
            // Clear any pending evaluations for this tab
            if (evaluationDelayTimers.has(tabId)) {
                clearTimeout(evaluationDelayTimers.get(tabId));
            }
            
            // Schedule a new evaluation
            schedulePageEvaluation(tabId, tab.url);
        }
    });
}

// Initialize IndexedDB
function initializeDatabase() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = function(event) {
        debug(`Database error: ${event.target.errorCode}`);
    };
    
    request.onupgradeneeded = function(event) {
        db = event.target.result;
        debug(`Upgrading database to version ${DB_VERSION}`);
        
        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains(STORES.USER_INPUTS)) {
            db.createObjectStore(STORES.USER_INPUTS, { keyPath: 'inputId' });
            debug('Created userInputs store');
        }
        
        if (!db.objectStoreNames.contains(STORES.EVALUATIONS)) {
            const evaluationStore = db.createObjectStore(STORES.EVALUATIONS, { keyPath: 'evaluationId' });
            evaluationStore.createIndex('byInputAndUrl', ['inputId', 'url'], { unique: false });
            evaluationStore.createIndex('byTabId', 'tabId', { unique: false });
            debug('Created evaluations store');
        }
        
        if (!db.objectStoreNames.contains(STORES.INTENTS)) {
            const intentStore = db.createObjectStore(STORES.INTENTS, { keyPath: 'intentId' });
            intentStore.createIndex('byEvaluationId', 'evaluationId', { unique: false });
            intentStore.createIndex('byTabAndUrl', ['tabId', 'url'], { unique: false });
            debug('Created intents store');
        }
    };
    
    request.onsuccess = function(event) {
        db = event.target.result;
        debug('Database opened successfully');
    };
}

// Check if already guarding
async function checkGuardingState() {
    try {
        const data = await chrome.storage.local.get([
            'is_guarding', 
            'activity_description', 
            'guard_start_time', 
            'monitoring_duration',
            'current_input_id'
        ]);
        
        if (data.is_guarding) {
            // Check if the guarding duration has expired
            const startTime = data.guard_start_time;
            const duration = data.monitoring_duration || 120; // Default 120 minutes
            const currentTime = Date.now();
            const durationMs = parseInt(duration) * 60 * 1000;
            
            if (currentTime - startTime > durationMs) {
                // Guarding has expired
                debug('Guarding duration expired, stopping guard');
                await chrome.storage.local.set({ 'is_guarding': false });
                isGuarding = false;
            } else {
                // Guarding is still active
                debug('Restoring guarding state');
                isGuarding = true;
                currentActivity = data.activity_description || '';
                
                // First try to get inputId from chrome.storage
                if (data.current_input_id) {
                    currentInputId = data.current_input_id;
                    debug(`Restored inputId from storage: ${currentInputId}`);
                } else {
                    // If not available in storage, try to get from IndexedDB
                    const latestInput = await getLatestUserInput();
                    if (latestInput) {
                        currentInputId = latestInput.inputId;
                        debug(`Restored inputId from IndexedDB: ${currentInputId}`);
                    } else {
                        debug('No inputId found, guarding may not work properly');
                    }
                }
            }
        }
    } catch (error) {
        debug(`Error checking guarding state: ${error.message}`);
    }
}

// Handle start guarding action
async function handleStartGuarding(data, sendResponse) {
    try {
        debug(`Starting guarding with activity: ${data.activity}`);
        isGuarding = true;
        currentActivity = data.activity;
        
        // Generate a new inputId
        currentInputId = generateUniqueId();
        
        // Save inputId to chrome.storage to persist across sessions
        await chrome.storage.local.set({ 'current_input_id': currentInputId });
        debug(`Saved inputId to storage: ${currentInputId}`);
        
        // Save user input to IndexedDB
        await saveUserInput({
            inputId: currentInputId,
            timestamp: Date.now(),
            monitoringDuration: data.duration,
            activityDescription: data.activity
        });
        
        sendResponse({ success: true });
    } catch (error) {
        debug(`Error starting guarding: ${error.message}`);
        sendResponse({ success: false, error: error.message });
    }
}

// Handle stop guarding action
function handleStopGuarding(sendResponse) {
    debug('Stopping guarding');
    isGuarding = false;
    currentActivity = '';
    currentInputId = null;
    
    // Clear any pending evaluations
    pendingEvaluations.clear();
    
    // Clear any timers
    for (const [tabId, timer] of evaluationDelayTimers.entries()) {
        clearTimeout(timer);
    }
    evaluationDelayTimers.clear();
    
    sendResponse({ success: true });
}

// Schedule page evaluation with a delay
function schedulePageEvaluation(tabId, url) {
    debug(`Scheduling evaluation for tab ${tabId} with a 15-second delay`);
    
    // Clear any existing timer for this tab
    if (evaluationDelayTimers.has(tabId)) {
        clearTimeout(evaluationDelayTimers.get(tabId));
    }
    
    // Set a new timer
    const timerId = setTimeout(() => {
        evaluationDelayTimers.delete(tabId);
        handleEvaluatePage(tabId, url);
    }, 15000); // 15-second delay
    
    evaluationDelayTimers.set(tabId, timerId);
}

// Handle evaluate page action
async function handleEvaluatePage(tabId, url, sendResponse) {
    try {
        debug(`Evaluating page for tab ${tabId}, url: ${url}, inputId: ${currentInputId}, isGuarding: ${isGuarding}`);
        
        if (!isGuarding || !currentInputId) {
            debug(`Not guarding or no current inputId, skipping evaluation`);
            if (sendResponse) sendResponse({ success: false, error: 'Not guarding or no active session' });
            return;
        }
        
        // Skip chrome:// URLs
        if (url.startsWith('chrome://')) {
            debug('Skipping chrome:// URL');
            if (sendResponse) sendResponse({ success: false, error: 'Chrome URLs cannot be evaluated' });
            return;
        }
        
        // Check if already evaluated recently
        const existingEval = await getEvaluation(tabId, url);
        if (existingEval && (Date.now() - existingEval.timestamp) < (5 * 60 * 1000)) {
            debug(`Recent evaluation exists, reusing: ${JSON.stringify(existingEval)}`);
            
            // If non-relevant, apply mask
            if (existingEval.classification === 'non-relevant') {
                applyMaskToTab(tabId);
            }
            
            if (sendResponse) sendResponse({ success: true, data: existingEval });
            return;
        }
        
        // If we're already evaluating this tab/url, add to pending queue
        const pendingKey = `${tabId}-${url}`;
        if (pendingEvaluations.has(pendingKey)) {
            debug(`Evaluation already in progress for ${pendingKey}, adding to queue`);
            if (sendResponse) {
                pendingEvaluations.get(pendingKey).push(sendResponse);
            }
            return;
        }
        
        // Start new evaluation
        pendingEvaluations.set(pendingKey, sendResponse ? [sendResponse] : []);
        
        // Get page content from content script
        let pageContent;
        try {
            pageContent = await getContentFromTab(tabId);
        } catch (error) {
            debug(`Error getting page content: ${error.message}`);
            pageContent = { title: '', url, content: '' };
        }
        
        // Get the current activity from storage
        const apiKey = await getApiKey();
        const result = await classifyPage(apiKey, currentActivity, pageContent);
        
        // Save evaluation to IndexedDB
        const evaluationId = generateUniqueId();
        const evaluationData = {
            evaluationId,
            inputId: currentInputId,
            tabId,
            url,
            category: result.category,
            classification: result.classification,
            timestamp: Date.now()
        };
        
        await saveEvaluation(evaluationData);
        debug(`Saved evaluation: ${JSON.stringify(evaluationData)}`);
        
        // If classified as non-relevant, apply mask
        if (result.classification === 'non-relevant') {
            applyMaskToTab(tabId);
        }
        
        // If classified as relevant, automatically set intent to 'work'
        if (result.classification === 'relevant') {
            const intentData = {
                intentId: generateUniqueId(),
                evaluationId,
                tabId,
                inputId: currentInputId,
                url,
                category: result.category,
                classification: result.classification,
                intent: 'work',
                timestamp: Date.now()
            };
            
            await saveIntent(intentData);
        }
        
        // Respond to all pending requests
        const callbacks = pendingEvaluations.get(pendingKey) || [];
        callbacks.forEach(callback => {
            if (typeof callback === 'function') {
                callback({ success: true, data: evaluationData });
            }
        });
        
        // Clear pending evaluations
        pendingEvaluations.delete(pendingKey);
        
    } catch (error) {
        debug(`Error evaluating page: ${error.message}`);
        
        // Respond to all pending requests with error
        const pendingKey = `${tabId}-${url}`;
        const callbacks = pendingEvaluations.get(pendingKey) || [];
        callbacks.forEach(callback => {
            if (typeof callback === 'function') {
                callback({ success: false, error: error.message });
            }
        });
        
        // Clear pending evaluations
        pendingEvaluations.delete(pendingKey);
        
        if (sendResponse) sendResponse({ success: false, error: error.message });
    }
}

// Handle get page classification action
async function handleGetPageClassification(tabId, url, sendResponse) {
    try {
        debug(`Getting classification for tab ${tabId}, url: ${url}`);
        const evaluation = await getEvaluation(tabId, url);
        
        if (evaluation) {
            debug(`Found evaluation: ${JSON.stringify(evaluation)}`);
            sendResponse({ success: true, data: evaluation });
        } else {
            debug('No evaluation found');
            sendResponse({ success: false, error: 'No evaluation found' });
        }
    } catch (error) {
        debug(`Error getting page classification: ${error.message}`);
        sendResponse({ success: false, error: error.message });
    }
}

// Handle get page intent action
async function handleGetPageIntent(tabId, url, sendResponse) {
    try {
        debug(`Getting intent for tab ${tabId}, url: ${url}`);
        const intent = await getIntent(tabId, url);
        
        if (intent) {
            debug(`Found intent: ${JSON.stringify(intent)}`);
            sendResponse({ success: true, data: intent });
        } else {
            debug('No intent found');
            sendResponse({ success: false, error: 'No intent found' });
        }
    } catch (error) {
        debug(`Error getting page intent: ${error.message}`);
        sendResponse({ success: false, error: error.message });
    }
}

// Handle set page intent action
async function handleSetPageIntent(tabId, url, intent, sendResponse) {
    try {
        debug(`Setting intent for tab ${tabId}, url: ${url} to ${intent}`);
        
        // Find the evaluation for this tab/url
        const evaluation = await getEvaluation(tabId, url);
        
        if (!evaluation) {
            throw new Error('No evaluation found for this page');
        }
        
        // Check if intent already exists
        const existingIntent = await getIntent(tabId, url);
        
        if (existingIntent) {
            // Update existing intent
            existingIntent.intent = intent;
            existingIntent.timestamp = Date.now();
            
            await updateIntent(existingIntent);
            debug(`Updated intent: ${JSON.stringify(existingIntent)}`);
            
            sendResponse({ success: true, data: existingIntent });
        } else {
            // Create new intent
            const intentData = {
                intentId: generateUniqueId(),
                evaluationId: evaluation.evaluationId,
                tabId,
                inputId: currentInputId,
                url,
                category: evaluation.category,
                classification: evaluation.classification,
                intent,
                timestamp: Date.now()
            };
            
            await saveIntent(intentData);
            debug(`Saved new intent: ${JSON.stringify(intentData)}`);
            
            sendResponse({ success: true, data: intentData });
        }
    } catch (error) {
        debug(`Error setting page intent: ${error.message}`);
        sendResponse({ success: false, error: error.message });
    }
}

// Apply mask to tab with retries
function applyMaskToTab(tabId) {
    debug(`Applying mask to tab ${tabId}`);
    
    // First check if the content script is ready
    checkContentScriptStatus(tabId)
        .then(isReady => {
            if (isReady) {
                return sendMaskMessage(tabId);
            } else {
                // If content script is not ready, inject it manually
                debug('Content script not ready, injecting scripts');
                return injectContentScriptsAndMask(tabId);
            }
        })
        .catch(error => {
            debug(`Error applying mask: ${error.message}`);
            // Try injecting scripts and applying mask as fallback
            injectContentScriptsAndMask(tabId);
        });
}

// Check if content script is ready
function checkContentScriptStatus(tabId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: 'checkContentScriptStatus' })
            .then(response => {
                if (response && response.success) {
                    debug(`Content script status for tab ${tabId}: ${response.ready}`);
                    resolve(response.ready);
                } else {
                    debug(`No valid response from content script in tab ${tabId}`);
                    resolve(false);
                }
            })
            .catch(error => {
                debug(`Error checking content script status: ${error.message}`);
                resolve(false);
            });
    });
}

// Send showMask message to content script
function sendMaskMessage(tabId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: 'showMask' })
            .then(response => {
                if (response && response.success) {
                    debug('Mask applied successfully');
                    resolve(true);
                } else {
                    debug('Failed to apply mask, response indicates failure');
                    resolve(false);
                }
            })
            .catch(error => {
                debug(`Error sending mask message: ${error.message}`);
                reject(error);
            });
    });
}

// Inject content scripts and apply mask
function injectContentScriptsAndMask(tabId) {
    return new Promise((resolve, reject) => {
        // First try to execute the content script
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['js/content.js']
        })
        .then(() => {
            debug('Content script injected, now injecting CSS');
            // Then inject the CSS
            return chrome.scripting.insertCSS({
                target: { tabId: tabId },
                files: ['css/content.css']
            });
        })
        .then(() => {
            debug('CSS injected, waiting for content script to initialize');
            // Wait a bit for the script to initialize
            setTimeout(() => {
                sendMaskMessage(tabId)
                    .then(result => resolve(result))
                    .catch(error => reject(error));
            }, 500);
        })
        .catch(error => {
            debug(`Error injecting content scripts: ${error.message}`);
            reject(error);
        });
    });
}

// Get content from tab
async function getContentFromTab(tabId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: 'getPageContent' })
            .then(response => {
                if (response && response.success) {
                    resolve(response.content);
                } else {
                    reject(new Error('Failed to get page content'));
                }
            })
            .catch(error => {
                reject(error);
            });
    });
}

// Classify page using Gemini API
async function classifyPage(apiKey, activity, pageContent) {
    debug('####Classifying page using Gemini API####');
    
    // Define all possible categories
    const categories = [
        'E-commerce', 'News', 'Social Media', 'Educational', 'Entertainment', 
        'Health and Fitness', 'Finance and Investment', 'Travel and Tourism', 
        'Technology and Gadgets', 'Lifestyle and Fashion', 'Food and Recipes', 
        'Automotive', 'Real Estate', 'Gaming', 'Music and Arts', 'Bank', 
        'Learning platforms', 'College or University', 'Search Engines', 
        'Chatbots and AI Assistants', 'Online Calculators and Converters', 
        'Weather Forecast Sites', 'Maps and Navigation', 'Forums and Communities', 
        'Webmail Services', 'Project Management Tools', 'Video Conferencing Platforms', 
        'CRM Software Websites', 'Marketing Automation Platforms', 
        'ERP/Business Management Sites', 'Job Portals', 'Freelancing Platforms', 
        'Legal Services', 'Event Booking Platforms', 'Conferences and Webinars', 
        'Wikis and Encyclopedias', 'Review Aggregators', 'Scientific Research Platforms', 
        'API Marketplaces', 'Software Documentation Sites', 'Online Marketplaces', 
        'B2B Portals', 'Government Websites', 'Charity and Fundraising Sites', 
        'Dating Websites', 'Parenting and Kids Sites', 'Pet Care and Adoption Sites', 
        'AI-generated Content Platforms', 'Blockchain and Crypto Websites', 
        'Virtual Reality and Metaverse Platforms'
    ].join(', ');
    
    // Construct prompt
    const prompt = `As a user I am working on given activity. I have provided a short description of the activity. As part of this activity I am visiting a website. You need to determine if the content of the website is relevant to my activity or not.
Classify website content as 'relevant' and 'non-relevant' with identified category. Here is example json output:
example-1: {'category': 'News', 'classification' : 'non-relevant'}
example-2: {'category': 'Bank', 'classification' : 'relevant'}

website belonging to following categories should always be considered as relevant always: Educational, Learning platforms, College or University, Scientific Research Platforms, Wikis and Encyclopedias, Project Management Tools, Software Documentation Sites, AI-generated Content Platforms, Bank, Finance and Investment, Government Websites.

Possible categories: ${categories}

User Activity description: ${activity}

Website content: 
Title: ${pageContent.title}
URL: ${pageContent.url}
${pageContent.content}`;

    try {
        debug('Sending request to Gemini API');
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ]
            })
        });
        
        const data = await response.json();
        if (!response.ok) {
            debug(`API error: ${JSON.stringify(data)}`);
            throw new Error(`API error: ${data.error?.message || 'Unknown error'}`);
        }
        
        // Extract classification result
        const generatedText = data.candidates[0]?.content?.parts[0]?.text || '';
        debug(`Generated text: ${generatedText}`);
        
        // Parse the JSON response from LLM
        const matches = generatedText.match(/\{[\s\S]*?\}/);
        if (!matches) {
            throw new Error('Could not parse classification result');
        }
        
        // Try to parse the JSON response
        const jsonResponse = JSON.parse(matches[0].replace(/'/g, '"'));
        
        // Apply rule for always relevant categories
        if (ALWAYS_RELEVANT_CATEGORIES.includes(jsonResponse.category)) {
            jsonResponse.classification = 'relevant';
        }
        
        debug(`Classification result: ${JSON.stringify(jsonResponse)}`);
        return jsonResponse;
        
    } catch (error) {
        debug(`Error classifying page: ${error.message}`);
        
        // If we failed to get a classification, make a best guess based on URL
        const url = pageContent.url.toLowerCase();
        let category = 'Unknown';
        let classification = 'non-relevant';
        
        // Simple URL-based classification fallback
        if (url.includes('edu') || url.includes('learn') || url.includes('course')) {
            category = 'Educational';
            classification = 'relevant';
        } else if (url.includes('github') || url.includes('stackoverflow') || url.includes('docs.')) {
            category = 'Software Documentation Sites';
            classification = 'relevant';
        } else if (url.includes('bank') || url.includes('finance')) {
            category = 'Finance and Investment';
            classification = 'relevant';
        } else if (url.includes('gov') || url.includes('government')) {
            category = 'Government Websites';
            classification = 'relevant';
        } else if (url.includes('facebook') || url.includes('twitter') || url.includes('instagram')) {
            category = 'Social Media';
        } else if (url.includes('youtube') || url.includes('netflix') || url.includes('hulu')) {
            category = 'Entertainment';
        } else if (url.includes('amazon') || url.includes('ebay') || url.includes('shop')) {
            category = 'E-commerce';
        } else if (url.includes('news') || url.includes('cnn') || url.includes('bbc')) {
            category = 'News';
        }
        
        debug(`Fallback classification: ${category}/${classification}`);
        return { category, classification };
    }
}

// Save user input to IndexedDB
function saveUserInput(inputData) {
    return new Promise((resolve, reject) => {
        if (!db) {
            return reject(new Error('Database not initialized'));
        }
        
        try {
            const transaction = db.transaction([STORES.USER_INPUTS], 'readwrite');
            const store = transaction.objectStore(STORES.USER_INPUTS);
            const request = store.add(inputData);
            
            request.onsuccess = () => {
                debug(`User input saved with ID: ${inputData.inputId}`);
                resolve(inputData);
            };
            
            request.onerror = (event) => {
                reject(new Error(`Error saving user input: ${event.target.error}`));
            };
        } catch (error) {
            reject(error);
        }
    });
}

// Save evaluation to IndexedDB
function saveEvaluation(evaluationData) {
    return new Promise((resolve, reject) => {
        if (!db) {
            return reject(new Error('Database not initialized'));
        }
        
        try {
            const transaction = db.transaction([STORES.EVALUATIONS], 'readwrite');
            const store = transaction.objectStore(STORES.EVALUATIONS);
            const request = store.add(evaluationData);
            
            request.onsuccess = () => {
                debug(`Evaluation saved with ID: ${evaluationData.evaluationId}`);
                resolve(evaluationData);
            };
            
            request.onerror = (event) => {
                reject(new Error(`Error saving evaluation: ${event.target.error}`));
            };
        } catch (error) {
            reject(error);
        }
    });
}

// Save intent to IndexedDB
function saveIntent(intentData) {
    return new Promise((resolve, reject) => {
        if (!db) {
            return reject(new Error('Database not initialized'));
        }
        
        try {
            const transaction = db.transaction([STORES.INTENTS], 'readwrite');
            const store = transaction.objectStore(STORES.INTENTS);
            const request = store.add(intentData);
            
            request.onsuccess = () => {
                debug(`Intent saved with ID: ${intentData.intentId}`);
                resolve(intentData);
            };
            
            request.onerror = (event) => {
                reject(new Error(`Error saving intent: ${event.target.error}`));
            };
        } catch (error) {
            reject(error);
        }
    });
}

// Update intent in IndexedDB
function updateIntent(intentData) {
    return new Promise((resolve, reject) => {
        if (!db) {
            return reject(new Error('Database not initialized'));
        }
        
        try {
            const transaction = db.transaction([STORES.INTENTS], 'readwrite');
            const store = transaction.objectStore(STORES.INTENTS);
            const request = store.put(intentData);
            
            request.onsuccess = () => {
                debug(`Intent updated with ID: ${intentData.intentId}`);
                resolve(intentData);
            };
            
            request.onerror = (event) => {
                reject(new Error(`Error updating intent: ${event.target.error}`));
            };
        } catch (error) {
            reject(error);
        }
    });
}

// Get evaluation from IndexedDB
function getEvaluation(tabId, url) {
    return new Promise((resolve, reject) => {
        if (!db || !currentInputId) {
            return resolve(null);
        }
        
        try {
            const transaction = db.transaction([STORES.EVALUATIONS], 'readonly');
            const store = transaction.objectStore(STORES.EVALUATIONS);
            const index = store.index('byInputAndUrl');
            const request = index.getAll([currentInputId, url]);
            
            request.onsuccess = () => {
                const evaluations = request.result;
                if (evaluations && evaluations.length > 0) {
                    // Return the most recent evaluation
                    const sortedEvaluations = evaluations.sort((a, b) => b.timestamp - a.timestamp);
                    resolve(sortedEvaluations[0]);
                } else {
                    resolve(null);
                }
            };
            
            request.onerror = (event) => {
                reject(new Error(`Error getting evaluation: ${event.target.error}`));
            };
        } catch (error) {
            reject(error);
        }
    });
}

// Get intent from IndexedDB
function getIntent(tabId, url) {
    return new Promise((resolve, reject) => {
        if (!db || !currentInputId) {
            return resolve(null);
        }
        
        try {
            const transaction = db.transaction([STORES.INTENTS], 'readonly');
            const store = transaction.objectStore(STORES.INTENTS);
            const index = store.index('byTabAndUrl');
            const request = index.getAll([tabId, url]);
            
            request.onsuccess = () => {
                const intents = request.result;
                if (intents && intents.length > 0) {
                    // Return the most recent intent
                    const sortedIntents = intents.sort((a, b) => b.timestamp - a.timestamp);
                    resolve(sortedIntents[0]);
                } else {
                    resolve(null);
                }
            };
            
            request.onerror = (event) => {
                reject(new Error(`Error getting intent: ${event.target.error}`));
            };
        } catch (error) {
            reject(error);
        }
    });
}

// Get latest user input from IndexedDB
function getLatestUserInput() {
    return new Promise((resolve, reject) => {
        if (!db) {
            return resolve(null);
        }
        
        try {
            const transaction = db.transaction([STORES.USER_INPUTS], 'readonly');
            const store = transaction.objectStore(STORES.USER_INPUTS);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const inputs = request.result;
                if (inputs && inputs.length > 0) {
                    // Return the most recent input
                    const sortedInputs = inputs.sort((a, b) => b.timestamp - a.timestamp);
                    resolve(sortedInputs[0]);
                } else {
                    resolve(null);
                }
            };
            
            request.onerror = (event) => {
                reject(new Error(`Error getting user inputs: ${event.target.error}`));
            };
        } catch (error) {
            reject(error);
        }
    });
}

// Get API key from storage
async function getApiKey() {
    try {
        const data = await chrome.storage.local.get('gemini_api_key');
        const apiKey = data.gemini_api_key;
        
        if (!apiKey) {
            // Use default API key if not set
            return 'AIzaSyDK-YKOAcFCc4C1b0i2YHGZmaDlhHgeFVU';
        }
        
        return apiKey;
    } catch (error) {
        debug(`Error getting API key: ${error.message}`);
        return 'AIzaSyDK-YKOAcFCc4C1b0i2YHGZmaDlhHgeFVU';
    }
}

// Helper function to generate unique IDs
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Handle generate report action
async function handleGenerateReport(sendResponse) {
    try {
        debug('Handling generate report request');
        // Simply respond with success - the popup will handle the actual report generation
        sendResponse({ success: true });
    } catch (error) {
        debug(`Error in handleGenerateReport: ${error.message}`);
        sendResponse({ success: false, error: error.message });
    }
}

