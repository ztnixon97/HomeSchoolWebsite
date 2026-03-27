# WLPC — Full Interaction Test Report

**Date:** March 26, 2026
**Method:** Code review of all source files + live API testing + browser UI testing
**Servers tested:** Rust backend (localhost:3000) + Vite frontend (localhost:5173)

---

## How to Use This Report

Every issue below has a **severity tag**, an **area tag**, and a **suggested fix**. Issues are grouped by area. Within each area they're ordered by severity.

**Severity:** `[CRITICAL]` security or data loss — `[HIGH]` broken functionality — `[MEDIUM]` bad UX or missing validation — `[LOW]` polish or nice-to-have

---

## 1. Security Issues

### SEC-01 [CRITICAL] XSS via Unsanitized Titles
**Tested:** POST /api/posts with `title: "<script>alert(1)</script>"` — stored and returned as-is.
**Also affects:** Lesson plan titles, session titles, student names, event titles, resource titles.
**Repro:** Any teacher/parent can create a post with a script tag in the title. When another user views the blog listing, the script executes.
**Fix:** Run all title/name fields through `ammonia::clean()` the same way content is sanitized. Or strip HTML tags entirely from single-line text fields.

### SEC-02 [CRITICAL] No File Upload Validation
**Tested:** POST /api/uploads accepts any file with no size limit, no extension allowlist, and trusts client-provided MIME type.
**Repro:** Upload a 1GB file or a .exe — backend stores it without question.
**Fix:** Add max file size (e.g., 10MB), allowlist extensions (pdf, png, jpg, gif, docx, txt), and verify MIME type from magic bytes, not client headers.

### SEC-03 [CRITICAL] Session Claim Race Condition
**Tested:** POST /api/sessions/{id}/claim reads status, checks "open", then updates — two concurrent requests can both succeed.
**Fix:** Use a single `UPDATE class_sessions SET host_id=?1, status='claimed' WHERE id=?2 AND status='open'` and check `changes()` == 1.

### SEC-04 [HIGH] RSVP Capacity Race Condition
**Tested:** POST /api/rsvps counts current RSVPs, then inserts — two concurrent RSVPs can both pass the max_students check.
**Fix:** Same pattern as SEC-03: check count in the WHERE clause of an INSERT, or wrap in a serializable transaction.

### SEC-05 [HIGH] Raw DB Errors Leaked to Client
**Tested:** POST /api/rsvps with student_id=999 returns `"FOREIGN KEY constraint failed"` to the client.
**Also seen:** Deserialization errors on malformed JSON show raw Rust error messages.
**Fix:** Catch database constraint errors in the error handler and return user-friendly messages like "Student not found."

### SEC-06 [MEDIUM] Case-Sensitive Email Login
**Tested:** Login with `ADMIN@preschool.local` returns Unauthorized, but `admin@preschool.local` works.
**Repro:** User registers with mixed-case email, then can't log in if they type it differently.
**Fix:** Lowercase email in both `register` and `login` handlers before DB lookup.

### SEC-07 [MEDIUM] Registration Race Condition
**Tested:** Two concurrent registrations with the same invite code could both pass the `used_by.is_none()` check.
**Fix:** Wrap the entire registration (check invite + create user + mark invite used) in a single transaction with a row lock on the invite.

### SEC-08 [MEDIUM] No Rate Limiting on Login
**Tested:** Can send unlimited login requests.
**Fix:** Add rate limiting middleware (e.g., tower-governor) — 5 attempts per minute per IP.

### SEC-09 [LOW] RSVP Cutoff String Comparison
**Tested:** RSVP cutoff uses raw string comparison on timestamps.
**Fix:** Parse both sides with `chrono::NaiveDateTime` before comparing.

---

## 2. Data Validation Issues

### VAL-01 [HIGH] Empty Titles Accepted Everywhere
**Tested:** POST /api/posts with `title: ""` returns 200. Same for sessions, lesson plans.
**Fix:** Add `if title.trim().is_empty() { return Err(BadRequest("Title is required")) }` to all create/update handlers.

