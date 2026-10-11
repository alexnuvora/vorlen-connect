# Vorlen Connect — direct access application guide

Prepared 11 October 2026. Goal: all 40 operations exposed by the connected LinkupAPI plugin. Full parity is not complete and some official access routes are unavailable.

## 1. Member connection — do this first

1. Open https://www.linkedin.com/developers/apps and create **Vorlen Connect**.
2. Link your business’s LinkedIn Page and have its super admin verify the app. Supply your actual logo, company details and public privacy-policy URL.
3. Products: request **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**.
4. Auth: add this exact redirect URL:

    https://vorlen-connect.fresh-charm-4046.chatgpt.site/api/linkedin/callback

5. In Vorlen → Direct & access, save the Client ID and Client Secret. Use the password field in the app; credentials remain encrypted server-side.
6. Click Connect directly with LinkedIn. Requested scopes: openid, profile, w_member_social.
7. After authorization, create a text draft and review it in Outreach. Only approve a real post you intend to publish.

Built: OAuth code exchange, expiring one-use state bound to your signed-in owner and browser, encrypted secrets/tokens, connection removal, member identity, reviewed public text posts, audit trail and concurrent-send protection. Live LinkedIn validation awaits your app. No direct media, scheduling, comments or analytics yet. Existing Zernio features remain separate.

## 2. Company Page management

Use a **separate new app with no other products** for the initial Community Management API Development-tier application (see LinkedIn’s current eligibility FAQ). Do not replace your member app credentials with it yet: this release requests member scopes only.

Prepare your legal business name, registered address, verified business email, company website, public privacy-policy URL and Page-admin app verification. The private Vorlen dashboard cannot serve as the public policy.

Application draft — adapt to the real business and disclose planned features accurately:

> Vorlen Connect lets users authorize their own LinkedIn accounts, prepare content, review drafts and approve publication. We request Development-tier access to extend this workflow to company Pages they administer, including publishing, comments and engagement reporting. Credentials are encrypted at rest and data access is owner-scoped. These Page features are planned; we will implement and demonstrate them after access is granted.

After implementing approved features, apply separately for Standard tier with a working demo/screencast and any requested reviewer access. Approval is discretionary. Development limits currently include 500 calls/app/day and 100/member/day, no BATCH_GET and no social-action webhooks.

## 3. Sales and recruitment inquiries

