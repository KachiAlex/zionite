-- Seed requested superadmin account. The hash below is bcrypt('superadmin123', 10).
INSERT INTO users (id, email, password_hash, name, role, tenant_id)
SELECT 'superadmin-1', 'superadmin@zionite.online', '$2a$10$JOG3ew1jR/y9OGydT6A2A.2YD5QKVF54o3iorGax43VlBqrdLt6ei', 'Super Admin', 'super_admin', id
FROM tenants
WHERE slug = 'zionite'
ON CONFLICT (email) DO NOTHING;
