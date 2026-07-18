-- Switch all agents from deepseek-chat to gpt-4.1-mini
-- Run this in Railway PostgreSQL console or via: pnpm db:studio

UPDATE "Agent" 
SET model = 'gpt-4.1-mini'
WHERE model = 'deepseek-chat';

-- Verify
SELECT model, COUNT(*) as count 
FROM "Agent" 
GROUP BY model 
ORDER BY count DESC;
