# Advance Focus-Guard a Google chrome extension
It is a google chrome extension/Extension which takes user inputs about what kind of activities user is planning to do. Extension  monitor user visited pages and relates it with user activity description. Extension evaluated following details. Here is summary:

1- Classify a page if it is "relevant" or "non-relevant"
2- Store details in chrome.storage about current session 
3- Store historical data and details in chrome IndexedDB for individual page evaluation
4- Allow user to provide intent of visit for "non-relevant" pages
5- Provide a user behavior summary in separate HTML page 
6- When Extension is activated for Guarding , Extension adds a mask on "non-relevant" web pages.

Extension input, output and its behavior is provided below 

## Extension branding
1. Extension should use image present in images/Advance-Focus-Guard.jpeg
2. Extension tag line is "Advance Focus Guard - Your Ally in Focused Work"


## Extension User inputs
User input is provided in two phases:

**Phase-1: When Guarding is not yet activated by user**

When User clicks on Extension, it should allow user to provide following inputs:
1. Extension should provide single input field to add user activity description within 120 words.
2. Extension should provide a Button named "Guard" on top to activate monitoring. Once Extension is activated, Button must change to "Stop Guarding". Clicking on "Stop Guarding" button, stops monitoring.
3. When Extension is monitoring, input fields must be readonly.
4. Extension must take input `monitoring-duration` as input in minutes. Default is 120 minutes.
5. All user provided inputs must be saved in chrome.storage. Latest inputs must be read back whenever user open Extension.
6. A object store named "usersInputs" must  be created in IndexedDB which should have following information `inputID`, `timestamp`,`monitoring-duration` and `activity-description`. 
7. Extension uses GoogleGetAI "gemini-2.0-flash". User must provide API key as input at bottom. Once API key is provided, mask that input. API key must be stored in chrome.storage.
    - Default API key is: "AIzaSyDK-YKOAcFCc4C1b0i2YHGZmaDlhHgeFVU"

**Phase-2: When Guarding is activated and page has been Classified**

1. Individual page is evaluated for its classification as `relevant` or `non-relevant`only when user visit them. 
2. `relevant` label will be marked as green, while `non-relevant` as red.
2. If page is `non-relevant`, Extension should provide option to choose user `Intent` to visit current website.
3. `Intent` option should have following three options. `Relaxation`, `Curiosity` and `Habit`.
4. User should be allowed to choose only one option.
7. For a selected tab website which is marked as `relevant` intent options should not be present. 
8. Extension must allow Each `non-relevant` website to be evaluated for its intent independently.

## Extension Execution flow and output

# Phase-1 : When Guarding is not activated by user and user want to start guarding

1. When user clicks on Guarding. Only currently active tab page go for evaluation.
    - All given user inputs must be stored in chrome.storage for easy retrieval when user again opens the Extension.
    - A object store named `usersInputs` must  be created in IndexedDB which should have following information `inputID`, `timestamp`,`monitoring-duration` and `activity-description`.
