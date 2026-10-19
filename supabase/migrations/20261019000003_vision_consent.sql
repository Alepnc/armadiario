-- Separate, explicit consent for sending garment photos to the stylist model.
alter table public.profiles add column ai_vision_consent_at timestamptz;
