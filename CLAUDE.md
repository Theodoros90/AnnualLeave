# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WorkTrack is a full-stack leave management and timesheet tracking application built with ASP.NET Core 10 and React 19 (TypeScript + Vite). See [Architecture](#architecture) for the layer layout — it is layered, but deliberately not dependency-inverted.

## Commands

### Backend (.NET)

```bash
# Run from API/ directory or solution root
dotnet run --project API
dotnet build
dotnet test

# Database migrations (run from solution root)
dotnet ef migrations add <MigrationName> --project Persistence --startup-project API
dotnet ef database update --project Persistence --startup-project API
```

### Frontend (React)

```bash
# Run from client/ directory
npm run dev        # Start Vite dev server (http://localhost:5173)
npm run build      # tsc -b && vite build
npm run lint       # eslint .
npm run preview    # Preview production build
```

### Running Full Stack

Run `dotnet run --project API` (port 5000) and `npm run dev` in `client/` concurrently.

## Architecture

The solution is **layered but not dependency-inverted**. Don't assume the textbook
Clean Architecture graph — `Application` references `Persistence` on purpose. The
actual project references:

```
Domain          → nothing (entities, enums, service contracts)
Persistence     → Domain (AppDbContext, EF configs, migrations)
Application     → Domain + Persistence (MediatR CQRS)
Infrastructure  → Domain (Email, holidays, config)
API             → Application + Infrastructure
client/         → React SPA (separate)
```

Note `Infrastructure → Domain`, not `Application`: the contracts it implements live in
`Domain/Interfaces/` (e.g. `IEmailService`).

**EF Core is the persistence abstraction — there is no repository layer.** This is a
deliberate trade, not drift: roughly 70 of `Application`'s ~150 files inject
`AppDbContext` straight into handlers, which query with LINQ and project to DTOs. What
that means when adding code:

- Inject `AppDbContext` into the handler constructor, like every existing handler does.
  Do **not** introduce `IRepository`/`IUnitOfWork` interfaces for new features.
- Handler tests run against a real EF provider, not mocks. `Tests/WorkTrack.Tests/`
  offers two: `TestDb` in `TestSupport.cs` (EF in-memory — fast, but enforces no constraints and
  ignores transactions) and `TransactionalTestDb` (SQLite in-memory — real transactions,
  enforced unique indexes and foreign keys). Assert on constraint or transaction
  behaviour only against the latter.
- Swapping the ORM would mean touching `Application`. That cost was accepted in exchange
  for dropping a layer of indirection over `DbContext`, which is already a unit of work
  plus a set of queryable repositories.

### Backend Patterns

**CQRS via MediatR:** Business logic belongs in `Application/*/Queries/` and `Application/*/Commands/`. Controllers should be thin — dispatch to MediatR, then call `HandleResult<T>()`. Two existing exceptions to follow *away* from, not copy: `API/Controllers/TimesheetEntriesController.cs` does its entry CRUD directly against `AppDbContext`, and `AnnualLeavesController`/`TimesheetsController` query it to resolve SignalR notification audiences. `API/Hubs/`, `API/BackgroundServices/`, and the health checks also use `AppDbContext` directly, which is fine — they sit outside the request/handler path.

**Result<T> pattern:** Handlers return `Result<T>` (never throw for business errors). `BaseApiController.HandleResult<T>()` maps these to HTTP responses consistently.

**Validation pipeline:** `FluentValidation` validators auto-run via MediatR's `ValidationBehavior` pipeline behavior. Add a validator class in the same folder as the command/query.

**Full-replace update DTOs:** `AdminUpdateUserDto` is a replace, not a patch — `UpdateAdminUser` assigns every field it carries unconditionally, so a `null` in the request genuinely clears the stored value. Anything added to it has to follow that: mixing in a "a null leaves the stored answer alone" rule for one field gives a field that looks editable but quietly refuses to be cleared. A nullable field on such a DTO therefore needs a way for the UI to *send* null — hence the explicit "Not specified" radio beside `User.Gender`.

**Authorization:** Policy-based (`"AnnualLeaveRead"`, `"AnnualLeaveCreate"`, etc.) defined in `API/Program.cs`. Roles: `Admin`, `Manager`, `Employee`. Managers are scoped to their departments in queries.

### Frontend Patterns

**Hash-based routing:** `App.tsx` reads `uiStore.currentPage` (a hash-style string) to decide which component to render. There is no router library — navigation happens by setting `uiStore.currentPage`.

**State split:** MobX (`authStore`, `uiStore`) holds client-only UI/auth state. React Query handles all server state (fetching, caching, invalidation).

**Real-time:** SignalR hub at `/hubs/notifications` sends `notificationsUpdated` events. `App.tsx` listens and calls `queryClient.invalidateQueries()` to refresh relevant caches.

**API client:** Axios instance at `client/src/lib/api/client.ts` (base URL `http://localhost:5000/api`, includes credentials). API modules in `client/src/lib/api/` are thin wrappers returning typed responses.

## Domain Model Summary