2. Extension should wait for at-least 15 seconds before starting any evaluation.
2. Evaluation history must be stored in an object store named `evaluations` created in IndexedDB.
3. Evaluation history must contain following information `inputId`, newly created `evaluationId`, `tabId`, `web-url`, `classification`, `category` and `timestamp`.
4. Follow the section [Instruction to classify the page](#instruction-to-classify-the-page) to determine the classification and category.
5. Whenever user switches tab, Extension should check if evaluation is already done based on `inputId` and `web-url` and `tabId`. If evaluation is older than 5 minutes, page should be automatically re-evaluated when user visit or select tab.  
6. If page is classified as `non-relevant` page should be masked and blocked with dark blue color frame with opacity 0.9, and it should have label and button at center to remove mask.
    - label should have text: "Blocked by Advance Focus Guard"
    - Button should have text: "Close Mask"
7- Extension must show selected active tab category and classification as`Category/Classification`. Text must be in green if classification is `relevant` otherwise `red`.
8- If page is classified as `non-relevant`, Extension must show `Intent` options for that specific page.
9- Extension must update its UI based on currently selected tab. It should load the Category and classification result from IndexedDB if available.
10. Extension must work in background. Means if user closes the extension popup it should continue to work for any selected tab. 

# Phase-2 : When Extension is guarding and page classification is completed
1. `Intent` information for each page must be saved in IndexedDB and should be persisted and synced when user moves from one tab to another.
2. A object store named "intents" must  be created in IndexedDB which should have following information `inputID`, `tabId`, `evaluationId`, `timestamp`, `category`, `classification` and `intent` 
3. If page is classified as `relevant`, Intent value must be stored as `work`automatically
4. If page is classified as `non-relevant`, Intent information must be stored based on user feedback.
5. Whenever page is is getting evaluated for classification, it should allow user to provide intent also.


## Instruction to classify the page
Following instructions Extension must follow to determine if user is visiting `relevant` or `non-relevant` pages or not:

1. Extension shall display category of web site like: E-commerce, News, Social Media, Educational, Entertainment, Health and Fitness, Finance and Investment, Travel and Tourism, Technology and Gadgets, Lifestyle and Fashion, Food and Recipes, Automotive, Real Estate, Gaming, Music and Arts, Bank, Learning platforms, College or University, Search Engines, Chatbots and AI Assistants, Online Calculators and Converters, Weather Forecast Sites, Maps and Navigation, Forums and Communities, Webmail Services, Project Management Tools, Video Conferencing Platforms, CRM Software Websites, Marketing Automation Platforms, ERP/Business Management Sites, Job Portals, Freelancing Platforms, Legal Services, Event Booking Platforms, Conferences and Webinars, Wikis and Encyclopedias, Review Aggregators, Scientific Research Platforms, API Marketplaces, Software Documentation Sites, Online Marketplaces, B2B Portals, Government Websites, Charity and Fundraising Sites, Dating Websites, Parenting and Kids Sites, Pet Care and Adoption Sites, AI-generated Content Platforms, Blockchain and Crypto Websites, Virtual Reality and Metaverse Platforms.

2. Website belonging to following categories should always be considered as relevant: Educational, Learning platforms, College or University, Scientific Research Platforms, Wikis and Encyclopedias, Project Management Tools, Software Documentation Sites, AI-generated Content Platforms, Bank, Finance and Investment, Government Websites.

3. Extension must use google Gemini Flash 2.0 APIs to determine category.

4. Section [Category identification Prompt design input](#category-identification-prompt-design-input) and [Additional API communication considerations](#additional-api-communication-considerations) should be used to determine LLM prompt and LLM gemini API communication. 

5. These evaluated classification text should be highlighted in Red or Green color based on Extension evaluation as `relevant` or `non-relevant`.

6. When user visit a page, it should perform following steps:
    - Use the page title and web site link and send to the Google gemini to determine the category and classification of website. If it is blank tab don't do anything.
    - If user is visiting youtube, it should see the title and comments of selected video and send for review to Gemini
    - Extension should read major page content, and send it to Google gemini to determine if page content have any relation with activity which user is doing.


## Category identification Prompt design input
As a user I am working on given activity. I have provided a short description pf the activity. As part of this activity I am visiting a website. You need to determine if the content of the website is relevant to my activity or not. 
Classify website content as 'relevant' and 'non-relevant' with identified category. Here is example json output: 
example-1: {'category': 'News', 'classification' : 'non-relevant'}
example-2: {'category': 'Bank', 'classification' : 'relevant'}

website belonging to following categories should always be considered as relevant always: Educational, Learning platforms, College or University, Scientific Research Platforms, Wikis and Encyclopedias, Project Management Tools, Software Documentation Sites, AI-generated Content Platforms, Bank, Finance and Investment, Government Websites.

Possible categories: <>

User Activity description: <>

Website content: <>

## Additional API communication considerations
1. store API key in chrome.storage.local. If key already available chrome.storage.local fill it in input page.
2. Here is the REST API request format to communicate with googleAPis

```REST
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "Explain how AI works in a few words"
          }
        ]
      }
    ]
  }'
```

## Report from Extension
I would like Chrome extension `Advance Focus Guard` to generate report. Extension should you IndexedDB and following object store to determine "evaluations" and "intents"

Gemini API should be used to evaluate these in sequence. If needed output of one prompt must be passed to other prompt as well. I want Now I would like to derive following stats with the help of gemini LLM.

Generate graphs or table if possible for each following outcome evaluations. Create a separate file for this functionality

1. Time Spent by Intent Over Time
What: Aggregate time spent on each intent per day/week.
Why: Understand focus trends and when certain intents dominate.
Insight Example: “Most of your curiosity browsing happens late at night.”
Pass this information to gemini and figure out following things:
  - Which time of day like (Morning, afternoon, evening, night) which intent is most active
  - Based on this input find of which top intents are distracting during working hours.

Example:
What: Analyze which top intents are distracting during working hours.
Why: Identify when the user is most prone to distraction.
Insight Example: “You tend to drift into habit browsing around afternoon.”

2. Productivity Ratios
What: Compute ratio of work vs. non-work (relaxation, curiosity, habit).
Why: Track effectiveness and improvement over each day between morning 8 to evening 7 PM.
Insight Example: “Your work focus improved by 15% compared to last week.”

3. Top Distraction Sources
What: Identify top websites visited under distraction intents and group them with title name
Insight Example: “Youtube accounted for 42% of your curiosity-driven visits.”


