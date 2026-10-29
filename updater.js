/**
 * UPDATER.JS - Módulo Independente de Atualização Automática e Cache-Buster
 * Paróquia Perpétuo Socorro - Escala de Acólitos
 *
 * Responsabilidades:
 * 1. Checar se há nova versão no servidor (version.json).
 * 2. Limpar caches do Service Worker e navegador quando houver novidade.
 * 3. Proteger 100% contra loops infinitos de reload.
 * 4. Notificar o usuário de forma suave.
 */

(function() {
    'use strict';

    // Versão padrão do módulo (atualizada em sincronia com o version.json)
    const CLIENT_VERSION = "1.5.1";
    let isChecking = false;

    // Toast de notificação suave (usa o showToast da aplicação se existir, ou cria um próprio)
    function notify(message) {
        if (typeof window.showToast === 'function') {
            window.showToast(message);
        } else {
            console.log(`[Updater] ${message}`);
        }
    }

    // Limpa caches do Service Worker e Cache Storage
    async function clearAllCaches() {
        try {
            if ('caches' in window) {
                const cacheKeys = await caches.keys();
                await Promise.all(cacheKeys.map(k => caches.delete(k)));
                console.log('[Updater] Caches do Service Worker limpos com sucesso.');
            }
        } catch (err) {
            console.warn('[Updater] Erro ao limpar caches:', err);
        }
    }

    /**
     * Verifica atualizações no servidor.
     * @param {boolean} isManual Indica se foi clicado manualmente pelo usuário.
     */
    async function checkForUpdates(isManual = false) {
        if (isChecking) return;
        isChecking = true;

        try {
            // Anti-loop: se uma atualização ocorreu há menos de 20s, bloqueia novos reloads automáticos
            const lastReloadTs = parseInt(sessionStorage.getItem('updater_last_reload_ts') || '0', 10);
            const now = Date.now();
            if (!isManual && (now - lastReloadTs < 20000)) {
                console.log('[Updater] Proteção anti-loop ativa: atualização ignorada.');
                return;
            }

            const response = await fetch(`version.json?_t=${now}`, {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }
            });

            if (!response.ok) {
                if (isManual) notify("Não foi possível verificar no momento.");
                return;
            }

            const data = await response.json();
            const serverVersion = data && data.version ? String(data.version).trim() : null;
            const storedVersion = localStorage.getItem('app_installed_version') || CLIENT_VERSION;

            // Se a versão já é a mesma da instalada ou do cliente atual
            if (serverVersion && (serverVersion === CLIENT_VERSION || serverVersion === storedVersion)) {
                localStorage.setItem('app_installed_version', serverVersion);
                if (isManual) {
                    notify("✅ Você já está na versão mais recente!");
                }
                return;
            }

            // Nova versão encontrada no servidor!
            if (serverVersion && serverVersion !== storedVersion) {
                console.log(`[Updater] Nova versão encontrada: ${serverVersion} (local: ${storedVersion}). Atualizando...`);
                
                // Registra versão e trava anti-loop
                sessionStorage.setItem('updater_last_reload_ts', String(now));
                localStorage.setItem('app_installed_version', serverVersion);

                await clearAllCaches();
                notify("✨ Nova versão disponível! Atualizando...");

                setTimeout(() => {
                    const cleanUrl = window.location.origin + window.location.pathname + '?_v=' + Date.now();
                    window.location.replace(cleanUrl);
                }, 800);
                return;
            }

            if (isManual) {
                notify("✅ Você já está na versão mais recente!");
            }
        } catch (err) {
            console.warn('[Updater] Erro na verificação:', err);
            if (isManual) {
                notify("Recarregando aplicativo...");
                setTimeout(() => window.location.reload(), 500);
            }
        } finally {
            isChecking = false;
        }
    }

    /**
     * Força a busca manual de novidades e limpeza de cache.
     */
    async function forceReloadApp() {
        const btn = document.getElementById('btn-force-reload');
        if (btn) btn.classList.add('rotating');
        
        notify("🔄 Verificando novidades e limpando cache...");
        await clearAllCaches();

        try {
            await checkForUpdates(true);
        } finally {
            if (btn) btn.classList.remove('rotating');
        }
    }

    // Exporta globalmente para o HTML / botões
    window.checkForUpdates = checkForUpdates;
    window.forceReloadApp = forceReloadApp;
    window.clearAppCaches = clearAllCaches;

    // Inicialização segura dos ouvintes
    window.addEventListener('load', () => {
        // Registra versão atual no storage sem sobrescrever se já tiver versão futura
        if (!localStorage.getItem('app_installed_version')) {
            localStorage.setItem('app_installed_version', CLIENT_VERSION);
        }
        // Primeira checagem silenciosa após carregar
        setTimeout(() => checkForUpdates(false), 3000);
    });

    // Checa ao retornar à aba do navegador
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkForUpdates(false);
        }
    });

    // Checa ao focar a janela
    window.addEventListener('focus', () => {
        checkForUpdates(false);
    });

    // Checa periodicamente a cada 5 minutos
    setInterval(() => {
        checkForUpdates(false);
    }, 5 * 60 * 1000);

    console.log(`[Updater] Verificador de versão independente iniciado (v${CLIENT_VERSION}).`);
})();
