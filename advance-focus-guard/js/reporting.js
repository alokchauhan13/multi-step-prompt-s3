// Debug logging function
const reportDebug = (message) => {
    console.log(`[Advance Focus Guard - Reporting] ${message}`);
};

// Database constants
const REPORT_DB_NAME = 'AdvanceFocusGuardDB';
const REPORT_STORES = {
    USER_INPUTS: 'userInputs',
    EVALUATIONS: 'evaluations',
    INTENTS: 'intents'
};

// Event listener for Generate Report button
document.getElementById('generate-report-button').addEventListener('click', function() {
    generateReport();
});

// Main function to generate the report
async function generateReport() {
    try {
        reportDebug('Starting report generation');
        showReportStatusMessage('Retrieving data from database...');
        
        // Open database connection
        const db = await openReportDatabase();
        if (!db) {
            throw new Error('Could not connect to database');
        }
        
        // Collect data from IndexedDB
        const userData = await getLatestUserInput(db);
        const evaluationData = await getAllEvaluations(db);
        const intentData = await getAllIntents(db);
        
        reportDebug(`Retrieved ${evaluationData.length} evaluations and ${intentData.length} intents`);
        
        if (evaluationData.length === 0) {
            showReportStatusMessage('No browsing data available for report generation', true);
            return;
        }
        
        // Prepare data for report
        const reportData = {
            userData,
            evaluations: evaluationData,
            intents: intentData,
            summary: {
                totalSites: evaluationData.length,
                relevantSites: evaluationData.filter(e => e.classification === 'relevant').length,
                nonRelevantSites: evaluationData.filter(e => e.classification === 'non-relevant').length
            }
        };
        
        // Get API key for Gemini API calls
        const apiKey = await getReportApiKey();
        if (!apiKey) {
            showReportStatusMessage('No API key available for report generation', true);
            return;
        }
        
        // Generate HTML report
        showReportStatusMessage('Generating report...');
        const reportHtml = await generateReportHtml(apiKey, reportData);
        
        // Open report in new tab
        openReportInNewTab(reportHtml);
        
        showReportStatusMessage('Report generated successfully!');
    } catch (error) {
        reportDebug(`Error generating report: ${error.message}`);
        showReportStatusMessage(`Error generating report: ${error.message}`, true);
    }
}

// Connect to the IndexedDB database
function openReportDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(REPORT_DB_NAME);
        
        request.onerror = (event) => {
            reportDebug(`Database error: ${event.target.errorCode}`);
            reject(new Error('Could not open database'));
        };
        
        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
    });
}

// Get the latest user input data
function getLatestUserInput(db) {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([REPORT_STORES.USER_INPUTS], 'readonly');
            const store = transaction.objectStore(REPORT_STORES.USER_INPUTS);
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

// Get all evaluation records
function getAllEvaluations(db) {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([REPORT_STORES.EVALUATIONS], 'readonly');
            const store = transaction.objectStore(REPORT_STORES.EVALUATIONS);
            const request = store.getAll();
            
            request.onsuccess = () => {
                resolve(request.result || []);
            };
            
            request.onerror = (event) => {
                reject(new Error(`Error getting evaluations: ${event.target.error}`));
            };
        } catch (error) {
            reject(error);
        }
    });
}

// Get all intent records
function getAllIntents(db) {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([REPORT_STORES.INTENTS], 'readonly');
            const store = transaction.objectStore(REPORT_STORES.INTENTS);
            const request = store.getAll();
            
            request.onsuccess = () => {
                resolve(request.result || []);
            };
            
            request.onerror = (event) => {
                reject(new Error(`Error getting intents: ${event.target.error}`));
            };
        } catch (error) {
            reject(error);
        }
    });
}

// Get API key from storage
async function getReportApiKey() {
    try {
        const data = await chrome.storage.local.get('gemini_api_key');
        const apiKey = data.gemini_api_key;
        
        if (!apiKey) {
            // Use default API key if not set
            return 'AIzaSyDK-YKOAcFCc4C1b0i2YHGZmaDlhHgeFVU';
        }
        
        return apiKey;
    } catch (error) {
        reportDebug(`Error getting API key: ${error.message}`);
        return 'AIzaSyDK-YKOAcFCc4C1b0i2YHGZmaDlhHgeFVU';
    }
}

