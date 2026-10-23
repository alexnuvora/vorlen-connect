# Vorlen-owned LinkedIn public jobs collector — prototype

This is an experimental, standalone parser/collector (no Apify SDK or API). It is NOT yet wired to the production MCP endpoint; existing Apify-backed tools remain available until parity is established. The earlier Greenhouse-only draft PR #18 is not a replacement for this work.

## Apify output parity target
The module declares 24 canonical keys: job_id, job_url, apply_url, job_title, search_keyword, company_name, company_url, company_logo_url, location, time_posted, posted_date, hiring_badge, is_actively_hiring, is_early_applicant, num_applicants, salary_range, job_description, job_description_raw_html, seniority_level, employment_type, job_function, industries, easy_apply and contact_email. Absent details are null. Field presence is not proof of data availability; no fake data.

## Actual implementation
- Parse public listing cards and job detail fragments when available.
- Extract jobs by keyword/location, deduplicate by LinkedIn job ID and validate arguments.
- Preserve the existing canonical fields so MCP consumers do not need different result objects.
- Explicit opt-in authorization gate: `collectJobs(input,{authorized:true})` must be supplied from a trusted server-side approval/permission mechanism; **never** from untrusted MCP request arguments.
- Fail on 403/429; no credentials, authentication circumvention, CAPTCHA avoidance, proxy rotation or stealth.
- Per request 12s timeout, bounded searches.
- Mock tests only; **no real live LinkedIn query or parity benchmark performed**.

## Known missing functionality (blocks rollout)
- Public page selectors are version-sensitive and must be verified with permitted real responses.
- Seniority, employment type, job function, industry, company logo, company URL, Easy Apply and external apply URL need robust extraction.
- Accurate applicant count semantics, salary, posting time, badge distinction and full HTML need field-by-field benchmark, not assumptions.
- No dedicated job store/queue for long-running searches yet.
- No verified authorization to automate LinkedIn collection. LinkedIn prohibits unauthorized scraping in its terms; public availability alone does not confer access rights.
- No deployment or MCP switch-over until permitted access, coverage tests, and output parity acceptance.

References: https://apify.com/worldunboxer/rapid-linkedin-scraper and https://www.linkedin.com/help/recruiter/answer/a1341387

Tests: `node --test tests/linkedin-public-collector.test.mjs`
