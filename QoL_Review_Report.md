# WLPC — Quality of Life Review

**Date:** March 26, 2026
**Scope:** Full code review (backend + frontend) and live browser testing

---

## Executive Summary

Jessica's HomeSchool (WLPC) is a well-built homeschool co-op management app with a Rust/Axum backend and React/TypeScript frontend. The core functionality works — sessions, lesson plans, blog, RSVP, and admin tools are all functional. The design is cohesive with a nice cream/cobalt palette and chicken silhouette branding.

That said, there are several quality-of-life issues that would make the app feel more polished and a handful of bugs and security items worth addressing. Below is everything organized by priority.

---

## Critical Issues (Fix First)

### 1. XSS Vulnerability in Blog Comments
**File:** `frontend/src/pages/member/BlogPost.tsx`
Blog post comments use `dangerouslySetInnerHTML` to render comment content without sanitization on the frontend. While the backend sanitizes post content via Ammonia, comment content appears to bypass this. A malicious user could inject scripts through comments.

**Fix:** Render comments through the `RichTextDisplay` component (which uses a read-only Tiptap editor), or sanitize on the frontend before inserting into the DOM.

### 2. Race Condition on Session Claims
**File:** `backend/src/routes/member.rs`
Two users could claim the same session simultaneously because the check-then-update isn't wrapped in a transaction. The code reads the session status, checks if it's "open," then updates — but between the read and the write, another user could also read "open."

**Fix:** Wrap the claim logic in a database transaction with a row lock, or use a single atomic UPDATE with a WHERE clause that checks status = 'open' and verify the affected row count.

### 3. RSVP Cutoff Uses String Comparison for Timestamps
**File:** `backend/src/routes/member.rs` (around line 1507)
The RSVP cutoff check compares timestamps as raw strings (`if now > cutoff`). This works for ISO 8601 format but is fragile — any format difference breaks it silently.

**Fix:** Parse both sides into `chrono::NaiveDateTime` and compare properly.

### 4. No File Upload Validation
**File:** `backend/src/routes/member.rs` (upload handler)
There's no file size limit enforced server-side, and the MIME type comes from the client (which can be spoofed). A user could upload arbitrarily large files or executables.

**Fix:** Add a max file size check (e.g., 10MB), validate file extensions against an allowlist, and consider checking magic bytes for type verification.

---

## UI/UX Issues Found During Live Testing

### 5. Broken Hero Image on Home Page
The home page has a large white empty box on the right side of the hero section where an image should be. It appears the image source (likely a photo of Catoctin Creek / Route 7 bridge based on the footer attribution) is missing or the path is wrong.

### 6. Browser Tab Title is "frontend"
Every page shows "frontend" as the browser tab title instead of something like "WLPC — Western Loudoun Preschool Co-op." There's no `<title>` tag management — consider using `react-helmet` or a simple `useEffect` to set `document.title` per page.

### 7. Resources Page Header Inconsistency
The Resources page (`/resources`) uses a left-aligned header style, while every other public page (Schedule, Blog, About, Contact) uses a centered header with the chicken icon and decorative underline. This breaks visual consistency.

### 8. Blog Post Cards Show Duplicate Preview
On the `/blog` page, each blog card shows the title/excerpt on the left AND a duplicate preview block on the right. This looks like an unintentional duplicate rendering of the post content — the right-side preview doesn't add information and uses up space.

### 9. RSVP Cutoff Timestamp Shows Seconds
On the session detail page, the RSVP cutoff displays as "3/30/2026, 10:00:00 AM" — the `:00` seconds are unnecessary clutter for a user-facing date. Format it to just show "March 30, 2026 at 10:00 AM."

### 10. No Feedback on Empty Login Submission
Submitting the login form with empty fields shows no visible error — the browser's HTML5 validation silently blocks it but there's no custom visual feedback. Users on some browsers or with autofill may be confused.

**Fix:** Add inline validation messages or at minimum use `required` attributes with CSS `:invalid` styling.

### 11. Dashboard "Upcoming Schedule" Missing Context
The dashboard shows "Friday — Apr 3" under Upcoming Schedule but doesn't show the session title or theme. For a parent, knowing *what* the session is matters more than just the day.

### 12. Lesson Plan Category Badge Inconsistency
On the Lesson Plans page, "literacy" and "science" categories render as teal badges, but "Test" renders as an unstyled gray text. The known categories should all have consistent badge styling, with a fallback for unknown/custom categories.

---

## Backend Code Quality Issues

### 13. N+1 Query Problem in `list_members()`
**File:** `backend/src/routes/member.rs`
The members list endpoint iterates through users and makes separate queries per user to fetch hosting data. With many users this will be noticeably slow.