### VAL-02 [HIGH] Invalid Dates Accepted
**Tested:** POST /api/sessions with `session_date: "not-a-date"` returns 200 and stores the string.
**Fix:** Parse date fields with `chrono::NaiveDate::parse_from_str()` before storing. Return 400 on failure.

### VAL-03 [HIGH] Empty Student Names Accepted
**Tested:** POST /api/admin/students with `first_name: "", last_name: ""` returns 200.
**Fix:** Validate non-empty after trim for first_name and last_name.

### VAL-04 [MEDIUM] No Length Limits on Text Fields
**Tested:** POST /api/posts with a 10,000-character title returns 200.
**Fix:** Enforce reasonable maxima: titles 200 chars, content 100KB, names 100 chars, addresses 500 chars.

### VAL-05 [MEDIUM] RSVP Status Not Validated
**Tested:** PUT /api/rsvps/{id} accepts any string as `status` (could be "hacked" or "invalid").
**Fix:** Validate status against `["confirmed", "pending", "declined", "waitlisted"]`.

### VAL-06 [MEDIUM] Event Type Not Validated
**Tested:** POST /api/admin/events accepts any string as `event_type`.
**Fix:** Validate against known types from the session_types table or a hardcoded enum.

### VAL-07 [MEDIUM] Email Format Not Validated
**Tested:** Registration accepts any string as email (no @ check).
**Fix:** Add basic email format validation (contains @ and a domain).

### VAL-08 [LOW] No Password Complexity Requirements
**Tested:** Registration accepts single-character passwords.
**Fix:** Require minimum 8 characters.

### VAL-09 [LOW] Invite Code Collision Risk
**Tested:** Invite codes use `uuid[..8]` which is only 32 bits of entropy.
**Fix:** Use 12+ characters or the full UUID.

---

## 3. UI/UX Issues (From Live Browser Testing)

### UI-01 [HIGH] Broken Hero Image on Home Page
**Tested:** Home page shows a large empty white box where an image should be.
**Likely cause:** Missing image file or wrong path for the Catoctin Creek photo referenced in the footer.
**Fix:** Either add the image or remove the placeholder box.

### UI-02 [HIGH] Blog Search Returns Empty When No Query
**Tested:** GET /api/posts/search (no `q` param) returns `total: 3` but `posts: []`.
**Expected:** Should return all posts (paginated) when no search query is provided.
**Fix:** When `q` is empty/missing, fall back to listing all published posts.

### UI-03 [MEDIUM] Browser Tab Title is "frontend"
**Tested:** Every page shows "frontend" in the browser tab.
**Fix:** Add `document.title` updates per route, e.g., "WLPC — Schedule", "WLPC — Blog".

### UI-04 [MEDIUM] Blog Post Cards Show Duplicate Preview
**Tested:** Blog listing shows title+excerpt on the left AND a duplicate preview block on the right of each card.
**Fix:** Remove the right-side duplicate or differentiate it (e.g., show a featured image instead).

### UI-05 [MEDIUM] Resources Page Header Style Inconsistent
**Tested:** Resources uses left-aligned header while all other public pages use centered header with icon and underline.
**Fix:** Match the centered-header pattern used by Schedule, Blog, About, Contact.

### UI-06 [MEDIUM] No Confirmation Dialogs for Destructive Actions
**Tested:** Delete buttons on admin sessions, students, and resources have no confirmation.
**Fix:** Add `if (!confirm("Delete this session?")) return;` or a proper modal.

### UI-07 [MEDIUM] RSVP Cutoff Shows Raw Timestamp
**Tested:** Session detail shows "3/30/2026, 10:00:00 AM" — the seconds are unnecessary.
**Fix:** Format as "March 30 at 10:00 AM" or similar.

### UI-08 [MEDIUM] No Toast/Notification System
**Tested:** Success and error messages appear as inline colored boxes that are easy to miss.
**Fix:** Add a toast notification system for confirmations ("Post saved!", "Session claimed!").

### UI-09 [MEDIUM] Dashboard "Upcoming Schedule" Missing Session Details
**Tested:** Shows "Friday — Apr 3" but not the session title, theme, or host.
**Fix:** Include the session title and linked lesson plan name.

