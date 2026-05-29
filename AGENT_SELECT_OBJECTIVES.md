# Agent Select Field in Objectives Configuration

## Summary
Replaced the plain text input field for agent selection in the Objectives settings with a proper Select dropdown component that displays all active agents with their names and usernames.

## Changes Made

### File: `src/components/GuichetAdmin.tsx`

#### 1. Updated Imports
- Added `useMemo` to the React imports for memoizing the filtered agents list
- Added `useErp` from `@/lib/erpStore` to access the users list

#### 2. ObjectiveEditor Component Enhancement

**Before:**
```tsx
{scope === "agent" && <div className="space-y-1.5"><Label>Agent</Label><Input value={agentId} onChange={(e) => setAgentId(e.target.value)} /></div>}
```

**After:**
```tsx
{scope === "agent" && <div className="space-y-1.5"><Label>Agent</Label>
  <Select value={agentId} onValueChange={setAgentId}>
    <SelectTrigger><SelectValue placeholder="Choisir un agent" /></SelectTrigger>
    <SelectContent>{agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.fullName} ({a.username})</SelectItem>)}</SelectContent>
  </Select>
</div>}
```

#### 3. Agent Filtering Logic
Added a `useMemo` hook to filter active agents with relevant roles:
```tsx
const agents = useMemo(
  () => users.filter((u) => (u.role === "Agent" || u.role === "Manager" || u.role === "AgentSuivi" || u.role === "AgentActivation" || u.role === "AgentVente") && u.active !== false),
  [users],
);
```

Filters include:
- Agent, Manager, AgentSuivi, AgentActivation, AgentVente roles
- Only active users (where `active !== false`)

#### 4. Validation Enhancement
Added validation to prevent saving without selecting an agent when scope is "agent":
```tsx
if (scope === "agent" && !agentId.trim()) {
  toast.error("Veuillez sélectionner un agent");
  return;
}
```

## Features

✅ **Select Dropdown**: User-friendly dropdown instead of text input
✅ **Agent Display**: Shows both full name and username for clarity
✅ **Automatic Filtering**: Only shows active agents with appropriate roles
✅ **Input Validation**: Prevents saving objectives without selecting an agent
✅ **Responsive**: Works seamlessly on all screen sizes
✅ **Memoization**: Optimized performance with useMemo to prevent unnecessary re-renders

## Where This Appears

1. **Configuration Page** → Objectives Tab → "Définir un objectif" section
2. Uses the ObjectivesPanel component from GuichetAdmin

## How It Works

1. When user selects "Par agent" from the Portée (scope) dropdown
2. The agent field appears as a Select component
3. User clicks to open the dropdown
4. All active agents are listed with their full name and username
5. User selects an agent
6. User can then set the targets (SIM, Portabilité, Fancy, etc.) and save

## Compatibility

- Works with all existing objective scopes (global, entity, agent)
- Integrates with the existing upsertObjective backend API
- No database changes required
- Agent ID is properly sent to backend API

## Testing Checklist

- [ ] Load configuration page and navigate to Objectives tab
- [ ] Click "Par agent" in the Portée dropdown
- [ ] Verify agent select appears with all active agents
- [ ] Try selecting different agents
- [ ] Try saving an objective for a specific agent
- [ ] Verify objective was saved with correct agent ID in database
