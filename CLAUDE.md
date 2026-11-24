# CLAUDE.md --- Charu Pottery E-commerce Platform

## 1. Project mission

Extend the existing application into a complete, production-ready
e-commerce platform for **Charu Pottery**, using the client requirements
in `docs/client-requirements/Charu Pottery Website Needs.pdf` as the
source of truth.

This is an existing-project integration task, not permission to rebuild
the application from scratch. Preserve working functionality and the
existing technology stack unless a documented, approved reason requires
a change.

The platform must provide two distinct experiences: - **Customer
storefront:** discovery, shopping, customer account, reviews, media,
offers and loyalty. - **Admin application:** products, orders,
inventory, customers, promotions, notifications and reporting.

The customer and admin interfaces must remain separate in navigation,
layout and access control. They may share backend services and data
models where appropriate.

## 2. Source of truth and requirement handling

1.  Read the client PDF before implementation.
2.  Convert every client requirement into a traceable requirement ID
    (for example `CP-CUST-001`, `CP-ADMIN-001`).
3.  Preserve the client's intent and terminology.
4.  Distinguish:
    -   `REQUIRED`: explicitly stated by the client.
    -   `RECOMMENDED`: useful addition proposed by engineering.
    -   `PENDING_CLIENT_DECISION`: cannot be safely implemented without
        confirmation.
5.  Never present an assumption as an approved business rule.
6.  Maintain a requirement-to-code-to-test traceability matrix.
7.  If the PDF is unavailable, stop and ask for its location. Do not
    invent its contents.

## 3. Non-negotiable engineering rules

-   Inspect the repository, Git status, existing architecture and
    project instructions before editing.
-   Preserve all pre-existing user changes. Never overwrite or revert
    unrelated work.
-   Do not rewrite working modules merely for stylistic preference.
-   Reuse existing components, API patterns, validation, authentication,
    authorization, logging and design tokens when sound.
-   Do not create duplicate models, endpoints, utilities or UI
    components without first checking for an existing equivalent.
-   Do not install, upgrade or remove dependencies without explaining
    the need and impact.
-   Do not change production environment variables, secrets, live
    databases, hosting, DNS, payment settings or deployment
    configuration unless explicitly authorized.
-   Never run destructive database commands, migrations against
    production, bulk deletes or data resets without explicit approval.
-   Do not commit, push, merge, tag or deploy unless explicitly
    requested.
-   Never expose secrets, tokens, customer personal data or credentials
    in logs, reports, screenshots or test fixtures.
-   Do not claim a feature is complete because a page or button exists.
    Verify the full user workflow from UI through API and persistence.
-   No fake success states, placeholder checkout completion, hardcoded
    production data or nonfunctional controls.
-   Ask before changing the scope of a phase or a business rule.

## 4. Required customer experience

Implement and verify the following, subject to the client-approved
decisions.

### 4.1 Home and discovery

-   Search and navigation.
-   Cart, profile and wishlist entry points.
-   Configurable, responsive promotional banner carousel.
-   Minimal product cards and product collections.
-   Featured products, new arrivals and other curated sections where
    supported by admin data.
-   Footer with Charu Pottery social links and brand information.

### 4.2 Product detail

-   Main image and image gallery.
-   Product title, description, price, availability and relevant
    specifications.
-   Variants/customization only if the business confirms the product
    model requires them.
-   Customer ratings and reviews.
-   Customer-submitted product photos/videos with moderation, file
    validation and storage controls.
-   Related products where useful.

### 4.3 Offers and brand/media content

-   Weekly updates, new launches, coupon codes and offers.
-   Social posts/reels using supported official APIs or admin-managed
    links/content. Do not scrape social platforms or assume an API is
    available.
-   Founder and co-founder profiles.
-   Workshop location and brand story.
-   Direct social media links.

### 4.4 Shopping and account

-   Cart persistence appropriate to the current architecture.
-   Wishlist.
-   Registration/login and secure session handling.
-   Customer profile and address book.
-   Checkout and order creation.
-   Payment status and order history/tracking.
-   Cancellation, return and refund workflows only according to approved
    client policies.
-   Clear validation, loading, empty, success and error states.

### 4.5 Prime Collection loyalty