**Fix:** Use a single JOIN query or batch the hosting lookups.

### 14. Missing Database Indexes
The database doesn't have indexes on commonly queried columns like `author_id`, `session_date`, `student_id`, or `host_id`. As data grows, list queries will slow down.

**Fix:** Add indexes on foreign key columns and date fields used in WHERE clauses.

### 15. No Pagination on Most List Endpoints
`list_lesson_plans()`, `list_students()`, `list_members()`, and others return all records. With enough data, these become slow and memory-heavy.

### 16. In-Memory Session Store
Sessions are stored in memory (`MemoryStore`), meaning all users get logged out on every server restart. This is fine for development but will be frustrating in any persistent deployment.

**Fix:** Switch to a file-backed or SQLite-backed session store for production.

### 17. Duplicate Session Creation Logic
Session creation appears in both `admin.rs` and `member.rs` with similar but not identical code. This is a maintenance risk.

**Fix:** Extract shared session creation into a helper function.

### 18. Silent Migration Failures
**File:** `backend/src/db.rs`
ALTER TABLE migrations use `let _ =` to silently swallow errors. If a migration partially fails, you'd never know.

**Fix:** At minimum, log warnings on failure. Better: track migration versions properly.

### 19. No Rate Limiting
There's no protection against brute-force login attempts or API abuse. The login endpoint in particular should be rate-limited.

### 20. No Structured Logging
The only logging is a single `println!` for admin creation. For debugging production issues, the app needs structured logging (e.g., `tracing` crate).

---

## Frontend Code Quality Issues

### 21. No Error Boundary Component
If any component crashes, the entire app white-screens. A React error boundary would catch crashes and show a fallback UI.

### 22. Heavy State Management in Forms
Components like `SessionDetail` manage 10+ individual `useState` hooks for form fields. This is error-prone and hard to maintain.

**Fix:** Use `useReducer` or a form library like `react-hook-form`.

### 23. No Data Caching
Every page navigation triggers fresh API calls. Switching between Sessions and Dashboard re-fetches all data each time.

**Fix:** Consider React Query or SWR for caching and stale-while-revalidate patterns.

### 24. No Search Debouncing on Blog Page
The blog search triggers an API call on every keystroke. For a fast typer, this sends many unnecessary requests.

**Fix:** Add a 300ms debounce on the search input.

### 25. No Toast/Notification System
Success and error messages appear as inline colored boxes that are easy to miss. A toast notification system would give better feedback.

### 26. Missing Accessibility Features
- No skip-to-main-content link
- No ARIA live regions for dynamic content
- Color-only status indicators (red/green badges)
- Some icon buttons lack `aria-label`
- Touch targets may be too small on mobile (some buttons use `px-3 py-1.5`)

---

## Nice-to-Haves

### 27. Auto-save for Blog Posts and Lesson Plans
The rich text editor shows "Not saved yet" status, which is great — but there's no auto-save. Users risk losing work on browser crash or accidental navigation.

### 28. Confirmation Dialogs for Destructive Actions
The "Delete" and "Remove" buttons on admin pages have no confirmation dialog. One misclick deletes a session or student.

### 29. Mobile Responsive Issues
- The calendar (7-column grid) doesn't collapse on narrow screens
- The rich text editor toolbar buttons don't wrap or scroll on mobile
- Nav links don't always collapse to a hamburger menu at intermediate widths

### 30. Input Validation / Name Normalization
There's no enforcement of consistent capitalization on names — existing data has "John doe" (lowercase d). Consider auto-capitalizing first/last names or at least trimming whitespace consistently.

---

## What's Working Well

- **Cohesive design system** — cream/cobalt palette, Fraunces + Instrument Sans typography, consistent panel styling
- **Solid auth** — Argon2 hashing, session-based auth, proper role guards, generic error messages (no email enumeration)
- **Rich text editing** — Tiptap with tables, images, YouTube embeds, Excalidraw drawings, comments
- **Session management** — claim/unclaim flow, RSVP system, health summary for hosts, session types
- **HTML sanitization** — Ammonia used for post content
- **Invite-based registration** — good for a private co-op
- **Lesson plan collaboration** — multi-author support with collaborators

---

## Recommended Priority Order

1. Fix XSS in blog comments (security)
2. Fix session claim race condition (data integrity)
3. Add file upload validation (security)
4. Fix the broken hero image (first impression)
5. Set proper page titles (professionalism)
6. Add confirmation dialogs for destructive actions (data safety)
7. Add database indexes (performance)
8. Add error boundary (stability)
9. Address the RSVP timestamp comparison (correctness)
10. Everything else from the list above
