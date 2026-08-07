-- Va solo en su propio archivo: Postgres no deja USAR un valor de enum recien
-- agregado dentro de la misma transaccion que lo agrego (55P04), y Prisma
-- envuelve cada migracion en una. Mismo criterio que la migracion de SUPERVISOR.
ALTER TYPE "Role" ADD VALUE 'TASK_MANAGER';
