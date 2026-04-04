# Privacy Policy

**Sipmetry**
Last updated: April 3, 2026

Sipmetry ("we", "our", or "the app") is a cocktail recommendation and bar management app. This Privacy Policy explains what data we collect, how we use it, and your rights regarding that data.

## 1. Data We Collect

### Account Information
When you create an account, we collect your email address and authentication credentials. If you sign in with Apple, we receive only the information Apple provides, which may include a private relay email address. We fully respect your choice to use Apple's "Hide My Email" feature and will never attempt to discover or request your real email address beyond what Apple provides.

### Age Verification
During your first sign-in, we collect your birth year and device region (country code) to verify that you meet the legal drinking age in your jurisdiction. Your birth year is stored in our database for age verification and aggregate analytics (such as understanding the age distribution of our users). Your birth month is used only for the one-time age calculation and is not stored. We do not collect your full date of birth.

### Bar Inventory
You can add bottles to your personal inventory. This data is stored in our database and used solely to generate personalized cocktail recommendations.

### Preferences and Interactions
We store your taste preferences, recipe favorites, and interaction history (such as likes, dislikes, and feedback). This data is used to build a personalized flavor profile that improves cocktail recommendations over time. Your flavor profile is derived from your in-app interactions and is used exclusively within Sipmetry to enhance your experience. It is never shared with third parties for advertising or external profiling purposes.

### Camera and Photos
Sipmetry accesses your device camera or photo library only when you choose to scan bottles. Photos are sent to our server for AI-powered bottle identification and are **not stored** after processing. We do not collect or store any metadata associated with your photos (such as EXIF data or location information). We do not retain, share, or use your images for any purpose beyond the immediate identification request.

### Push Notification Tokens
If you enable push notifications, we store your device's push token to send you relevant notifications such as low-stock alerts. You can disable notifications at any time through your device settings.

### Feedback
When you submit feedback on recipes, we store it to improve our recommendation engine. If you delete your account, your feedback is anonymized (your identity is removed) but the anonymized data may be retained for product improvement.

### Technical and Log Data
When you use Sipmetry, our servers automatically receive and record certain technical information, including your IP address, request timestamps, and general device information (such as operating system and app version). This data is collected through standard server logs hosted on our infrastructure provider (Render) and is used solely for debugging, security monitoring, and service reliability. We do not use log data for advertising or behavioral profiling, and it is not linked to any third-party data for tracking purposes. Server logs are retained for approximately 30 days before being automatically purged by our hosting provider.

## 2. How We Use Your Data

We use your data exclusively to:

- Authenticate your identity and maintain your session
- Store and display your bar inventory
- Generate personalized cocktail recommendations based on your inventory, taste preferences, and interaction history
- Process bottle images for identification via AI
- Send push notifications you have opted into (such as low-stock alerts)
- Improve recommendation accuracy based on your feedback and interactions
- Monitor and maintain service security, stability, and performance

We do **not** use your data for advertising. We do **not** sell, rent, or share your personal data with advertisers or data brokers. We do **not** engage in cross-app tracking.

## 3. Third-Party Services

Sipmetry relies on the following third-party services to operate:

| Service | Purpose | Data Shared |
|---|---|---|
| **Supabase** | Authentication and database hosting | Email, account data, all user-generated content |
| **OpenAI** | AI-powered bottle image identification | Photos you submit for scanning (processed via API; strictly for identification; encrypted in transit; not stored after processing; not used for model training) |
| **Expo** | Push notification delivery | Device push tokens |
| **Render** | Backend server hosting | All data transiting through our API, including server logs |

We access OpenAI solely through their API, which does not use submitted data for training AI models. For details, refer to OpenAI's API data usage policy.

Each service operates under its own privacy policy. We encourage you to review them:
- Supabase: https://supabase.com/privacy
- OpenAI: https://openai.com/policies/privacy-policy
- Expo: https://expo.dev/privacy
- Render: https://render.com/privacy

We do not use any advertising SDKs, analytics platforms, or cross-app tracking tools.

## 4. Data Retention

We retain your data for as long as your account is active. You may delete your account at any time from the Profile tab in the app. Upon account deletion, an automated deletion process is immediately triggered:

- All personally identifiable data is **permanently deleted**, including your inventory, favorites, preferences, interactions, and push notification tokens.
- Feedback you previously submitted is **anonymized** (your user identity is removed) and may be retained in de-identified, aggregate form for product improvement. Anonymized feedback cannot be traced back to you.
- Your authentication record is deleted from our identity provider (Supabase Auth).
- Server logs that may contain your IP address are retained for approximately 30 days before automatic purging. These logs are not linked to your deleted account and cannot be used to re-identify you.

