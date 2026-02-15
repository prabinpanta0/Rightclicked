## **PRD: Rightclicked (v1)**

### **1\) Overview**

Rightclicked is a product that lets users collect LinkedIn posts via a Chrome extension and view them later in a searchable, organized library.

### **2\) Problem**

LinkedIn posts worth saving are hard to revisit later. Users need a fast way to capture posts and reliably find them again by author, topic, or other useful groupings.

### **3\) Goal**

Enable users to:

1. Save LinkedIn posts in 1 click via a Chrome extension  
2. View all saved posts in Rightclicked  
3. Browse and search saved posts with useful grouping

### **4\) Core User Flow**

1. User browses LinkedIn  
2. User clicks the Rightclicked extension on a post  
3. The post is saved into Rightclicked  
4. User opens Rightclicked web app  
5. User views saved posts grouped and searchable

### **5\) Requirements**

#### **Chrome Extension (Required)**

* Must work on LinkedIn posts  
* Must allow saving a post into Rightclicked with a single action  
* Must extract enough post data to display later in the app

**Minimum post data to capture**

* Author name  
* Author profile URL (if available)  
* Post content text  
* Post URL  
* Timestamp (if available)  
* Date saved

#### **Rightclicked Web App (Required)**

* Must display all collected posts  
* Must support grouping views:  
  * By author
  * By topic
  * By other useful groupings (TBD but required as a category)

#### **Organization & Discovery (Required)**

* Must allow fast search across saved posts  
* Search must work across:  
  * Post text  
  * Author name

### **6\) Groupings (v1)**

**Required**

* Author  
* Topic

**Additional “useful groupings” (at least 1 required in v1)**  
Examples:

* Date saved  
* Engagement level (if available)  
* Keywords  
* Custom tags (user-applied)

(Exact sets can be finalized in implementation, but at least one beyond author/topic must ship.)

### **7\) Non-goals (v1)**

* Publishing or reposting to LinkedIn  
* Editing LinkedIn content  
* Multi-platform saving (Twitter, etc.)  
* Team/shared libraries

### **8\) Success Metrics**

* Save success rate (% of attempted saves that appear in app)  
* Time-to-save (from click to confirmation)  
* Search usage rate  
* Repeat usage (weekly returning users)

**9\) Open Questions**

* How is “topic” determined?  
  * Auto-detected via NLP?  
  * User-assigned tags?  
  * Both?  
* Should the extension show a “Saved” confirmation UI?  
* Do we store full post content or only a reference \+ excerpt?

### **10\) Risks**

* LinkedIn DOM changes breaking extraction  
* LinkedIn anti-scraping / rate limiting  
* Topic detection quality (if automated)

## todo
avoid ban from scraping
human readable text 
