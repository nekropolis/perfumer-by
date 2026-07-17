// PM2 process definitions for the Next.js frontend.
//
// Используется и для "in-place" деплоя (scripts/deploy.sh), и для
// capistrano-style релизов (scripts/release.sh): script pm2 подхватывает
// файл по реальному пути, cwd = __dirname, поэтому после свапа символической
// ссылки `current` pm2 reload поднимает процесс уже из новой релиз-директории.
//
// Cluster (2 instances): zero-downtime `pm2 reload` — инстансы обновляются по очереди.
// script = next binary (не npm), иначе cluster mode не работает.
//
// Запуск вручную:
//   cd /var/www/perfumer-by/current/frontend
//   pm2 start ecosystem.config.cjs
//   pm2 save
//
// Быстрое обновление после нового билда:
//   pm2 reload perfumer-frontend --update-env
//
// После смены fork→cluster первый раз:
//   pm2 delete perfumer-frontend
//   pm2 start ecosystem.config.cjs
//   pm2 save

module.exports = {
    apps: [
        {
            name: "perfumer-frontend",
            cwd: __dirname,
            script: "node_modules/next/dist/bin/next",
            args: "start",
            instances: 2,
            exec_mode: "cluster",
            autorestart: true,
            watch: false,
            max_memory_restart: "700M",
            kill_timeout: 10000,
            listen_timeout: 15000,
            wait_ready: false,
            time: true,
            env: {
                NODE_ENV: "production",
                PORT: 3000,
                // При необходимости SSR к API по loopback: API_URL: "http://127.0.0.1/api",
            },
            error_file: "/var/log/pm2/perfumer-frontend.err.log",
            out_file: "/var/log/pm2/perfumer-frontend.out.log",
            merge_logs: true,
        },
    ],
};
