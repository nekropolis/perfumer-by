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
// Имена процессов:
//   prod:    perfumer-frontend   (FRONT_PROD_NAME по умолчанию)
//   staging: frontend-staging    (FRONT_PROD_NAME=frontend-staging)
//
// Запуск вручную (prod):
//   cd /var/www/perfumer-by/current/frontend
//   pm2 start ecosystem.config.cjs --only perfumer-frontend
//   pm2 save
//
// Запуск вручную (staging):
//   FRONT_PROD_NAME=frontend-staging pm2 start ecosystem.config.cjs --only frontend-staging
//   pm2 save
//
// Быстрое обновление после нового билда:
//   pm2 reload perfumer-frontend --update-env
//   # staging: pm2 reload frontend-staging --update-env
//
// После смены fork→cluster первый раз:
//   pm2 delete perfumer-frontend   # или frontend-staging
//   pm2 start ecosystem.config.cjs --only <name>
//   pm2 save

function makeApp(name) {
    return {
        name,
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
        error_file: `/var/log/pm2/${name}.err.log`,
        out_file: `/var/log/pm2/${name}.out.log`,
        merge_logs: true,
    };
}

module.exports = {
    apps: [
        makeApp("perfumer-frontend"),
        makeApp("frontend-staging"),
    ],
};
