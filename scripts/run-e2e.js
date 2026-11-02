const { spawnSync } = require('child_process');
const env = { ...process.env, DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/ecommerce_db_test?schema=public', JWT_SECRET: 'test-secret-that-is-at-least-thirty-two-characters', LOGIN_THROTTLE_LIMIT: '5', LOGIN_THROTTLE_TTL: '60000' };
function run(command, args) { const result = spawnSync(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' }); if (result.error) { console.error(result.error); process.exit(1); } if (result.status !== 0) process.exit(result.status || 1); }
run('docker', ['compose', '-p', 'ecommerce-e2e', '-f', 'docker-compose.test.yml', 'up', '-d', '--wait', '--wait-timeout', '60']);
run('npx', ['prisma', 'migrate', 'deploy']);
run('npm', ['run', 'prisma:seed']);
run('npx', ['jest', '--config', './test/jest-e2e.json', '--runInBand']);
