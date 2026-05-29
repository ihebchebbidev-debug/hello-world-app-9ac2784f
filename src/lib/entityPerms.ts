// Map an entity name (used by detail-page cards) to its "edit" permission key.
// Cards like AttachmentsCard, ContractInfoCard, CustomFieldsCard, etc. accept
// an `entity` prop; this helper lets them check the right perm without each
// caller having to pass `canEdit` explicitly.

export type EditableEntity =
  | "prospect"
  | "opportunity"
  | "contract"
  | "reclamation"
  | "user"
  | "lead-action";

const ENTITY_EDIT_PERM: Record<EditableEntity, string> = {
  prospect: "prospect.edit",
  opportunity: "opportunity.edit",
  contract: "contract.edit",
  reclamation: "reclamation.edit",
  user: "user.edit",
  "lead-action": "prospect.edit",
};

export function entityEditPerm(entity: string): string {
  return ENTITY_EDIT_PERM[entity as EditableEntity] ?? `${entity}.edit`;
}

const ENTITY_DELETE_PERM: Record<EditableEntity, string> = {
  prospect: "prospect.delete",
  opportunity: "opportunity.delete",
  contract: "contract.delete",
  reclamation: "reclamation.delete",
  user: "user.delete",
  "lead-action": "prospect.edit", // deleting a lead action is part of editing the lead
};

export function entityDeletePerm(entity: string): string {
  return ENTITY_DELETE_PERM[entity as EditableEntity] ?? `${entity}.delete`;
}