| Entity | Key Fields |
|--------|-----------|
| `User` | Extends `IdentityUser`; has `DisplayName`, `ImageUrl`, `IsActive` (may this account sign in — a leaver is switched off rather than deleted, since `DeleteAdminUser` nulls out every approval they gave). `DateOfBirth` and `Gender` are recorded HR data an admin maintains on the Users panel. **`Gender` decides who is offered Maternity and Paternity Leave** — see [Who is offered parental leave](#domain-model-summary) below the table. It is nullable and `null` means "not specified", which the dialog offers explicitly so a value set by mistake can be taken back — see **Full-replace update DTOs** under [Backend Patterns](#backend-patterns) — and a `null` is offered **both** parental types rather than neither |
| `AnnualLeave` | `EmployeeId`, `StartDate/EndDate`, `Status` (enum), `TotalDays` (computed, no weekends). `ChildId` is nullable — required on a request against a `PerChildEntitlement` type, `null` on every row predating the feature (and on any request against a type that isn't per-child), and a `null` `ChildId` counts against no per-child ledger |
| `LeaveType` | `Name`, `IsActive`, `AffectsBalance` (is it deducted from the enforced pool), `DefaultAllowance` and `MaxCarryoverDays` — the allowance and the year-end cap that bounds it (and which it in turn bounds: a cap may not exceed the allowance, and is nullable, `null` meaning no cap at all), both per type and both edited **only** on Leave Types. See [Leave is configured once](#domain-model-summary). `PerChildEntitlement` plus its three numbers (`PerChildTotalWeeks`, `PerChildWeeksPerYear`, `ChildEligibleUntilAge`) configure the second, per-child ledger — see [the two leave ledgers](#domain-model-summary) below the table. `AttachmentPolicy` decides whether a request needs a supporting document, and is enforced on create and edit — see [the attachment policy](#domain-model-summary) below the table. Annual, Maternity and Paternity Leave are **built-in** (`Domain/SystemLeaveTypes.cs`): they cannot be renamed or deleted, though every other setting on them stays editable. Keyed by name, which is sound only because the name is frozen and already unique case-insensitively; `LeaveTypeDto.IsSystem` derives the flag so the client keeps no copy of the list. Annual leave additionally cannot be **disabled** — it is the type the enforced pool is a budget for — but Maternity and Paternity can be, for an organisation that does not offer them |
| `AnnualLeave` (cont.) | `Duration` (`Full`/`HalfDayMorning`/`HalfDayAfternoon`) decides whether the request costs whole days or 0.5 of one, and `TotalDays` is **decimal** because of it. `Full` is 0, so every row predating the column reads as the full day it was charged as. A half day covers exactly one date and is refused on a type whose `HalfDayAllowed` is off — see [A half day is stored and charged](#domain-model-summary) below the table |
| `Timesheet` | `EmployeeId`, `PeriodStart/End`, `TotalHours`, `Status` (Draft→Submitted→Approved/Rejected), `DepartmentId` (nullable — the department it was filed under, kept for history so it outlives its author's move; null when the author has none, i.e. an Admin, matching `AnnualLeave.DepartmentId`) |
| `TimesheetEntry` | `TimesheetId`, `ProjectId`, `Date`, `HoursWorked` (decimal 4,2), optional `ActivityTypeId`, `ProjectTypeId` and `ProjectComponentId`. One entry per project **+ type + component** per date |
| `Project` | `Name` (unique), `Code` (unique), `IsActive`; belongs to many `Department` via `ProjectDepartment` (which departments can see it), narrows activities via `ProjectActivityAssignment`, components via `ProjectComponentAssignment`, and its kinds of engagement via `ProjectTypeAssignment` |
| `EmployeeProfile` | Links `User` to `Department`, tracks leave entitlement. `DepartmentId` is **nullable, and null is what an Admin gets** — the role sees every department, so belonging to one grants nothing, and an invented assignment counted for real (headcount, attendance warnings, `DeleteDepartment` blockers). The validators enforce it both ways: required for Employee/Manager, refused for Admin. Anything grouping profiles by department must skip the nulls. `AnnualLeaveEntitlement` and `LeaveBalance` are the pool the API enforces on approval, but are **derived from the annual-leave allowance, never edited per person** — see [Leave is configured once](#domain-model-summary) below the table. **A stored 0 switches the balance check off entirely** (`AnnualLeaveBalanceCalculator.CheckSufficientBalanceAsync`), so never write one. `HasChildren` is a tri-state (`null` = never asked, `false` = declared none, `true` = has some) — `HasChildrenDeclaration` refuses `false` while any `Child` row still points at the profile. `EmploymentStartDate` follows `DepartmentId`'s rule exactly — **required for Employee/Manager, refused for Admin** — because both live in the dialog's Profile section, which is hidden for an Admin; see [The employment start date](#domain-model-summary) below the table |
| `Child` | One declared child of an `EmployeeProfile`: `Name`, `DateOfBirth`. **Age and eligibility are never stored** — both are computed on every read (`PerChildLeaveCalculationService`), which is what makes a child aging out of paternity leave automatic. Deleting a child with leave against them is refused (`DeleteChild`, and the FK is `Restrict`): the row is what the per-child ledger is queried by, so removing it would erase the record of leave actually taken. An aged-out child is kept and reads as ineligible. Managed from **two** surfaces, both rendering `ChildrenSection`: the employee's own Edit profile (sidebar), which also asks the `HasChildren` Yes/No, and **Users → Edit User → Profile**, where an admin maintains them for an employee by passing that person's user id. `ChildAccessResolver` is the authority on who may touch whose — self and Admin read/write, Manager read-only within their department scope. The declaration is not asked on the admin surface (it is the employee's own statement) but is still recorded, because `CreateChild` sets `HasChildren = true` |
| `ProjectComponent` | Org-wide catalogue of deliverables (DM, Lasernet, jDocs): `Name` (unique), `Icon`, `ColorKey`, `IsActive`. Projects declare theirs via `ProjectComponentAssignment`, and a `TimesheetEntry` logs against one — narrowed by its project the same way the activity is |
| `ProjectType` | Org-wide catalogue of engagement kinds (Task, Issue, Inquiry, Support): `Name` (unique), `Icon`, `ColorKey`, `IsActive`. Projects carry any number via `ProjectTypeAssignment`, or none; a type projects still carry cannot be deleted. A `TimesheetEntry` also logs against one — narrowed to the types its project carries, and the field that narrows its project picker |
| `StoredFile` | An uploaded file's bytes in the database: `Content` (varbinary(max)), `FileName`, `ContentType` (**detected**, never the caller's claim), `Sha256` (also the HTTP ETag), `SizeBytes`, `UploadedById`. `Purpose` (`ProfileImage`, `LeaveEvidence`) drives both what the upload accepts and who may read it back |

Status enums: `AnnualLeaveStatus` (Pending, Approved, Rejected, Cancelled); `TimesheetStatus` (Draft=0, Submitted=1, Approved=2, Rejected=3, Resubmitted=4).

**Leave is configured once, for everyone, on Leave Types.** Both numbers that describe
an annual-leave budget are columns on the type flagged `AffectsBalance` (annual leave,
in practice): `LeaveType.DefaultAllowance`, how many days it grants, and
`LeaveType.MaxCarryoverDays`, how many unused ones survive the year end. One row, and
the Leave Types screen is the only place either is edited.

Leave Settings (`AppSettingsPanel`) **quotes** both — the carryover preview is
meaningless without them — but no longer edits either, and saves no leave type. It
used to edit both: the allowance as a second surface onto the same column, and the cap
as an org-wide `AppSettings.MaxCarryoverDays` sitting a screen away from the allowance
it bounds, with no way to say that sick leave carries nothing while annual leave
carries five. The column is gone (migration `MoveCarryoverCapToLeaveType`, which
copied the configured cap onto the `AffectsBalance` type first).
`client/src/lib/leave-allowance.ts` reads both figures (`annualLeaveAllowance`,
`annualCarryoverCap`).

**The cap is nullable, and all three of its readings mean something different:**
`null` is no cap — every unused day carries; `0` is the opposite — nothing carries,
an ordinary policy, unlike a 0 allowance, which is a hazard; `N` caps at N days and
**may not exceed that type's own `DefaultAllowance`** (`UpsertLeaveTypeRequestValidator`).
The bound is what migration `BoundCarryoverCapToTheAllowance` added, along with the
nullability and a clamp of any stored cap above its allowance. Before it, the cap was
checked against the calendar alone, so annual leave could grant 23 days a year and
carry over 80 — reachable only after four straight years of taking none, so it read
like a limit and behaved like none. That policy is real, but it is now the field left
blank rather than a number chosen to be out of reach.

Note the cap and the allowance are not the same quantity at year end: a closing balance
is last year's carry-in plus this year's allowance, so 23 days carried into a 23-day
year closes at 46 and a cap of 23 still expires 23 of them. That is why "carry
everything" is `null` and not `cap = allowance`. `splitAtCarryoverCap` in
`leave-allowance.ts` is the one place that arithmetic lives, and a `null` must never be
flattened to 0 on the way to it — the two are opposites. Nothing performs a rollover
yet: the figure drives the preview on Leave Settings and the leave type's card. A
per-child type has no cap at all (the dialog hides the field and sends 0) — that ledger
is bounded by the child's age, not by the leave year.

`EmployeeProfile.AnnualLeaveEntitlement` and `LeaveBalance` are **derived, never
edited per person**. Only three things write them, all from the allowance:
`CreateAdminUser` on hire, `UpdateLeaveType` when the allowance moves (it re-stamps
every profile and recomputes balances), and `DbInitializer.FixZeroEntitlementProfiles`
for anything sitting at 0. `EditEmployeeProfileRequest` deliberately carries neither
field — when it did, a dialog that had stopped showing the input still echoed a stale
value back.

Two rules that follow, both learned the hard way:

- **Never write a 0 entitlement.** `AnnualLeaveBalanceCalculator.CheckSufficientBalanceAsync`
  returns early on `<= 0`, so a 0 does not mean "no allowance" — it means *no balance
  check at all* for that employee. `UpdateLeaveType` refuses a 0 allowance outright for
  this reason.
- **Do not add an org-wide allowance or carryover setting back.** `AppSettings` used to
  carry a third allowance, `DefaultAnnualEntitlement`, free to disagree with the leave
  type and by default doing so (20 against 25). It is gone (migration
  `RemoveAppSettingsDefaultAnnualEntitlement`), and every profile was aligned to the
  allowance by `AlignEntitlementsWithAnnualLeaveAllowance`. `MaxCarryoverDays` followed
  it onto the leave type for the same reason (`MoveCarryoverCapToLeaveType`).

The client mirrors this in `client/src/lib/leave-allowance.ts`; a type that sets no
allowance reads as 0 and renders "—".

**There are two leave ledgers, and they are disjoint.** The pooled one is
`EmployeeProfile.LeaveBalance`, kept by `AnnualLeaveBalanceCalculator` for the type
flagged `AffectsBalance`. The other is per child, enforced by
`PerChildLeaveBalanceCalculator` for a type flagged `PerChildEntitlement` — paternity
leave, which is not one budget per employee but one per child:
`PerChildTotalWeeks` (18) weeks per child, `PerChildWeeksPerYear` (5) per leave year,
until the child reaches `ChildEligibleUntilAge` (15). A week is **5 business days**
(`PerChildLeaveCalculationService.BusinessDaysPerWeek`), so 18 weeks is 90 business
days and weekends and public holidays inside a request consume nothing.

`UpsertLeaveTypeRequestValidator` refuses a type that sets both flags: counted in
both, one day of leave would be charged twice.

**`PerChildEntitlement` is not a free-standing setting — only Maternity and
Paternity Leave may carry it** (`SystemLeaveTypes.PerChildEntitlementTypes`, also
enforced by `UpsertLeaveTypeRequestValidator`). The ledger is keyed by
`AnnualLeave.ChildId` and a request against a per-child type must name a child,
which only means anything for the leave a birth grants; it was previously a switch
on every type, so a per-child ledger could be put on sick leave. The edit dialog
therefore has **no toggle**: it shows the three numbers unconditionally for those
two types, driven by the server-derived `LeaveTypeDto.SupportsPerChildEntitlement`,
and shows no section at all for anything else. Note the dialog falls back to
18/5/15 when a stored number is 0 (`||`, not `??`) — a per-child type with a 0 in
any of the three is refused by the validator, so a 0 reaching the field would open
the form already invalid. Maternity Leave is seeded with those columns at 0, so
that fallback is reachable, not theoretical.

The per-child ledger is **stored nowhere** — it is a projection over approved leave
rows, grouped by `AnnualLeave.ChildId`. That is why a child turning 15 needs no job
and no recalculation: their usage stays in history, their remaining entitlement is
simply gone, and the employee's totals (which cover eligible children only) fall on
the next read. `GetChildLeaveEntitlements` reads usage through the same
`PerChildLeaveBalanceCalculator` helpers that enforce it, so a screen cannot promise
more than the API will approve.

Two differences from the pooled balance worth knowing:

- **A 0 refuses everything here, rather than switching the check off.** The opposite
  of `AnnualLeaveEntitlement`, where `CheckSufficientBalanceAsync` returns early on
  `<= 0`. `UpsertLeaveTypeRequestValidator` refuses saving a 0 in any of the three
  fields once `PerChildEntitlement` is on, but the runtime arithmetic agrees even if
  a 0 ever got in some other way: `RemainingDays` floors at zero, so a 0 total leaves
  nothing to approve rather than nothing to check.
- **The per-child check runs at creation even when the type requires approval**
  (`CreateAnnualLeave`), unlike the pooled check, which only runs at creation for an
  auto-approving type. A per-child refusal is something the employee can act on;
  waiting days for a manager to hit it helps nobody. It is re-checked on the
  transition into `Approved` in `UpdateLeaveStatus` — so, as with the pooled balance,
  several *pending* requests can each pass creation and the second *approval* is what
  fails.

**Who is offered parental leave.** Maternity and Paternity Leave are shown to an
employee only when two things hold: their recorded `User.Gender` matches the type
(Maternity → Female, Paternity → Male), and they have at least one child young
enough to qualify. Everything else is offered to everybody.

`Application/AnnualLeaves/Commands/ParentalLeaveEligibility.cs` is the rule, called
from `CreateAnnualLeave` and `EditAnnualLeave`; `client/src/lib/parental-leave.ts`
mirrors it so the leave forms never show a card the API would refuse. Keep the two
in step — a disagreement shows up as a card that only fails when pressed. Three
things about it that are deliberate:

- **A `null` gender passes.** It means "nobody entered it", which is every account
  predating the column — not "neither". Failing closed would have stripped parental
  leave from the whole company until an admin filled the field in one person at a
  time. The eligible-child half still applies.
- **The eligible-child rule is skipped for a type with its own per-child ledger.**
  Paternity Leave already refuses a request naming no child, a child that is not
  the employee's, or one who has aged out, each with a message naming the child and
  the date. A blunter pre-check in front of it would only make those messages
  worse. So in practice the new child rule bites on Maternity Leave, which keeps no
  per-child ledger.
- **Maternity Leave has all three per-child columns at 0**, so it has no cut-off age
  of its own and falls back to the per-child type's (Paternity's 15). Note the
  consequence: an employee expecting their first child cannot file maternity leave
  until the child is on file. That is the rule as specified, not an oversight.

On the client the filter applies to the employee's **own** request only —
`ApplyLeavePage`, and `AnnualLeaveForm` when it is not an admin filing or editing
on somebody else's behalf. An admin's own gender says nothing about the employee
they are filing for, so that path keeps the whole list and lets the server answer.
`AnnualLeaveForm` also keeps an existing request's own type on the list even when
the rule would no longer offer it, so editing an old request does not open on a
blank select.

**The attachment policy is enforced, not advertised.** `LeaveType.AttachmentPolicy`
(`None`/`Optional`/`Required`) decides whether a request may be filed without a
supporting document. Only `Required` refuses anything — `Optional` is encouragement
rendered in amber and `None` offers no upload at all, and if either could refuse, an
admin nudging a type towards documentation would lock employees out of it instead.

`Application/AnnualLeaves/Commands/AttachmentPolicyRule.cs` is the rule, called
from `CreateAnnualLeave` and `EditAnnualLeave`;
`client/src/lib/attachment-policy.ts` mirrors it so neither leave form offers a
submit the API is certain to refuse. Keep the two in step, the same way
`ParentalLeaveEligibility` and `parental-leave.ts` are kept in step.

Four things about it that are deliberate:

- **`None` means the section is not there.** `isAttachmentOffered` in
  `attachment-policy.ts` decides that: a type set to *No attachment needed* drops
  step 5 off `ApplyLeavePage` (and its "Attachments" summary row) and the evidence
  block off `AnnualLeaveForm` entirely, rather than rendering the dropzone under an
  "(optional)" label. Two consequences to keep. A form that hides the section must
  **drop any file staged behind it** — both forms do, in an effect on the flag —
  or it uploads on submit with nothing on screen saying so. And evidence a request
  *already carries* keeps the block visible in `AnnualLeaveForm` even under `None`:
  that dialog is the only place to open it, and a policy moved to `None` afterwards
  must not hide a document somebody actually filed. Note a fresh form with no type
  chosen reads as `none` too, so the step appears only once a type asks for one.
- **It was display-only until this rule.** The admin dialog saved the policy and
  the leave type's card rendered it, while `ApplyLeavePage` decided the same thing
  from the type's *name* — anything containing "sick" got the amber label, and
  everything else read "(optional)". So a type set to *Attachment required* changed
  nothing an employee could see and submitted happily with no document. The name
  now only picks the wording of step 5's subtitle ("a doctor's note" beats "a
  supporting document" where we can tell); the policy decides everything else.
- **There is no exemption, and it will bite on real data.** An admin filing on
  somebody's behalf is refused like anyone else, and a request filed *before* the
  policy was set to `Required` carries no evidence — so editing one, even to fix
  the reason, means attaching a document first. That is the rule as chosen, not an
  oversight.
- **Whitespace is not an attachment.** `AnnualLeave.EvidenceUrl` is free text, so
  the check trims before believing it.

**A half day is stored and charged, not just offered.** `AnnualLeave.Duration`
(`Full`/`HalfDayMorning`/`HalfDayAfternoon`) is what makes the apply page's
"Half day (AM)" and "Half day (PM)" buttons mean anything.
`Application/AnnualLeaves/Commands/HalfDayRule.cs` is the rule, called from
`CreateAnnualLeave` and `EditAnnualLeave`; `client/src/lib/half-day.ts` mirrors it
so neither form offers a submit the API is certain to refuse. Keep the two in step,
the same way `AttachmentPolicyRule` and `attachment-policy.ts` are kept in step.

It was display-only before. The buttons showed for every type regardless of
`LeaveType.HalfDayAllowed`, the payload carried no duration at all, and the summary
panel's "Days deducted 0.5" was a number the server never charged — a half day was
stored and deducted as a whole one. `LeaveCalculationService.CalculateChargeableDays`
and the `LeaveDuration` enum were written for this and had no callers.

Six things about it that are deliberate:

- **A half day covers exactly one date**, and `HalfDayRule` refuses anything wider.
  This is where the bug was most visible: the calendar's first click sets the start
  and clears the end, which is right for a range and wrong for a half day — the form
  sat at "End date —, Working days 0" with submit disabled and no way forward but
  clicking the same cell twice. `collapseToHalfDay` in `half-day.ts` is the one place
  that correction lives, and both forms run it.
- **The charge is a flat 0.5, not `businessDays * 0.5`.** A half day is half a day,
  not half of however many days the range covers; the old expression would have
  billed 2.5 days for a week-long request calling itself a half day.
- **A half day on a weekend or public holiday charges 0 and is *not* refused**,
  matching a full-day request over the same dates, which counts 0 rather than being
  refused. A stricter rule for half days alone would be a surprise with nothing
  behind it.
- **`EmployeeProfile.LeaveBalance` is `decimal(5,2)`; `AnnualLeaveEntitlement` stays
  `int`** (migration `AddLeaveDurationAndFractionalBalance`). An allowance is stamped
  from `LeaveType.DefaultAllowance` and is always whole days — only what is left of
  one can be a fraction. `AnnualLeaveDto.TotalDays` is decimal for the same reason,
  and lost the `[Range(1, int.MaxValue)]` that would now reject 0.5.
- **Both ledgers charge 0.5, not just the pooled one.** `PerChildLeaveBalanceCalculator`
  counts chargeable days too, so a half day taken against a child consumes 0.5 of
  that child's ledger. Paternity Leave is seeded `HalfDayAllowed = false`, but an
  admin can turn it on, and a ledger that disagreed with the request would be worse
  than the restriction.
- **`AnnualLeaveForm` needs its own duration control because it is a full replace.**
  It posts every field it holds, so a field it does not hold is a field it silently
  resets — without the control, an admin fixing a typo in the reason would promote a
  half day to a full one and take another half day off the balance. Its reset effect
  is guarded on the leave type having *resolved*, not just on `halfDayOffered`: the
  type list lands a tick after the dialog opens, and until it does every type reads
  as "no half days", which would wipe the duration before anyone touched anything.

**The two limits on the leave type are enforced, in different units.**
`LeaveType.MinNoticeDays` bounds how soon a request may start and
`LeaveType.MaxConsecutiveDays` how long it may run.
`Application/AnnualLeaves/Commands/NoticePeriodRule.cs` and `MaxConsecutiveRule.cs`
are the rules, called from `CreateAnnualLeave` and `EditAnnualLeave`;
`client/src/lib/leave-limits.ts` mirrors both. Keep them in step, the same way
`AttachmentPolicyRule` and `attachment-policy.ts` are kept in step.

Both were display-only before. The admin dialog saved them and the type's card
rendered "Minimum 7 days notice required" and "Max 15 consecutive days per
request", while `ApplyLeavePage` warned "Short notice" below a hardcoded seven
days for every type alike and never mentioned length at all — the same shape of
guess as the old `name.includes('sick')` attachment sniff. A type asking 30 days
notice changed nothing an employee could see.

Five things about them that are deliberate:

- **Notice is counted in calendar days; the maximum in business days.** "30 days
  notice" is how an HR policy states it, and the card says "days notice" plainly.
  The maximum instead counts what `AnnualLeave.TotalDays` holds, so "17
  consecutive days" and "17 days deducted" are the same 17 — which is what the
  seeded data already assumed: Paternity Leave's 25 is exactly its
  `PerChildWeeksPerYear` of 5 at `BusinessDaysPerWeek`, and Maternity Leave's 90
  matches its own 90-day allowance.
- **A 0 in either is "no limit", not "nothing allowed"** — the opposite reading of
  a 0 `DefaultAllowance`, and the same trap `MaxCarryoverDays` documents.
- **Notice is re-checked on an edit only when the start date moves.** It is the
  one limit with a clock in it: a request filed properly in advance drifts towards
  its own start date every day it sits there, so checking it on every edit would
  strand it — the reason could not be corrected the morning before a trip. The
  maximum has no clock and is checked on every edit. Neither is re-checked in
  `UpdateLeaveStatus`: re-testing notice at approval would refuse leave purely
  because the manager was slow.
- **No exemption for an admin**, matching `AttachmentPolicyRule`. Note this bites
  on real data: Maternity is seeded at 30 days notice and Sabbatical at 60, and
  nothing enforced them before, so requests that were accepted yesterday are
  refused now.
- **`AnnualLeaveForm` blocks on notice but only *warns* on length.** Its
  `requestedDays` excludes weekends but not public holidays — that dialog has no
  holiday list — so the figure only ever errs high, and blocking on it would
  refuse requests `MaxConsecutiveRule` allows. `ApplyLeavePage` has the holiday
  set and blocks on both. A mirror may under-refuse; it must never over-refuse.

`ApplyLeavePage` also dims calendar days inside the notice period, so the limit
reads like the weekends and public holidays beside it — but only for a type that
actually asks for notice, since a 0 would otherwise put the earliest start at
today and quietly ban backdating, which no rule here does.

**Coverage is announced, not just recorded.** `AnnualLeave.DelegateId` — the
colleague nominated on step 3 of the apply form — used to be a private note: stored,
rendered in a detail drawer, and told to nobody, so the nominated colleague found
out in the corridor or not at all.
`Application/AnnualLeaves/Commands/CoverageNotification.cs` is the rule that emails
them, and it is called from all three places a leave can reach `Approved`: the
auto-approving branch of `CreateAnnualLeave`, `UpdateLeaveStatus`, and the status
path of `EditAnnualLeave` (the one an admin uses from the edit dialog rather than
the approve button). Five things about it are deliberate:

- **Nothing is announced before approval.** A request can sit `Pending` for days
  and then be rejected, and a team that rearranged itself around a trip that never
  happened is worse off than one told late. The single exception is the `Coverage`
  line on the manager's new-request email, which is part of what the approver is
  deciding.
- **No delegate means no announcement at all**, not an announcement saying nobody
  is covering. The message is about coverage, so with nobody covering there is
  nothing to send — which also keeps the department's inbox for the absences
  somebody actually arranged cover for. The approver's email says
  "Coverage: Nobody nominated" precisely because they are the one person who needs
  to know it was left empty.
- **Neither message carries the leave's `Reason`.** Step 4 of the apply form
  promises the reason stays private; it reaches the manager deciding the request
  and nobody else.
- **The department is the employee's own department, and a null one announces to
  nobody** — an Admin has no department, and "the same department as nobody" is not
  a match, the same trap `ManagerNotificationRecipients` documents. A deactivated
  account is never mailed either: a leaver covers nothing.
- **Leaving `Approved` stands the delegate down**, with a note to them alone —
  cancelled leave, or an approval taken back. The department hears nothing further,
  because an absence that went away is visible on the calendar. Swapping the
  delegate on an already-approved leave likewise tells the new delegate only. Note
  what follows: **changing the dates of an announced absence re-announces nothing**,
  so the department keeps the dates it was first told.

`client/src/components/annual-leave/TeamLeavePage.tsx` renders "Covered by X" under
the employee's name on each row, not only in the view dialog, so a manager scanning
next week's absences can see who is holding the fort without opening anything.

**The employment start date is role-scoped, not universal.**
`EmployeeProfile.EmploymentStartDate` is when somebody joined — which was recorded
nowhere before. `CreatedAt` is when the *row* was written, so it reads as the day an
admin got round to keying the account in, and as the same day for everybody migrated
in at once.

It lives in the **Profile** section of the admin dialogs, beside the department and
the job title, and it carries that section's rule: **required for an Employee and a
Manager, refused for an Admin**, exactly as `DepartmentId` is. The section is already
hidden for an Admin, so the scoping needed no new surface — and refusing rather than
ignoring means a promotion to Admin *clears* the date rather than stranding a row the
Admin's own dialog cannot show. `CreateAdminUserValidator` and
`EditEmployeeProfileRequestValidator` are the rules;
`client/src/lib/validation/person.ts` mirrors them. Keep the two in step, the same
way `AttachmentPolicyRule` and `attachment-policy.ts` are kept in step.

Four things about it that are deliberate:

- **The column is nullable and nothing backfills it.** A hire date for a real
  person is not ours to invent, so the rule is what makes it mandatory: every
  account predating the column has to be given one the next time it is saved.
  That is the same trade `PersonFieldRules.ValidDateOfBirth` documents, and it
  bites the same way — an admin fixing a typo in someone's email has to supply a
  start date first. The demo seed *does* set one (two years back), because a
  seeded record the rule refuses is a demo database that has to be repaired by
  hand before anything can be saved.
- **A future date is accepted; one before their 16th birthday is not.** The
  opposite of the date of birth on both counts. A hire keyed in before their first
  day is ordinary, while a start date decades before the person was born is a typed
  year — so the check reuses `PersonFieldRules.MinimumAgeYears` and is skipped when
  no date of birth is on file, since there is then no age to disagree with.
- **The edit path reads the date of birth from the database, not the payload**
  (`EditEmployeeProfileRequest` carries none). `AdminUsersPanel`'s edit mutation
  therefore saves the *user* before the profile, so the date being checked against
  is the one just stored. Reordering those two calls breaks the age check silently.
- **It changes no behaviour.** In particular it does **not** pro-rate
  `AnnualLeaveEntitlement` for a mid-year joiner: the allowance is stamped from the
  leave type in full and is never set per person (see [Leave is configured
  once](#domain-model-summary)). The field is recorded HR data and nothing reads it
  yet.

Two more traps worth knowing, both found the hard way:

- **`Child` has no soft-delete query filter, and `EmployeeProfile`'s does not
  propagate to it.** A child row outlives a soft-deleted profile. Handlers must
  resolve a child's owner through the filtered `EmployeeProfiles` set (by
  `Child.EmployeeProfileId`) rather than through the `Child.EmployeeProfile`
  navigation, which EF Core nulls out for a soft-deleted owner — and `null` is
  `ChildAccessResolver`'s sentinel for "the caller themselves". Reading the
  navigation instead would let any authenticated employee pass as the owner of an
  orphaned child; see the comment in `Application/Children/Commands/DeleteChild.cs`.
- **The leave-type card's Enabled/Disabled toggle resubmits the whole leave type**
  (`toggleActive` in `client/src/components/admin/LeaveTypesPanel.tsx`), not just
  `isActive`. Any new `LeaveType` column has to be added to that payload as well as
  the edit dialog's, or flipping the switch silently zeroes it.

## Key Configuration

- **DB:** SQL Server. The connection string lives in **`API/appsettings.json`** —
  `Server=.` (local default instance), database `jpeople_dev`. There is no
  `appsettings.Development.json`; both `appsettings.json` and
  `appsettings.Production.json` are gitignored, so a fresh clone has neither and
  you must create `API/appsettings.json` before the first run.
  Startup runs `context.Database.MigrateAsync()` and the app **exits** if the
  database is unreachable. If the API dies moments after launch — typically after
  a reboot, when it starts before SQL Server finishes coming up — that is the
  cause; check `API/Logs/worktrack-<date>.jsonl` for "Database migration or
  seeding failed" and just start it again.
- **File uploads:** Stored in the database, not on a CDN. `Application/Files/` holds
  the `StoreFile` command (one place for signature, size and extension validation)
  and the `GetStoredFile` query (per-purpose read authorization). `User.ImageUrl` and
  `AnnualLeave.EvidenceUrl` hold a relative `/api/files/{id}` path served by
  `API/Controllers/FilesController.cs`. Rows predating this still hold absolute
  Cloudinary URLs and keep rendering — the client's `resolveFileUrl` helper
  (`client/src/lib/api/file-url.ts`) accepts both shapes.
- **Email:** Pluggable provider architecture (`Infrastructure/Services/Email/`). `IEmailProvider` has two implementations — `BrevoEmailProvider` (Brevo transactional HTTP API) and `SmtpEmailProvider` (MailKit; Gmail/Office365/Brevo relay). `EmailService` selects one at startup via `Email:Provider` (`"Brevo"` or `"Smtp"`) in `appsettings.json`. Brevo config in the `Brevo` section (`ApiKey`); SMTP config in `MailSettings`. Note: the Brevo account has "Authorised IPs" enabled. This host's public **IPv4** is allowlisted but its rotating IPv6 privacy addresses are not, so the Brevo HTTP client is pinned to IPv4 via a `SocketsHttpHandler.ConnectCallback` in `Infrastructure/DependencyInjection.cs` (otherwise .NET prefers IPv6 → intermittent 401 "unrecognised IP"). See https://app.brevo.com/security/authorised_ips.
- **Logging:** Serilog (`API/Extensions/LoggingExtensions.cs`). Console plus
  newline-delimited JSON in `Logs/worktrack-<date>.jsonl` (14 days). Every request
  log line carries a `CorrelationId`, which is also the `X-Correlation-ID` response
  header and the `traceId` in error bodies — see `API/Middleware/CorrelationIdMiddleware.cs`.
  Override levels with a `Serilog` section in appsettings.
- **Health probes:** `GET /health` is liveness (no checks); `GET /health/ready` checks
  the database (Unhealthy → 503) and the configured mail provider (Degraded → still
  200, result cached 5 minutes). Both anonymous and exempt from rate limiting. See
  `API/Extensions/HealthCheckExtensions.cs`.
  **Give a readiness probe more than 10 seconds.** The mail check is allowed 10s and
  is only cached for 5 minutes, so roughly every 5 minutes one probe pays the full
  cost of reaching the provider — 8s when it is unreachable. A probe that gives up
  sooner disconnects mid-response, and `GlobalExceptionMiddleware` now reports that
  as the caller hanging up (logged at Information) rather than as an unhandled 500;
  it used to be the latter, which is how it was found.
- **OAuth:** None. No external providers are registered — social sign-in was
  removed along with public self-registration (its callback provisioned an
  account for any unrecognised email). `AccountController.Login` is the only
  sign-in path, and `MapIdentityApi` is deliberately not mapped;
  `Tests/WorkTrack.Tests/PublicRegistrationRemovedTests.cs` keeps it that way.
- **Account deactivation:** `User.IsActive` gates sign-in, enforced inside
  Identity by `API/Security/ActiveUserSignInManager.cs` (overrides
  `CanSignInAsync`), so no sign-in path can miss it. A refusal surfaces as
  `SignInResult.NotAllowed` — the same result an unconfirmed email gives — which
  is why `Login` re-checks `IsActive` to choose between 403 "deactivated" and
  401 "not verified". Toggled by `Application/AdminUsers/Commands/SetAdminUserActive.cs`
  (`PUT /api/adminusers/{id}/active`), which refuses self-deactivation and
  rotates the security stamp so live sessions die at the next revalidation —
  `SecurityStampValidatorOptions.ValidationInterval` is lowered to 1 minute in
  `Program.cs` for that reason. Deliberately distinct from `LockoutEnd`, which
  is the 15-minute brake on password guessing (see `API/Security/LockoutPolicy.cs`).
## Improvements & Roadmap

The following areas have been identified for future enhancement to improve scalability, security, and developer experience:

### 1. Frontend & Routing
- **Standardized Routing:** Replace custom hash-based routing with `react-router` for better deep linking and browser history support.
- **Form Management:** Integrate `react-hook-form` and `zod` for robust client-side validation.
- **Code Splitting:** Implement `React.lazy` for page-level components.

### 2. API & Backend
- **Versioning:** Implement API versioning (e.g., `/api/v1`) to manage breaking changes.
- **Soft Deletes:** Add `IsDeleted` support for `EmployeeProfile` and `Project` entities.

### 3. Security & Resilience
- **Audit Logging:** Add a domain-level audit log to track status changes and sensitive modifications.

### 4. Developer Experience (DX)
- **Containerization:** Add `Dockerfile` and `docker-compose.yml` for simplified environment setup.
- **Test Coverage:** Expand unit and integration tests for leave balance logic and timesheet validations.
- **API Documentation:** Enhance Swagger with XML comments and better DTO descriptions.
