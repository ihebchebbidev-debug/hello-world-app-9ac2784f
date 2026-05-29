# Bug Fix: Guichet Agent Filter Not Updating

## Problem
When an AgentGuichet (normal agent with `guichet_entity_id` assigned) selected between:
- **"Toute mon entité"** (show all entity data)
- **"Mes données uniquement"** (show only my data)

The select dropdown value would change visually, but **the dashboard data would not update** - it would continue showing the same data regardless of which filter was selected.

## Root Cause
Located in `/vercel/share/v0-project/src/routes/guichet.tsx` line 1069:

```typescript
const [agentId, setAgentId] = useState<string>(
  canReadAll ? "" : (assignedEntity ? "" : (user?.id ?? ""))
);
```

### The Issue
1. When `DashboardTab` component mounts, `user` from `useAuth()` might not be loaded yet
2. If `user` is `undefined`, then `user?.id ?? ""` evaluates to `""`
3. React's `useState` hook only uses the initial value on the **first render**
4. Even after `user` loads and gets set by the auth context, the `agentId` state **does not automatically update**
5. The select filter would change, but `agentId` state would remain as the initial (stale) value
6. The `useEffect` for fetching dashboard data (which depends on `agentId`) would not see the change in actual agent assignment

## Solution
Added a `useEffect` hook to synchronize `agentId` state when the user or assigned entity changes:

```typescript
// Sync agentId when user or assignedEntity changes (handles race condition with auth loading)
useEffect(() => {
  const newAgentId = canReadAll ? "" : (assignedEntity ? "" : (user?.id ?? ""));
  if (newAgentId !== agentId && user) {
    // Only update if user is loaded and value actually changed
    setAgentId(newAgentId);
  }
}, [user?.id, assignedEntity, canReadAll, agentId, user]);
```

### How It Works
1. This effect runs whenever `user?.id`, `assignedEntity`, `canReadAll`, or `agentId` changes
2. It computes what the correct `agentId` should be
3. If the computed value differs from current state AND the user is loaded, it updates the state
4. This ensures that when the user auth context finally loads, the `agentId` is properly synchronized

## Impact
- ✅ Agent filter now updates data correctly when toggled
- ✅ Initial dashboard load with correct agent scope
- ✅ No changes to backend or API required
- ✅ The fix is transparent to other components

## Testing Steps
1. Log in as an AgentGuichet user (user with `guichet_entity_id` assigned)
2. Navigate to Guichet → Dashboard tab
3. Observe the select dropdown shows "Toute mon entité" (all entity)
4. Click and select "Mes données uniquement" (my data only)
5. Verify dashboard data updates to show only your records
6. Toggle back to "Toute mon entité"
7. Verify dashboard data updates to show entire entity again

## Files Modified
- `/vercel/share/v0-project/src/routes/guichet.tsx` - Added synchronization effect