### UI-10 [MEDIUM] Lesson Plan Category Badge Inconsistency
**Tested:** "literacy" and "science" render as colored badges; "Test" renders as unstyled text.
**Fix:** Ensure all categories get consistent badge styling with a fallback color for unknown categories.

### UI-11 [MEDIUM] No Empty-Field Feedback on Login Form
**Tested:** Submitting empty login form shows no visible error — browser validation blocks it silently.
**Fix:** Add custom inline validation messages or at minimum a general "Please fill in all fields" message.

### UI-12 [LOW] No Search Debouncing on Blog Page
**Tested:** Blog search fires API call on every keystroke.
**Fix:** Add 300ms debounce.

### UI-13 [LOW] No Auto-save for Rich Text Editors
**Tested:** The editor shows "Not saved yet" status but doesn't auto-save.
**Fix:** Auto-save drafts every 30 seconds.

---

## 4. Backend Architecture Issues

### ARCH-01 [HIGH] N+1 Query in Members List
**File:** `routes/member.rs` — `list_members()`
**Issue:** For each user, runs separate queries for hosted_sessions and upcoming_sessions.
**Fix:** Use JOIN queries or batch-fetch hosting data.

### ARCH-02 [HIGH] Missing Database Indexes
**Issue:** No indexes on foreign key columns (author_id, host_id, student_id, session_id) or date columns.
**Fix:** Add indexes:
```sql
CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_sessions_date ON class_sessions(session_date);
CREATE INDEX idx_rsvps_session ON rsvps(session_id);
CREATE INDEX idx_student_parents ON student_parents(student_id, user_id);
CREATE INDEX idx_files_linked ON files(linked_type, linked_id);
```

### ARCH-03 [MEDIUM] No Pagination on Most List Endpoints
**Affected:** lesson-plans, students, members, resources, invites, session-types, events, files.
**Fix:** Add `?page=1&page_size=25` support with total count in response.

### ARCH-04 [MEDIUM] In-Memory Session Store
**Issue:** All users lose sessions on server restart.
**Fix:** Switch to SQLite-backed session store for production.

### ARCH-05 [MEDIUM] Multiple Separate UPDATEs Without Transaction
**File:** `routes/admin.rs` — `update_user()` runs separate UPDATE per field.
**Fix:** Combine into a single UPDATE statement, or wrap in a transaction.

### ARCH-06 [MEDIUM] Silent Migration Failures
**File:** `db.rs` — ALTER TABLE migrations use `let _ =` to swallow errors.
**Fix:** Log warnings on migration failures and track applied migrations.

### ARCH-07 [LOW] No Structured Logging
**Issue:** Only logging is `println!` for admin seed.
**Fix:** Add `tracing` crate with structured JSON logging.

### ARCH-08 [LOW] Duplicate Session Creation Logic
**Issue:** Session creation code exists in both admin.rs and member.rs.
**Fix:** Extract into shared helper function.

---

## 5. Frontend Architecture Issues

### FE-01 [HIGH] No React Error Boundary
**Issue:** Any component crash white-screens the entire app.
**Fix:** Add an error boundary component at the App level with a fallback UI.

### FE-02 [MEDIUM] Heavy useState for Forms
**Issue:** Components like SessionDetail manage 10+ individual useState hooks.
**Fix:** Use `useReducer` or `react-hook-form`.

### FE-03 [MEDIUM] No Data Caching
**Issue:** Every navigation refetches all data from scratch.
**Fix:** Add React Query or SWR for caching.

### FE-04 [MEDIUM] Accessibility Gaps
**Issues found:**
- No skip-to-main-content link
- No ARIA live regions for dynamic content updates
- Color-only status indicators (red/green badges without text alternatives)
- Some icon buttons lack aria-label
- 4 buttons below 44px touch target minimum
**Fix:** Add ARIA attributes, ensure all interactive elements meet 44x44px minimum, add sr-only text for color-coded badges.

### FE-05 [LOW] Calendar Doesn't Collapse on Mobile
**Issue:** 7-column calendar grid has no mobile alternative.
**Fix:** On small screens, show a list view instead of the grid, or allow horizontal scrolling.

