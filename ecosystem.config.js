module.exports = {
  apps: [
    {
      name: 'radar-light-api',
      script: 'src/server.js',
      cwd: '.',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      max_memory_restart: '512M',
      watch: false,
      time: true,
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: 'logs/pm2-api-error.log',
      out_file: 'logs/pm2-api-out.log',
      merge_logs: true,
      kill_timeout: 5000,
    },
    {
      name: 'radar-light-recalc-worker',
      script: 'src/scripts/runRecalcWorker.js',
      cwd: '.',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '256M',
      watch: false,
      time: true,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/pm2-worker-error.log',
      out_file: 'logs/pm2-worker-out.log',
      merge_logs: true,
      kill_timeout: 5000,
    },
  ],
};
