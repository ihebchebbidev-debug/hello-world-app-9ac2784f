---
name: Custom fields system
description: Dynamic custom fields for prospect/contract/user — backend + create dialogs + detail cards + list columns/filters/export
type: feature
---
Backend: `custom_fields.php` (defs) + `custom_field_values.php` (values; supports `?entity=X&all=1` bulk).
Entities: `prospect`, `contract`, `user`. Types: text, textarea, number, date, boolean, select.

Frontend pieces:
- `<CustomFieldsCard entity entityId />` — view/edit on detail pages (mounted on prospect, contract, user detail).
- `<CustomFieldsInline entity values onChange />` — in NewProspectDialog, NewContractDialog, NewUserDialog. NewUserDialog persists values via POST /custom_field_values.php after saveUser (entity_id = username).
- `useCustomFieldsTable(entity)` (src/lib/useCustomFields.ts) — defs + valuesById for list pages.
- `<CustomColumnsPicker>` + per-column `customFilters` wired into prospects.index and contracts.index. Exports include `cf_<key>` columns.

User detail page: `src/routes/users.$username.tsx`. When extending to a new entity, mirror this pattern and update `$ENTITIES` in both PHP files + `Entity` type in CustomFieldsInline/Card/useCustomFields.

Field types: text, textarea, number, date, boolean, select, multiselect.
Multiselect values are stored as JSON arrays (string) in `crminternet_custom_field_values.value`.
Frontend uses `<MultiSelect>` from `src/components/ui/multi-select.tsx` + `parseMulti`/`serializeMulti` helpers.
List filter for multiselect uses single-select Select (matches via "contains" on JSON string).