Client-stated rule: after at least five purchases, a customer can order
the sixth time with a free gift and an entertainment element on the
website.

Before implementation, confirm what counts as a qualifying purchase,
treatment of cancelled/refunded/returned orders, gift
selection/availability, redemption timing and whether the reward is
automatic or customer-selected.

Implement reward eligibility on the server, with auditable purchase
counts and one-time redemption protection. Never rely only on frontend
counters. Do not allow duplicate or concurrent redemption.

## 5. Required admin experience

Keep admin routes, navigation and permissions separate from customer
routes.

### 5.1 Product catalogue

-   Create, edit, view, activate/deactivate and list products.
-   Upload and manage multiple product images.
-   Manage descriptions, pricing, categories, stock linkage and
    availability.
-   Validate inputs and image file types, sizes and upload failures.

### 5.2 Orders

-   Order list, details, filters and search.
-   Received order status and status history.
-   Customer and delivery details with appropriate access control.
-   Order source only where reliably captured.
-   Payment status and transaction references.
-   Post-delivery review visibility/moderation.
-   Safe status transitions and audit trail.

### 5.3 Inventory

-   Finished-product stock.
-   Packaging-material stock.
-   Configurable additional stock categories.
-   Stock adjustments with reason, actor and timestamp.
-   Stock movement ledger and low-stock thresholds/alerts.
-   Prevent negative or inconsistent stock unless an explicitly approved
    business rule allows it.
-   Use transactional/atomic operations appropriate to the database.
-   Do not treat a product's displayed stock number as a complete
    inventory ledger.

### 5.4 Customer database

-   Customer name, email, phone and addresses.
-   Purchase history and loyalty status.
-   Search and filters.
-   Restrict personal data access by role; avoid unnecessary data
    exposure.

### 5.5 Marketing and notifications

-   Admin-managed banners, offers and coupon codes.
-   In-app/site notifications.
-   WhatsApp promotional messaging only with recorded customer consent
    and a compliant provider/template setup.
-   Customer preferences, opt-out and suppression handling.
-   Campaign delivery status and audit history.
-   Do not send real messages during development or tests.

### 5.6 Reporting

Recommended additions, subject to scope approval: sales, order status,
best-selling products, repeat customers, inventory and campaign
summaries. Clearly label estimates and derived metrics.

## 6. Design system

Brand direction from the client: - Light warm beige and deep earthy soil
colours. - Simple, minimal, user-friendly visuals. - Premium
handmade-pottery identity. - Responsive layouts.

Use the existing design system if suitable, adapting it consistently.
Define reusable design tokens for colours, typography, spacing, borders,
elevation and responsive breakpoints. Do not copy reference brands'
assets or exact layouts. Use authentic client-provided product
photography and content; use clearly labelled placeholders only in
development.

Customer and admin should have distinct visual hierarchies while sharing
appropriate brand tokens.

## 7. Architecture and implementation expectations

First discover the actual stack. Do not assume MERN, Next.js or any
particular database.

Design around existing conventions and document: - Frontend
applications/routes and shared component boundaries. - Backend
modules/services/controllers and API contracts. - Database entities,
indexes, relationships and migration strategy. - Authentication,
sessions and role/permission model. - Product media storage and upload
security. - Payment provider integration and webhook verification. -
Shipping integration if selected. - WhatsApp provider and consent
model. - Reviews/media moderation. - Inventory transaction
consistency. - Loyalty eligibility and redemption. - Observability,
error handling, backups and recovery.

Keep business logic out of UI components. Validate untrusted input on
the server. Enforce authorization on every protected API operation, not
only by hiding UI controls.

## 8. Security, privacy and reliability

-   Apply least-privilege role-based authorization.
-   Validate and normalize all user input server-side.
-   Protect against injection, broken access control, CSRF/XSS where
    relevant, unsafe uploads, rate abuse and insecure direct object
    references.
-   Store secrets only in approved environment/secret management.
-   Verify payment webhooks and make payment/order operations
    idempotent.
-   Use secure password/session practices consistent with the existing
    stack.
-   Protect customer data and support consent/opt-out requirements.
-   Record sensitive admin actions in an audit log.
-   Avoid logging payment credentials or personal data.
-   Add pagination and sensible query limits to large lists.
-   Consider concurrency, retries and duplicate requests for stock,
    orders and rewards.

