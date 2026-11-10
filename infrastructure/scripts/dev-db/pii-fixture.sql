-- Recognisable fake personal data for anonymize.test.sh / refresh.test.sh (CORE-189).
-- The caller sets search_path to the tenant schema. Staffina is the internal
-- (keep_domain) account that must survive; everything else must be replaced.
-- planted: Gertrudis|Zwolinskaya|Tula|gertrudis|5512349876|1961-08-23|Tulipan|Bonifacio|Quetzalli|clinicaq|3398761234|3311112222|QUEB800101AAA|EXP-778899|CED-5544332|Chapultepec|bcrypt-doctor-hash|prod-remember-me-hash
INSERT INTO identities (id, first_name, last_name, preferred_name, email, phone, date_of_birth, notes, metadata) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Gertrudis', 'Zwolinskaya', 'Tula', 'gertrudis.z@gmail.com', '+525512349876', '1961-08-23', 'Lives at Calle Tulipan 42', NULL),
  ('00000000-0000-0000-0000-000000000002', 'Bonifacio', 'Quetzalli', NULL, 'dr.bonifacio@clinicaq.mx', '+523398761234', NULL, NULL,
   '{"clinic_name": "Consultorio Quetzalli", "clinic_phone": "+523311112222", "tax_id": "QUEB800101AAA", "locale": "es"}'),
  ('00000000-0000-0000-0000-000000000003', 'Staffina', 'Internalova', NULL, 'staffina@neosleepcare.com', '+48600111222', '1990-05-05', NULL, NULL);
INSERT INTO patient (id, identity_id, medical_record, shipping_address)
  VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'EXP-778899',
          '{"line1": "Calle Tulipan 42", "city": "Guadalajara", "postal_code": "44100", "country_code": "MX"}');
INSERT INTO practitioner (identity_id, national_ids) VALUES ('00000000-0000-0000-0000-000000000002', '{"cedula": "CED-5544332"}');
INSERT INTO users (id, identity_id, password_hash) VALUES
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000002', 'bcrypt-doctor-hash'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000003', 'bcrypt-staff-hash');
INSERT INTO remember_me_tokens (user_id, token_hash, expires_at)
  VALUES ('00000000-0000-0000-0000-0000000000b3', 'prod-remember-me-hash', now() + interval '1 day');
INSERT INTO organization (name, address_line1, phone, email, identifiers)
  VALUES ('Consultorio Quetzalli', 'Avenida Chapultepec 480', '+523311112222', 'contacto@clinicaq.mx', '{"rfc": "QUEB800101AAA"}');
INSERT INTO note (entity_type, entity_id, body)
  VALUES ('patient', '00000000-0000-0000-0000-0000000000a1', 'Gertrudis called from +525512349876');
INSERT INTO audit_log (entity_type, action, entity_after)
  VALUES ('patient', 'update', '{"first_name": "Gertrudis", "email": "gertrudis.z@gmail.com"}');