// Generate the HTML report content
async function generateReportHtml(apiKey, reportData) {
    try {
        // Prepare data for visualizations
        const timeSpentByIntent = processTimeSpentByIntent(reportData.intents, reportData.evaluations);
        const productivityRatios = processProductivityRatios(reportData.intents);        
        
        // Get insights from Gemini API
        const insightsPromises = [
            getTimeSpentInsights(apiKey, timeSpentByIntent),
            getProductivityInsights(apiKey, productivityRatios)
        ];
        
        const [timeInsights, productivityInsights] = await Promise.all(insightsPromises);
        
        // Build HTML template
        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Advance Focus Guard Report</title>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    margin: 0;
                    padding: 20px;
                    background-color: #f5f5f7;
                    color: #333;
                    line-height: 1.6;
                }
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #fff;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                }
                header {
                    text-align: center;
                    margin-bottom: 30px;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 20px;
                }
                .logo {
                    width: 80px;
                    height: 80px;
                    object-fit: cover;
                    border-radius: 10px;
                    margin-bottom: 10px;
                }
                h1 {
                    font-size: 24px;
                    color: #1a1a1a;
                    margin-bottom: 5px;
                }
                .tagline {
                    font-size: 14px;
                    color: #666;
                    font-style: italic;
                }
                .summary {
                    background-color: #f9f9f9;
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }
                .summary-title {
                    font-size: 18px;
                    font-weight: 500;
                    margin-bottom: 10px;
                }
                .summary-stats {
                    display: flex;
                    justify-content: space-around;
                    text-align: center;
                }
                .stat-item {
                    flex: 1;
                }
                .stat-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: #0066cc;
                }
                .stat-label {
                    font-size: 14px;
                    color: #666;
                }
                .report-section {
                    margin-bottom: 30px;
                    padding: 20px;
                    border: 1px solid #eee;
                    border-radius: 8px;
                }
                .section-title {
                    font-size: 20px;
                    color: #333;
                    margin-bottom: 15px;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 10px;
                }
                .chart-container {
                    position: relative;
                    height: 300px;
                    margin-bottom: 20px;
                }
                .insights {
                    background-color: #f0f7ff;
                    padding: 15px;
                    border-left: 4px solid #0066cc;
                    margin-top: 15px;
                }
                .insights-title {
                    font-weight: 500;
                    margin-bottom: 10px;
                    color: #0055aa;
                }
                .table-container {
                    overflow-x: auto;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 15px 0;
                }
                th, td {
                    padding: 12px 15px;
                    text-align: left;
                    border-bottom: 1px solid #ddd;
                }
                th {
                    background-color: #f2f2f2;
                    font-weight: 500;
                }
                tr:hover {
                    background-color: #f9f9f9;
                }
                .intent-tag {
                    display: inline-block;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 500;
                }
                .work {
                    background-color: #e8f5e9;
                    color: #2e7d32;
                }
                .relaxation {
                    background-color: #e3f2fd;
                    color: #1565c0;
                }
                .curiosity {
                    background-color: #fff8e1;
                    color: #f57f17;
                }
                .habit {
                    background-color: #fce4ec;
                    color: #c2185b;
                }
                .footer {
                    text-align: center;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #eee;
                    color: #666;
                    font-size: 12px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <header>
                    <img src="../images/Advance-Focus-Guard.jpeg" alt="Advance Focus Guard" class="logo">
                    <h1>Advance Focus Guard Report</h1>
                    <p class="tagline">Your Ally in Focused Work</p>
                </header>
                
                <div class="summary">
                    <h2 class="summary-title">Overview Summary</h2>
                    <div class="summary-stats">
                        <div class="stat-item">
                            <div class="stat-value">${reportData.summary.totalSites}</div>
                            <div class="stat-label">Total Sites Visited</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${reportData.summary.relevantSites}</div>
                            <div class="stat-label">Work-Related Sites</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${reportData.summary.nonRelevantSites}</div>
                            <div class="stat-label">Non-Work Sites</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${Math.round((reportData.summary.relevantSites / reportData.summary.totalSites) * 100)}%</div>
                            <div class="stat-label">Work Focus Ratio</div>
                        </div>
                    </div>
                </div>
                
                <div class="report-section">
                    <h2 class="section-title">Time Spent by Intent Over Time</h2>
                    <div class="chart-container">
                        <canvas id="timeSpentChart"></canvas>
                    </div>
                    <div class="insights">
                        <h3 class="insights-title">Key Insights</h3>
                        <div id="timeInsights">${timeInsights}</div>
                    </div>
                </div>
                
                <div class="report-section">
                    <h2 class="section-title">Productivity Ratios</h2>
                    <div class="chart-container">
                        <canvas id="productivityChart"></canvas>
                    </div>
                    <div class="insights">
                        <h3 class="insights-title">Key Insights</h3>
                        <div id="productivityInsights">${productivityInsights}</div>
                    </div>
                </div>
                
                <div class="footer">
                    <p>Generated by Advance Focus Guard on ${new Date().toLocaleString()}</p>
                </div>
            </div>
            
            <script>
                // Load chart data
                document.addEventListener('DOMContentLoaded', function() {
                    // Time Spent Chart
                    const timeSpentCtx = document.getElementById('timeSpentChart').getContext('2d');
                    const timeSpentData = ${JSON.stringify(timeSpentByIntent.chartData)};
                    new Chart(timeSpentCtx, {
                        type: 'bar',
                        data: {
                            labels: timeSpentData.labels,
                            datasets: timeSpentData.datasets
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                x: {
                                    stacked: true,
                                    title: {
                                        display: true,
                                        text: 'Time of Day'
                                    }
                                },
                                y: {
                                    stacked: true,
                                    title: {
                                        display: true,
                                        text: 'Number of Visits'
                                    }
                                }
                            },
                            plugins: {
                                legend: {
                                    display: true,
                                    position: 'top'
                                },
                                title: {
                                    display: true,
                                    text: 'Intent Distribution by Time of Day'
                                }
                            }
                        }
                    });
                    
                    // Productivity Chart
                    const productivityCtx = document.getElementById('productivityChart').getContext('2d');
                    const productivityData = ${JSON.stringify(productivityRatios.chartData)};
                    new Chart(productivityCtx, {
                        type: 'line',
                        data: {
                            labels: productivityData.labels,
                            datasets: productivityData.datasets
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                y: {
                                    min: 0,
                                    max: 100,
                                    title: {
                                        display: true,
                                        text: 'Productivity Percentage'
                                    }
                                }
                            },
                            plugins: {
                                legend: {
                                    display: true,
                                    position: 'top'
                                },
                                title: {
                                    display: true,
                                    text: 'Daily Productivity Ratio (Work vs Non-Work)'
                                }
                            }
                        }
                    });
                });
            </script>
        </body>
        </html>
        `;
        
        return html;
    } catch (error) {
        reportDebug(`Error generating HTML report: ${error.message}`);
        throw error;
    }
}

// Process data for Time Spent by Intent visualization
function processTimeSpentByIntent(intents, evaluations) {
    const timeBlocks = ['Morning (6am-12pm)', 'Afternoon (12pm-5pm)', 'Evening (5pm-9pm)', 'Night (9pm-6am)'];
    
    // Initialize data structure
    const intentsByTime = {
        work: [0, 0, 0, 0],
        relaxation: [0, 0, 0, 0],
        curiosity: [0, 0, 0, 0],
        habit: [0, 0, 0, 0]
    };
    
    // Process each intent entry
    intents.forEach(intent => {
        const date = new Date(intent.timestamp);
        const hour = date.getHours();
        
        // Determine time block
        let timeBlockIndex;
        if (hour >= 6 && hour < 12) {
            timeBlockIndex = 0; // Morning
        } else if (hour >= 12 && hour < 17) {
            timeBlockIndex = 1; // Afternoon
        } else if (hour >= 17 && hour < 21) {
            timeBlockIndex = 2; // Evening
        } else {
            timeBlockIndex = 3; // Night
        }
        
        // Increment count for this intent and time block
        if (intent.intent && intentsByTime[intent.intent]) {
            intentsByTime[intent.intent][timeBlockIndex]++;
        }
    });
    
    // Prepare chart data
    const chartData = {
        labels: timeBlocks,
        datasets: [
            {
                label: 'Work',
                data: intentsByTime.work,
                backgroundColor: '#4caf50',
                stack: 'Stack 0'
            },
            {
                label: 'Relaxation',
                data: intentsByTime.relaxation,
                backgroundColor: '#2196f3',
                stack: 'Stack 0'
            },
            {
                label: 'Curiosity',
                data: intentsByTime.curiosity,
                backgroundColor: '#ff9800',
                stack: 'Stack 0'
            },
            {
                label: 'Habit',
                data: intentsByTime.habit,
                backgroundColor: '#e91e63',
                stack: 'Stack 0'
            }
        ]
    };
    
    // Calculate predominant intents by time block
    const predominantByTime = timeBlocks.map((timeBlock, index) => {
        const intentCounts = [
            { intent: 'work', count: intentsByTime.work[index] },
            { intent: 'relaxation', count: intentsByTime.relaxation[index] },
            { intent: 'curiosity', count: intentsByTime.curiosity[index] },
            { intent: 'habit', count: intentsByTime.habit[index] }
        ];
        
        intentCounts.sort((a, b) => b.count - a.count);
        
        return {
            timeBlock,
            predominant: intentCounts[0].intent,
            count: intentCounts[0].count,
            total: intentCounts.reduce((sum, item) => sum + item.count, 0)
        };
    });
    
    return {
        chartData,
        intentsByTime,
        predominantByTime,
        timeBlocks
    };
}

// Process data for Productivity Ratios visualization
function processProductivityRatios(intents) {
    // Group intents by date (only considering 8am-7pm)
    const dateGroups = {};
    
    intents.forEach(intent => {
        const date = new Date(intent.timestamp);
        const hour = date.getHours();
        
        // Only consider work hours (8am-7pm)
        if (hour >= 8 && hour <= 19) {
            const dateStr = date.toISOString().split('T')[0];
            
            if (!dateGroups[dateStr]) {
                dateGroups[dateStr] = { work: 0, nonWork: 0 };
            }
            
            if (intent.intent === 'work') {
                dateGroups[dateStr].work++;
            } else {
                dateGroups[dateStr].nonWork++;
            }
        }
    });
    
    // Calculate productivity ratios
    const productivityData = [];
    for (const [date, counts] of Object.entries(dateGroups)) {
        const total = counts.work + counts.nonWork;
        const productivityRatio = total > 0 ? (counts.work / total) * 100 : 0;
        
        productivityData.push({
            date,
            work: counts.work,
            nonWork: counts.nonWork,
            total,
            productivityRatio
        });
    }
    
    // Sort by date
    productivityData.sort((a, b) => a.date.localeCompare(b.date));
    
    // Prepare chart data
    const chartData = {
        labels: productivityData.map(item => item.date),
        datasets: [
            {
                label: 'Productivity Ratio (%)',
                data: productivityData.map(item => item.productivityRatio),
                fill: false,
                borderColor: '#4caf50',
                tension: 0.1
            }
        ]
    };
    
    return {
        chartData,
        productivityData
    };
}

// Get insights from Gemini API about time spent
async function getTimeSpentInsights(apiKey, timeData) {
    try {
        const prompt = `
            Analyze this time spent data by intent and give me 2-3 key insights about user behavior patterns.
            Focus on when certain intents dominate and potential productivity impacts. Keep response concise (3-4 sentences max).
            
            Data: ${JSON.stringify(timeData.predominantByTime)}
            
            Example insight: "Most of your curiosity browsing happens late at night."
        `;
        
        const response = await fetchGeminiInsight(apiKey, prompt, 'time spent');
        return response || 'No insights available for time spent data.';
    } catch (error) {
        reportDebug(`Error getting time insights: ${error.message}`);
        return 'Unable to generate time spent insights.';
    }
}

// Get insights from Gemini API about productivity
async function getProductivityInsights(apiKey, productivityData) {
    try {
        const prompt = `
            Analyze this daily productivity ratio data and give me 2-3 key insights about productivity trends.
            Focus on patterns, improvements, or declines over time. Keep response concise (3-4 sentences max).
            
            Data: ${JSON.stringify(productivityData.productivityData)}
            
            Example insight: "Your work focus improved by 15% compared to last week."
        `;
        
        const response = await fetchGeminiInsight(apiKey, prompt, 'productivity');
        return response || 'No insights available for productivity data.';
    } catch (error) {
        reportDebug(`Error getting productivity insights: ${error.message}`);
        return 'Unable to generate productivity insights.';
    }
}

// Helper function to fetch insights from Gemini API
async function fetchGeminiInsight(apiKey, prompt, purpose) {
    try {
        reportDebug(`####Fetching Gemini insight for purpose: ${purpose} ####`);
        reportDebug(`* Prompt: ${prompt}`);

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
            reportDebug(`API error: ${JSON.stringify(data)}`);
            throw new Error(`API error: ${data.error?.message || 'Unknown error'}`);
        }
        
        return data.candidates[0]?.content?.parts[0]?.text || '';
    } catch (error) {
        reportDebug(`Error fetching Gemini insight: ${error.message}`);
        throw error;
    }
}

// Open report in a new tab
function openReportInNewTab(htmlContent) {
    // Create a blob with the HTML content
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    // Open in a new tab
    chrome.windows.create({
        url: url,
        type: 'popup',
        width: 800,
        height: 600
    });
}

// Show status message in the popup
function showReportStatusMessage(message, isError = false) {
    const statusMessage = document.getElementById('status-message');
    if (statusMessage) {
        statusMessage.textContent = message;
        statusMessage.classList.toggle('error', isError);
        statusMessage.classList.toggle('success', !isError);
        
        // Auto-hide after 5 seconds if not an error
        if (!isError) {
            setTimeout(() => {
                statusMessage.textContent = '';
                statusMessage.classList.remove('error', 'success');
            }, 5000);
        }
    }
}