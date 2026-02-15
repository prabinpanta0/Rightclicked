**Handling ever-changing DOM structures on LinkedIn**:
Data Attributes or ARIA Roles. These are special attributes added to HTML elements that can help you identify them. Data attributes start with "data-" and can hold any information you want. ARIA roles and labels are used to improve accessibility but can also be useful for targeting elements.
    Example: Look for div[data-urn] or button[aria-label="Save"].
which are commonly used in LinkedIn posts and less likely to change frequently than the class sectors such as ".update-components-text" or ".feed-shared-update-v2__description".

**Handling Anti-scraping and account bans**:
- Respect robots.txt: Always check LinkedIn's robots.txt file to see which parts of the site are off-limits to crawlers and scrapers. This can help you avoid violating their terms of service.
- Rate Limiting: Implement rate limiting in your extension to avoid making too many requests in a short period of time. This can help prevent your extension from being flagged as a bot.
- not using headless browsers or automated tools that mimic human behavior, as these can be easily detected by LinkedIn's anti-scraping measures. Instead, rely on the user to trigger the save action through the context menu, which is a more natural interaction.