Do not claim legal or regulatory compliance without a qualified review.

## 9. Testing and definition of done

For every feature, test: - Unit/business logic. - API validation and
authorization. - Database persistence and consistency. - Customer/admin
end-to-end workflow where feasible. - Responsive UI and accessibility
basics. - Error, empty, loading and retry states. - Regression of
affected existing functionality.

At minimum verify: - Customer cannot access admin functions. -
Unauthorized users cannot access protected customer/admin data. -
Product create/edit/list and image upload work end-to-end. - Cart and
order totals are calculated server-side. - Duplicate checkout/payment
callbacks do not create duplicate orders or charges. - Inventory updates
are consistent under concurrent operations. - Loyalty rewards cannot be
redeemed twice. - Reviews and uploaded media follow moderation rules. -
WhatsApp messages are not sent without consent. - Admin actions are
auditable.

A feature is done only when implementation, tests, documentation and
acceptance criteria pass. Report any untested or blocked path
explicitly.

## 10. Client decisions --- do not guess

Maintain a decision register for at least: - Payment gateway and payment
methods. - COD availability. - Shipping provider, service areas and
delivery charges. - GST/invoice requirements. - Product
variants/customization. - Cancellation, return, refund and damaged-item
policy. - WhatsApp Business provider, templates and consent process. -
Social media accounts and API permissions. - Review and customer-media
moderation policy. - Prime Collection qualifying-purchase definition and
gift rules. - Admin roles and permissions. - Product catalogue content,
images and brand copy.

For each item, record options, recommendation, impact and approval
status.

## 11. Working method

Work in small, reviewable phases. Before each phase: 1. State the goal
and requirement IDs. 2. Inspect relevant existing code and tests. 3.
List intended files/modules and data changes. 4. Identify risks,
dependencies and rollback approach. 5. Confirm whether client decisions
block the work.

During each phase: - Implement only the approved scope. - Keep changes
focused. - Add/update tests with the feature. - Avoid unrelated
refactoring. - Keep documentation current.

After each phase: - Run relevant tests, lint, type checks and builds
available in the repository. - Review the diff and Git status. - Report
files changed, behavior delivered, tests run/results, known gaps and
next steps. - Stop and wait for approval before moving to the next
phase.

## 12. Required project documentation

Maintain under `docs/charu-pottery/`: - `requirements-traceability.md` -
`architecture.md` - `data-model.md` - `api-contracts.md` -
`client-decisions.md` - `implementation-roadmap.md` -
`testing-and-acceptance.md` - `release-and-rollback.md` -
`phase-status.md`

Do not fabricate results or mark pending decisions as approved.

## 13. Priority order

Use this as the proposed sequence, adjusting only with documented
justification:

0.  Repository and existing-system audit; requirements and decision
    register.
1.  Architecture/data/API foundation and security boundaries.
2.  Admin product catalogue and media management.
3.  Customer storefront, discovery and product details.
4.  Cart, checkout, payments and order lifecycle.
5.  Inventory ledger and admin stock workflows.
6.  Customer account, wishlist and order history.
7.  Reviews and customer-uploaded media moderation.
8.  Offers, coupons, banners and brand/media content.
9.  WhatsApp and site notifications.
10. Prime Collection loyalty.
11. Reporting, hardening, accessibility, performance and
    production-readiness.

Dependencies may change the exact order. Do not build a feature before
its required foundation is safe.

## 14. Default authorization boundary

Unless the user explicitly authorizes implementation, the initial task
is audit and planning only. Do not edit application source code, run
migrations, alter databases, install packages, change
environment/deployment settings, or commit/push/deploy. Creating or
updating the requested documentation is allowed.

When implementation is explicitly approved, approval applies only to the
named phase and scope.

## 15. Final communication format

Always report: - Current phase and status. - Requirement IDs
addressed. - What was reused versus newly built. - Files/modules
changed. - Database/API impact. - Tests run and exact outcomes. -
Security/data-integrity considerations. - Pending client decisions. -
Known limitations and risks. - Recommended next action.

Be precise. Never say "complete" when a requirement is only partially
implemented.