For sales integrations, request SNAP partnership guidance through LinkedIn Developer Support (https://www.linkedin.com/help/linkedin/ask/LI-Developer). The access overview’s current SNAP application link redirects to CRM help, so a functioning public application form was not verified. Ask which matching, display or CRM-validation APIs fit your actual product. SNAP approval does not imply arbitrary people search, personal DMs or invitations.

For recruiter/applicant integrations, use https://business.linkedin.com/hire/ats-partners/partner-application and and explain the actual ATS workflow. Ask about Recruiter System Connect and Apply Connect, including the specific applicant and CV operations you need. Do not represent Vorlen as an existing ATS partner. Neither route guarantees Linkup parity.

## 4. Mail and enrichment

Gmail and Outlook need their own OAuth apps and mailbox permissions. Own email discovery/verification needs a separate data pipeline and delivery-quality work. These are not LinkedIn scopes. Hunter remains optional; the direct mailbox and own enrichment adapters have not been implemented.

## Exact capability map

| Linkup operation | Direct route | Status / next step |
|---|---|---|
| profiles.get_me | OpenID Connect | Direct authenticated-member identity implemented as linkedin.profile; awaiting your developer app and live authorization. |
| profiles.get | Restricted profile / Sales partner | No unrestricted public-profile lookup through ordinary access. Ask SNAP about the exact permitted matching/display use case; approval is not full-profile parity. |
| profiles.get_contact | Restricted member data | No confirmed general route for another person’s email/phone. Requires an expressly authorized data source or consent. |
| profiles.search_people | No confirmed general-access route | SNAP is a partner inquiry, not an entitlement to arbitrary people search or Linkup filters. Blocked pending documented access. |
| profiles.search_companies | Organization APIs / separate search source | Organization lookup is not broad company search. Exact keyword/filter parity remains unimplemented and access-dependent. |
| profiles.get_company | Community Management / organization access | Company administration and permitted organization data after approval; arbitrary full-company parity is not established. |
| profiles.get_candidates | Talent Solutions partner program | Ask about Recruiter System Connect / Apply Connect and your ATS use case. Access is contractual and product-specific; applicant/CV parity is not guaranteed. |
| profiles.get_viewers | No confirmed general-access route | Profile visitor identities are not enabled by OpenID, Share or Community Management. |
| profiles.get_reactions | Restricted member social reads | Reactions on an arbitrary profile’s posts are not covered by member publishing. Page engagement is only a subset. |
| profiles.get_comments | Restricted member social reads | Comments authored by an arbitrary member are not general-access. r_member_social requests are currently closed. |
| network.list_connections | Restricted network access | No general-access connector implemented. Obtain written eligibility and endpoint access before promising parity. |
| network.list_invitations | No confirmed general-access route | Received personal invitations remain blocked pending an authorized API program. |
| network.list_sent | No confirmed general-access route | Sent personal invitations remain blocked pending an authorized API program. |
| network.check_invitation | No confirmed general-access route | Cannot infer invitation status from an incomplete result or missing page. |
| network.recommendations | No confirmed general-access route | People-you-may-know is not covered by the requested products. |
| recruiter.get_posts | Talent Solutions partner program | Ask about Recruiter System Connect / Apply Connect and your ATS use case. Access is contractual and product-specific; applicant/CV parity is not guaranteed. |
| recruiter.get_candidates | Talent Solutions partner program | Ask about Recruiter System Connect / Apply Connect and your ATS use case. Access is contractual and product-specific; applicant/CV parity is not guaranteed. |
| recruiter.get_cv | Talent Solutions partner program | Ask about Recruiter System Connect / Apply Connect and your ATS use case. Access is contractual and product-specific; applicant/CV parity is not guaranteed. |
| content.search | No confirmed general-access route | General post search and advanced author filters need a separate approved source. |
| content.get_feed | No confirmed general-access route | Personal home feed is not provided by the requested open products. |
| content.get_comments | Community Management, permitted posts | Direct adapter pending approval and implementation. Does not imply access to every public or personal post. |
| content.get_reactions | Community Management, permitted posts | Direct adapter pending approval and implementation; identity fields depend on granted permissions. |
| enrich.enrich_person | Own enrichment pipeline / licensed data | Hunter remains optional today. Own source collection, matching, provenance and accuracy evaluation are not yet built. |
| enrich.enrich_company | Own enrichment pipeline / company sources | Optional Hunter today. Build company-domain and source-provenance ingestion separately. |
| enrich.find_email | Own discovery / consented or licensed sources | Optional Hunter today. This is separate from LinkedIn API approval. Own discovery pipeline not built. |
| enrich.validate_email | Own verification service | Optional Hunter today. Syntax, domain/MX checks and delivery uncertainty require separate implementation. |
| enrich.reverse_email | Own matching / licensed sources | Optional Hunter today. No general LinkedIn email-to-profile lookup entitlement. |
| enrich.search_jobs | Job-board partnerships / licensed feeds | Talent job-posting access does not grant general LinkedIn, Indeed or Glassdoor job search. Separate feed agreements required. |
| enrich.extract_employees | Restricted profile search / licensed data | No general company-to-all-employees API. Own authorized source ingestion remains unimplemented. |
| messages.list | No general personal inbox route | Community Management and Pages messaging do not unlock personal LinkedIn DMs. |
| conversation.get | No general personal inbox route | Personal conversation retrieval remains blocked; no undocumented endpoints are assumed. |
| emails.list | Gmail API / Microsoft Graph | Direct mailbox connector not built. Requires separate Google/Microsoft OAuth apps and mailbox consent. |
| send_connection.send | No general personal invitation route | Sending personal invitations remains blocked pending documented authorized access. |
| send_message.send | No general personal DM route | Personal DMs/InMail remain blocked. An approved Pages messaging integration is a different product. |
| send_email.send | Gmail API / Microsoft Graph | Direct sending connector not built. Draft review framework exists; mailbox approval is separate. |
| accounts.list | Vorlen account registry | Direct LinkedIn account list implemented as linkedin.status; mailbox and recruiter-seat adapters pending. |
| account.get | Vorlen account registry | Own direct connection status available via linkedin.status; not Linkup-specific webhook/country/seat parity. |
| credits.get | Vorlen metering | No invented credit balance. Local usage exists; own billing/credit product has not been defined. |
| logs.list | Vorlen native | Implemented: owner-scoped operation audit, status, timing and filters. |
| usage.get | Vorlen native | Implemented: local calls and breakdowns. Linkup’s credit accounting is not reproduced. |

## Official references

- Access and SNAP/Talent application links: https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access
- Member OpenID Connect: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
- OAuth: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
- Page application requirements: https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review
- Community Management eligibility FAQ: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview
- Tier limits: https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access
- Posts API: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api

No general-access route for personal inbox, invitations, visitor identities, recommendations or home feed has been established. r_member_social is closed to new requests according to the current overview. These stay explicitly blocked; no private undocumented LinkedIn endpoints or account-password collection are included.
