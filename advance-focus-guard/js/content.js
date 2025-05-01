// Debug logging function
const debug = (message) => {
    console.log(`[Advance Focus Guard - Content] ${message}`);
};

// Track if mask is currently shown
let isMaskShown = false;

// Initialize content script
(function() {
    debug('Content script initialized');
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        debug(`Received message: ${JSON.stringify(message)}`);
        
        if (message.action === 'showMask') {
            showMask();
            sendResponse({ success: true });
            return true;
        } else if (message.action === 'hideMask') {
            hideMask();
            sendResponse({ success: true });
            return true;
        } else if (message.action === 'getPageContent') {
            const content = getPageContent();
            sendResponse({ success: true, content });
            return true;
        }
    });
})();

// Show mask overlay
function showMask() {
    if (isMaskShown) return;
    
    debug('Showing mask');
    
    // Create mask element
    const mask = document.createElement('div');
    mask.id = 'afg-mask';
    mask.className = 'afg-mask';
    
    // Create mask content
    const maskContent = document.createElement('div');
    maskContent.className = 'afg-mask-content';
    
    // Title
    const title = document.createElement('h1');
    title.className = 'afg-mask-title';
    title.textContent = 'Blocked by Advance Focus Guard';
    
    // Close button
    const closeButton = document.createElement('button');
    closeButton.className = 'afg-mask-button';
    closeButton.textContent = 'Close Mask';
    closeButton.addEventListener('click', hideMask);
    
    // Assemble mask
    maskContent.appendChild(title);
    maskContent.appendChild(closeButton);
    mask.appendChild(maskContent);
    
    // Add to body
    document.body.appendChild(mask);
    isMaskShown = true;
}

// Hide mask overlay
function hideMask() {
    if (!isMaskShown) return;
    
    debug('Hiding mask');
    
    const mask = document.getElementById('afg-mask');
    if (mask) {
        mask.parentNode.removeChild(mask);
        isMaskShown = false;
    }
}

// Get page content for evaluation
function getPageContent() {
    debug('Getting page content for evaluation');
    
    const pageInfo = {
        title: document.title || '',
        url: window.location.href,
        content: ''
    };
    
    // For YouTube, try to get video title and comments
    if (window.location.hostname.includes('youtube.com')) {
        debug('YouTube detected, getting video info');
        
        // Get video title
        const videoTitle = document.querySelector('h1.title');
        if (videoTitle) {
            pageInfo.content += `Video Title: ${videoTitle.textContent.trim()}\n\n`;
        }
        
        // Try to get comments (simple implementation)
        const comments = document.querySelectorAll('ytd-comment-renderer #content-text');
        if (comments && comments.length > 0) {
            pageInfo.content += 'Top Comments:\n';
            let commentCount = 0;
            
            for (const comment of comments) {
                if (commentCount >= 5) break; // Limit to 5 comments
                pageInfo.content += `- ${comment.textContent.trim()}\n`;
                commentCount++;
            }
        }
    } else {
        // For regular pages, get the main content
        // Choose content from main content areas or most content-dense part
        const contentElements = [
            document.querySelector('main'),
            document.querySelector('article'),
            document.querySelector('.content'),
            document.querySelector('#content'),
            document.querySelector('.main-content'),
            document.body
        ];
        
        // Use the first available content element
        let mainContent = '';
        for (const element of contentElements) {
            if (element) {
                // Get text content but avoid scripts, styles, etc.
                mainContent = extractTextContent(element);
                if (mainContent) {
                    break;
                }
            }
        }
        
        // Truncate content to avoid excessive API usage
        pageInfo.content = mainContent.trim().substring(0, 5000);
        
        // Add meta description if available
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
            pageInfo.content = `Meta Description: ${metaDescription.getAttribute('content')}\n\n${pageInfo.content}`;
        }
    }
    
    return pageInfo;
}

// Helper function to extract text content
function extractTextContent(element) {
    // Clone element to avoid modifying the page
    const clone = element.cloneNode(true);
    
    // Remove script and style elements
    const scripts = clone.querySelectorAll('script, style, noscript, iframe');
    for (const script of scripts) {
        script.parentNode.removeChild(script);
    }
    
    // Extract text from relevant elements
    const relevantElements = clone.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, td, th, span, div, a');
    let content = '';
    
    for (const el of relevantElements) {
        // Ignore if element is hidden or empty
        const style = window.getComputedStyle(el);
        const text = el.textContent.trim();
        
        if (
            text && 
            style.display !== 'none' && 
            style.visibility !== 'hidden' && 
            el.offsetHeight > 0
        ) {
            // Include element tag to give more context
            content += `${el.tagName.toLowerCase()}: ${text}\n`;
        }
    }
    
    return content;
}