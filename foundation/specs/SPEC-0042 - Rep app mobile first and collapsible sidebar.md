# SPEC-0042: Rep app – mobile first, collapsible sidebar

Status: Draft  
Owner: Neo Sleep Care  
Milestone: MVP  
Apps/Modules: rep-app

## 1) Goal
Rep app is designed mobile first; the sidebar can be collapsed, and the collapse/expand control is at the bottom (thumb-friendly). Sidebar state is persisted.

## 2) User story
As a rep I mainly use the app on my phone; I want the sidebar collapsed or expanded and to toggle it with one button at the bottom, without reaching to the top of the screen.

## 3) UX flow
- **Sidebar** is for **modules** only (navigation: Dashboard, HCP, HCO, Planner, etc.). Collapse/expand button **at the bottom** of the sidebar (mobile first: thumb zone).
- **Theme and language** are on the **right** in the **user menu**: round avatar, user name, **role label** (e.g. Sales Rep; source TBD). On click a small menu (dropdown) opens to change theme (light/dark) and language.
- Sidebar is open by default (state stored in localStorage). When collapsed: module links only (icons/short labels).
- Sidebar state stored in `rep-sidebar-collapsed` (true/false).

## 4) Data & API
- localStorage: `rep-sidebar-collapsed`. No API yet.

## 5) Events & analytics
- Optional: `rep_sidebar_toggled` { collapsed: boolean } (later).

## 6) Mobile first good practices (rep-app)
- **Touch targets:** min. 44×44 px for buttons (e.g. toggle, theme, select).
- **Toggle at bottom:** easy thumb reach one-handed.
- **Safe area:** `padding-bottom: max(20px, env(safe-area-inset-bottom))` in sidebar footer so the button is not cut off (dock, notch).
- **Tap highlight:** `-webkit-tap-highlight-color: transparent` where needed.
- **Focus visible:** `:focus-visible` for keyboard navigation.
- Sidebar narrow when collapsed (~56 px) to save space for content.
- **Sidebar style:** iOS/Finder-like: grouping (heading “Modules”), icon + text per link, rounded corners, dark panel in dark mode (e.g. #262626). CSS variables: `--rep-sidebar-bg`, `--rep-sidebar-border`, `--rep-sidebar-text`, `--rep-sidebar-hover`, `--rep-sidebar-active-bg`.
- **User menu:** menu closes on language change (key behavior). Labels refresh on open (`:key="locale"`). Click on `<select>`/`<option>` does not close menu before choice (only after – close in `onLangChange`).
- **Shared components:** HCP app will be similar; plan for shared components (sidebar, user menu).
- **Module title separator line:** full width of header (16px to right edge with padding 16px); module title vertically centered in header.
- **Hamburger on iPad mini / mobile:** On small screens (e.g. breakpoint 768px, iPad mini, phones) sidebar **collapses into hamburger at bottom**. On hamburger tap a **drawer** (module list) slides up from the bottom; **max-height: 70vh** (sliver of page visible behind); dark overlay – click overlay closes menu; menu closes on module selection. Animation seamless.
- **Mobile symmetry:** On viewports &lt; 768px, header (module title, separator) and content use **symmetric horizontal padding (16px left and right)** for symmetry and readability.

## 7) Layout and styling (all breakpoints)
- **Symmetry everywhere:** Use symmetric horizontal padding and spacing in all layouts (header, content, modals). Use `--rep-content-padding-x` (default 16px) for left/right insets so separator lines, title, and content align. New views inside the app content area must not add extra outer padding; they inherit the content padding so the project look is consistent.
- **Logo and header row:** Sidebar logo block and main header share the same vertical height (`--rep-topbar-height`, 56px) so the separator under the logo and the separator under the page title meet on one horizontal line; logo is vertically centered with the title and avatar.
- **Mobile: left alignment:** On mobile, header title, content, and drawer content all use the same left padding (`--rep-content-padding-x`); everything is left-aligned with no extra margins that would break alignment.
- **Automatic styling:** New views rendered in the app layout automatically get the same content padding and typography. Rely on `theme.css` variables and the existing content container; avoid view-specific overrides for outer spacing so new screens match the project without extra work.

## 8) Acceptance criteria
- **Sidebar:** modules only (navigation). Toggle to collapse/expand **at bottom** of sidebar.
- **User menu (right):** round avatar + name + role label (e.g. Sales Rep); click opens dropdown with theme and language.
- Sidebar state (collapsed/expanded) stored in localStorage, default expanded.
- Buttons in sidebar and user menu: min. 44×44 px (touch target) where appropriate.
- Collapsed sidebar view: module links/icons only.
- **Collapse button (bottom of sidebar):** min. 44×44 px, centered, symmetric padding above and below; collapse without jump (seamless).
- **Mobile:** hamburger at bottom; on tap – menu from bottom with animation, app navigation.

## 9) Test plan
- Unit: `parseSidebarCollapsed`, `SIDEBAR_DEFAULT_COLLAPSED`, `sidebarCollapsed` in REP_STORAGE_KEYS.
- i18n: keys `layout.sidebar.expand`, `layout.sidebar.collapse`, `layout.nav.modules`, `rep.user.menu`, `rep.user.placeholderName`, `rep.user.role`.
- Router: routes `dashboard`, `hcp`, `hco`, `planner` have `meta.layout === "app"`.
- AppLayout / theme: `theme.css` defines sidebar variables; test in `AppLayout.spec.ts`.
- AppLayout: collapse button – min 44×44 px, centered in footer, aria-label/title, symmetric padding; tests in `AppLayout.spec.ts`.

## 10) Documentation updates
- `foundation/modules/rep-app.md`: mobile first, sidebar toggle at bottom, symmetry, auto-styling.
- `docs/RUNBOOK_LOCAL_DEV.md` or PROJECT_STATE: mention rep-app mobile first.
