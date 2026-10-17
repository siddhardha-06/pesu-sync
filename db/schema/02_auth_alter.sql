-- =====================================================================
-- PESU-Sync | 02_auth_alter.sql
-- ALTER TABLE changes required by authentication & authorization.
-- Author: Parth Pandurang Kale (PES1UG24AM184)
-- =====================================================================

-- Track logins and brute-force attempts (account locks after 5 failures)
ALTER TABLE users ADD COLUMN last_login_at  TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN failed_logins  SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD CONSTRAINT chk_users_failed_logins CHECK (failed_logins BETWEEN 0 AND 100);

-- Campus-restricted platform, enforced by the database (not just the UI):
--   students -> <srn>@stu.pes.edu (e.g. pes1ug24am186@stu.pes.edu)
--   faculty / admins -> <name>@pes.edu
ALTER TABLE users ADD CONSTRAINT chk_users_email_campus
    CHECK (CASE WHEN role = 'STUDENT'
                THEN email = LOWER(srn) || '@stu.pes.edu'
                ELSE email ~ '^[a-z0-9._%+-]+@pes\.edu$'
           END);

-- Only bcrypt hashes may be stored (never plain-text passwords)
ALTER TABLE users ALTER COLUMN password_hash TYPE CHAR(60);
ALTER TABLE users ADD CONSTRAINT chk_users_password_bcrypt
    CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$');

-- Sign-in with PESU Academy (through the open-source PESUAuth API):
--   auth_provider    LOCAL = PESU-Sync password, PESU = account created from a PESU Academy login
--   pesu_verified_at last time PESU Academy confirmed this student's SRN
ALTER TABLE users ADD COLUMN auth_provider VARCHAR(5) NOT NULL DEFAULT 'LOCAL';
ALTER TABLE users ADD COLUMN pesu_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD CONSTRAINT chk_users_auth_provider CHECK (auth_provider IN ('LOCAL', 'PESU'));
ALTER TABLE users ADD CONSTRAINT chk_users_pesu_verified
    CHECK ((auth_provider = 'LOCAL' OR pesu_verified_at IS NOT NULL) AND (pesu_verified_at IS NULL OR role = 'STUDENT'));

-- Privacy review: phone numbers are no longer collected,
-- students talk through in-app team messages instead.
ALTER TABLE users DROP COLUMN phone;
