// PM2 ecosystem file — place at /home/deploy/ecosystem.config.cjs on the VPS
// Start both BFF processes: pm2 start ecosystem.config.cjs
// Save process list:        pm2 save

module.exports = {
  apps: [
    {
      name: "bff-prod",
      cwd: "/home/deploy/apps/bff-prod",
      script: "dist/server.js",
      env_file: ".env",
      env: {
        PORT: 3000,
        NODE_ENV: "production",
      },
      // Restart on crash, but not on OOM (let systemd handle that)
      max_restarts: 10,
      restart_delay: 3000,
      error_file: "/home/deploy/logs/bff-prod-error.log",
      out_file: "/home/deploy/logs/bff-prod-out.log",
    },
    {
      name: "bff-uat",
      cwd: "/home/deploy/apps/bff-uat",
      script: "dist/server.js",
      env_file: ".env",
      env: {
        PORT: 3001,
        NODE_ENV: "production",
      },
      max_restarts: 10,
      restart_delay: 3000,
      error_file: "/home/deploy/logs/bff-uat-error.log",
      out_file: "/home/deploy/logs/bff-uat-out.log",
    },
  ],
};
