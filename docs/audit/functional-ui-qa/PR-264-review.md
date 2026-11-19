# Administration review — PR #264

Reviewed exact head `d2328806b679e181005353f5045522e77f9a8d73` in a separate checkout and disposable database.

- **UI-02 (P2, still present):** Sign in as an EMPLOYEE, switch to French, and visit `/admin` directly at 1440 px. The page displays `Espace protégé / Accès refusé`; the workspace tab strip selects `Vue d'ensemble`. Keep the denied panel and make the selected semantic state match the actual visible view. [Browser evidence](evidence/pr264-employee-admin-denied-desktop-fr.png).
- **UI-03 (P2, partial resolution):** As an administrator at 390 px in French, Billing and Roles and Permissions are independent and selectable. Billing no longer displays the entire Access section. The 391 px tab row sits inside a 343 px viewport; the final tab is partly clipped and scrolls into view when selected. The Access view is still about 26,100 px tall with the seeded permission catalog. Add a visible indication that more tabs are available and give long role lists a compact, keyboard-accessible way to jump to one role or expand it. [Billing](evidence/pr264-mobile-billing-fr-390.png) · [Access](evidence/pr264-mobile-access-fr-390.png).

Record the fixes in the Administration branch and verify at 390 px in French, then repeat the denied deep link and Back/Forward states. This QA change does not modify PR #264.
