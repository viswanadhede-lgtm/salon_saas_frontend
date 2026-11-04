# MODULE 17 — Auth Pages & Session Guards

> **Developer Documentation** | BharathBots Salon SaaS Frontend  
> **Scope**: Authentication flows, OAuth, onboarding, password management, global auth guard, session lifecycle  
> **Files Covered**: `signin.html`, `script.js`, `auth-callback.html`, `onboarding.html`, `onboarding.js`, `reset-password.html`, `reset-password.js`, `scripts/auth-loader.js`, `scripts/global-auth-guard.js`, `logout.js`, `change-password.js`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Auth Pre-Flight Blocker — `auth-loader.js`](#2-auth-pre-flight-blocker--auth-loaderjs)
3. [Sign In Page — `signin.html` / `script.js`](#3-sign-in-page--signinhtml--scriptjs)
4. [Sign Up & OTP Verification — `script.js`](#4-sign-up--otp-verification--scriptjs)
5. [Google OAuth Flow — `script.js` + `auth-callback.html`](#5-google-oauth-flow--scriptjs--auth-callbackhtml)
6. [Forgot Password Modal — `script.js`](#6-forgot-password-modal--scriptjs)
7. [Workspace Onboarding — `onboarding.html` / `onboarding.js`](#7-workspace-onboarding--onboardinghtml--onboardingjs)
8. [Password Reset — `reset-password.html` / `reset-password.js`](#8-password-reset--reset-passwordhtml--reset-passwordjs)
9. [Global Auth Guard — `scripts/global-auth-guard.js`](#9-global-auth-guard--scriptsglobal-auth-guardjs)
10. [Logout Handler — `logout.js`](#10-logout-handler--logoutjs)
11. [In-App Change Password — `change-password.js`](#11-in-app-change-password--change-passwordjs)
12. [localStorage Session Keys](#12-localstorage-session-keys)
13. [Security Summary](#13-security-summary)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Navigation                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                 ┌─────────▼──────────┐
                 │   auth-loader.js   │  ← Runs in <head> (synchronous)
                 │   (Pre-flight)     │    Blocks FOUC. No token → redirect
                 └─────────┬──────────┘
                           │ token exists
                 ┌─────────▼──────────────────────────────┐
                 │      global-auth-guard.js              │  ← Async validator
                 │   3-Gate Authorization Model           │
                 │  Gate 1: Subscription Lifecycle        │
                 │  Gate 2: In-App RBAC (Role Perms)      │
                 │  Gate 3: Plan Feature Tier             │
                 └────────────────────────────────────────┘
```

### Auth Pages Map

| Page | File | Public? | Scripts |
|------|------|---------|---------|
| Sign In / Sign Up | `signin.html` | ✅ Yes | `script.js`, `global-auth-guard.js` |
| Google OAuth Callback | `auth-callback.html` | ✅ Yes | inline `<script>` |
| Workspace Onboarding | `onboarding.html` | ✅ Yes | `onboarding.js`, `global-auth-guard.js` |
| Password Reset | `reset-password.html` | ✅ Yes | `reset-password.js`, `global-auth-guard.js` |
| All Dashboard Pages | `*.html` | ❌ No | `auth-loader.js`, `global-auth-guard.js` |

### Zero Direct DB Writes

All authentication mutations go through Supabase Auth SDK or atomic stored procedures. No HTML page performs direct `INSERT`/`UPDATE` to any table.

---

## 2. Auth Pre-Flight Blocker — `auth-loader.js`

**Location**: `scripts/auth-loader.js` — loaded synchronously in `<head>` of every protected page.

### Purpose
Prevents Flash of Unauthenticated Content (FOUC). Runs before the DOM is painted.

### Interaction Detail

#### Token Check (Synchronous IIFE)

| Step | Action |
|------|--------|
| 1 | Reads `window.location.pathname` → extracts `filename` |
| 2 | Checks against `PUBLIC_ROUTES` array |
| 3 | If public route → returns immediately (no-op) |
| 4 | Reads `localStorage.getItem('token')` |
| 5a | No token → `window.location.replace('signin.html')` |
| 5b | Token exists → `document.documentElement.style.display = 'none'` (hides page) |
| 6 | On `DOMContentLoaded` → injects `#bbAuthLoader` branded spinner overlay |
| 7 | 30-second failsafe timer → shows "Connection Timeout" with **Try Again** button if `global-auth-guard.js` hasn't resolved |

### Public Routes (Bypass Auth)

```js
const PUBLIC_ROUTES = [
    '/', '/index.html', '/signin.html', '/pricing.html',
    '/plans.html', '/onboarding.html', '/addons.html',
    '/payment-result.html', '/payments.html'
];
```

### Spinner Overlay — `#bbAuthLoader`

```
Element: div#bbAuthLoader
Style: fixed inset-0, z-index: 2147483646, background: #0f172a (dark)
Content: BharathBots logo SVG + CSS spinner (.bb-spinner) + "Verifying access..." label
Dismissed by: global-auth-guard.js calling removeAuthSpinner()
```

---

## 3. Sign In Page — `signin.html` / `script.js`

**URL**: `/signin.html`

### Interactive Elements

---

#### Button: "Sign In with Google" (`.btn-social`)

| Property | Value |
|----------|-------|
| Selector | `.btn-social` |
| Event | `click` |
| Handler | `script.js` → Google OAuth section |

**Flow**:
1. Writes `oauth_mode = 'signin'` to `localStorage`
2. Disables button, sets text to `"Redirecting to Google..."`
3. Calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '<origin>/auth-callback.html', queryParams: { prompt: 'select_account' } } })`
4. Browser redirects to Google account picker
5. On return: `auth-callback.html` processes the session (see §5)

**Error Handling**:
- OAuth error → button re-enabled, error text shown in `#signin-error`

---

#### Form: `#signin-form` — Email/Password Sign In

| Field | ID | Type | Required |
|-------|----|------|---------|
| Email Address | `#email` | `email` | ✅ |
| Password | `#password` | `password` | ✅ |

#### Button: "Sign In" (`.btn-primary` inside `#signin-form`)

| Property | Value |
|----------|-------|
| Selector | `#signin-form .btn-primary` |
| Type | `submit` |
| Event | `submit` on `#signin-form` |

**Complete Backend Flow**:

```
Step 1: supabase.auth.signInWithPassword({ email, password })
         ↓
         Returns: data.session.access_token + refresh_token
         Errors: "Invalid login credentials" etc.

Step 2: supabase.from('users')
         .select('user_id, company_id, branch_id, role_id, status, email')
         .eq('email', userEmail)
         [Fallback: .eq('user_id', user_id)]
         ↓
         Checks status ∈ { 'deleted', 'inactive' } → blocks login

Step 3: supabase.rpc('update_user_last_login_atomic', { p_email: userEmail })
         OR supabase.rpc('update_user_last_login_atomic', { p_user_id: user_id })
         ↓
         Table: public.users → updates last_login_at

Step 4: Clear stale caches:
         localStorage.removeItem('userFeatures', 'userSubFeatures', 'appContext')

Step 5: localStorage.setItem('token', token)
         localStorage.setItem('refresh_token', ...)
         localStorage.setItem('company_id', ...)
         localStorage.setItem('active_branch_id', ...)
         localStorage.setItem('role_id', ...)

Step 6: window.location.href = 'dashboard.html'  (after 1.5s success animation)
```

**DB Interactions**:

| Operation | Table | Method |
|-----------|-------|--------|
| Validate credentials | Supabase Auth | `auth.signInWithPassword()` |
| Read user profile | `public.users` | `supabase.from('users').select()` |
| Update last login | `public.users` | `supabase.rpc('update_user_last_login_atomic')` |

**Error States**:
- Invalid credentials → `#signin-error` shown (red banner)
- Account deactivated → token cleared → `#signin-error` shown
- Network error → `#signin-error` shown

---

#### Button: Password Eye Toggle (`.btn-toggle-password`)

| Property | Value |
|----------|-------|
| Selector | `.btn-toggle-password` |
| Type | `button` (prevents form submit) |
| Event | `click` |

**Flow**: Toggles `#password` input between `type="password"` and `type="text"`. Swaps SVG between eye-open and eye-off icons.

---

#### Link: "Forgot password? Reset now" (`#forgotPasswordLink`)

| Property | Value |
|----------|-------|
| Selector | `#forgotPasswordLink` |
| Event | `click` (preventDefault) |
| Action | Opens `#fwdBackdrop` Forgot Password Modal |

See §6 for full modal detail.

---

#### Link: "Create one" (`.login-link a`)

| Property | Value |
|----------|-------|
| Selector | `.login-link a` |
| `href` | `index.html` (Sign Up page) |
| Action | Navigate to registration flow |

---

#### Error State — `#signin-error`

Inline error paragraph rendered by JavaScript. Shown on:
- OAuth failure redirect (`?error=no_account`)
- Email/password auth failure
- Account deactivated

---

#### Logged Out Toast — `#loggedOutToast`

Triggered automatically when page loads with `?loggedout` query param (set by `logout.js`).

| Property | Value |
|----------|-------|
| Trigger | `window.location.search` contains `loggedout` param |
| Auto-dismiss | 3000ms + 300ms fade-out animation |
| Content | ✅ Green check icon + "Logged out successfully" / "See you next time!" |

---

## 4. Sign Up & OTP Verification — `script.js`

The sign-up form lives on `index.html` (not `signin.html`) but shares `script.js` logic.

### Form: `#signup-form`

| Field | ID | Type |
|-------|----|------|
| Full Name | `#fullname` | `text` |
| Email | `#email` | `email` |
| Phone | `#phone` | `tel` |
| Password | `#password` | `password` |

#### Button: "Sign Up" (`.btn-primary` inside `#signup-form`)

**Complete Backend Flow**:

```
Step 1: supabase.auth.signUp({ email, password, data: { full_name, phone } })
         ↓
         Two outcomes:
         A) data.session exists → email confirmation OFF → proceed to plans.html
         B) data.session is null → email confirmation ON → show OTP form

Step 2a (Session exists):
         SHA-256 hash of password via crypto.subtle.digest()
         Store in localStorage: signup_data = { full_name, email, phone, user_id, password_hash }
         localStorage.setItem('token', data.session.access_token)
         window.location.href = 'plans.html'

Step 2b (OTP required):
         Hide #signup-form
         Show #otp-form with dataset.email = email

Error: "already registered" → "Account already exists. Please sign in."
```

**Security Note**: The `password_hash` stored in `localStorage` is a **SHA-256 hash** (not plaintext), used only for local handoff to `onboarding.js` → `onboard_company_workspace` RPC. Never sent as plaintext over network.

---

### OTP Verification — `#otp-form`

Shown when Supabase email confirmation is enabled.

| Field | ID | Purpose |
|-------|----|---------|
| OTP Code | `#otp` | 6-digit email OTP |

#### Button: "Verify" (`#btn-verify-otp`)

```
supabase.auth.verifyOtp({ email, token: otp, type: 'signup' })
         ↓
         Success: localStorage.setItem('token', data.session.access_token)
                  Update signup_data.user_id with resolved ID
                  window.location.href = 'plans.html'  (after 1s)
         Error: Show #otp-error
```

#### Button: "Change Email" (`#btn-back-signup`)

Hides `#otp-form`, re-shows `#signup-form` and `.divider`/`.login-link`. No backend call.

---

## 5. Google OAuth Flow — `script.js` + `auth-callback.html`

### Phase 1 — Initiating OAuth (`script.js`)

```
User clicks .btn-social
     ↓
localStorage.setItem('oauth_mode', 'signin' | 'signup')
     ↓
supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
        redirectTo: `${window.location.origin}/auth-callback.html`,
        queryParams: { prompt: 'select_account' }
    }
})
     ↓
Browser navigates to Google OAuth consent screen
```

### Phase 2 — Callback Processing (`auth-callback.html`)

Dedicated intermediate page. Runs inline `<script type="module">`.

```
Page loads at /auth-callback.html#access_token=...&type=...
     ↓
setTimeout(handleCallback, 300ms)  ← Let Supabase parse URL hash
     ↓
supabase.auth.getSession()
     ↓
Extract: session.user, session.access_token, session.refresh_token
     ↓
localStorage.setItem('token', token)
localStorage.setItem('refresh_token', ...)
     ↓
Store signup_data (user_id, full_name, email) if not already set
     ↓
supabase.from('users').select(...).eq('email', userEmail)
[Fallback: .eq('user_id', user.id)]
```

**Decision Tree**:

```
User found in public.users?
├─ YES (Existing User):
│   ├─ status = 'deleted'/'inactive' → throw Error (deactivated)
│   ├─ Store: company_id, active_branch_id, role_id in localStorage
│   ├─ supabase.rpc('update_user_last_login_atomic', { p_email })
│   ├─ Clear stale caches (userFeatures, userSubFeatures, appContext)
│   └─ window.location.href = 'dashboard.html'  (after 1s)
│
└─ NO (New User / No DB Record):
    ├─ Read localStorage.getItem('oauth_mode')
    ├─ oauth_mode === 'signin':
    │   └─ Clear tokens → window.location.href = 'signin.html?error=no_account'
    └─ oauth_mode === 'signup':
        └─ window.location.href = 'plans.html'  (after 1s)
```

**UI Elements in `auth-callback.html`**:

| Element | ID | Purpose |
|---------|----|---------|
| Spinner | `.spinner` | CSS animation while processing |
| Status Title | `#statusTitle` | Updates dynamically ("Welcome back!", "Account created!") |
| Status Message | `#statusMsg` | Supporting text |
| Error Box | `#errorBox` | Red error banner (hidden by default) |
| Retry Button | `#retryBtn` | `onclick="window.location.href='signin.html'"` |

**DB Interactions**:

| Operation | Table/Method | Trigger |
|-----------|-------------|---------|
| Session extraction | `supabase.auth.getSession()` | Always |
| User lookup by email | `public.users` SELECT | Always |
| User lookup by user_id | `public.users` SELECT | Email lookup fails |
| Update last login | `update_user_last_login_atomic` RPC | Existing user only |

---

## 6. Forgot Password Modal — `script.js`

Dynamically injected via `injectForgotPasswordModal()` on `DOMContentLoaded`.

### Trigger

| Element | ID | Event |
|---------|----|-------|
| "Forgot password? Reset now" link | `#forgotPasswordLink` | `click` → `openModal()` |

### Modal Structure — `#fwdBackdrop` / `#fwdBox`

| Element | ID/Class | Purpose |
|---------|----------|---------|
| Backdrop | `#fwdBackdrop` | Blurred dark overlay. Click outside → `closeModal()` |
| Email Input | `#fwdEmail` | Pre-populated from `#email` signin field if filled |
| Message Area | `#fwdMsg` | Success (green) or error (red) text |
| Cancel Button | `#fwdCancelBtn` | `closeModal()` |
| Submit Button | `#fwdSubmitBtn` | Sends reset email |

#### Button: "Send Reset Link" (`#fwdSubmitBtn`)

```
Validate: email not empty
     ↓
Disable button → "Sending..."
     ↓
supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password.html`
})
     ↓
Success: 
    #fwdMsg → green "Reset link sent..." 
    .fwd-actions hidden (prevent double-send)
Error:
    #fwdMsg → red error.message
```

**Backend**: Triggers Supabase Auth email dispatch. No direct DB write.  
**Redirect Target**: `reset-password.html` (see §8)

---

## 7. Workspace Onboarding — `onboarding.html` / `onboarding.js`

**URL**: `/onboarding.html`  
**Purpose**: Collects salon & branch setup details, executes single-transaction workspace creation.

### Entry Prerequisites

| Prerequisite | Storage Key | Source |
|-------------|------------|--------|
| Auth token | `token` | `signin.html` or `auth-callback.html` |
| User data | `signup_data` | `script.js` signUp handler |
| Selected plan | `signup_data.plan_id` / `selected_plan` | `plans.html` |

### Form Fields — `#onboardingForm`

#### Column 1: Salon Details

| Field | ID | Required | Type |
|-------|----|---------|------|
| Salon / Company Name | `#salonName` | ✅ | text |
| Business Type | `#businessType` | ✅ | select: `salon` / `spa` / `clinic` |
| Business Phone | `#salonPhone` | ✅ | tel |
| Country | `#country` | ✅ | select: `IN` / `US` / `UK` / `AE` |
| Timezone | `#timezone` | ✅ | select: `Asia/Kolkata` / `America/New_York` / `Europe/London` / `Asia/Dubai` |

#### Column 2: Branch Details

| Field | ID | Required | Type |
|-------|----|---------|------|
| Branch Name | `#locationName` | ✅ | text |
| Street Address | `#branchAddress` | ✅ | text |
| City | `#city` | ✅ | text |
| State / Province | `#state` | ✅ | text |
| Pincode / Zip | `#pincode` | ✅ | text |
| Branch Phone | `#locationPhone` | ✅ | tel |

#### Plan Pill Display — `#summaryPlan`

Reads `signup_data.plan_name` or `localStorage.getItem('selected_plan')`. Display-only, no interaction.

---

#### Button: "Create My Salon & Continue" (`#btnSubmit`)

| Property | Value |
|----------|-------|
| Selector | `#btnSubmit` |
| Type | `submit` |
| Handler | `submitOnboarding()` (also attached to `#onboardingForm submit`) |

**Complete Backend Flow**:

```
Step 1: Client-side validation (9 required fields)
         → displayError() on first failed field, focus & smooth-scroll

Step 2: Resolve plan_id UUID
         Priority 1: signup_data.plan_id (from plans.js DB fetch)
         Priority 2: Live fetch from public.plans:
                      supabase.from('plans')
                        .select('plan_id, plan_name')
                        .ilike('plan_name', activePlanName)
                        .eq('status', 'active')
                        .maybeSingle()
         Priority 3: Send null → let RPC use default

Step 3: supabase.rpc('onboard_company_workspace', {
    p_data: {
        user_id, full_name, email, phone, password_hash,
        company_name, business_category, business_structure: 'single_location',
        business_phone, plan_id, plan_name,
        branch_name, branch_phone, branch_address,
        city, state, pin_code, country
    }
})
         ↓
         Returns: { success: boolean, company_id, branch_id, role_id, error? }

Step 4: Save context to localStorage:
         company_id, active_branch_id, role_id, plan_id, plan_name
         appContext = { company, branch, user }

Step 5: window.location.href = `payments.html?company_id=...&plan_id=...&plan_name=...`
         (after 800ms success animation)
```

**DB Interactions** (all inside `onboard_company_workspace`):

| Table | Action | Notes |
|-------|--------|-------|
| `public.companies` | INSERT | New company record |
| `public.branches` | INSERT | First branch |
| `public.users` | INSERT/UPDATE | Owner user record |
| `public.roles` | READ | Resolve 'Owner' role_id |
| `public.user_roles` | INSERT | Assign Owner role to user |
| `public.plan_features` | INSERT/UPSERT | Initialize plan feature row |
| `public.usage_counters` | INSERT | Initialize branch/user/staff counters |

> [!IMPORTANT]
> `onboard_company_workspace` runs as a **single ACID transaction** via `SECURITY DEFINER`. If any step fails, all insertions are rolled back atomically. No partial workspaces are created.

**Error States**:
- Missing fields → inline `#apiError` div with field focus
- RPC error → `#apiError` with `rpcErr.message`
- `res.success === false` → `#apiError` with `res.error`
- Missing auth session → "Authentication session missing!"

---

## 8. Password Reset — `reset-password.html` / `reset-password.js`

**URL**: `/reset-password.html#access_token=...&type=recovery`  
**Entry**: Only reachable from Supabase password recovery email link.

### Token Parsing

```js
const hash = window.location.hash;
const params = new URLSearchParams(hash.replace('#', ''));
// Checks params.get('type') === 'recovery' && params.get('access_token')
localStorage.setItem('token', accessToken);
// Cleans URL: window.history.replaceState({}, title, pathname)
```

If no valid recovery token → immediately shows `#invalidTokenBanner`, hides the form.

### Interactive Elements

#### Button: Password Eye Toggles (`.rp-eye`)

Two toggles: one for `#rpNewPwd`, one for `#rpConfirmPwd`.

| Property | Value |
|----------|-------|
| Selector | `.rp-eye[data-target]` |
| Event | `click` |
| Action | Toggles `input.type` between `password` / `text`. Swaps eye SVG icon |

#### Form: `#rpForm` — Reset Password

| Field | ID | Validation |
|-------|----|-----------|
| New Password | `#rpNewPwd` | Min 6 characters |
| Confirm Password | `#rpConfirmPwd` | Must match `#rpNewPwd` |

#### Button: "Reset Password" (`#rpSubmitBtn`)

```
Client validation:
   newPwd.length < 6 → show hint on #rpNewPwd (red border + message)
   newPwd !== confirmPwd → show hint on #rpConfirmPwd
     ↓
supabase.auth.updateUser({ password: newPwd })
     ↓
Success:
   localStorage.removeItem('token')     ← Invalidate recovery token
   localStorage.removeItem('refresh_token')
   showSuccess():
       Hide #rpForm, .rp-back
       Show #rpSuccess (green checkmark)
       setTimeout 2000ms → window.location.href = 'signin.html'
Error:
   /invalid|expired|not found/i → showInvalidToken() (banner)
   Other → show hint on #rpConfirmPwd
Network error → show network error hint
```

**DB Interactions**:

| Operation | Method | Notes |
|-----------|--------|-------|
| Update password | `supabase.auth.updateUser({ password })` | Uses recovery token from localStorage as Bearer |

#### Link: BharathBots Brand (`.rp-brand`)

`href="signin.html"` — Navigation back to login.

#### Link: "Sign in" (`.rp-back a`)

`href="signin.html"` — Remembered password quick-link.

#### Link: "Go to Sign In" (`#rpSuccess .rp-btn`)

`href="signin.html"` — Post-reset navigation.

#### Banner: `#invalidTokenBanner`

Shown when URL hash lacks valid `type=recovery` + `access_token`. Contains link to `signin.html` to request a new reset.

---

## 9. Global Auth Guard — `scripts/global-auth-guard.js`

**Location**: `scripts/global-auth-guard.js`  
**Loaded**: On every protected page as `<script type="module">`  
**Export**: `runGlobalAuthGuard()` (also called internally on load)

### 3-Gate Authorization Model

```
Gate 1: Subscription State Manager  (config/subscription-state-manager.js)
         → Is tenant's subscription active, expired, or in read-only mode?

Gate 2: In-App RBAC Manager         (config/rbac-manager.js)
         → Does this user's role have permission for this specific page?

Gate 3: Plan Features Manager       (config/plan-features-manager.js)
         → Is this feature included in the tenant's commercial plan tier?
```

---

### Route-to-Feature Dictionary (`ROUTE_MAP`)

Maps 45 application pages to `FEATURES.*` permission keys:

```js
'/dashboard.html'          → FEATURES.DASHBOARD_ACCESS
'/bookings.html'           → FEATURES.BOOKINGS_MANAGEMENT
'/pos.html'                → FEATURES.POS_SYSTEM
'/customers.html'          → FEATURES.CUSTOMERS_MANAGEMENT
'/staff.html'              → FEATURES.STAFF_MANAGEMENT
'/services.html'           → FEATURES.SERVICES_MANAGEMENT
'/products.html'           → FEATURES.PRODUCT_MANAGEMENT
'/memberships.html'        → FEATURES.MARKETING_MEMBERSHIPS
'/reports.html'            → FEATURES.REPORTS_ACCESS
'/expenses.html'           → FEATURES.ANALYTICS_EXPENSES
'/users.html'              → FEATURES.USER_MANAGEMENT
'/roles-permissions.html'  → FEATURES.ROLES_PERMISSIONS
'/billing-subscription.html' → FEATURES.BILLING_SUBSCRIPTION_MANAGEMENT
'/notifications.html'      → FEATURES.NOTIFICATIONS
'/support.html'            → FEATURES.SUPPORT
'/branches.html'           → FEATURES.BRANCH_MANAGEMENT
// ... 29 more pages
```

**Unmapped routes** (not in `ROUTE_MAP`) → treated as public → auth bypass.

---

### Granular Sub-Route Map (`SUB_ROUTE_MAP`)

For nested settings pages, checks an additional sub-feature permission:

```js
'/settings-business.html'  → 'settings_business'
'/settings-contact.html'   → 'settings_contact'
'/settings-hours.html'     → 'settings_hours'
'/settings-tax.html'       → 'settings_tax'
'/settings-payments.html'  → 'settings_payments'
'/settings-notifications.html' → 'settings_notifications'
'/settings-invoice.html'   → 'settings_billing'
// + 4 invoice sub-pages → 'settings_billing'
```

---

### Hot Navigation Path (Cache Hit, < 2ms)

```
localStorage.getItem('userFeatures') ✓ exists
localStorage.getItem('appContext')   ✓ exists
authCacheTimestamp within 30 minutes ✓

     ↓
Parse cached userFeatures[], userSubFeatures[], parsedCtx, subProfile, planProfile

     ↓ Gate 3 Check (Cache)
isFeatureUnlocked(featureKey, planProfile)?
     NO  → showPlanUpgradeModal(featureKey)   STOP

     ↓ Gate 2 Check (Cache)
isOwner OR userFeatures.includes(featureKey)?
     NO  → showAuthBlockModal('FEATURE_NOT_ALLOWED', ..., 'dashboard.html')   STOP

     ↓ Sub-route Gate 2 Check
requiredSubFeature AND NOT userSubFeatures.includes(requiredSubFeature)?
     NO  → showAuthBlockModal('FEATURE_NOT_ALLOWED', ..., 'company.html')   STOP

     ↓ Gate 1 Check (Cache)
subProfile.isExpired OR accessLevel === 'read-only'?
     YES → renderSubscriptionBanner('mainWrapper')   (non-blocking)

     ↓
populateGlobalHeader()      ← Hydrate header from cache
initGlobalBookingModal()    ← Init quick-booking button
initSubFeatures()           ← DOM action gating
applySubFeatureGates()      ← Hide/disable gated UI elements
removeAuthSpinner()         ← Remove #bbAuthLoader
setupTokenRefresh()         ← 25-min background token refresh
setupHeartbeat()            ← 30-min background re-validation
```

---

### Cold Start Path (Cache Miss or Stale)

```
1. JWT expiry pre-check:
   Decode token payload → check exp field
   If expires within 5 minutes → silentTokenRefresh()
        ↓ refresh fails → showAuthBlockModal('INVALID_SESSION', ...)

2. Authoritative session validation:
   fetch(`${SUPABASE_URL}/auth/v1/user`, { Authorization: Bearer token })
   401 → silentTokenRefresh()
        ↓ refresh fails → showAuthBlockModal('INVALID_SESSION', ...)
   !ok  → showAuthBlockModal('ERROR', ...)

3. Load user record:
   supabase.from('users').select(...).eq('user_id', user_id)
   status = 'deleted'/'inactive' → showAuthBlockModal + localStorage.removeItem('token')

4. Load company record:
   supabase.from('companies').select(...).eq('company_id', resolvedCompanyId)
   Store plan_id, plan_name in localStorage

5. GATE 1: getSubscriptionAccess(true)   ← Force refresh
6. GATE 3: resolvePlanFeatures(true)     ← Force refresh
   !isFeatureUnlocked → showPlanUpgradeModal(featureKey)   STOP

7. GATE 2: getUserRoleAndPermissions(true) ← Force refresh
   !hasRolePermission → showAuthBlockModal('FEATURE_NOT_ALLOWED', ...)   STOP
   Sub-route check → showAuthBlockModal if fails

8. Derive userFeatures / userSubFeatures:
   Owner/hasUniversalAccess → userFeatures = all planProfile.features
   Otherwise → filter rbacProfile.permissions by FEATURES values

9. Load supplementary data:
   supabase.from('profiles').select(...).eq('user_id', user_id)
   supabase.from('user_preferences').select(...).eq('user_id', user_id)
   supabase.from('branches').select(...).eq('company_id', ...).eq('status', 'active')

10. supabase.rpc('update_user_last_login_atomic', { p_user_id })

11. Construct appContext object:
    { user: {...}, company: {...}, branch: {...}, branches: [...], ... }
    localStorage.setItem('appContext', JSON.stringify(appContext))
    localStorage.setItem('userFeatures', ...)
    localStorage.setItem('userSubFeatures', ...)
    localStorage.setItem('subscriptionState', ...)
    localStorage.setItem('planFeatures', ...)
    localStorage.setItem('authCacheTimestamp', Date.now())

12. populateGlobalHeader() + initGlobalBookingModal()
    initSubFeatures() + applySubFeatureGates()
    removeAuthSpinner()
    setupTokenRefresh() + setupHeartbeat()
```

**DB Interactions (Cold Start)**:

| Operation | Table/Endpoint | Method |
|-----------|---------------|--------|
| Validate JWT | `auth/v1/user` endpoint | `fetch()` |
| Load user | `public.users` | `.select()` |
| Load company | `public.companies` | `.select()` |
| Load profile | `public.profiles` | `.select()` |
| Load preferences | `public.user_preferences` | `.select()` |
| Load branches | `public.branches` | `.select()` |
| Subscription state | `public.subscriptions` (via manager) | `.select()` |
| Plan features | `public.plan_features` (via manager) | `.select()` |
| RBAC permissions | `public.role_permissions` (via manager) | `.select()` |
| Update last login | `update_user_last_login_atomic` | `.rpc()` |

---

### Silent Token Refresh (`silentTokenRefresh()`)

```
localStorage.getItem('refresh_token')
     ↓
fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    body: JSON.stringify({ refresh_token })
})
     ↓
Success: localStorage.setItem('token', data.access_token)
         localStorage.setItem('refresh_token', data.refresh_token)
Failure: returns false → triggers session expired modal
```

**Timers**:
- `setInterval(silentTokenRefresh, 25 * 60 * 1000)` — proactive 25-minute refresh
- `setInterval(heartbeat, 30 * 60 * 1000)` — 30-minute full re-validation

---

### 30-Minute Heartbeat (`setupHeartbeat()`)

Runs in background every 30 minutes while user is on any page. Silently:

1. Re-fetches Gate 1 (subscription state)
2. Re-fetches Gate 3 (plan features)
3. Re-fetches Gate 2 (RBAC permissions)
4. Re-derives `userFeatures` / `userSubFeatures`
5. Updates all localStorage caches
6. Re-checks if **current page** is still accessible under new state
7. If plan feature removed → `showPlanUpgradeModal()`
8. If role permission revoked → `showAuthBlockModal('FEATURE_NOT_ALLOWED', ...)`
9. If subscription expired → `renderSubscriptionBanner('mainWrapper')`
10. Re-applies `initSubFeatures()` + `applySubFeatureGates()`

---

### Auth Block Modals

**`showAuthBlockModal(type, message, btnText, redirectUrl)`**:
- Renders a full-screen centered modal with error icon, message, and CTA button
- Used for: invalid session, feature not allowed, account deactivated

**`showPlanUpgradeModal(featureKey)`**:
- Renders a plan upgrade prompt with pricing CTA
- Redirects to `billing-subscription.html` or upgrade flow

---

### Global Contracts (Window Exports)

| Export | Type | Consumer |
|--------|------|---------|
| `window.populateGlobalHeader` | function | App shell, any page |
| `window.getActiveBranchId` | function | POS, Bookings, etc. |
| `window.uploadProfilePhoto` | function | Profile modal |
| `export populateGlobalHeader` | ESM export | Modular imports |
| `export populateDateChip` | ESM export | Header date chip |
| `export initProfilePhotoLightbox` | ESM export | Profile photo |
| `export runGlobalAuthGuard` | ESM export | Explicit call if needed |

---

### Notification Manager Auto-Load

On every protected page load, `global-auth-guard.js` injects `notification-manager.js` via dynamic `<script>` tag:

```js
(function loadNotificationManager() {
    if (window.__notifManagerLoaded) return;
    window.__notifManagerLoaded = true;
    const s = document.createElement('script');
    s.src = 'scripts/notification-manager.js';
    document.head.appendChild(s);
})();
```

---

## 10. Logout Handler — `logout.js`

**Location**: `logout.js`  
**Loaded**: All dashboard pages (via `<script src="logout.js">`)

### How It Works

Binds to logout trigger buttons via CSS selector matching:

```js
document.querySelectorAll(
    '.dropdown-item.text-danger, ' +
    'a.dropdown-item[style*="color:#ef4444"], ' +
    '#menuItemLogout'
).forEach(logoutBtn => { ... })
```

Also exposed globally: `window.openLogoutModal`, `window.closeLogoutModal`, `window.handleLogout`.

---

### Button: Logout Dropdown Item (`.dropdown-item.text-danger` / `#menuItemLogout`)

**Flow**:

```
click → e.preventDefault()
     ↓
openLogoutModal() → shows #logoutModalBackdrop
```

---

### Modal: `#logoutModalBackdrop` / `#logoutModalBox`

Dynamically injected on first trigger.

| Element | ID | Purpose |
|---------|----|---------|
| Backdrop | `#logoutModalBackdrop` | Blurred dark overlay. Click outside → `closeLogoutModal()` |
| Icon | `.logout-icon` | Red power-off SVG |
| Cancel | `#logoutCancelBtn` | `closeLogoutModal()` |
| Confirm | `#logoutConfirmBtn` | `handleLogout()` |

---

#### Button: "Yes, Logout" (`#logoutConfirmBtn`)

```
closeLogoutModal()
     ↓
handleLogout():
     showLoggingOutOverlay()  ← Full-screen "Logging you out…" spinner (#loggingOutOverlay)
     ↓
     fetch('https://qxmgyxjwpxkdbgldpdil.supabase.co/auth/v1/logout', {
         method: 'POST',
         headers: { apikey, Authorization: Bearer token }
     })
     ↓ (always, in .finally())
     localStorage.removeItem('token')
     localStorage.removeItem('refresh_token')
     localStorage.removeItem('company_id')
     localStorage.removeItem('active_branch_id')
     localStorage.removeItem('role_id')
     localStorage.removeItem('signup_data')
     localStorage.removeItem('selected_plan')
     localStorage.removeItem('userFeatures')
     localStorage.removeItem('userSubFeatures')
     localStorage.removeItem('appContext')
     ↓
     window.location.href = 'signin.html?loggedout=true'
```

> [!NOTE]
> Session invalidation is **best-effort** (`.catch()` logs warning). The local token is always cleared regardless of network state, ensuring the user is locked out locally even if the server call fails.

**DB Interaction**: `POST auth/v1/logout` — Supabase Auth server-side session revocation.  
**Tables affected**: Supabase internal `auth.refresh_tokens` (token invalidation).

---

### Overlay: `#loggingOutOverlay`

| Property | Value |
|----------|-------|
| Position | Fixed inset-0, z-index: 999999 |
| Content | Red spinner + "Logging you out…" + "Please wait a moment." |
| Dismissed | Never (page redirects) |

---

## 11. In-App Change Password — `change-password.js`

**Location**: `change-password.js`  
**Loaded**: All dashboard pages  
**Entry Point**: Profile modal → left column "Change Password" button

### Button: "Change Password" (`#btnChangePassword`)

Dynamically injected into `#profileContent > div` (left column) by `watchProfileModal()` MutationObserver when the profile modal becomes visible.

```
click → openChgPwdModal()
     ↓
Reset fields: ['cpwdCurrent', 'cpwdNew', 'cpwdConfirm'] → value='', type='password'
Clear #cpwdMismatchError
Show #chgPwdBackdrop
```

---

### Modal: `#chgPwdBackdrop` / `#chgPwdBox`

Dynamically injected on `DOMContentLoaded`.

| Element | ID | Type |
|---------|----|------|
| Current Password | `#cpwdCurrent` | password + eye toggle |
| New Password | `#cpwdNew` | password + eye toggle |
| Confirm Password | `#cpwdConfirm` | password + eye toggle |
| Error/Success | `#cpwdMismatchError` | inline text |
| Cancel | `#cpwdCancelBtn` | `closeChgPwdModal()` |
| Submit | `#cpwdSubmitBtn` | Update password |

**Password Eye Toggles** (3×): `.cpwd-toggle[data-target]` — same pattern as other forms.

---

#### Button: "Update Password" (`#cpwdSubmitBtn`)

```
Client validation:
   - newPwd or confirmPwd empty → error "Please fill in all password fields."
   - newPwd.length < 6 → error "New password must be at least 6 characters."
   - newPwd !== confirmPwd → error "Passwords do not match."

If currentPwd provided:
   supabase.auth.getUser(token) → resolve userEmail
   supabase.auth.signInWithPassword({ email: userEmail, password: currentPwd })
       error → "Current password is incorrect."   STOP

supabase.auth.updateUser({ password: newPwd })
     ↓
Success:
   #cpwdMismatchError → green "Password updated successfully."
   setTimeout 2000ms → closeChgPwdModal()
Error:
   #cpwdMismatchError → red error.message
```

**DB Interaction**:

| Operation | Method | Notes |
|-----------|--------|-------|
| Verify current password | `supabase.auth.signInWithPassword()` | Optional; only if currentPwd filled |
| Update password | `supabase.auth.updateUser({ password })` | Updates Supabase Auth user |

---

## 12. localStorage Session Keys

Complete reference of all auth-related localStorage keys managed across this module:

| Key | Type | Set By | Cleared By | Purpose |
|-----|------|--------|------------|---------|
| `token` | string (JWT) | `script.js`, `auth-callback.html`, `reset-password.js`, `silentTokenRefresh()` | `logout.js`, `reset-password.js` | Bearer access token for all API calls |
| `refresh_token` | string | `script.js`, `auth-callback.html`, `silentTokenRefresh()` | `logout.js` | Supabase refresh token for silent re-auth |
| `company_id` | UUID string | `script.js`, `auth-callback.html`, `onboarding.js`, `global-auth-guard.js` | `logout.js` | Active company context |
| `active_branch_id` | UUID string | `script.js`, `auth-callback.html`, `onboarding.js`, `global-auth-guard.js` | `logout.js` | Active branch context (switchable) |
| `branch_id` | UUID string | `global-auth-guard.js` | `logout.js` | Alias mirror of `active_branch_id` |
| `role_id` | UUID string | `script.js`, `onboarding.js`, `global-auth-guard.js` | `logout.js` | User's current role |
| `user_id` | UUID string | `global-auth-guard.js` | `logout.js` | Resolved auth user ID |
| `plan_id` | UUID string | `onboarding.js`, `global-auth-guard.js` | `logout.js` | Active plan UUID |
| `plan_name` | string | `onboarding.js`, `global-auth-guard.js` | `logout.js` | Active plan display name |
| `signup_data` | JSON | `script.js`, `auth-callback.html` | `logout.js` | Temp signup payload (email, name, user_id, password_hash) |
| `selected_plan` | string | `plans.js` | `logout.js` | Plan name chosen during plan selection |
| `oauth_mode` | `'signin'`\|`'signup'` | `script.js` | `auth-callback.html` | Tells callback which flow triggered OAuth |
| `appContext` | JSON | `onboarding.js`, `global-auth-guard.js` | `logout.js`, `script.js` (on login) | Full user/company/branch context object |
| `userFeatures` | JSON array | `global-auth-guard.js` | `logout.js`, `script.js` (on login) | Permitted feature keys for this user |
| `userSubFeatures` | JSON array | `global-auth-guard.js` | `logout.js`, `script.js` (on login) | Permitted sub-feature/action keys |
| `subscriptionState` | JSON | `global-auth-guard.js` | `logout.js` | Gate 1 subscription lifecycle profile |
| `planFeatures` | JSON | `global-auth-guard.js` | `logout.js` | Gate 3 commercial plan features profile |
| `authCacheTimestamp` | number (ms) | `global-auth-guard.js` | — | TTL anchor for 30-min cache validity |

---

## 13. Security Summary

| Security Layer | Mechanism | Location |
|---------------|-----------|---------|
| FOUC Prevention | Synchronous `auth-loader.js` in `<head>` hides page until guard resolves | `scripts/auth-loader.js` |
| Token Validation | Live `auth/v1/user` fetch on every cold start | `global-auth-guard.js` |
| Token Refresh | Silent 25-min proactive refresh + on-demand on 401 | `silentTokenRefresh()` |
| Account Status | `status ∈ {'deleted','inactive'}` check on every cold start | `global-auth-guard.js` |
| Feature Gating | Gate 2 (RBAC) + Gate 3 (Plan Tier) on every navigation | `global-auth-guard.js` |
| Sub-Feature Gating | `SUB_ROUTE_MAP` for nested settings pages | `global-auth-guard.js` |
| Read-Only Mode | Gate 1 subscription lifecycle → `renderSubscriptionBanner()` | `subscription-state-manager.js` |
| Background Sync | 30-min heartbeat re-validates all 3 gates silently | `setupHeartbeat()` |
| Logout Thoroughness | Server-side `auth/v1/logout` + full localStorage wipe | `logout.js` |
| OAuth Mode Tracking | `oauth_mode` localStorage key prevents cross-flow confusion | `script.js` + `auth-callback.html` |
| Password Security | Recovery token cleared after `updateUser()` succeeds | `reset-password.js` |
| Change Password Verification | Current password re-confirmed via `signInWithPassword()` before update | `change-password.js` |
| Zero Direct DB Writes | All auth mutations via Supabase Auth SDK or `*_atomic` RPCs | All files |

---

*End of MODULE_17_AUTH.md — All 17 modules documented.*

