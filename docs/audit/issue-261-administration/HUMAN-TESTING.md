# Human Administration acceptance record

**Status: pending.** No screen-reader user, physical-device tester, or business user approved this build in #261. Local Chrome viewport emulation and automated accessibility scans provide engineering evidence. Record this checklist against the same reviewed SHA in a separately authorized synthetic staging environment.

| Test | Suggested setup | Expected observation | Result |
| --- | --- | --- | --- |
| Page and workspace navigation | NVDA with Chrome on Windows and VoiceOver with Safari on macOS | The main landmark, Administration heading, one active Console tab, current section, and restricted route are announced clearly in English and French. | Pending |
| User directory and details | Keyboard and screen reader on desktop | The search has a label. Loading, empty and error results are announced. Selection moves focus to the user heading, and Back returns focus to the same result. Status and role summaries are understandable without color. | Pending |
| Account actions | Keyboard and screen reader on desktop | The form, field requirements and errors are announced. Role, status and session confirmations identify the target and consequences. Escape, dismissal and completion return focus meaningfully. | Pending |
| Billing settings | Keyboard and screen reader on desktop | Billing field groups, validation, retry and unsaved warnings are announced. The numbering review communicates the year, current series and consequence before confirmation. Reader permissions leave readable values and no write controls. | Pending |
| Physical mobile | Touch and VoiceOver on iOS Safari, then touch and TalkBack on Android Chrome | Check narrow portrait, landscape, text enlargement, virtual keyboard, scrolling and target size. Verify Billing, directory/details and permission disclosures in both languages. The input remains visible while typing and actions remain reachable. | Pending |
| Business-user UAT | Authorized staff accounts in synthetic staging | Each tester completes the complete workflow, can explain the consequences of revocation and numbering actions, verifies delegated access and records approval or defects. | Pending |

For every run record the reviewed SHA, environment, date, tester, OS/browser/assistive-technology version, device and settings, locale, expected and actual outcomes, severity and a sanitized capture where useful. Record accessibility findings even if the affected task has a keyboard workaround. Use synthetic records and keep invoice issuance disabled throughout UAT.
