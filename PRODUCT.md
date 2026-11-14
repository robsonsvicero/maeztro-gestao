# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a music teacher or studio owner who manages students, lessons, and incoming inquiries. Teachers may use shared lesson schedules; CRM lead records are visible only to the workspace owner.

## Product Purpose

MAEZTRO Gestão helps music teachers and studios manage their teaching operations. The CRM phase focuses on helping the owner follow interested people from first contact through trial lessons and enrollment, and retain a clear follow-up history.

## Capabilities and Constraints

- The application has authenticated, multi-workspace data and existing student, lesson, and schedule workflows.
- CRM leads are private to the workspace owner.
- Trial lessons are distinct from regular student lessons. Assigned teachers may see only the trial time and the label “Aula experimental” in the shared schedule, not lead details.
- Follow-up reminders are internal to the application; no external messages are authorized.
- Conversion should check for an existing student by normalized phone and let the owner explicitly link a match or create a student. Names alone must not trigger automatic merging.
- The CRM success measure is the number of interested people, trial lessons, and enrollments.
- The owner dashboard uses deterministic operational indicators with explicit data sources and a 15-day planning horizon; it does not depend on generative AI.
- Student end-of-study dates are estimates entered by the studio, not inferred from payment or lesson history.
- Teacher availability shown in management intelligence is an estimate based on shared studio hours and assigned lessons, not a teacher-specific availability calendar.
- New accounts choose Individual or Studio during free-trial registration. Individual accounts have one owner seat and no Studio tab; Studio accounts support up to 10 total members, including the owner.
- The platform administrator may set the account type on invitations and change existing accounts without replacing their workspace or data. Account-type writes are server-authorized.

## Evidence on Hand

- Existing product screens and workflows: `src/pages/Students.jsx`, `src/pages/Schedule.jsx`, and `src/pages/Automations.jsx`.
- Existing brand asset: `public/logo_horizontal.png`.
- No customer testimonials, performance benchmarks, or other external proof were supplied.

## Product Principles

- Keep each interested person’s stage and contact history visible to the owner.
- Make next actions and follow-up timing clear.
- Prevent duplicate student records without merging people based on name alone.
- Share only the minimum trial-event details needed by an assigned teacher.
- Keep reminders in-app unless external messaging is separately authorized.
