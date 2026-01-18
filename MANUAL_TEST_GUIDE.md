# Iris Manual Test Guide

This guide documents the **currently working GUI functionality** and how to verify it through the browser. Update this guide as features are added.

**Last Updated:** 2024-01-16
**Current Phase:** Phase 14 (WebUI Shell)

---

## Quick Start

```bash
bun run dev:all
```

Open http://localhost:5173 in your browser.

---

## 1. Home Page - Project List

### 1.1 View Projects
1. Open http://localhost:5173
2. **Verify:**
   - "Projects" heading displays
   - Project list shows existing projects OR "No projects yet" message
   - Sidebar shows project dropdown at top

### 1.2 Create a Project
1. Click the project dropdown in the sidebar
2. Click "Create New Project"
3. A new tab opens with a "Create New Project" form
4. Type a name (e.g., "My Test Project")
5. Optionally enter a project path
6. Click "Create Project" button
7. **Verify:**
   - New project tab opens
   - Project appears in the sidebar dropdown
   - Page navigates to project detail

---

## 2. Project Detail Page

### 2.1 Navigate to Project
1. From home page, click on any project in the list
2. **Verify:**
   - URL changes to `/projects/{project-id}`
   - Project name displays as heading
   - "← Projects" back link appears

### 2.2 View Project Sections
1. On project detail page, verify these sections exist:
   - **Sessions** - Shows "No sessions yet" or list of sessions
   - **Missions** - Shows "No missions yet" or list of missions
   - **Running Processes** - Shows "No running processes" or list of processes

### 2.3 Navigate Back
1. Click "← Projects" link
2. **Verify:** Returns to home page with project list

---

## 3. Sidebar

### 3.1 Project Selector
1. Look at the top of the sidebar
2. **Verify:**
   - A dropdown showing "Select a project" appears at the top
   - Dropdown has a folder icon and chevron
3. Click the dropdown
4. **Verify:**
   - Dropdown expands to show all available projects
   - Projects show folder icons next to names
5. Click a project in the dropdown
6. **Verify:**
   - Dropdown closes
   - Dropdown label updates to show selected project name
   - A tab opens for the project
   - Page navigates to project detail

### 3.2 Panel Switching
1. Click each icon in the sidebar (top to bottom):
   - **Files icon** → Shows "Files" panel
   - **Git branch icon** → Shows "Git" panel (Source Control)
   - **Play icon** → Shows "Run" panel (Commands & Services)
2. **Verify:**
   - Panel title changes to match selection
   - Active icon is visually highlighted
   - Panel content area updates

### 3.3 Project-Scoped Panels
1. Without a project selected:
   - Files panel shows "Select a project to browse files"
   - Git panel shows "Select a project to view git status"
   - Run panel shows "Select a project to manage processes"
2. After selecting a project:
   - Files panel shows "File browser coming soon"
   - Git panel shows "Git integration coming soon"
   - Run panel shows "No running processes"

### 3.4 Toggle Sidebar
1. Press `Cmd+B` (Mac) or `Ctrl+B` (Windows)
2. **Verify:** Sidebar collapses/hides
3. Press shortcut again
4. **Verify:** Sidebar reappears

---

## 4. Bottom Panel

### 4.1 Expand/Collapse
1. If panel is collapsed (shows as thin bar at bottom), click the up arrow or any tab label
2. **Verify:** Panel expands to show content
3. Click down arrow in panel header
4. **Verify:** Panel collapses to thin bar

### 4.2 Tab Switching
1. With panel expanded, click each tab:
   - **Output** - Shows "Output will appear here..."
   - **Problems** - Shows "No problems detected"
   - **Services** - Shows "No services running"
2. **Verify:** Tab content changes, active tab is highlighted

### 4.3 Resize Panel
1. Hover over the thin line at top of the expanded panel
2. Cursor should change to resize cursor
3. Drag up/down to resize
4. **Verify:** Panel height changes (min ~100px, max ~500px)

### 4.4 Keyboard Toggle
1. Press `Cmd+J` (Mac) or `Ctrl+J` (Windows)
2. **Verify:** Bottom panel toggles visibility

---

## 5. Tab System

### 5.1 Initial State
1. Open http://localhost:5173
2. **Verify:**
   - Tab bar is above the main content (to the right of sidebar)
   - Tab bar shows "No open tabs"

### 5.2 Opening a Project Tab
1. Click on a project in the project list
2. **Verify:**
   - A tab appears in the tab bar with the project name
   - The tab shows a folder icon
   - The project detail page loads

### 5.3 Tab Persistence
1. Open a project (creates a tab)
2. Click "← Projects" to go back to home
3. **Verify:** The project tab remains in the tab bar
4. Click the project tab
5. **Verify:** Navigates back to the project detail page

### 5.4 Closing Tabs
1. Open a project to create a tab
2. Hover over the tab
3. Click the X button that appears
4. **Verify:**
   - Tab is removed
   - Tab bar shows "No open tabs" (if no other tabs)

### 5.5 Multiple Tabs
1. Open Project A (creates tab)
2. Go back to home, open Project B (creates another tab)
3. **Verify:**
   - Both project tabs appear in the tab bar
   - Clicking each tab navigates to that project

### 5.6 Tab Deduplication
1. Open a project
2. Go back to home
3. Click the same project again
4. **Verify:** Only one tab exists for that project (not duplicated)

### 5.7 Create Project Tab
1. Click the project dropdown in sidebar
2. Click "Create New Project"
3. **Verify:**
   - A "New Project" tab opens with a + icon
   - Tab shows form with project name and path fields
4. Click the X on the tab to close it
5. **Verify:** Tab closes, returns to previous view

---

## 6. Error States

### 6.1 Backend Disconnected
1. Stop the backend server (Ctrl+C on the `bun run dev` process)
2. Refresh the browser
3. **Verify:** Error message displays: "Failed to load projects"

### 6.2 Project Not Found
1. Navigate to http://localhost:5173/projects/prj_nonexistent
2. **Verify:** "Project not found" error displays

---

## Known Limitations (Not Yet Implemented)

The following are **placeholder UI only** - not functional:

- **Sidebar panels**: Files, Git, Run panels show project-scoped placeholders - no actual content
- **Bottom panel**: Output, Problems, Services show placeholder text - no real data
- **Terminal**: No ability to type/run commands from GUI
- **Sessions**: Display only - cannot create from UI
- **Missions**: Display only - cannot create from UI
- **Processes**: Display only - cannot start from UI
- **File browser**: Not implemented (placeholder shows "File browser coming soon")
- **Git operations**: Not implemented (placeholder shows "Git integration coming soon")

---

## Troubleshooting

### Page won't load / blank screen
- Check browser console (F12) for errors
- Ensure both servers are running: `bun run dev:all`
- Try hard refresh: `Cmd+Shift+R` / `Ctrl+Shift+R`

### "Failed to load projects" error
- Ensure backend is running on port 3000
- Check terminal for backend errors

### Styles look broken
- Clear browser cache
- Restart Vite dev server