### FE-06 [LOW] Rich Text Toolbar Doesn't Wrap on Mobile
**Issue:** Toolbar buttons overflow on narrow screens.
**Fix:** Add `flex-wrap` or a scrollable toolbar container.

---

## 6. Management UX Recommendations

These are features that would make daily management of the co-op significantly easier.

### MGMT-01 Bulk Session Creation
**Problem:** Admins create sessions one at a time. For a weekly co-op, this means 40+ individual session creates per school year.
**Suggestion:** Add a "Generate recurring sessions" feature — pick a day of week, time range, start/end dates, and auto-create all sessions at once. Include ability to skip specific dates (holidays).

### MGMT-02 Admin Dashboard with Overview Stats
**Problem:** The admin experience is spread across multiple pages with no overview.
**Suggestion:** Create an admin dashboard showing: upcoming unclaimed sessions (with quick-claim), RSVPs needing approval, recent blog drafts pending publish, member count, and student count.

### MGMT-03 Drag-and-Drop Session Reordering
**Problem:** Admin session management is a flat list with no way to reorder or reschedule quickly.
**Suggestion:** Add a calendar-based admin view where sessions can be dragged to new dates.

### MGMT-04 One-Click "Copy Last Session" for Hosts
**Problem:** When a parent hosts a similar session to one they've hosted before, they have to re-enter all details.
**Suggestion:** On the session detail page, add a "Copy from previous session" option that pre-fills materials, notes, and lesson plan.

### MGMT-05 Email Notifications for Key Events
**Problem:** No one knows when things change unless they check the site.
**Suggestion:** Add email notifications (even simple mailto: links or a weekly digest) for: new session claimed, RSVP received, blog post published, RSVP cutoff approaching.

### MGMT-06 Parent RSVP from Dashboard
**Problem:** Parents must navigate to Sessions → find session → click into detail → RSVP. Four clicks minimum.
**Suggestion:** Show the next upcoming session on the dashboard with a one-click "RSVP [child name]" button.

### MGMT-07 Session Health Summary on List View
**Problem:** The host health summary (allergies/dietary) is only visible on the session detail page.
**Suggestion:** Show a small badge on the session card: "3 RSVPs · 1 allergy" so hosts can see at a glance.

### MGMT-08 Lesson Plan Templates
**Problem:** Creating lesson plans from scratch every time is tedious.
**Suggestion:** Allow marking a lesson plan as a "template" and creating new plans from templates.

### MGMT-09 Quick-Add Student from Parent's "My Children" Page
**Problem:** Currently admin must add students separately, then link parents. For a small co-op, parents should be able to self-register their children.
**Current state:** Parents CAN add children via /my-children, but the UX isn't obvious.
**Suggestion:** Make the "My Children" link more prominent in the nav and add a first-time onboarding prompt.

### MGMT-10 Printable Session Summary for Hosts
**Problem:** Hosts need to prepare supplies and know allergies, but the session detail isn't print-friendly.
**Suggestion:** Add a "Print session summary" button that generates a clean, print-optimized view with: date, time, lesson plan, supply list, RSVP list with allergy/dietary info.

---

## Test Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Security | 3 | 2 | 3 | 1 | 9 |
| Validation | 0 | 3 | 4 | 2 | 9 |
| UI/UX | 0 | 2 | 8 | 3 | 13 |
| Backend Arch | 0 | 2 | 4 | 2 | 8 |
| Frontend Arch | 0 | 1 | 3 | 2 | 6 |
| **Total** | **3** | **10** | **22** | **10** | **45** |

Plus **10 management UX recommendations** for making daily operations easier.

---

## Recommended Fix Order

**Phase 1 — Security (do first):**
SEC-01, SEC-02, SEC-03, VAL-01, VAL-02, VAL-03, SEC-05

**Phase 2 — Core UX:**
UI-01, UI-02, UI-03, UI-06, UI-08, FE-01, SEC-06

**Phase 3 — Data Integrity:**
SEC-04, SEC-07, VAL-04, VAL-05, ARCH-02, ARCH-05

**Phase 4 — Management Features:**
MGMT-01, MGMT-02, MGMT-06, MGMT-10

**Phase 5 — Polish:**
Everything else
