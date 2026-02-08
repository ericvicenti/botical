# Botical WebUI Changes - February 8, 2026

This document summarizes the changes made to fix dotfiles visibility and add a Skills browser to the Botical web UI.

## Task 1: Fix Dotfiles Not Showing in File Browser

### Problem
The file browser was hiding dotfiles (files and directories starting with `.`) due to filtering logic in the backend API routes.

### Solution
1. **Backend Changes** (`src/server/routes/files.ts`):
   - Removed dotfile filtering in `collectFilesRecursively` function (line ~155)
   - Removed dotfile filtering in main files listing endpoint (line ~241)
   - Added `isHidden` property to `FileEntry` interface
   - Set `isHidden: entry.name.startsWith(".")` for all file entries

2. **Frontend Changes** (`webui/src/lib/api/queries.ts`):
   - Added `isHidden?: boolean` to `FileEntry` interface

### Testing
- Created comprehensive test suite in `tests/unit/server/routes/files-dotfiles.test.ts`
- Tests verify dotfiles are included in:
  - Root directory listings
  - Nested directory listings  
  - Detailed folder endpoint
- All tests pass ✅

### Notes
- The filesystem browser (`/api/filesystem/browse`) already supported dotfiles correctly
- The detailed folders endpoint (`/api/projects/:id/folders`) already supported dotfiles
- Only the basic file listing endpoints needed fixes
- `node_modules` continues to be filtered out as expected

## Task 2: Add Skills Tab to Sidebar

### Problem
No main sidebar tab for browsing, installing, and managing skills.

### Solution
1. **Sidebar Integration**:
   - Added `"skills"` to `SidebarPanel` type in `webui/src/contexts/ui.tsx`
   - Added Skills tab to `BASE_PROJECT_PANELS` in `webui/src/components/layout/Sidebar.tsx`
   - Added Sparkles icon import
   - Added Skills case to `SidebarPanelContent` switch statement

2. **Skills Browser Component** (`webui/src/components/skills/SkillsBrowser.tsx`):
   - **Two tabs**: Available skills (from project) and Installed skills (from GitHub)
   - **Search functionality**: Filters skills by name and description
   - **Available Skills tab**:
     - Shows project skills from `skills/` directory
     - Expandable details showing tools, license, etc.
     - No individual enable/disable (project skills are always available)
   - **Installed Skills tab**:
     - Shows GitHub repositories with their skills
     - Enable/disable entire repositories
     - Uninstall repositories
     - Shows installation date and GitHub links
     - Expandable view of individual skills in each repository
   - **Install from GitHub**:
     - Text input supporting both `owner/repo` and full GitHub URLs
     - URL parsing to extract repository names
     - Integration with existing install API

3. **API Integration**:
   - Uses existing API hooks: `useSkills`, `useInstalledSkills`, `useInstallSkill`, etc.
   - Proper TypeScript types matching backend `Skill` and `InstalledSkill` interfaces
   - Error handling for install/uninstall operations

### UI/UX Features
- **Responsive design** following existing component patterns
- **Consistent styling** with other sidebar panels
- **Loading states** and empty states
- **Search functionality** across both skill types
- **Icon consistency** using Lucide React icons
- **Proper accessibility** with ARIA labels and keyboard navigation

### Testing
- Created React component test in `tests/unit/components/skills/SkillsBrowser.test.tsx` 
- Tests component rendering, tab switching, search, and GitHub URL parsing
- Note: React testing setup needs configuration (JSX runtime issue)

## Technical Implementation Details

### Backend API Structure
- **Skills**: Individual skills in project `skills/` directory
- **Installed Skills**: GitHub repositories containing one or more skills
- **Repository-level operations**: Install, uninstall, enable/disable entire repos
- **Skill-level operations**: Individual skills within repositories

### Frontend Architecture  
- **Reusable component**: Self-contained Skills browser
- **State management**: Local state for UI, React Query for API data
- **Type safety**: Full TypeScript coverage with proper API interfaces
- **Error boundaries**: Graceful error handling for API failures

### File Changes
```
src/server/routes/files.ts              - Fixed dotfile filtering, added isHidden
webui/src/lib/api/queries.ts            - Updated FileEntry interface  
webui/src/contexts/ui.tsx               - Added "skills" to SidebarPanel type
webui/src/components/layout/Sidebar.tsx - Added Skills tab integration
webui/src/components/skills/SkillsBrowser.tsx - New Skills browser component
tests/unit/server/routes/files-dotfiles.test.ts - Dotfiles tests
tests/unit/components/skills/SkillsBrowser.test.tsx - Skills component tests
```

## Deployment Steps Completed

1. ✅ **Fixed backend filtering logic**
2. ✅ **Updated TypeScript interfaces**  
3. ✅ **Created Skills browser component**
4. ✅ **Integrated into sidebar**
5. ✅ **Built frontend**: `cd ~/botical/webui && npx vite build`
6. ✅ **Restarted service**: `sudo systemctl restart botical`
7. ✅ **Wrote and ran tests**
8. ✅ **Committed changes**
9. ✅ **Pushed to ion-kitty/botical remote**

## Live Deployment

The changes are now live at **https://leopard.verse.link** with:
- Dotfiles visible in project file browsers
- Skills tab available in sidebar for all projects
- Full skills management functionality

## Future Improvements

1. **Skills component tests**: Set up proper React testing environment
2. **Skills marketplace**: Add discovery of public skill repositories
3. **Skill dependencies**: Handle skill-to-skill dependencies
4. **Skill categories**: Organize skills by category/tags
5. **Installation progress**: Show progress for large skill installations