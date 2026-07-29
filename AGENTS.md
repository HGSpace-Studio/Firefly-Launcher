# Project: Firefly Launcher (Tauri 2) - Migration to React

## Objective
Migrate from Vue 3 to React 18 as the frontend framework. All components, stores, i18n, and build config have been converted.

## Migration State: COMPLETE

### Infrastructure Changes
- `package.json`: Vue deps removed, React/lucide-react/react-i18next added
- `vite.config.ts`: Uses `@vitejs/plugin-react` (no Vue plugin)
- `tsconfig.json`: `jsx: react-jsx`, strict mode on
- `index.html`: Uses `#root` and `main.tsx`
- `vite-env.d.ts`: Removed `.vue` module declaration

### New Files Created
- `src/main.tsx` - React entry point
- `src/App.tsx` - Main React App component (dock layout, spotlight, task manager)
- `src/App.css` - App component styles
- `src/index.css` - Global styles from App.vue
- `src/i18n.ts` - react-i18next setup
- `src/hooks/` - React hooks:
  - `useTaskStore.ts`
  - `useLaunchStore.ts`
  - `useNavigationStore.ts`
  - `useOpenedInstancesStore.ts`
- `.github/workflows/build.yml` - CI/CD workflow

### Stores (Class-based singleton with subscribe/notify)
- `src/stores/taskStore.ts` - Task management (addTask, updateTask, removeTask, getTask, registerLaunchListeners, registerInstallListeners)
- `src/stores/instanceLaunch.ts` - Launch store with currentInstanceName, currentLaunchFn, currentStopFn
- `src/stores/navigation.ts` - Navigation with pending instance target
- `src/stores/openedInstances.ts` - Opened instances tracking

### Components Converted (.vue → .tsx + .css)
- `SpotlightSearch.tsx` - Global search with instances/modrinth/mc versions
- `Sidebar.tsx` - Navigation sidebar with instances
- `HomePage.tsx` - News feed + quick launch
- `ResourcesCenter.tsx` - Modrinth projects browser
- `accinterface.tsx` - Account management (MS auth, offline, auth servers)
- `settings_interface.tsx` - Application settings (appearance, Java, memory, etc.)
- `InstanceSettingsInterface.tsx` - Per-instance settings panel
- `OnboardingWindow.tsx` - First-run setup wizard
- `crush_shell.tsx` - Crash report display
- `root_interface.tsx` - New instance creation
- `mcverselection_interface.tsx` - Minecraft version selection
- `versionroot.tsx` - Version info display
- `instance_detail.tsx` - Instance detail with launch/settings/resources tabs
- `pagesexport.tsx` - Empty/removed (was unused)

### Build
- `npm run build` passes (tsc --noEmit + vite build)
- All Vue files (.vue) deleted
- React hooks use `useSyncExternalStore` for store subscriptions

### Known Issues
- Some event listener stubs (account-changed, spotlight-*) need proper implementations
- Several unused imports marked with _ prefix patterns
- CSS files extracted from Vue style blocks may need refinement for React context
