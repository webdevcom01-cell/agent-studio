-- Faza 4 end-to-end probe: prove that Railway preDeployCommand (`prisma migrate
-- deploy`) applies migrations on its own during deploy. Harmless, idempotent and
-- reversible — schema.prisma does not model schema comments, so `migrate diff`
-- stays empty and no schema drift is introduced.
COMMENT ON SCHEMA public IS 'deploy-migrate probe ok (faza4)';
