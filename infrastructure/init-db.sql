-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS public;

-- Set default search path
ALTER DATABASE cmmp_db SET search_path TO public;

-- Create enums
CREATE TYPE maturity_level AS ENUM ('NOT_APPLICABLE', 'INITIAL', 'DEVELOPING', 'DEFINED', 'MANAGED', 'OPTIMISED');
CREATE TYPE risk_level AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MINIMAL');
CREATE TYPE control_status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED');
CREATE TYPE audit_action AS ENUM ('LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'UPLOAD', 'DOWNLOAD', 'EXPORT', 'IMPORT');

COMMENT ON TYPE maturity_level IS 'Cybersecurity maturity scale: 0=N/A, 1=Initial, 2=Developing, 3=Defined, 4=Managed, 5=Optimised';
COMMENT ON TYPE risk_level IS 'Risk severity levels for security findings and gaps';
COMMENT ON TYPE control_status IS 'Lifecycle status of security controls';
COMMENT ON TYPE audit_action IS 'Types of user actions tracked in audit logs';
