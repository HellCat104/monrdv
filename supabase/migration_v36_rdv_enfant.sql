-- « Pour mon enfant » : les fiches enfant créées depuis le compte parent sont
-- marquées is_child et liées au compte (user_id) — dossier famille côté patient.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_child BOOLEAN DEFAULT false;