Account deletion is irreversible and cannot be undone.

## 5. Data Security

We use industry-standard security measures to protect your data, including encrypted connections (HTTPS/TLS) for all data in transit, secure authentication via Supabase, and access-controlled server infrastructure on Render. API endpoints are protected with rate limiting and authentication requirements. However, no method of electronic storage or transmission is 100% secure, and we cannot guarantee absolute security.

## 6. Children's Privacy

Sipmetry is an alcohol-related application and is not intended for use by anyone under the legal drinking age in their jurisdiction. The app includes an age verification step that prevents underage users from accessing the app. We do not knowingly collect personal information from children or minors. If you believe a minor has provided us with personal data, please contact us and we will promptly delete it.

## 7. Your Rights

Depending on your location, you may have specific rights regarding your personal data, as described below.

### All Users

You have the right to:

- **Access** your data through the app (inventory, favorites, preferences are all visible in-app)
- **Correct** your data by updating your inventory, preferences, or favorites directly within the app
- **Delete** your account and all associated personally identifiable data at any time via Profile > Delete Account
- **Opt out** of push notifications through your device settings

### California Residents (CCPA / CPRA)

Under the California Consumer Privacy Act and the California Privacy Rights Act, California residents have additional rights:

- **Right to Know**: You may request a summary of the categories and specific pieces of personal information we have collected about you, the sources of collection, the business purpose, and any third parties with whom it is shared.
- **Right to Delete**: You may request deletion of your personal information. You can exercise this directly via Profile > Delete Account, or by contacting us.
- **Right to Opt Out of Sale**: We do **not** sell your personal information. We do not share your personal information for cross-context behavioral advertising. Because no sale or sharing occurs, there is no need to opt out, but you may still contact us with any concerns.
- **Right to Non-Discrimination**: We will not discriminate against you for exercising any of your privacy rights.

To submit a verifiable consumer request, please contact us at the email address listed below. We will respond within 45 days of receiving your request.

### European Economic Area, United Kingdom, and Switzerland (GDPR)

If you are located in the EEA, UK, or Switzerland, the following applies:

- **Legal Basis for Processing**: We process your personal data based on: (a) your consent (e.g., when you opt into push notifications), (b) performance of a contract (e.g., providing the app's core features to you as a registered user), and (c) our legitimate interests (e.g., maintaining security and improving our service), balanced against your rights and freedoms.
- **Additional Rights**: In addition to the rights listed above, you have the right to:
  - **Data Portability**: Request a copy of your personal data in a structured, machine-readable format.
  - **Restrict Processing**: Request that we limit how we use your data in certain circumstances.
  - **Object to Processing**: Object to our processing of your data where we rely on legitimate interests.
  - **Lodge a Complaint**: File a complaint with your local data protection authority if you believe your rights have been violated.
- **International Data Transfers**: Your data is processed on servers located in the United States. By using Sipmetry, you acknowledge that your data will be transferred to and processed in the United States, where data protection laws may differ from those in your jurisdiction.

### Taiwan Residents (個人資料保護法)

Under Taiwan's Personal Data Protection Act (PDPA), you have the right to request access to, correction of, or deletion of your personal data. You may also request that we cease collecting, processing, or using your data. To exercise these rights, please contact us at the email address listed below. We will respond within 30 days of receiving your request.

## 8. Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be reflected by updating the "Last updated" date at the top of this page. For material changes that significantly affect how we handle your personal data, we will notify you through an in-app notification before the changes take effect. Continued use of the app after the effective date of changes constitutes acceptance of the updated policy.

## 9. Contact Us

If you have questions about this Privacy Policy, wish to exercise any of your privacy rights, or want to submit a data request, please contact us at:

**Email:** brok110@gmail.com

We aim to respond to all privacy-related inquiries within 30 days.

---

## Appendix: App Store Privacy Label Reference

The following table summarizes the data categories collected by Sipmetry as they correspond to Apple's App Privacy labels. This information is provided for transparency and to ensure consistency with our App Store listing.

| Data Category | Data Type | Usage | Linked to Identity | Tracking |
|---|---|---|---|---|
| Contact Info | Email Address | App Functionality | Yes | No |
| Demographics | Age (birth year) and Region (country code) | App Functionality, Analytics | Yes | No |
| User Content | Photos (camera/library) | App Functionality | No (not stored) | No |
| User Content | Other User Content (inventory, favorites, preferences) | App Functionality, Product Personalization | Yes | No |
| Usage Data | Product Interaction (likes, dislikes, feedback) | App Functionality, Product Personalization | Yes | No |
| Identifiers | Device Push Token | App Functionality | Yes | No |
| Diagnostics | Performance Data (server logs) | App Functionality | No | No |
