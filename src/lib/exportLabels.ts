// Mapping technique → libellé UI utilisé pour les exports CSV / Excel / JSON.
// Les en-têtes des fichiers exportés doivent ressembler à l'interface, pas à
// la base de données. Les imports acceptent les deux (clé technique OU libellé)
// grâce au mapping case-insensitive d'ImportDialog.

export type LabelMap = Record<string, string>;

export const PROSPECT_LABELS: LabelMap = {
  id: "Identifiant",
  civility: "Civilité",
  lastName: "Nom",
  firstName: "Prénom",
  phone: "Téléphone 1",
  phone2: "Téléphone 2",
  ancienLigne: "Ancien Ligne",
  cin: "CIN",
  birthDate: "Date de naissance",
  email: "E-mail",
  source: "Source",
  status: "Statut",
  assignedTo: "Assigné à",
  createdAt: "Créé le",
  updatedAt: "Modifié le",
  gouvernorat: "Gouvernorat",
  delegation: "Délégation",
  address: "Adresse",
  city: "Ville",
  codePostal: "Code postal",
  localisationXy: "Localisation (lat,lng)",
  comment: "Observation 1",
  comment2: "Observation 2",
  type: "Type de prospect",
  typeId: "Type de prospect",
  opportunityId: "Opportunité liée",
  contractId: "Contrat lié",
};

export const CONTRACT_LABELS: LabelMap = {
  id: "N° contrat",
  prospectId: "Prospect lié",
  lastName: "Nom",
  firstName: "Prénom",
  city: "Ville",
  address: "Adresse",
  codePostal: "Code postal",
  localisationXy: "Localisation (lat,lng)",
  partner: "Partenaire",
  cabinet: "Cabinet",
  premium: "Cotisation",
  billingStatus: "Statut facturation",
  signatureDate: "Date signature",
  effectiveDate: "Date d'effet",
  validationDate: "Date validation",
  source: "Source",
  assignedTo: "Assigné à",
  status: "Statut",
  stage: "Statut",
  createdAt: "Créé le",
};

export const OPPORTUNITY_LABELS: LabelMap = {
  id: "N° opportunité",
  prospectId: "Prospect lié",
  lastName: "Nom",
  firstName: "Prénom",
  partner: "Partenaire",
  product: "Produit",
  premium: "Montant",
  stage: "Statut",
  status: "Statut",
  assignedTo: "Assigné à",
  source: "Source",
  expectedCloseDate: "Clôture prévue",
  createdAt: "Créé le",
  updatedAt: "Modifié le",
  comment: "Observation",
};

export const RECLAMATION_LABELS: LabelMap = {
  id: "N° réclamation",
  prospectId: "Prospect lié",
  contractId: "Contrat lié",
  subject: "Sujet",
  description: "Description",
  status: "Statut",
  priority: "Priorité",
  assignedTo: "Assigné à",
  createdAt: "Créé le",
  resolvedAt: "Résolu le",
};
