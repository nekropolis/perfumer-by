// PM2 process definitions for the Next.js frontend.
//
// Используется и для "in-place" деплоя (scripts/deploy.sh), и для
// capistrano-style релизов (scripts/release.sh): script pm2 подхватывает
// файл по реальному пути, cwd = __dirname, поэтому после свапа символической
// ссылки `current` pm2 reload поднимает процесс уже из новой релиз-директории.
//
// Запуск вручную:
//   cd /var/www/perfumer-by/current/frontend
//   pm2 start ecosystem.config.cjs
//   pm2 save
//
// Быстрое обновление после нового билда:
//   pm2 reload perfumer-frontend --update-env

module.exports = {
    apps: [
        {
            name: "perfumer-frontend",
            cwd: __dirname,
            script: "npm",
            args: "run start",
            instances: 1,
            exec_mode: "fork",
            autorestart: true,
            watch: false,
            max_memory_restart: "700M",
            kill_timeout: 10000,
            listen_timeout: 15000,
            time: true,
            env: {
                NODE_ENV: "production",
                PORT: 3000,
            },
            error_file: "/var/log/pm2/perfumer-frontend.err.log",
            out_file: "/var/log/pm2/perfumer-frontend.out.log",
            merge_logs: true,
        },
    ],
};
