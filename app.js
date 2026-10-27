// --- CONFIGURAÇÃO DO SUPABASE ---
const supabaseUrl = 'https://uokmwzqqwpojfxrdiuzg.supabase.co';
const supabaseKey = 'sb_publishable_SQd6xVIZnFqAbqwgFel_cw_J-cOIsPO';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// --- SENHA DOS COORDENADORES ---
const SENHA_COORDENADOR_PADRAO = 'acolitos2026';
function getSenhaCoordenador() {
    return localStorage.getItem('senha_coordenador') || SENHA_COORDENADOR_PADRAO;
}

// --- METAS DE QUANTIDADE DE SERVIDORES POR MISSA (0 = Livre / Sem limite) ---
function getMetaAcolitos() {
    const raw = localStorage.getItem('meta_acolitos_missa');
    if (raw === null) return 2;
    const val = parseInt(raw, 10);
    return isNaN(val) || val < 0 ? 0 : val;
}
function getMetaCoroinhas() {
    const raw = localStorage.getItem('meta_coroinhas_missa');
    if (raw === null) return 2;
    const val = parseInt(raw, 10);
    return isNaN(val) || val < 0 ? 0 : val;
}
function getMetaTotal() {
    return getMetaAcolitos() + getMetaCoroinhas();
}
function syncMetaInputs() {
    const metaAcoInput = document.getElementById('meta-acolitos');
    const metaCorInput = document.getElementById('meta-coroinhas');
    if (metaAcoInput) metaAcoInput.value = getMetaAcolitos();
    if (metaCorInput) metaCorInput.value = getMetaCoroinhas();
}

// Dados dinâmicos
let servers = [];
let attendanceData = [];
let specialMasses = [];
let attendanceChart = null;
let currentMode = 'month'; // 'month' (mensal) ou 'special'
let currentSpecialMassId = null;

// Gestão de Mês e Ano
let selectedYear = new Date().getFullYear();
let selectedMonth = new Date().getMonth(); // 0 a 11
let massSchedules = [];
let weekendGroups = [];
let selectedMassId = null;
let currentScaleFilter = 'all'; // 'all' ou número do weekendIndex
let scaleServerFilter = 'all'; // 'all' ou id do servidor (visão pessoal na Agenda Geral)
let adminMassFilter = 'all';

const MONTH_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Grade Oficial da Paróquia Perpétuo de Socorro (Lago Sul - nspslagosul.com.br/horarios)
const GRADE_PERPETUO_SOCORRO = {
    0: { 
        dia: 'Domingo', 
        prefix: 'dom', 
        horarios: [
            { hora: '08:00', obs: '' },
            { hora: '10:00', obs: 'Missa com as Crianças' },
            { hora: '12:00', obs: '' },
            { hora: '17:00', obs: '' },
            { hora: '19:00', obs: '' },
            { hora: '21:00', obs: '' }
        ] 
    },
    1: { 
        dia: 'Segunda-feira', 
        prefix: 'seg', 
        horarios: [
            { hora: '08:00', obs: '' },
            { hora: '19:00', obs: '' }
        ] 
    },
    2: { 
        dia: 'Terça-feira', 
        prefix: 'ter', 
        horarios: [
            { hora: '08:00', obs: '' },
            { hora: '19:00', obs: '' }
        ] 
    },
    3: { 
        dia: 'Quarta-feira', 
        prefix: 'qua', 
        horarios: [
            { hora: '08:00', obs: '' },
            { hora: '17:00', obs: '' },
            { hora: '19:00', obs: 'Novena Perpétua' }
        ] 
    },
    4: { 
        dia: 'Quinta-feira', 
        prefix: 'qui', 
        horarios: [
            { hora: '08:00', obs: '' },
            { hora: '17:00', obs: 'Missa da Saúde' },
            { hora: '19:00', obs: '' }
        ] 
    },
    5: { 
        dia: 'Sexta-feira', 
        prefix: 'sex', 
        horarios: [
            { hora: '08:00', obs: '' },
            { hora: '19:00', obs: '' }
        ] 
    },
    6: { 
        dia: 'Sábado', 
        prefix: 'sab', 
        horarios: [
            { hora: '08:00', obs: '' },
            { hora: '18:00', obs: '' }
        ] 
    }
};

// Cálculo e Geração das Missas do Mês
function calculateMonthMassSchedules(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const schedules = [];
    const groups = [];
    
    let currentGroup = null;
    let weekCount = 0;
    
    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const dayOfWeek = d.getDay(); // 0=Dom, 1=Seg, ..., 6=Sáb
        
        const dd = String(day).padStart(2, '0');
        const mm = String(month + 1).padStart(2, '0');
        const yyyy = year;
        const dateFormatted = `${dd}/${mm}`;
        const isoDate = `${yyyy}-${mm}-${dd}`;
        
        // Nova semana inicia na segunda-feira ou no primeiro dia do mês
        if (!currentGroup || dayOfWeek === 1) {
            weekCount++;
            currentGroup = {
                index: weekCount,
                startDate: dateFormatted,
                endDate: dateFormatted,
                dates: [dateFormatted],
                masses: []
            };
            groups.push(currentGroup);
        } else {
            currentGroup.endDate = dateFormatted;
            if (!currentGroup.dates.includes(dateFormatted)) {
                currentGroup.dates.push(dateFormatted);
            }
        }
        
        const info = GRADE_PERPETUO_SOCORRO[dayOfWeek];
        if (info && info.horarios) {
            info.horarios.forEach(hObj => {
                const hora = hObj.hora;
                const obs = hObj.obs || '';
                const horaClean = hora.replace(':', '');
                const mass = {
                    id: `${info.prefix}-${horaClean}-${isoDate}`,
                    dia: info.dia,
                    data: dateFormatted,
                    hora: hora,
                    obs: obs,
                    isoDate: isoDate,
                    dayOfWeek: dayOfWeek,
                    weekendIndex: weekCount
                };
                schedules.push(mass);
                currentGroup.masses.push(mass);
            });
        }
    }
    
    // Atualizar labels dos grupos por semana
    groups.forEach(g => {
        g.label = `${g.index}ª Sem (${g.startDate} a ${g.endDate})`;
        g.fullLabel = `${g.index}ª Semana (${g.startDate} a ${g.endDate})`;
    });
    
    return { schedules, groups };
}

// Elementos do DOM
const viewSelection = document.getElementById('view-selection');
const viewInscricao = document.getElementById('view-inscricao');
const viewControle = document.getElementById('view-luiggi');

const btnSelectWeekend = document.getElementById('btn-select-weekend');
const btnSelectSpecial = document.getElementById('btn-select-special');
const btnAdminAccess = document.getElementById('btn-admin-access');
const btnControle = document.getElementById('btn-controle');
const btnInscricaoNav = document.getElementById('btn-inscricao');
const btnsBack = document.querySelectorAll('.btn-back');

const inscricaoTitle = document.getElementById('inscricao-title');
const inscricaoSubtitle = document.getElementById('inscricao-subtitle');
const specialMassPickerContainer = document.getElementById('special-mass-picker-container');
const selectSpecialMass = document.getElementById('select-special-mass');
const inscricaoMonthNav = document.getElementById('inscricao-month-nav');
const labelQuaisMissas = document.getElementById('label-quais-missas');

// Navegadores de Mês
const btnPrevMonth = document.getElementById('btn-prev-month');
const btnNextMonth = document.getElementById('btn-next-month');
const currentMonthDisplay = document.getElementById('current-month-display');
const btnAdminPrevMonth = document.getElementById('btn-admin-prev-month');
const btnAdminNextMonth = document.getElementById('btn-admin-next-month');
const weekendLabel = document.getElementById('current-weekend-label');

// Form e Ticks
const selectName = document.getElementById('select-name');
const massOptions = document.getElementById('mass-options');
const formEscala = document.getElementById('form-escala');
const btnSubmitEscala = document.getElementById('btn-submit-escala');
const serverTickBanner = document.getElementById('server-tick-banner');
const massQuickActions = document.getElementById('mass-quick-actions');
const btnQuickDesmarcar = document.getElementById('btn-quick-desmarcar');
const btnQuickSabados = document.getElementById('btn-quick-sabados');
const btnQuickDomManha = document.getElementById('btn-quick-dom-manha');
const btnQuickDomNoite = document.getElementById('btn-quick-dom-noite');

// Tabela Pública
const publicScaleTitle = document.getElementById('public-scale-title');
const publicScaleMonthBadge = document.getElementById('public-scale-month-badge');
const scaleFilterContainer = document.getElementById('scale-filter-container');
const publicScaleList = document.getElementById('public-scale-list');
const scaleServerFilterSelect = document.getElementById('scale-server-filter-select');
const toast = document.getElementById('toast');

// Sub-abas Controle
const btnSubQuemVai = document.getElementById('btn-sub-quem-vai');
const btnSubChamada = document.getElementById('btn-sub-chamada');
const btnSubServidores = document.getElementById('btn-sub-servidores');
const btnSubEspecial = document.getElementById('btn-sub-especial');
const btnSubRelatorio = document.getElementById('btn-sub-relatorio');

const controlQuemVai = document.getElementById('control-quem-vai');
const controlChamada = document.getElementById('control-chamada');
const controlServidores = document.getElementById('control-servidores');
const controlEspecial = document.getElementById('control-especial');
const controlRelatorio = document.getElementById('control-relatorio');

const adminMassFilterContainer = document.getElementById('admin-mass-filter');
const massTabs = document.getElementById('mass-tabs');
const attendanceList = document.getElementById('attendance-list');
const generalStatusList = document.getElementById('general-status-list');
const roleInputs = document.querySelectorAll('input[name="user-role"]');
const btnExportPdf = document.getElementById('btn-export-pdf');
const btnExportExcel = document.getElementById('btn-export-excel');

// Form Missa Especial
const formSpecialMass = document.getElementById('form-special-mass');
const specialMassList = document.getElementById('special-mass-list');

// Inicialização
async function init() {
    try {
        updateMonthState();
        setupNavigation();
        setupRoleFilter();
        setupQuickActions();
        setupSpecialMassForm();
        setupQuemVaiServir();
        setupServerManagement();
        initChart();

        if (btnExportPdf) btnExportPdf.addEventListener('click', exportToPDF);
        if (btnExportExcel) btnExportExcel.addEventListener('click', exportToExcel);
    } catch (error) {
        console.error("Erro na inicialização:", error);
    }

    // Busca os dados DEPOIS de registrar os handlers, para que a navegação
    // (inclusive o Acesso Coordenador) já funcione mesmo com a rede lenta.
    try {
        await fetchData();
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
    }
}

// Navegação de Mês
function changeMonth(delta) {
    selectedMonth += delta;
    if (selectedMonth > 11) {
        selectedMonth = 0;
        selectedYear++;
    } else if (selectedMonth < 0) {
        selectedMonth = 11;
        selectedYear--;
    }
    updateMonthState();
}

function updateMonthState() {
    const { schedules, groups } = calculateMonthMassSchedules(selectedYear, selectedMonth);
    massSchedules = schedules;
    weekendGroups = groups;
    currentScaleFilter = 'all';
    adminMassFilter = 'all';
    
    if (massSchedules.length > 0 && !selectedMassId) {
        selectedMassId = massSchedules[0].id;
    }
    
    const monthText = `${MONTH_NAMES[selectedMonth]} de ${selectedYear}`;
    const monthShort = `${MONTH_NAMES[selectedMonth].substring(0, 3)}/${selectedYear}`;
    
    if (currentMonthDisplay) currentMonthDisplay.textContent = monthText;
    if (weekendLabel) weekendLabel.textContent = `Mês: ${monthText}`;
    if (publicScaleTitle) publicScaleTitle.textContent = `Agenda Geral - ${monthText}`;
    if (publicScaleMonthBadge) publicScaleMonthBadge.textContent = monthShort;
    
    renderMassOptions();
    updateTicksForSelectedServer();
    renderPublicScale();
    renderMassTabs();
    updateAttendanceList();
    renderMassesReport();
    updateGeneralList();
    updateChart();
    renderQuemVaiServir();
    renderServersAdminList();
}

async function fetchData() {
    try {
        const { data: sData, error: sErr } = await supabaseClient.from('servers').select('*');
        if (sErr) throw sErr;
        // Filtra servidores excluídos e nomes antigos
        servers = (sData || []).filter(s => s && s.cargo !== 'deleted' && s.nome && !s.nome.startsWith('__deleted__'));

        const { data: aData, error: aErr } = await supabaseClient.from('attendance').select('*');
        if (aErr) throw aErr;
        const validServerIds = servers.map(s => s.id);
        attendanceData = (aData || []).filter(a => a && a.status !== 'deleted' && validServerIds.includes(a.server_id));

        const { data: mData, error: mErr } = await supabaseClient.from('special_masses').select('*').order('mass_date', { ascending: true });
        if (mErr) throw mErr;
        specialMasses = mData || [];
        
        renderSpecialMassSelect();
        renderSpecialMassListAdmin();
        renderServerSelect();
        updateTicksForSelectedServer();
        renderPublicScale();
        renderMassTabs();
        updateAttendanceList();
        renderMassesReport();
        updateGeneralList();
        updateChart();
        renderQuemVaiServir();
        renderServersAdminList();
    } catch (e) {
        console.error("Erro ao buscar dados:", e);
        showToast("Erro ao conectar ao banco de dados.");
    }
}

function setupNavigation() {
    btnSelectWeekend.addEventListener('click', () => {
        currentMode = 'month';
        inscricaoTitle.textContent = "Escala Mensal";
        inscricaoSubtitle.textContent = "Selecione seu nome e marque os dias que você pode servir neste mês. Você pode alterar seus ticks ou desmarcar dias a qualquer momento.";
        specialMassPickerContainer.classList.add('hidden');
        if (labelQuaisMissas) labelQuaisMissas.classList.remove('hidden');
        if (inscricaoMonthNav) inscricaoMonthNav.classList.remove('hidden');
        showView(viewInscricao);
        renderServerSelect();
        renderMassOptions();
        updateTicksForSelectedServer();
        renderPublicScale();
    });

    btnSelectSpecial.addEventListener('click', () => {
        currentMode = 'special';
        inscricaoTitle.textContent = "Missa Especial";
        inscricaoSubtitle.textContent = "Selecione a missa, seu nome e informe se estará presente.";
        specialMassPickerContainer.classList.remove('hidden');
        if (labelQuaisMissas) labelQuaisMissas.classList.add('hidden');
        if (inscricaoMonthNav) inscricaoMonthNav.classList.add('hidden');
        if (serverTickBanner) serverTickBanner.classList.add('hidden');
        if (massQuickActions) massQuickActions.classList.add('hidden');
        showView(viewInscricao);
        renderServerSelect();
        renderMassOptions();
        renderPublicScale();
    });

    // Controles de Mês
    if (btnPrevMonth) btnPrevMonth.addEventListener('click', () => changeMonth(-1));
    if (btnNextMonth) btnNextMonth.addEventListener('click', () => changeMonth(1));
    if (btnAdminPrevMonth) btnAdminPrevMonth.addEventListener('click', () => changeMonth(-1));
    if (btnAdminNextMonth) btnAdminNextMonth.addEventListener('click', () => changeMonth(1));

    // Função de acesso ao admin com logs detalhados
    console.log('setupNavigation: registrando handlers de admin');
    const openAdminArea = () => {
        console.log('openAdminArea chamada');
        // Mostrar modal customizado para senha
        const modal = document.getElementById('admin-password-modal');
        const input = document.getElementById('admin-pass-input');
        const errorMsg = document.getElementById('admin-pass-error');
        modal.classList.remove('hidden');
        input.value = '';
        errorMsg.classList.add('hidden');
        input.focus();

        const hideModal = () => modal.classList.add('hidden');

        const verify = () => {
            const senha = input.value.trim().toLowerCase();
            console.log('Senha digitada:', senha);
            const senhaAtual = getSenhaCoordenador().toLowerCase();
            if (senha === senhaAtual || senha === 'acolitos2026' || senha === 'amoservir') {
                console.log('Senha correta – exibindo viewControle');
                hideModal();
                if (viewControle) {
                    showView(viewControle);
                } else {
                    console.warn('Elemento viewControle não encontrado');
                }
                fetchData()
                    .then(() => {
                        updateMonthState();
                        const btnSubQuemVai = document.getElementById('btn-sub-quem-vai');
                        if (btnSubQuemVai) btnSubQuemVai.click();
                    })
                    .catch(err => console.error('Erro ao buscar dados admin:', err));
            } else {
                console.warn('Senha incorreta');
                errorMsg.classList.remove('hidden');
            }
        };
        // Handlers dos botões do modal
        document.getElementById('admin-pass-confirm').onclick = verify;
        document.getElementById('admin-pass-cancel').onclick = hideModal;
        // Permitir Enter para confirmar
        input.onkeypress = e => { if (e.key === 'Enter') verify(); };
    };

    if (btnAdminAccess) {
        btnAdminAccess.addEventListener('click', () => {
            console.log('Botão Acesso Coordenador clicado');
            openAdminArea();
        });
    }
    if (btnControle) {
        btnControle.addEventListener('click', () => {
            console.log('Botão Controle (Acesso Coordenador) clicado');
            openAdminArea();
        });
    }
    if (btnInscricaoNav) {
        btnInscricaoNav.addEventListener('click', () => {
            showView(viewSelection);
            currentMode = 'month';
            currentSpecialMassId = null;
        });
    }

    btnsBack.forEach(btn => {
        btn.addEventListener('click', () => {
            showView(viewSelection);
            currentMode = 'month';
            currentSpecialMassId = null;
        });
    });

    // Sub-navegação Controle
    if (btnSubQuemVai) {
        btnSubQuemVai.addEventListener('click', () => {
            showControlSection(controlQuemVai, btnSubQuemVai);
            renderQuemVaiServir();
        });
    }

    if (btnSubChamada) {
        btnSubChamada.addEventListener('click', () => {
            showControlSection(controlChamada, btnSubChamada);
            renderMassTabs();
            updateAttendanceList();
        });
    }

    if (btnSubServidores) {
        btnSubServidores.addEventListener('click', () => {
            showControlSection(controlServidores, btnSubServidores);
            renderServersAdminList();
        });
    }

    if (btnSubEspecial) {
        btnSubEspecial.addEventListener('click', () => {
            showControlSection(controlEspecial, btnSubEspecial);
            renderSpecialMassListAdmin();
        });
    }

    if (btnSubRelatorio) {
        btnSubRelatorio.addEventListener('click', () => {
            showControlSection(controlRelatorio, btnSubRelatorio);
            renderMassesReport();
            updateChart();
            updateGeneralList();
        });
    }

    const btnConfirmAllMass = document.getElementById('btn-confirm-all-mass');
    if (btnConfirmAllMass) {
        btnConfirmAllMass.addEventListener('click', () => {
            window.confirmAllCurrentMass();
        });
    }

    // Seleção de Nome -> Atualiza Ticks Imediatamente
    selectName.addEventListener('change', () => {
        updateTicksForSelectedServer();
    });

    // Visualização pessoal na Agenda Geral (dropdown "Ver escala de:")
    if (scaleServerFilterSelect) {
        scaleServerFilterSelect.addEventListener('change', () => {
            scaleServerFilter = scaleServerFilterSelect.value;
            renderPublicScale();
        });
    }

    // Toggle de Tick ao clicar no Card ou Checkbox
    massOptions.addEventListener('change', (e) => {
        if (e.target.name === 'mass') {
            const label = e.target.closest('.mass-item')?.querySelector('.mass-label');
            if (label) {
                if (e.target.checked) label.classList.add('is-checked');
                else label.classList.remove('is-checked');
            }
            updateSubmitButtonText();
        }
    });

    // Re-renderiza a agenda ao cruzar o limite mobile/desktop (giro do celular)
    let lastIsMobile = window.innerWidth <= 768;
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const nowIsMobile = window.innerWidth <= 768;
            if (nowIsMobile !== lastIsMobile) {
                lastIsMobile = nowIsMobile;
                if (viewInscricao && !viewInscricao.classList.contains('hidden')) {
                    renderPublicScale();
                }
            }
        }, 200);
    });
}

function showView(view) {
    [viewSelection, viewInscricao, viewControle].forEach(v => v.classList.add('hidden'));
    view.classList.remove('hidden');

    // Mantém o menu superior em sincronia com a tela aberta
    if (btnInscricaoNav && btnControle) {
        const onAdmin = (view === viewControle);
        btnControle.classList.toggle('active', onAdmin);
        btnInscricaoNav.classList.toggle('active', !onAdmin);
    }

    // Garante que a nova tela comece visível (evita a sensação de "não abriu")
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showControlSection(section, btn) {
    [controlQuemVai, controlChamada, controlServidores, controlEspecial, controlRelatorio].forEach(s => {
        if (s) s.classList.add('hidden');
    });
    [btnSubQuemVai, btnSubChamada, btnSubServidores, btnSubEspecial, btnSubRelatorio].forEach(b => {
        if (b) b.classList.remove('active');
    });
    if (section) section.classList.remove('hidden');
    if (btn) btn.classList.add('active');
}

function setupRoleFilter() {
    roleInputs.forEach(input => {
        input.addEventListener('change', () => {
            renderServerSelect(input.value);
            updateTicksForSelectedServer();
        });
    });
}

function renderServerSelect(filterRole = null) {
    if (!filterRole) {
        const checkedRole = document.querySelector('input[name="user-role"]:checked');
        filterRole = checkedRole ? checkedRole.value : "Coroinha";
    }
    
    const previousSelected = selectName.value;
    selectName.innerHTML = '<option value="" disabled selected>Escolha seu nome...</option>';
    
    servers
        .filter(s => s.cargo === filterRole)
        .sort((a,b) => a.nome.localeCompare(b.nome))
        .forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.nome;
            selectName.appendChild(opt);
        });

    if (previousSelected && Array.from(selectName.options).some(o => o.value == previousSelected)) {
        selectName.value = previousSelected;
    }

    // Mantém o dropdown de visualização pessoal (Agenda Geral) em sincronia
    renderScaleServerFilterSelect();
}

// Dropdown "Ver escala de:" — cada acólito/coroinha escolhe seu nome na Agenda Geral
function renderScaleServerFilterSelect() {
    if (!scaleServerFilterSelect) return;
    const previous = scaleServerFilter;

    scaleServerFilterSelect.innerHTML = '<option value="all">Todos os servidores</option>';
    [...servers]
        .sort((a, b) => a.nome.localeCompare(b.nome))
        .forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = `${s.cargo === 'Acólito' ? '⛪' : '✝️'} ${s.nome}`;
            scaleServerFilterSelect.appendChild(opt);
        });

    const stillValid = previous !== 'all' &&
        Array.from(scaleServerFilterSelect.options).some(o => o.value == previous);

    if (stillValid) {
        scaleServerFilterSelect.value = previous;
    } else {
        scaleServerFilter = 'all';
        scaleServerFilterSelect.value = 'all';
    }
}

function renderSpecialMassSelect() {
    selectSpecialMass.innerHTML = '<option value="" disabled selected>Escolha a missa especial...</option>';
    if (specialMasses.length === 0) {
        selectSpecialMass.innerHTML = '<option value="" disabled>Nenhuma missa especial cadastrada</option>';
        return;
    }
    specialMasses.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        const [y, mon, d] = m.mass_date.split('-');
        opt.textContent = `${m.description} (${d}/${mon} às ${m.mass_time.substring(0,5)})`;
        selectSpecialMass.appendChild(opt);
    });

    selectSpecialMass.onchange = () => {
        currentSpecialMassId = selectSpecialMass.value;
        renderMassOptions();
        renderPublicScale();
    };
}

window.marcarPorFiltro = function(prefix) {
    let count = 0;
    document.querySelectorAll('input[name="mass"]').forEach(cb => {
        if (cb.value.startsWith(prefix) || cb.value.includes(prefix)) {
            cb.checked = true;
            count++;
        }
    });
    updateMassDropdownSummary();
    updateSubmitButtonText();
    showToast(`${count} missa(s) marcada(s)! Toque em "Salvar" abaixo.`);
};

window.desmarcarTodasMissas = function() {
    document.querySelectorAll('input[name="mass"]').forEach(cb => {
        cb.checked = false;
    });
    updateMassDropdownSummary();
    updateSubmitButtonText();
    showToast("Todas as missas foram desmarcadas!");
};

// Configuração dos Botões de Ação Rápida (Shortcuts)
function setupQuickActions() {
    if (btnQuickDesmarcar) {
        btnQuickDesmarcar.addEventListener('click', () => {
            document.querySelectorAll('input[name="mass"]').forEach(cb => {
                cb.checked = false;
                const label = cb.closest('.mass-item')?.querySelector('.mass-label');
                if (label) label.classList.remove('is-checked');
            });
            updateSubmitButtonText();
            showToast("Todos os ticks foram desmarcados! Clique no botão abaixo para salvar.");
        });
    }

    if (btnQuickSabados) {
        btnQuickSabados.addEventListener('click', () => {
            document.querySelectorAll('input[name="mass"]').forEach(cb => {
                if (cb.value.startsWith('sab-')) {
                    cb.checked = true;
                    const label = cb.closest('.mass-item')?.querySelector('.mass-label');
                    if (label) label.classList.add('is-checked');
                }
            });
            updateSubmitButtonText();
            showToast("Todos os sábados foram marcados!");
        });
    }

    if (btnQuickDomManha) {
        btnQuickDomManha.addEventListener('click', () => {
            document.querySelectorAll('input[name="mass"]').forEach(cb => {
                if (cb.value.startsWith('dom-09-') || cb.value.startsWith('dom-11-')) {
                    cb.checked = true;
                    const label = cb.closest('.mass-item')?.querySelector('.mass-label');
                    if (label) label.classList.add('is-checked');
                }
            });
            updateSubmitButtonText();
            showToast("Missas de domingo pela manhã foram marcadas!");
        });
    }

    if (btnQuickDomNoite) {
        btnQuickDomNoite.addEventListener('click', () => {
            document.querySelectorAll('input[name="mass"]').forEach(cb => {
                if (cb.value.startsWith('dom-18-')) {
                    cb.checked = true;
                    const label = cb.closest('.mass-item')?.querySelector('.mass-label');
                    if (label) label.classList.add('is-checked');
                }
            });
            updateSubmitButtonText();
            showToast("Missas de domingo à noite foram marcadas!");
        });
    }
}

// Renderização das Opções de Missa (Agrupadas por Final de Semana)
function renderMassOptions() {
    massOptions.innerHTML = '';
    
    if (currentMode === 'month' || currentMode === 'weekend') {
        const selectedServerId = selectName.value ? parseInt(selectName.value) : null;
        let serverMassIds = [];
        if (selectedServerId) {
            serverMassIds = attendanceData
                .filter(a => a.server_id === selectedServerId)
                .map(a => a.mass_id);
        }

        if (weekendGroups.length === 0) {
            massOptions.innerHTML = '<p style="text-align:center; color:#7f8c8d; padding:20px;">Nenhuma data encontrada para este mês.</p>';
            return;
        }

        const dropdown = document.createElement('div');
        dropdown.className = 'mass-dropdown';
        dropdown.id = 'mass-dropdown';
        dropdown.innerHTML = `
            <button type="button" class="mass-dropdown-toggle" id="mass-dropdown-toggle" aria-haspopup="listbox" aria-expanded="true">
                <span class="mass-dropdown-icon">📅</span>
                <span class="mass-dropdown-summary" id="mass-dropdown-summary">Toque para marcar/desmarcar os dias e horários que você quer servir</span>
                <span class="mass-dropdown-count hidden" id="mass-dropdown-count"></span>
                <span class="mass-dropdown-chevron">▼</span>
            </button>
            <div class="mass-dropdown-panel" id="mass-dropdown-panel">
                <div class="mass-dropdown-options"></div>
            </div>
        `;
        massOptions.appendChild(dropdown);

        const optionsWrap = dropdown.querySelector('.mass-dropdown-options');

        weekendGroups.forEach(group => {
            const g = document.createElement('div');
            g.className = 'mass-dropdown-group';

            const header = document.createElement('div');
            header.className = 'mass-dropdown-group-header';
            header.innerHTML = `
                <span>📅 ${group.fullLabel}</span>
                <span class="weekend-badge">${group.masses.length} missa${group.masses.length > 1 ? 's' : ''}</span>
            `;
            g.appendChild(header);

            group.masses.forEach(m => {
                const isTicked = serverMassIds.includes(m.id);
                const item = document.createElement('label');
                item.className = 'mass-dropdown-item';
                item.setAttribute('for', `check-${m.id}`);
                item.innerHTML = `
                    <input type="checkbox" id="check-${m.id}" name="mass" value="${m.id}" ${isTicked ? 'checked' : ''}>
                    <span class="tick-indicator">✓</span>
                    <span class="mass-info-wrap" style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px;">
                        <span class="mass-info-date" style="font-weight: 600;">${m.dia} (${m.data}) – <strong style="color: #2563eb; font-size: 0.95rem;">${m.hora}</strong></span>
                        ${m.obs ? `<span style="font-size: 0.75rem; color: #d97706; font-weight: 600;">⭐ ${m.obs}</span>` : ''}
                    </span>
                `;
                g.appendChild(item);
            });

            optionsWrap.appendChild(g);
        });

        const toggleBtn = dropdown.querySelector('.mass-dropdown-toggle');
        const panel = dropdown.querySelector('.mass-dropdown-panel');

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = panel.classList.contains('hidden');
            panel.classList.toggle('hidden', !willOpen);
            toggleBtn.setAttribute('aria-expanded', String(willOpen));
        });

        const onDocClick = (e) => {
            if (!document.contains(dropdown)) {
                document.removeEventListener('click', onDocClick);
                return;
            }
            if (!dropdown.contains(e.target)) {
                panel.classList.add('hidden');
                toggleBtn.setAttribute('aria-expanded', 'false');
            }
        };
        document.addEventListener('click', onDocClick);

        updateMassDropdownSummary();
        updateSubmitButtonText();
    } else if (currentMode === 'special' && currentSpecialMassId) {
        const div = document.createElement('div');
        div.className = 'options-grid';
        div.style.gridTemplateColumns = '1fr 1fr';
        div.style.width = '100%';
        div.innerHTML = `
            <div class="mass-item">
                <input type="radio" id="special-present" name="special-status" value="present" checked>
                <label for="special-present" class="mass-label is-checked">
                    <div class="tick-indicator">✓</div>
                    <div class="mass-info-wrap">
                        <span class="mass-info-date">Estarei Presente</span>
                        <span class="mass-info-time">Confirmar presença</span>
                    </div>
                </label>
            </div>
            <div class="mass-item">
                <input type="radio" id="special-absent" name="special-status" value="absent">
                <label for="special-absent" class="mass-label">
                    <div class="tick-indicator">✕</div>
                    <div class="mass-info-wrap">
                        <span class="mass-info-date">Estarei Ausente</span>
                        <span class="mass-info-time">Informar falta</span>
                    </div>
                </label>
            </div>
        `;
        massOptions.appendChild(div);
        
        div.querySelectorAll('input[name="special-status"]').forEach(r => {
            r.addEventListener('change', () => {
                div.querySelectorAll('.mass-label').forEach(l => l.classList.remove('is-checked'));
                const parent = r.closest('.mass-item')?.querySelector('.mass-label');
                if (parent) parent.classList.add('is-checked');
            });
        });
    } else if (currentMode === 'special') {
        massOptions.innerHTML = '<p style="text-align:center; color:#7f8c8d; padding:20px;">Selecione uma missa especial acima primeiro.</p>';
    }
}

// Atualiza Ticks e Banner quando um Servidor é Selecionado
function updateTicksForSelectedServer() {
    if (currentMode === 'special') {
        if (serverTickBanner) serverTickBanner.classList.add('hidden');
        if (massQuickActions) massQuickActions.classList.add('hidden');
        return;
    }
    
    const serverId = selectName.value ? parseInt(selectName.value) : null;
    if (!serverId) {
        if (serverTickBanner) serverTickBanner.classList.add('hidden');
        if (massQuickActions) massQuickActions.classList.add('hidden');
        
        document.querySelectorAll('input[name="mass"]').forEach(cb => {
            cb.checked = false;
            const label = cb.closest('.mass-item')?.querySelector('.mass-label');
            if (label) label.classList.remove('is-checked');
        });
        updateSubmitButtonText();
        syncPersonalViewToServer(null);
        return;
    }
    
    const server = servers.find(s => s.id === serverId);
    if (!server) return;
    
    if (massQuickActions) massQuickActions.classList.remove('hidden');
    if (serverTickBanner) serverTickBanner.classList.remove('hidden');
    
    const monthMassIds = massSchedules.map(m => m.id);
    const serverRegistrations = attendanceData.filter(a => a.server_id === serverId && monthMassIds.includes(a.mass_id));
    const registeredIds = serverRegistrations.map(a => a.mass_id);
    
    document.querySelectorAll('input[name="mass"]').forEach(cb => {
        const isTicked = registeredIds.includes(cb.value);
        cb.checked = isTicked;
        const label = cb.closest('.mass-item')?.querySelector('.mass-label');
        if (label) {
            if (isTicked) label.classList.add('is-checked');
            else label.classList.remove('is-checked');
        }
    });
    
    const monthText = `${MONTH_NAMES[selectedMonth]} de ${selectedYear}`;
    if (serverRegistrations.length > 0) {
        serverTickBanner.className = 'tick-banner has-ticks';
        serverTickBanner.innerHTML = `
            <div class="tick-banner-content">
                <div class="tick-banner-icon">📋</div>
                <div class="tick-banner-text">
                    <h4>Marcações de ${server.nome}</h4>
                    <p>Você tem <strong>${serverRegistrations.length} missa(s) marcada(s)</strong> para ${monthText}. Use o menu dropdown abaixo para <strong>mudar</strong> ou <strong>desmarcar</strong> qualquer missa, depois clique em Salvar.</p>
                </div>
            </div>
        `;
    } else {
        serverTickBanner.className = 'tick-banner no-ticks';
        serverTickBanner.innerHTML = `
            <div class="tick-banner-content">
                <div class="tick-banner-icon">💡</div>
                <div class="tick-banner-text">
                    <h4>Olá, ${server.nome}!</h4>
                    <p>Você ainda não marcou nenhuma missa para ${monthText}. Abra o menu dropdown abaixo, marque os dias e horários que você pode servir e depois clique em Salvar.</p>
                </div>
            </div>
        `;
    }
    
    updateSubmitButtonText();

    // Ao escolher o nome no formulário, a Agenda Geral mostra só a escala dessa pessoa
    syncPersonalViewToServer(serverId);
}

// Sincroniza o dropdown "Ver escala de:" com o nome escolhido no formulário
function syncPersonalViewToServer(serverId) {
    const newFilter = serverId ? String(serverId) : 'all';
    if (String(scaleServerFilter) === newFilter) return;
    scaleServerFilter = serverId ? serverId : 'all';
    if (scaleServerFilterSelect) scaleServerFilterSelect.value = newFilter;
    renderPublicScale();
}

// Atualiza o Resumo do Dropdown de Missas (mostra quantas e quais missas estão marcadas)
function updateMassDropdownSummary() {
    const summaryEl = document.getElementById('mass-dropdown-summary');
    const countEl = document.getElementById('mass-dropdown-count');
    if (!summaryEl || !countEl) return;

    const checked = Array.from(document.querySelectorAll('input[name="mass"]:checked'));
    if (checked.length === 0) {
        summaryEl.textContent = 'Selecione as missas, datas e horários que deseja servir...';
        countEl.classList.add('hidden');
        return;
    }

    const labels = checked.map(cb => {
        const item = cb.closest('.mass-dropdown-item');
        const date = item?.querySelector('.mass-info-date')?.textContent || '';
        const time = item?.querySelector('.mass-info-time')?.textContent || '';
        return `${date} às ${time}`;
    });

    summaryEl.textContent = labels.slice(0, 2).join(' • ') + (labels.length > 2 ? ` +${labels.length - 2} outra(s)` : '');
    countEl.textContent = checked.length;
    countEl.classList.remove('hidden');
}

// Atualiza o Texto do Botão de Submit Dinamicamente
function updateSubmitButtonText() {
    if (!btnSubmitEscala) return;
    
    if (currentMode === 'special') {
        btnSubmitEscala.textContent = "Confirmar Presença na Missa Especial";
        btnSubmitEscala.className = "btn-primary";
        return;
    }
    
    updateMassDropdownSummary();
    
    const checkedCount = document.querySelectorAll('input[name="mass"]:checked').length;
    if (checkedCount > 0) {
        btnSubmitEscala.textContent = `Salvar Alterações na Escala (${checkedCount} missa${checkedCount > 1 ? 's' : ''} marcada${checkedCount > 1 ? 's' : ''})`;
        btnSubmitEscala.className = "btn-primary";
    } else {
        btnSubmitEscala.textContent = "Desmarcar Todas as Minhas Missas do Mês";
        btnSubmitEscala.className = "btn-primary";
    }
}

// Submissão do Formulário de Escala
formEscala.addEventListener('submit', async (e) => {
    e.preventDefault();
    const serverId = selectName.value;
    if (!serverId) {
        showToast("Por favor, selecione seu nome!");
        return;
    }
    
    const server = servers.find(s => s.id == serverId);
    const serverName = server ? server.nome : "Servidor";
    const monthText = `${MONTH_NAMES[selectedMonth]} de ${selectedYear}`;
    
    let selectedEntries = [];
    const monthMassIds = massSchedules.map(m => m.id);
    
    if (currentMode === 'month' || currentMode === 'weekend') {
        const selectedMasses = Array.from(document.querySelectorAll('input[name="mass"]:checked')).map(i => i.value);
        
        selectedEntries = selectedMasses.map(mId => ({
            server_id: parseInt(serverId),
            mass_id: mId,
            status: 'pretended',
            confirmed: false
        }));
    } else {
        if (!currentSpecialMassId) {
            showToast("Selecione a missa especial!");
            return;
        }
        const status = document.querySelector('input[name="special-status"]:checked').value;
        selectedEntries = [{
            server_id: parseInt(serverId),
            mass_id: `special-${currentSpecialMassId}`,
            status: status,
            confirmed: (status === 'present')
        }];
    }

    const btnSubmit = formEscala.querySelector('button[type="submit"]');
    const originalText = btnSubmit.textContent;
    btnSubmit.textContent = "Salvando...";
    btnSubmit.disabled = true;

    try {
        if (currentMode === 'month' || currentMode === 'weekend') {
            // Remove/invalida todas as marcações anteriores deste servidor no mês atual
            try {
                await supabaseClient.from('attendance')
                    .update({ status: 'deleted' })
                    .eq('server_id', serverId)
                    .in('mass_id', monthMassIds);
            } catch (errDel) {
                console.warn("Aviso ao limpar attendance antiga:", errDel);
            }
            attendanceData = attendanceData.filter(item => item.server_id != serverId || !monthMassIds.includes(item.mass_id));
            
            if (selectedEntries.length > 0) {
                const { data, error } = await supabaseClient.from('attendance').insert(selectedEntries).select();
                if (error) throw error;
                if (data) attendanceData.push(...data);
                showToast(`Escala de ${serverName} atualizada! ${selectedEntries.length} missa(s) marcada(s) para ${monthText} ⛪`);
            } else {
                showToast(`Todas as suas missas de ${monthText} foram desmarcadas com sucesso! 👍`);
            }
        } else {
            // Missa Especial
            const mId = `special-${currentSpecialMassId}`;
            try {
                await supabaseClient.from('attendance')
                    .update({ status: 'deleted' })
                    .eq('server_id', serverId)
                    .eq('mass_id', mId);
            } catch (errDel) {
                console.warn("Aviso ao limpar missa especial:", errDel);
            }
            attendanceData = attendanceData.filter(item => item.server_id != serverId || item.mass_id != mId);
            
            const { data, error } = await supabaseClient.from('attendance').insert(selectedEntries).select();
            if (error) throw error;
            if (data) attendanceData.push(...data);
            
            const m = specialMasses.find(sm => sm.id == currentSpecialMassId);
            const massName = m ? m.description : "Missa Especial";
            const status = document.querySelector('input[name="special-status"]:checked').value;
            if (status === 'present') {
                showToast(`Você foi cadastrado como presente na ${massName}! 🌟`);
            } else {
                showToast("Sua ausência foi informada com sucesso.");
            }
        }

        // Atualiza a visualização mantendo a seleção ativa
        updateTicksForSelectedServer();
        renderPublicScale();
        updateGeneralList();
        updateChart();
    } catch (err) {
        console.error("Erro ao salvar escala:", err);
        showToast("Erro ao salvar. Tente novamente.");
    } finally {
        btnSubmit.textContent = originalText;
        btnSubmit.disabled = false;
        updateSubmitButtonText();
    }
});

// Renderização dos Filtros da Tabela Pública
function renderScaleFilters() {
    if (!scaleFilterContainer) return;
    scaleFilterContainer.innerHTML = '';
    
    const btnAll = document.createElement('button');
    btnAll.type = 'button';
    btnAll.className = `btn-filter ${currentScaleFilter === 'all' ? 'active' : ''}`;
    btnAll.textContent = `Todo o Mês (${massSchedules.length})`;
    btnAll.onclick = () => {
        currentScaleFilter = 'all';
        renderPublicScale();
    };
    scaleFilterContainer.appendChild(btnAll);
    
    weekendGroups.forEach(g => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn-filter ${currentScaleFilter == g.index ? 'active' : ''}`;
        btn.textContent = g.label;
        btn.onclick = () => {
            currentScaleFilter = g.index;
            renderPublicScale();
        };
        scaleFilterContainer.appendChild(btn);
    });
}

// Renderização do Resumo Público de Quantidade por Missa
// Se personalServerId for informado, mostra apenas as missas daquele servidor com seu status
function renderPublicMassSummary(massList, personalServerId) {
    const container = document.getElementById('public-mass-summary');
    if (!container) return;
    container.innerHTML = '';

    if (!massList || massList.length === 0) return;

    if (personalServerId) {
        const myEntries = attendanceData.filter(a => a.server_id == personalServerId);
        const myMassIds = myEntries.map(a => a.mass_id);
        const myMasses = massList.filter(m => myMassIds.includes(m.id));

        if (myMasses.length === 0) {
            container.innerHTML = '<p class="chip-empty">Você ainda não marcou nenhuma missa neste período.</p>';
            return;
        }

        myMasses.forEach(mass => {
            const entry = myEntries.find(a => a.mass_id === mass.id);
            const st = entry ? entry.status : 'pretended';
            let cls = 'st-in', txt = '✓ Inscrito';
            if (st === 'present') { cls = 'st-present'; txt = '✓ Presente'; }
            else if (st === 'absent') { cls = 'st-absent'; txt = '✗ Falta'; }

            const chip = document.createElement('div');
            chip.className = 'mass-summary-chip personal-chip';
            chip.innerHTML = `
                <span class="chip-title">${mass.dia.substring(0,3)} ${mass.data} – ${mass.hora}</span>
                <div class="chip-counts">
                    <span class="chip-status ${cls}">${txt}</span>
                </div>
            `;
            container.appendChild(chip);
        });
        return;
    }

    massList.forEach(mass => {
        const entriesForMass = attendanceData.filter(a => a.mass_id === mass.id);

        let acolitoCount = 0;
        let coroinhaCount = 0;

        entriesForMass.forEach(entry => {
            const server = servers.find(s => s.id === entry.server_id);
            if (server) {
                if (server.cargo === 'Acólito') acolitoCount++;
                else if (server.cargo === 'Coroinha') coroinhaCount++;
            }
        });

        const metaAco = getMetaAcolitos();
        const metaCor = getMetaCoroinhas();
        const metaTotal = metaAco + metaCor;
        const total = acolitoCount + coroinhaCount;
        const chip = document.createElement('div');
        chip.className = 'mass-summary-chip';
        chip.innerHTML = `
            <span class="chip-title">${mass.dia.substring(0,3)} ${mass.data} – ${mass.hora}</span>
            <div class="chip-counts">
                <span class="chip-count-badge total" title="Total inscrito / Meta">👥 ${total}/${metaTotal}</span>
                <span class="chip-count-badge acolito" title="Acólitos inscritos / Meta">⛪ Ac: ${acolitoCount}/${metaAco}</span>
                <span class="chip-count-badge coroinha" title="Coroinhas inscritos / Meta">✝️ Co: ${coroinhaCount}/${metaCor}</span>
            </div>
        `;
        container.appendChild(chip);
    });
}

// Renderizacao da Tabela Publica da Escala
function renderPublicScale() {
    if (!publicScaleList) return;
    publicScaleList.innerHTML = '';
    publicScaleList.classList.remove('cards-view');

    const attendanceMap = {};
    attendanceData.forEach(function(entry) {
        if (!attendanceMap[entry.server_id]) attendanceMap[entry.server_id] = {};
        attendanceMap[entry.server_id][entry.mass_id] = entry.status;
    });

    var sortedServers = [...servers].sort(function(a,b){ return a.nome.localeCompare(b.nome); });

    // Visualização pessoal: só o servidor escolhido no dropdown
    var personalServerId = null;
    if (scaleServerFilter && scaleServerFilter !== 'all') {
        personalServerId = scaleServerFilter;
        sortedServers = sortedServers.filter(s => s.id == scaleServerFilter);
    }

    var massList = [];
    if (currentMode === 'month' || currentMode === 'weekend') {
        renderScaleFilters();
        if (currentScaleFilter === 'all') {
            massList = massSchedules;
        } else {
            massList = massSchedules.filter(function(m){ return m.weekendIndex == currentScaleFilter; });
        }
    } else {
        if (scaleFilterContainer) scaleFilterContainer.innerHTML = '';
        if (!currentSpecialMassId) {
            publicScaleList.innerHTML = '<p style="text-align:center;padding:20px;color:#7f8c8d;">Selecione uma missa especial para ver a agenda.</p>';
            return;
        }
        var sm = specialMasses.find(function(x){ return x.id == currentSpecialMassId; });
        if (sm) {
            var parts = sm.mass_date.split('-');
            massList = [{
                id: 'special-' + currentSpecialMassId,
                dia: sm.description,
                data: parts[2] + '/' + parts[1],
                hora: sm.mass_time.substring(0,5)
            }];
        }
    }

    if (massList.length === 0) {
        publicScaleList.innerHTML = '<p style="text-align:center;padding:20px;color:#7f8c8d;">Nenhuma missa encontrada para este periodo.</p>';
        renderPublicMassSummary([], personalServerId);
        return;
    }

    // Visão pessoal: lista limpa com as missas e horários da pessoa
    if (personalServerId) {
        const summaryEl = document.getElementById('public-mass-summary');
        if (summaryEl) summaryEl.innerHTML = ''; // os cards já mostram o status
        renderPersonalScaleCards(massList, personalServerId);
        return;
    }

    renderPublicMassSummary(massList, null);

    // Celular: cartões por missa (fáceis de ler, sem tabela estreita)
    if (window.innerWidth <= 768) {
        renderMobilePublicScaleCards(massList, attendanceMap);
        return;
    }

    if (currentMode !== 'month' && currentMode !== 'weekend') {
        renderWeekendSection(publicScaleList, massList, sortedServers, attendanceMap, null, personalServerId);
        return;
    }

    if (currentScaleFilter !== 'all') {
        var group = weekendGroups.find(function(g){ return g.index == currentScaleFilter; });
        renderWeekendSection(publicScaleList, massList, sortedServers, attendanceMap, group, personalServerId);
    } else {
        weekendGroups.forEach(function(group) {
            var groupMasses = massList.filter(function(m){ return m.weekendIndex === group.index; });
            if (groupMasses.length === 0) return;
            renderWeekendSection(publicScaleList, groupMasses, sortedServers, attendanceMap, group, personalServerId);
        });
    }
}

// Visão pessoal: cartões limpos com as missas marcadas pela pessoa
function renderPersonalScaleCards(massList, personalServerId) {
    const server = servers.find(s => s.id == personalServerId);
    publicScaleList.classList.add('cards-view');
    if (!server) return;

    const roleClass = server.cargo === 'Ac\u00f3lito' ? 'acolito' : 'coroinha';
    const roleIcon = server.cargo === 'Ac\u00f3lito' ? '\u26EA' : '\u271D\uFE0F';

    const myEntries = attendanceData.filter(a => a.server_id == personalServerId);
    const myMassIds = new Set(myEntries.map(a => a.mass_id));
    const myMasses = massList.filter(m => myMassIds.has(m.id));

    // Cabeçalho pessoal com botão de alterar
    const head = document.createElement('div');
    head.className = 'personal-scale-head';
    head.innerHTML = `
        <div class="psh-info">
            <span class="psh-avatar ${roleClass}">${server.nome.trim().charAt(0).toUpperCase()}</span>
            <div>
                <h4>${server.nome}</h4>
                <span class="badge ${roleClass}">${roleIcon} ${server.cargo}</span>
            </div>
        </div>
        <button type="button" class="btn-quick" id="personal-edit-btn">✏️ Alterar escala</button>
    `;
    publicScaleList.appendChild(head);

    const btnEdit = head.querySelector('#personal-edit-btn');
    if (btnEdit) btnEdit.onclick = () => editServerTicks(personalServerId);

    if (myMasses.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'personal-scale-empty';
        empty.textContent = 'Nenhuma missa marcada neste período. Toque em "Alterar escala" para marcar seus dias.';
        publicScaleList.appendChild(empty);
        return;
    }

    myMasses.forEach(m => {
        const entry = myEntries.find(a => a.mass_id === m.id);
        const st = entry ? entry.status : 'pretended';
        let cls = 'st-in', txt = '\u2713 Inscrito';
        if (st === 'present') { cls = 'st-present'; txt = '\u2713 Presente'; }
        else if (st === 'absent') { cls = 'st-absent'; txt = '\u2717 Falta'; }

        const card = document.createElement('div');
        card.className = 'personal-mass-card';
        card.innerHTML = `
            <div class="pmc-left">
                <span class="pmc-day">${m.dia}</span>
                <span class="pmc-date">${m.data}</span>
            </div>
            <span class="pmc-time">⏰ ${m.hora}</span>
            <span class="chip-status ${cls}">${txt}</span>
        `;
        publicScaleList.appendChild(card);
    });
}

// Celular: um cartão por missa, com os nomes de quem vai servir
function renderMobilePublicScaleCards(massList, attendanceMap) {
    publicScaleList.classList.add('cards-view');

    massList.forEach(m => {
        const registered = servers
            .map(s => ({ s, status: attendanceMap[s.id] && attendanceMap[s.id][m.id] }))
            .filter(x => x.status);

        const acolitos = registered.filter(x => x.s.cargo === 'Ac\u00f3lito')
            .sort((a, b) => a.s.nome.localeCompare(b.s.nome));
        const coroinhas = registered.filter(x => x.s.cargo === 'Coroinha')
            .sort((a, b) => a.s.nome.localeCompare(b.s.nome));
        const total = registered.length;

        const card = document.createElement('div');
        card.className = 'pub-mass-card';

        const chipHtml = (items, kind) => {
            if (items.length === 0) return '';
            return `
                <div class="coord-role-section">
                    <div class="coord-role-heading ${kind}"><span>${kind === 'acolito' ? '\u26EA Ac\u00f3litos' : '\u271D\uFE0F Coroinhas'}</span><span>${items.length}</span></div>
                    <div class="coord-chips-list">
                        ${items.map(({ s, status }) => {
                            let stCls = 'pending', stTxt = 'Inscrito';
                            if (status === 'present') { stCls = 'confirmed'; stTxt = 'Presente'; }
                            else if (status === 'absent') { stCls = 'absent'; stTxt = 'Falta'; }
                            return `
                                <div class="server-chip ${kind}" data-server-id="${s.id}" title="Toque para carregar a escala de ${s.nome}">
                                    <div class="server-chip-avatar">${s.nome.trim().charAt(0).toUpperCase()}</div>
                                    <span class="server-chip-name">${s.nome}</span>
                                    <span class="server-chip-status ${stCls}">${stTxt}</span>
                                </div>`;
                        }).join('')}
                    </div>
                </div>`;
        };

        let bodyHtml = '';
        if (total === 0) {
            bodyHtml = '<div class="empty-role-hint"><span>🕊️</span> Ninguém escalado ainda</div>';
        } else {
            bodyHtml = chipHtml(acolitos, 'acolito') + chipHtml(coroinhas, 'coroinha');
        }

        card.innerHTML = `
            <div class="coord-mass-header">
                <div class="coord-mass-title-group">
                    <span class="coord-mass-day-title">📅 ${m.dia} ${m.data}</span>
                    <span class="coord-mass-time-badge">⏰ ${m.hora}</span>
                </div>
                <div class="coord-mass-counts-row">
                    <span class="count-pill total">👥 ${total}</span>
                    <span class="count-pill ac">⛪ ${acolitos.length}</span>
                    <span class="count-pill co">✝️ ${coroinhas.length}</span>
                </div>
            </div>
            <div class="coord-mass-body">${bodyHtml}</div>
        `;

        card.querySelectorAll('.server-chip[data-server-id]').forEach(chip => {
            chip.onclick = () => editServerTicks(chip.getAttribute('data-server-id'));
        });

        publicScaleList.appendChild(card);
    });
}

function renderWeekendSection(container, masses, sortedServers, attendanceMap, group, personalServerId) {
    var NAME_W = window.innerWidth <= 480 ? 120 : 150;
    var MASS_W = window.innerWidth <= 480 ? 68  : 80;
    var gridCols = NAME_W + 'px repeat(' + masses.length + ', minmax(' + MASS_W + 'px, 1fr))';

    var section = document.createElement('div');
    section.className = 'scale-v2-section';

    if (group) {
        var hdr = document.createElement('div');
        hdr.className = 'scale-v2-section-header';
        var lbl  = group.fullLabel || group.label;
        var cnt  = masses.length + ' miss' + (masses.length === 1 ? 'a' : 'as');
        hdr.innerHTML =
            '<div class="scale-v2-section-label"><span>&#x26EA;</span><span>' + lbl + '</span></div>' +
            '<span class="scale-v2-section-count">' + cnt + '</span>';
        section.appendChild(hdr);
    }

    var tableWrap = document.createElement('div');
    tableWrap.className = 'scale-v2-table';

    /* ─── Column header row ─── */
    var colHdrRow = document.createElement('div');
    colHdrRow.className = 'scale-v2-row scale-v2-col-header-row';
    colHdrRow.style.gridTemplateColumns = gridCols;

    var srvHdr = document.createElement('div');
    srvHdr.className = 'scale-v2-cell scale-v2-name-col scale-v2-hdr-cell';
    srvHdr.innerHTML = '<span>Servidor</span>';
    colHdrRow.appendChild(srvHdr);

    masses.forEach(function(m) {
        var cell = document.createElement('div');
        cell.className = 'scale-v2-cell scale-v2-mass-col scale-v2-hdr-cell';
        var isSat   = m.dayOfWeek === 6;
        var dayAbbr = (m.dia || '').substring(0, 3);
        cell.innerHTML =
            '<div class="scale-v2-mass-pill ' + (isSat ? 'is-sat' : 'is-sun') + '">' +
            '<span class="sv2-day">'  + dayAbbr + '</span>' +
            '<span class="sv2-date">' + m.data  + '</span>' +
            '<span class="sv2-time">' + m.hora  + '</span>' +
            '</div>';
        colHdrRow.appendChild(cell);
    });
    tableWrap.appendChild(colHdrRow);

    /* ─── Summary rows (ocultas na visão pessoal de um servidor) ─── */
    if (!personalServerId) {
        var summaryDefs = [
        { cls: 'sv2-sum-coroinha', label: '&#x271D;&#xFE0F; Coroinhas', fn: function(c){ return c.coroinha; } },
        { cls: 'sv2-sum-acolito',  label: '&#x26EA; Acolitos',          fn: function(c){ return c.acolito;  } },
        { cls: 'sv2-sum-total',    label: '&#x1F465; Total',            fn: function(c){ return c.total;    } }
    ];

    summaryDefs.forEach(function(def) {
        var row = document.createElement('div');
        row.className = 'scale-v2-row scale-v2-summary-row ' + def.cls;
        row.style.gridTemplateColumns = gridCols;

        var lbl = document.createElement('div');
        lbl.className = 'scale-v2-cell scale-v2-name-col scale-v2-sum-label';
        lbl.innerHTML = def.label;
        row.appendChild(lbl);

        masses.forEach(function(m) {
            var counts = getMassCounts(m.id);
            var val    = def.fn(counts);
            var cell   = document.createElement('div');
            cell.className = 'scale-v2-cell scale-v2-mass-col scale-v2-sum-val';
            cell.innerHTML = '<span class="sv2-count ' + def.cls + '">' + val + '</span>';
            row.appendChild(cell);
        });
            tableWrap.appendChild(row);
        });
    }

    /* ─── Server rows ─── */
    var monthMassIds = massSchedules.map(function(m){ return m.id; });

    sortedServers.forEach(function(server, idx) {
        var totalTicksMonth = attendanceData.filter(function(a){
            return a.server_id === server.id && monthMassIds.includes(a.mass_id);
        }).length;

        var isAcolito = server.cargo === 'Ac\u00f3lito';
        var roleClass = isAcolito ? 'role-acolito'  : 'role-coroinha';
        var roleLabel = isAcolito ? 'Ac\u00f3lito'  : 'Coroinha';

        var row = document.createElement('div');
        row.className = 'scale-v2-row scale-v2-server-row ' + (idx % 2 === 0 ? 'sv2-even' : 'sv2-odd');
        row.style.gridTemplateColumns = gridCols;

        var nameCell = document.createElement('div');
        nameCell.className = 'scale-v2-cell scale-v2-name-col scale-v2-server-name';
        nameCell.title = 'Clique para alterar a escala de ' + server.nome;
        nameCell.onclick = (function(id){ return function(){ editServerTicks(id); }; })(server.id);
        var tcls = totalTicksMonth > 0 ? 'has-ticks' : '';
        nameCell.innerHTML =
            '<div class="sv2-server-info">' +
              '<span class="sv2-server-title">' + server.nome + '</span>' +
              '<div class="sv2-server-badges">' +
                '<span class="badge ' + roleClass + '" style="font-size:0.6rem;padding:1px 5px;">' + roleLabel + '</span>' +
                '<span class="badge-total-ticks ' + tcls + '" style="font-size:0.6rem;padding:1px 5px;">' + totalTicksMonth + 'ms</span>' +
              '</div>' +
            '</div>' +
            '<button type="button" class="btn-row-edit sv2-edit-btn" title="Alterar">&#x270F;&#xFE0F;</button>';
        row.appendChild(nameCell);

        masses.forEach(function(m) {
            var status = (attendanceMap[server.id] && attendanceMap[server.id][m.id])
                         ? attendanceMap[server.id][m.id] : null;
            var icon = '\u2014', cls = 'sv2-none', tip = 'N\u00e3o inscrito';
            if (status === 'present') {
                icon = '\u2714'; cls = 'sv2-present'; tip = 'Presen\u00e7a confirmada';
            } else if (status === 'absent') {
                icon = '\u2716'; cls = 'sv2-absent';  tip = 'Falta informada';
            } else if (status === 'pending' || status === 'pretended') {
                icon = '\u2714'; cls = 'sv2-pending'; tip = 'Inscrito';
            }
            var cell = document.createElement('div');
            cell.className = 'scale-v2-cell scale-v2-mass-col scale-v2-tick-cell';
            cell.innerHTML = '<span class="sv2-icon ' + cls + '" title="' + tip + '">' + icon + '</span>';
            row.appendChild(cell);
        });

        tableWrap.appendChild(row);
    });

    section.appendChild(tableWrap);
    container.appendChild(section);
}


// Atalho rápido: Carregar ticks de um servidor ao clicar na tabela
window.editServerTicks = function(serverId) {
    const server = servers.find(s => s.id == serverId);
    if (!server) return;
    
    const roleRadio = document.querySelector(`input[name="user-role"][value="${server.cargo}"]`);
    if (roleRadio) {
        roleRadio.checked = true;
        renderServerSelect(server.cargo);
    }
    
    selectName.value = serverId;
    updateTicksForSelectedServer();
    
    const card = document.getElementById('card-escala');
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        card.style.transition = 'box-shadow 0.4s ease, border-color 0.4s ease';
        card.style.boxShadow = '0 0 25px rgba(26, 35, 126, 0.4)';
        card.style.borderColor = 'var(--primary)';
        setTimeout(() => {
            card.style.boxShadow = '';
            card.style.borderColor = '';
        }, 1800);
    }
    
    showToast(`Carregados os ticks de ${server.nome}! Altere ou desmarque como desejar.`);
};

// --- ÁREA DO COORDENADOR ---

// Estado e Filtros do Painel "Quem vai Servir"
let qvWeekendFilter = 'all';
let qvViewMode = 'mass'; // 'mass' ou 'server'
let qvSearchTerm = '';
let qvRoleFilter = 'all'; // 'all', 'Acólito', 'Coroinha'

function setupQuemVaiServir() {
    const btnQvPrevMonth = document.getElementById('btn-qv-prev-month');
    const btnQvNextMonth = document.getElementById('btn-qv-next-month');
    const btnModeByMass = document.getElementById('btn-mode-by-mass');
    const btnModeByServer = document.getElementById('btn-mode-by-server');
    const qvSearchInput = document.getElementById('qv-search-input');
    const qvSearchClear = document.getElementById('qv-search-clear');
    const rolePills = document.querySelectorAll('#qv-role-filters .role-pill');

    if (btnQvPrevMonth) btnQvPrevMonth.addEventListener('click', () => changeMonth(-1));
    if (btnQvNextMonth) btnQvNextMonth.addEventListener('click', () => changeMonth(1));

    if (btnModeByMass && btnModeByServer) {
        btnModeByMass.addEventListener('click', () => {
            qvViewMode = 'mass';
            btnModeByMass.classList.add('active');
            btnModeByServer.classList.remove('active');
            renderQuemVaiServir();
        });
        btnModeByServer.addEventListener('click', () => {
            qvViewMode = 'server';
            btnModeByServer.classList.add('active');
            btnModeByMass.classList.remove('active');
            renderQuemVaiServir();
        });
    }

    if (qvSearchInput) {
        qvSearchInput.addEventListener('input', (e) => {
            qvSearchTerm = e.target.value.trim().toLowerCase();
            if (qvSearchClear) {
                if (qvSearchTerm) qvSearchClear.classList.remove('hidden');
                else qvSearchClear.classList.add('hidden');
            }
            renderQuemVaiServir();
        });
    }

    if (qvSearchClear && qvSearchInput) {
        qvSearchClear.addEventListener('click', () => {
            qvSearchInput.value = '';
            qvSearchTerm = '';
            qvSearchClear.classList.add('hidden');
            renderQuemVaiServir();
        });
    }

    rolePills.forEach(pill => {
        pill.addEventListener('click', () => {
            rolePills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            qvRoleFilter = pill.getAttribute('data-role');
            renderQuemVaiServir();
        });
    });
}

function renderQuemVaiServir() {
    const monthDisplay = document.getElementById('qv-month-display');
    const container = document.getElementById('qv-content-container');
    const weekendFilterContainer = document.getElementById('qv-weekend-filters');

    if (!container) return;

    const monthText = `${MONTH_NAMES[selectedMonth]} de ${selectedYear}`;
    if (monthDisplay) monthDisplay.textContent = `Mês: ${monthText}`;

    const monthMassIds = massSchedules.map(m => m.id);
    const monthAttendances = attendanceData.filter(a => monthMassIds.includes(a.mass_id));

    // Cálculos de KPIs
    const activeServerIds = new Set(monthAttendances.map(a => a.server_id));
    const totalActive = activeServerIds.size;
    const totalRegistered = servers.length;

    const acolitoSlots = monthAttendances.filter(a => {
        const s = servers.find(srv => srv.id === a.server_id);
        return s && s.cargo === 'Acólito';
    });
    const activeAcolitosSet = new Set(acolitoSlots.map(a => a.server_id));
    const totalAcolitosRegistered = servers.filter(s => s.cargo === 'Acólito').length;

    const coroinhaSlots = monthAttendances.filter(a => {
        const s = servers.find(srv => srv.id === a.server_id);
        return s && s.cargo === 'Coroinha';
    });
    const activeCoroinhasSet = new Set(coroinhaSlots.map(a => a.server_id));
    const totalCoroinhasRegistered = servers.filter(s => s.cargo === 'Coroinha').length;

    const metaAco = getMetaAcolitos();
    const metaCor = getMetaCoroinhas();
    const metaTotal = metaAco + metaCor;

    const isLivre = (metaAco === 0 && metaCor === 0);

    let lowCoverageCount = 0;
    if (!isLivre) {
        massSchedules.forEach(m => {
            const acolitosCount = monthAttendances.filter(a => a.mass_id === m.id && servers.some(s => s.id === a.server_id && s.cargo === 'Acólito')).length;
            const coroinhasCount = monthAttendances.filter(a => a.mass_id === m.id && servers.some(s => s.id === a.server_id && s.cargo === 'Coroinha')).length;
            const faltaAco = metaAco > 0 && acolitosCount < metaAco;
            const faltaCor = metaCor > 0 && coroinhasCount < metaCor;
            if (faltaAco || faltaCor) {
                lowCoverageCount++;
            }
        });
    }

    const kpiTotalActive = document.getElementById('kpi-qv-total-active');
    const kpiTotalReg = document.getElementById('kpi-qv-total-registered');
    const kpiAcolitos = document.getElementById('kpi-qv-acolitos');
    const kpiAcolitosActive = document.getElementById('kpi-qv-acolitos-active');
    const kpiCoroinhas = document.getElementById('kpi-qv-coroinhas');
    const kpiCoroinhasActive = document.getElementById('kpi-qv-coroinhas-active');
    const kpiMassesCount = document.getElementById('kpi-qv-masses-count');
    const kpiNeedsAttention = document.getElementById('kpi-qv-needs-attention');

    if (kpiTotalActive) kpiTotalActive.textContent = totalActive;
    if (kpiTotalReg) kpiTotalReg.textContent = `de ${totalRegistered} cadastrados`;
    if (kpiAcolitos) kpiAcolitos.textContent = acolitoSlots.length;
    if (kpiAcolitosActive) kpiAcolitosActive.textContent = `${activeAcolitosSet.size} de ${totalAcolitosRegistered} ativos`;
    if (kpiCoroinhas) kpiCoroinhas.textContent = coroinhaSlots.length;
    if (kpiCoroinhasActive) kpiCoroinhasActive.textContent = `${activeCoroinhasSet.size} de ${totalCoroinhasRegistered} ativos`;
    if (kpiMassesCount) kpiMassesCount.textContent = massSchedules.length;
    if (kpiNeedsAttention) {
        if (isLivre) {
            kpiNeedsAttention.textContent = "Modo Livre (sem limite de vagas)";
        } else {
            kpiNeedsAttention.textContent = `${lowCoverageCount} com poucos servidores (Meta: ${metaAco > 0 ? metaAco + ' Ac' : 'Ac livre'} / ${metaCor > 0 ? metaCor + ' Co' : 'Co livre'})`;
        }
    }

    // Renderizar Filtros de Fim de Semana
    if (weekendFilterContainer) {
        weekendFilterContainer.innerHTML = '';
        const btnAll = document.createElement('button');
        btnAll.type = 'button';
        btnAll.className = `btn-filter ${qvWeekendFilter === 'all' ? 'active' : ''}`;
        btnAll.textContent = `Todas as Missas (${massSchedules.length})`;
        btnAll.onclick = () => {
            qvWeekendFilter = 'all';
            renderQuemVaiServir();
        };
        weekendFilterContainer.appendChild(btnAll);

        weekendGroups.forEach(g => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `btn-filter ${qvWeekendFilter == g.index ? 'active' : ''}`;
            btn.textContent = g.label;
            btn.onclick = () => {
                qvWeekendFilter = g.index;
                renderQuemVaiServir();
            };
            weekendFilterContainer.appendChild(btn);
        });
    }

    container.innerHTML = '';

    if (qvViewMode === 'mass') {
        // --- VISÃO POR MISSA ---
        let displayedMasses = massSchedules;
        if (qvWeekendFilter !== 'all') {
            displayedMasses = massSchedules.filter(m => m.weekendIndex == qvWeekendFilter);
        }

        if (displayedMasses.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:30px; color:#7f8c8d;">Nenhuma missa encontrada para este filtro.</p>';
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'coord-masses-grid';

        let visibleCardsCount = 0;

        displayedMasses.forEach(m => {
            const massEntries = attendanceData.filter(a => a.mass_id === m.id);

            let acolitos = massEntries
                .map(a => ({ entry: a, server: servers.find(s => s.id === a.server_id) }))
                .filter(item => item.server && item.server.cargo === 'Acólito')
                .sort((a, b) => a.server.nome.localeCompare(b.server.nome));

            let coroinhas = massEntries
                .map(a => ({ entry: a, server: servers.find(s => s.id === a.server_id) }))
                .filter(item => item.server && item.server.cargo === 'Coroinha')
                .sort((a, b) => a.server.nome.localeCompare(b.server.nome));

            // Filtro por Cargo
            if (qvRoleFilter === 'Acólito') coroinhas = [];
            if (qvRoleFilter === 'Coroinha') acolitos = [];

            // Filtro de Busca
            if (qvSearchTerm) {
                const matchesAcolito = acolitos.some(i => i.server.nome.toLowerCase().includes(qvSearchTerm));
                const matchesCoroinha = coroinhas.some(i => i.server.nome.toLowerCase().includes(qvSearchTerm));
                if (!matchesAcolito && !matchesCoroinha) {
                    return; // Pula este card
                }
            }

            visibleCardsCount++;

            const totalInMass = (qvRoleFilter === 'all') 
                ? (acolitos.length + coroinhas.length)
                : (qvRoleFilter === 'Acólito' ? acolitos.length : coroinhas.length);

            let coverageClass = 'is-well-covered';
            let badgeClass = 'good';
            let badgeText = isLivre 
                ? (totalInMass > 0 ? `✓ ${totalInMass} inscrito(s)` : 'Sem servidores')
                : `✓ Completa (${acolitos.length}/${metaAco} Acólitos, ${coroinhas.length}/${metaCor} Coroinhas)`;

            if (totalInMass === 0) {
                coverageClass = 'is-empty-mass';
                badgeClass = isLivre ? 'warning' : 'danger';
                badgeText = isLivre ? '⚪ Sem Servidores' : `🚨 Sem Servidores (Meta: ${metaTotal})`;
            } else if (!isLivre && ((metaAco > 0 && acolitos.length < metaAco) || (metaCor > 0 && coroinhas.length < metaCor))) {
                coverageClass = 'is-low-coverage';
                badgeClass = 'warning';
                badgeText = `⚠️ Incompleta (${acolitos.length}/${metaAco} Ac, ${coroinhas.length}/${metaCor} Co)`;
            }

            const card = document.createElement('div');
            card.className = `coord-mass-card ${coverageClass}`;

            // Renderizar chips de acólitos
            let acolitosChipsHtml = '';
            if (acolitos.length > 0) {
                acolitosChipsHtml = acolitos.map(({ entry, server }) => {
                    const initial = server.nome.trim().charAt(0).toUpperCase();
                    let statusClass = 'pending';
                    let statusLabel = 'Inscrito';
                    if (entry.status === 'present') {
                        statusClass = 'confirmed';
                        statusLabel = 'Presente';
                    } else if (entry.status === 'absent') {
                        statusClass = 'absent';
                        statusLabel = 'Ausente';
                    }
                    const isMatched = qvSearchTerm && server.nome.toLowerCase().includes(qvSearchTerm);
                    return `
                        <div class="server-chip acolito" style="${isMatched ? 'border-color: #d97706; box-shadow: 0 0 10px rgba(217,119,6,0.35);' : ''}">
                            <div class="server-chip-avatar">${initial}</div>
                            <span class="server-chip-name">${server.nome}</span>
                            <span class="server-chip-status ${statusClass}">${statusLabel}</span>
                        </div>
                    `;
                }).join('');
            } else {
                acolitosChipsHtml = '<div class="empty-role-hint"><span>⛪</span> Nenhum acólito escalado</div>';
            }

            // Renderizar chips de coroinhas
            let coroinhasChipsHtml = '';
            if (coroinhas.length > 0) {
                coroinhasChipsHtml = coroinhas.map(({ entry, server }) => {
                    const initial = server.nome.trim().charAt(0).toUpperCase();
                    let statusClass = 'pending';
                    let statusLabel = 'Inscrito';
                    if (entry.status === 'present') {
                        statusClass = 'confirmed';
                        statusLabel = 'Presente';
                    } else if (entry.status === 'absent') {
                        statusClass = 'absent';
                        statusLabel = 'Ausente';
                    }
                    const isMatched = qvSearchTerm && server.nome.toLowerCase().includes(qvSearchTerm);
                    return `
                        <div class="server-chip coroinha" style="${isMatched ? 'border-color: #0284c7; box-shadow: 0 0 10px rgba(2,132,199,0.35);' : ''}">
                            <div class="server-chip-avatar">${initial}</div>
                            <span class="server-chip-name">${server.nome}</span>
                            <span class="server-chip-status ${statusClass}">${statusLabel}</span>
                        </div>
                    `;
                }).join('');
            } else {
                coroinhasChipsHtml = '<div class="empty-role-hint"><span>✝️</span> Nenhum coroinha escalado</div>';
            }

            card.innerHTML = `
                <div class="coord-mass-header">
                    <div class="coord-mass-title-group">
                        <span class="coord-mass-day-title">📅 ${m.dia} ${m.data}</span>
                        <span class="coord-mass-time-badge">⏰ ${m.hora}</span>
                    </div>
                    <div class="coord-mass-header-badges">
                        <span class="badge-coverage ${badgeClass}">${badgeText}</span>
                        <div class="coord-mass-counts-row">
                            <span class="count-pill total" title="Total na Missa">👥 ${acolitos.length + coroinhas.length}</span>
                            ${qvRoleFilter !== 'Coroinha' ? `<span class="count-pill ac" title="Acólitos">⛪ ${acolitos.length}</span>` : ''}
                            ${qvRoleFilter !== 'Acólito' ? `<span class="count-pill co" title="Coroinhas">✝️ ${coroinhas.length}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="coord-mass-body">
                    ${qvRoleFilter !== 'Coroinha' ? `
                    <div class="coord-role-section">
                        <div class="coord-role-heading acolito">
                            <span>⛪ Acólitos (${acolitos.length} de ${metaAco})</span>
                        </div>
                        <div class="coord-chips-list">
                            ${acolitosChipsHtml}
                        </div>
                    </div>` : ''}

                    ${qvRoleFilter !== 'Acólito' ? `
                    <div class="coord-role-section">
                        <div class="coord-role-heading coroinha">
                            <span>✝️ Coroinhas (${coroinhas.length} de ${metaCor})</span>
                        </div>
                        <div class="coord-chips-list">
                            ${coroinhasChipsHtml}
                        </div>
                    </div>` : ''}
                </div>
            `;
            grid.appendChild(card);
        });

        if (visibleCardsCount === 0) {
            container.innerHTML = `<p style="text-align:center; padding:30px; color:#7f8c8d;">Nenhuma missa encontrada com o filtro de pesquisa "${qvSearchTerm}".</p>`;
        } else {
            container.appendChild(grid);
        }

    } else {
        // --- VISÃO POR SERVIDOR ---
        let filteredServers = [...servers];

        if (qvRoleFilter !== 'all') {
            filteredServers = filteredServers.filter(s => s.cargo === qvRoleFilter);
        }

        if (qvSearchTerm) {
            filteredServers = filteredServers.filter(s => s.nome.toLowerCase().includes(qvSearchTerm));
        }

        filteredServers.sort((a, b) => a.nome.localeCompare(b.nome));

        if (filteredServers.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:30px; color:#7f8c8d;">Nenhum servidor encontrado com estes filtros.</p>';
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'servers-breakdown-grid';

        filteredServers.forEach(server => {
            const serverEntries = attendanceData.filter(a => a.server_id === server.id && monthMassIds.includes(a.mass_id));
            const hasMasses = serverEntries.length > 0;
            const roleClass = server.cargo === 'Acólito' ? 'acolito' : 'coroinha';
            const initial = server.nome.trim().charAt(0).toUpperCase();

            const card = document.createElement('div');
            card.className = `server-breakdown-card ${hasMasses ? '' : 'no-masses'}`;

            let tagsHtml = '';
            if (hasMasses) {
                tagsHtml = serverEntries.map(e => {
                    const m = massSchedules.find(ms => ms.id === e.mass_id);
                    const label = m ? `${m.dia.substring(0,3)} ${m.data} às ${m.hora}` : e.mass_id;
                    const isConfirmed = e.status === 'present';
                    return `<span class="mass-tag-chip ${isConfirmed ? 'confirmed' : ''}" title="${isConfirmed ? 'Presença Confirmada' : 'Inscrito'}">${isConfirmed ? '✔' : '📅'} ${label}</span>`;
                }).join('');
            } else {
                tagsHtml = '<div class="no-masses-alert"><span>⚠️</span> Não marcou nenhuma missa neste mês</div>';
            }

            card.innerHTML = `
                <div class="server-breakdown-header">
                    <div class="server-breakdown-identity">
                        <div class="server-avatar-circle ${roleClass}">${initial}</div>
                        <div>
                            <div class="server-breakdown-name">${server.nome}</div>
                            <span class="badge ${server.cargo === 'Acólito' ? 'role-acolito' : 'role-coroinha'}">${server.cargo}</span>
                        </div>
                    </div>
                    <span class="server-breakdown-count-badge ${hasMasses ? 'has-count' : 'zero-count'}">
                        ${serverEntries.length} missa${serverEntries.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div class="server-masses-tags">
                    ${tagsHtml}
                </div>
            `;
            grid.appendChild(card);
        });

        container.appendChild(grid);
    }
}

// Estado e Gestão de Servidores (Cadastrar e Excluir)
let serverFilterSearchTerm = '';
let serverFilterRole = 'all';

function setupServerManagement() {
    syncMetaInputs();
    const formAddServer = document.getElementById('form-add-server');
    const filterInput = document.getElementById('filter-servers-list-input');
    const filterRoleSelect = document.getElementById('filter-servers-role-select');

    if (formAddServer) {
        formAddServer.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('new-server-name');
            const roleRadio = document.querySelector('input[name="new-server-role"]:checked');
            const submitBtn = document.getElementById('btn-submit-add-server');

            if (!nameInput || !nameInput.value.trim()) {
                showToast("Por favor, digite o nome do servidor!");
                return;
            }

            const cleanName = nameInput.value.trim();
            const cargo = roleRadio ? roleRadio.value : "Coroinha";

            // Verifica duplicação
            const alreadyExists = servers.some(s => 
                s.nome.trim().toLowerCase() === cleanName.toLowerCase() && s.cargo === cargo
            );
            if (alreadyExists) {
                showToast(`O servidor "${cleanName}" já está cadastrado como ${cargo}!`);
                return;
            }

            const originalBtnHtml = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>⏳ Salvando...</span>';

            try {
                const { data, error } = await supabaseClient
                    .from('servers')
                    .insert([{ nome: cleanName, cargo: cargo }])
                    .select();

                let newServerObj;
                if (!error && data && data.length > 0) {
                    newServerObj = data[0];
                } else {
                    if (error) console.warn("Aviso ao inserir no Supabase (usando fallback local):", error);
                    const maxId = servers.reduce((max, s) => Math.max(max, s.id || 0), 0);
                    newServerObj = { id: maxId + 1, nome: cleanName, cargo: cargo };
                }

                servers.push(newServerObj);
                showToast(`${cargo} "${cleanName}" cadastrado com sucesso! 🎉`);
                formAddServer.reset();

                // Atualizar todas as telas
                renderServerSelect();
                renderServersAdminList();
                renderQuemVaiServir();
                renderPublicScale();
                updateAttendanceList();
                renderMassesReport();
                updateGeneralList();
                updateChart();
            } catch (err) {
                console.error("Erro ao adicionar servidor:", err);
                showToast("Erro ao cadastrar servidor.");
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHtml;
            }
        });
    }

    if (filterInput) {
        filterInput.addEventListener('input', (e) => {
            serverFilterSearchTerm = e.target.value.trim().toLowerCase();
            renderServersAdminList();
        });
    }

    if (filterRoleSelect) {
        filterRoleSelect.addEventListener('change', (e) => {
            serverFilterRole = e.target.value;
            renderServersAdminList();
        });
    }
}

function renderServersAdminList() {
    const listContainer = document.getElementById('servers-admin-list');
    const badgeTotal = document.getElementById('badge-total-servers');
    const badgeAcolitos = document.getElementById('badge-acolitos-servers');
    const badgeCoroinhas = document.getElementById('badge-coroinhas-servers');

    if (!listContainer) return;

    const totalAcolitos = servers.filter(s => s.cargo === 'Acólito').length;
    const totalCoroinhas = servers.filter(s => s.cargo === 'Coroinha').length;

    if (badgeTotal) badgeTotal.textContent = `Total: ${servers.length}`;
    if (badgeAcolitos) badgeAcolitos.textContent = `⛪ Acólitos: ${totalAcolitos}`;
    if (badgeCoroinhas) badgeCoroinhas.textContent = `✝️ Coroinhas: ${totalCoroinhas}`;

    let filtered = [...servers];

    if (serverFilterRole !== 'all') {
        filtered = filtered.filter(s => s.cargo === serverFilterRole);
    }

    if (serverFilterSearchTerm) {
        filtered = filtered.filter(s => s.nome.toLowerCase().includes(serverFilterSearchTerm));
    }

    filtered.sort((a, b) => a.nome.localeCompare(b.nome));

    listContainer.innerHTML = '';

    if (filtered.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; padding:20px; color:#7f8c8d; grid-column: 1 / -1;">Nenhum servidor encontrado.</p>';
        return;
    }

    const monthMassIds = massSchedules.map(m => m.id);

    filtered.forEach(s => {
        const initial = s.nome.trim().charAt(0).toUpperCase();
        const roleClass = s.cargo === 'Acólito' ? 'acolito' : 'coroinha';
        const ticksInMonth = attendanceData.filter(a => a.server_id === s.id && monthMassIds.includes(a.mass_id)).length;

        const card = document.createElement('div');
        card.className = 'server-admin-card';
        card.innerHTML = `
            <div class="server-admin-left">
                <div class="server-avatar-circle ${roleClass}" style="width: 38px; height: 38px; font-size: 0.95rem;">${initial}</div>
                <div class="server-admin-info">
                    <span class="server-admin-name" title="${s.nome}">${s.nome}</span>
                    <div class="server-admin-meta">
                        <span class="badge ${s.cargo === 'Acólito' ? 'role-acolito' : 'role-coroinha'}">${s.cargo}</span>
                        <span class="server-admin-ticks-count">📅 ${ticksInMonth} missa${ticksInMonth !== 1 ? 's' : ''} em ${MONTH_NAMES[selectedMonth].substring(0,3)}</span>
                    </div>
                </div>
            </div>
            <button type="button" class="btn-delete-server" onclick="deleteServer(${s.id})" title="Excluir ${s.nome}">
                🗑️ Excluir
            </button>
        `;
        listContainer.appendChild(card);
    });
}

window.deleteServer = async function(serverId) {
    const srv = servers.find(s => s.id === serverId);
    if (!srv) return;

    const confirmMsg = `Tem certeza que deseja excluir ${srv.cargo} "${srv.nome}"?\n\nTodas as marcações e presenças dele serão removidas da escala.`;
    if (!confirm(confirmMsg)) return;

    try {
        // Marca como deleted no Supabase (que aceita UPDATE com 200 OK)
        try {
            await supabaseClient.from('servers').update({ cargo: 'deleted', nome: `__deleted__${serverId}` }).eq('id', serverId);
            await supabaseClient.from('attendance').update({ status: 'deleted' }).eq('server_id', serverId);
        } catch (supaErr) {
            console.warn("Aviso ao atualizar no Supabase:", supaErr);
        }

        servers = servers.filter(s => s.id !== serverId);
        attendanceData = attendanceData.filter(a => a.server_id !== serverId);
        showToast(`${srv.cargo} "${srv.nome}" excluído com sucesso!`);

        renderServerSelect();
        renderServersAdminList();
        renderQuemVaiServir();
        renderPublicScale();
        updateAttendanceList();
        renderMassesReport();
        updateGeneralList();
        updateChart();
    } catch (err) {
        console.error("Erro ao excluir servidor:", err);
        showToast("Erro ao excluir servidor.");
    }
};

window.deleteAllServers = async function() {
    if (!servers || servers.length === 0) {
        showToast("Não há servidores para limpar.");
        return;
    }

    const confirmMsg = `⚠️ ATENÇÃO: Tem certeza que deseja apagar TODOS os ${servers.length} servidores cadastrados?\n\nIsso limpará a lista completamente para que você possa cadastrar os nomes da Paróquia Perpétuo de Socorro.`;
    if (!confirm(confirmMsg)) return;

    const btn = document.getElementById('btn-clear-all-servers');
    if (btn) {
        btn.disabled = true;
        btn.textContent = "⏳ Apagando...";
    }

    try {
        for (const s of [...servers]) {
            try {
                await supabaseClient.from('servers').update({ cargo: 'deleted', nome: `__deleted__${s.id}` }).eq('id', s.id);
                await supabaseClient.from('attendance').update({ status: 'deleted' }).eq('server_id', s.id);
            } catch (e) {
                console.warn("Erro ao deletar servidor id " + s.id, e);
            }
        }

        servers = [];
        attendanceData = [];

        showToast("Todos os nomes foram apagados com sucesso! 🗑️");

        renderServerSelect();
        renderServersAdminList();
        renderQuemVaiServir();
        renderPublicScale();
        updateAttendanceList();
        renderMassesReport();
        updateGeneralList();
        updateChart();
    } catch (err) {
        console.error("Erro ao apagar servidores:", err);
        showToast("Erro ao apagar todos os servidores.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = "🗑️ Limpar Todos os Nomes";
        }
    }
};

window.clearSelectedName = function() {
    if (selectName) {
        selectName.value = "";
        updateTicksForSelectedServer();
        showToast("Seleção de nome limpa.");
    }
};

window.alterarSenhaCoordenador = function() {
    const input = document.getElementById('input-nova-senha');
    if (!input || !input.value.trim()) {
        showToast("Por favor, digite a nova senha desejada!");
        return;
    }
    const novaSenha = input.value.trim();
    localStorage.setItem('senha_coordenador', novaSenha);
    input.value = '';
    showToast(`Senha alterada com sucesso para "${novaSenha}"! 🔐`);
};

window.salvarMetasServidores = function() {
    const inputAcolitos = document.getElementById('meta-acolitos');
    const inputCoroinhas = document.getElementById('meta-coroinhas');
    const rawAco = inputAcolitos ? inputAcolitos.value.trim() : '0';
    const rawCor = inputCoroinhas ? inputCoroinhas.value.trim() : '0';
    const valAco = Math.max(0, parseInt(rawAco, 10) || 0);
    const valCor = Math.max(0, parseInt(rawCor, 10) || 0);
    
    localStorage.setItem('meta_acolitos_missa', valAco);
    localStorage.setItem('meta_coroinhas_missa', valCor);
    
    if (valAco === 0 && valCor === 0) {
        showToast("Modo LIVRE ativado: sem limites e sem metas de vagas! 🎉");
    } else {
        const txtAco = valAco > 0 ? `${valAco} Acólitos` : 'Acólitos livres';
        const txtCor = valCor > 0 ? `${valCor} Coroinhas` : 'Coroinhas livres';
        showToast(`Salvo! ${txtAco} e ${txtCor} por missa. 🎯`);
    }
    
    renderQuemVaiServir();
    renderMassesReport();
    renderPublicScale();
};

window.confirmAllCurrentMass = async function() {
    if (!selectedMassId) {
        showToast("Selecione uma missa primeiro!");
        return;
    }

    const massEntries = attendanceData.filter(a => a.mass_id === selectedMassId);
    if (massEntries.length === 0) {
        showToast("Ninguém inscrito nesta missa para confirmar.");
        return;
    }

    const unconfirmed = massEntries.filter(a => a.status !== 'present');
    if (unconfirmed.length === 0) {
        showToast("Todos os servidores desta missa já estão confirmados!");
        return;
    }

    try {
        for (const entry of unconfirmed) {
            await supabaseClient
                .from('attendance')
                .update({ status: 'present', confirmed: true })
                .eq('id', entry.id);
            entry.status = 'present';
            entry.confirmed = true;
        }

        showToast(`Todos os ${unconfirmed.length} servidores desta missa foram confirmados! ✔`);
        updateAttendanceList();
        renderQuemVaiServir();
        renderPublicScale();
        updateGeneralList();
        updateChart();
    } catch (err) {
        console.error("Erro ao confirmar todos:", err);
        showToast("Erro ao confirmar presenças.");
    }
};

// Conta quantos acólitos e coroinhas já marcaram (clicaram) em uma missa
function getMassCounts(massId) {
    let acolitoCount = 0;
    let coroinhaCount = 0;

    attendanceData.filter(a => a.mass_id === massId).forEach(entry => {
        const server = servers.find(s => s.id === entry.server_id);
        if (!server) return;
        if (server.cargo === 'Acólito') acolitoCount++;
        else if (server.cargo === 'Coroinha') coroinhaCount++;
    });

    return { acolito: acolitoCount, coroinha: coroinhaCount, total: acolitoCount + coroinhaCount };
}

function countTag(cls, text) {
    return `<span class="count-tag ${cls}">${text}</span>`;
}

// Datas fixas do mês em que já há marcações (ticks)
function getFixedDatesWithClicks(cargoFilter = null) {
    const dates = [];

    massSchedules.forEach(m => {
        const hasClick = attendanceData.some(a => {
            if (a.mass_id !== m.id) return false;
            if (!cargoFilter) return true;
            const server = servers.find(s => s.id === a.server_id);
            return !!server && server.cargo === cargoFilter;
        });

        if (hasClick && !dates.includes(m.data)) dates.push(m.data);
    });

    return dates;
}

function formatFixedDates(dates) {
    return dates.length > 0 ? dates.join(', ') : 'Nenhuma marcação';
}

// KPI de Quantidades da Missa Selecionada (Chamada)
function renderAdminMassKpi() {
    const kpi = document.getElementById('admin-mass-kpi');
    if (!kpi) return;

    if (!selectedMassId) {
        kpi.innerHTML = '';
        return;
    }

    const counts = getMassCounts(selectedMassId);
    const datasTotal = getFixedDatesWithClicks();
    const datasAcolito = getFixedDatesWithClicks('Acólito');
    const datasCoroinha = getFixedDatesWithClicks('Coroinha');

    kpi.innerHTML = `
        <div class="kpi-item total">
            <span class="kpi-value">${counts.total}</span>
            <span class="kpi-label">Total que já clicaram</span>
            <span class="kpi-dates" title="Datas fixas do mês com marcações">Datas fixas no mês: ${formatFixedDates(datasTotal)}</span>
        </div>
        <div class="kpi-item acolito">
            <span class="kpi-value">${counts.acolito}</span>
            <span class="kpi-label">Acólitos</span>
            <span class="kpi-dates" title="Datas fixas do mês com marcações de acólitos">Datas fixas no mês: ${formatFixedDates(datasAcolito)}</span>
        </div>
        <div class="kpi-item coroinha">
            <span class="kpi-value">${counts.coroinha}</span>
            <span class="kpi-label">Coroinhas</span>
            <span class="kpi-dates" title="Datas fixas do mês com marcações de coroinhas">Datas fixas no mês: ${formatFixedDates(datasCoroinha)}</span>
        </div>
    `;
}

// Quadro de Servidores por Missa (Relatório Geral)
function renderMassesReport() {
    const grid = document.getElementById('admin-masses-report');
    if (!grid) return;
    grid.innerHTML = '';

    if (massSchedules.length === 0) {
        grid.innerHTML = '<p style="text-align:center; padding:20px; color:#7f8c8d;">Nenhuma missa encontrada para este mês.</p>';
        return;
    }

    massSchedules.forEach(m => {
        const counts = getMassCounts(m.id);
        const names = attendanceData
            .filter(a => a.mass_id === m.id)
            .map(a => servers.find(s => s.id === a.server_id))
            .filter(Boolean)
            .sort((a, b) => a.nome.localeCompare(b.nome))
            .map(s => `${s.nome} (${s.cargo})`)
            .join(', ');

        const card = document.createElement('div');
        card.className = 'mass-report-card';
        card.innerHTML = `
            <div class="mass-report-card-header">
                <span class="mass-report-card-title">${m.dia} ${m.data} – ${m.hora}</span>
            </div>
            <div class="mass-report-card-stats">
                ${countTag('total', `👥 Total: ${counts.total}`)}
                ${countTag('acolito', `⛪ Acólitos: ${counts.acolito}`)}
                ${countTag('coroinha', `✝️ Coroinhas: ${counts.coroinha}`)}
            </div>
            <div class="mass-report-names-list">${names || 'Ninguém escalado para esta missa ainda.'}</div>
        `;
        grid.appendChild(card);
    });
}

function renderMassTabs() {
    if (!massTabs) return;
    massTabs.innerHTML = '';
    
    renderAdminMassFilter();
    
    let displayedMasses = massSchedules;
    if (adminMassFilter !== 'all') {
        displayedMasses = massSchedules.filter(m => m.weekendIndex == adminMassFilter);
    }
    
    if (displayedMasses.length > 0 && !displayedMasses.some(m => m.id === selectedMassId)) {
        selectedMassId = displayedMasses[0].id;
    }

    // Abas de missas regulares do mês
    displayedMasses.forEach(m => {
        const counts = getMassCounts(m.id);
        const tab = document.createElement('div');
        tab.className = `tab ${selectedMassId === m.id ? 'active' : ''}`;
        tab.innerHTML = `
            <div>${m.dia}</div>
            <small>${m.data} - ${m.hora}</small>
            <div class="tab-counts-badge"><span>Ac: ${counts.acolito}</span><span>Co: ${counts.coroinha}</span></div>
        `;
        tab.onclick = () => {
            selectedMassId = m.id;
            updateTabStates();
            updateAttendanceList();
            updateChart();
            syncChamadaMassSelect();
        };
        massTabs.appendChild(tab);
    });

    // Abas das missas especiais
    specialMasses.forEach(m => {
        const mId = `special-${m.id}`;
        const counts = getMassCounts(mId);
        const tab = document.createElement('div');
        tab.className = `tab ${selectedMassId === mId ? 'active' : ''}`;
        const [y, mon, d] = m.mass_date.split('-');
        tab.innerHTML = `
            <div>🌟 ${m.description}</div>
            <small>${d}/${mon} - ${m.mass_time.substring(0,5)}</small>
            <div class="tab-counts-badge"><span>Ac: ${counts.acolito}</span><span>Co: ${counts.coroinha}</span></div>
        `;
        tab.onclick = () => {
            selectedMassId = mId;
            updateTabStates();
            updateAttendanceList();
            updateChart();
            syncChamadaMassSelect();
        };
        massTabs.appendChild(tab);
    });

    renderChamadaMassSelect();
}

// Dropdown de seleção de missa na aba Chamada (mais prático no celular)
function renderChamadaMassSelect() {
    const sel = document.getElementById('chamada-mass-select');
    if (!sel) return;

    const prev = selectedMassId;
    sel.innerHTML = '';

    let displayedMasses = massSchedules;
    if (adminMassFilter !== 'all') {
        displayedMasses = massSchedules.filter(m => m.weekendIndex == adminMassFilter);
    }

    const optGroup = (label) => {
        const og = document.createElement('optgroup');
        og.label = label;
        return og;
    };

    if (displayedMasses.length > 0) {
        const og = optGroup('Missas do mês');
        displayedMasses.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = `${m.dia} (${m.data}) às ${m.hora}`;
            og.appendChild(opt);
        });
        sel.appendChild(og);
    }

    if (specialMasses.length > 0) {
        const og = optGroup('Missas especiais');
        specialMasses.forEach(m => {
            const opt = document.createElement('option');
            const mId = `special-${m.id}`;
            opt.value = mId;
            const [y, mon, d] = m.mass_date.split('-');
            opt.textContent = `🌟 ${m.description} (${d}/${mon}) às ${m.mass_time.substring(0,5)}`;
            og.appendChild(opt);
        });
        sel.appendChild(og);
    }

    if (Array.from(sel.options).some(o => o.value === prev)) {
        sel.value = prev;
    } else if (sel.options.length > 0) {
        sel.value = sel.options[0].value;
        selectedMassId = sel.value;
    }

    sel.onchange = () => {
        selectedMassId = sel.value;
        updateTabStates();
        updateAttendanceList();
        updateChart();
    };
}

function syncChamadaMassSelect() {
    const sel = document.getElementById('chamada-mass-select');
    if (!sel) return;
    if (Array.from(sel.options).some(o => o.value === selectedMassId)) {
        sel.value = selectedMassId;
    }
}

function renderAdminMassFilter() {
    if (!adminMassFilterContainer) return;
    adminMassFilterContainer.innerHTML = '';
    
    const btnAll = document.createElement('button');
    btnAll.type = 'button';
    btnAll.className = `btn-filter ${adminMassFilter === 'all' ? 'active' : ''}`;
    btnAll.textContent = 'Todas as Missas';
    btnAll.onclick = () => {
        adminMassFilter = 'all';
        renderMassTabs();
        updateAttendanceList();
    };
    adminMassFilterContainer.appendChild(btnAll);
    
    weekendGroups.forEach(g => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn-filter ${adminMassFilter == g.index ? 'active' : ''}`;
        btn.textContent = g.label;
        btn.onclick = () => {
            adminMassFilter = g.index;
            renderMassTabs();
            updateAttendanceList();
        };
        adminMassFilterContainer.appendChild(btn);
    });
}

function updateTabStates() {
    const allTabs = document.querySelectorAll('#mass-tabs .tab');
    let displayedMasses = massSchedules;
    if (adminMassFilter !== 'all') {
        displayedMasses = massSchedules.filter(m => m.weekendIndex == adminMassFilter);
    }
    
    const combinedSchedules = [
        ...displayedMasses.map(m => m.id),
        ...specialMasses.map(m => `special-${m.id}`)
    ];
    
    allTabs.forEach((t, index) => {
        if (combinedSchedules[index] === selectedMassId) {
            t.classList.add('active');
        } else {
            t.classList.remove('active');
        }
    });
}

function updateAttendanceList() {
    if (!attendanceList) return;
    renderAdminMassKpi();
    const list = attendanceData.filter(a => a.mass_id === selectedMassId);
    attendanceList.innerHTML = '';

    if (list.length === 0) {
        attendanceList.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 20px;">Ninguém escalado para esta missa ainda.</p>';
        return;
    }

    const acolitos = list.filter(a => {
        const s = servers.find(srv => srv.id === a.server_id);
        return s && s.cargo === 'Acólito';
    }).sort((a,b) => {
        const sa = servers.find(s => s.id === a.server_id);
        const sb = servers.find(s => s.id === b.server_id);
        return sa.nome.localeCompare(sb.nome);
    });

    const coroinhas = list.filter(a => {
        const s = servers.find(srv => srv.id === a.server_id);
        return s && s.cargo === 'Coroinha';
    }).sort((a,b) => {
        const sa = servers.find(s => s.id === a.server_id);
        const sb = servers.find(s => s.id === b.server_id);
        return sa.nome.localeCompare(sb.nome);
    });

    const renderSection = (title, items) => {
        if (items.length === 0) return;
        const h = document.createElement('h4');
        h.style.margin = "20px 0 10px 0";
        h.style.color = "var(--primary)";
        h.style.borderBottom = "2px solid var(--secondary)";
        h.style.paddingBottom = "5px";
        h.textContent = title;
        attendanceList.appendChild(h);

        items.forEach(entry => {
            const server = servers.find(s => s.id === entry.server_id);
            if (!server) return;
            
            const item = document.createElement('div');
            item.className = 'attendance-item';
            const roleClass = server.cargo === 'Acólito' ? 'role-acolito' : 'role-coroinha';
            
            item.innerHTML = `
                <div class="person-info">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <h4>${server.nome}</h4>
                        <span class="badge ${roleClass}">${server.cargo}</span>
                    </div>
                    <p>Status: ${entry.status === 'present' ? 'Confirmado' : entry.status === 'absent' ? 'Ausente' : 'Inscrito (Aguardando chamada)'}</p>
                </div>
                <div class="status-buttons">
                    <button class="status-btn ${entry.status === 'present' ? 'confirmed' : ''}" onclick="setStatus(${entry.server_id}, '${entry.mass_id}', 'present')">Confirmar</button>
                    <button class="status-btn ${entry.status === 'absent' ? 'absent' : ''}" onclick="setStatus(${entry.server_id}, '${entry.mass_id}', 'absent')">Ausente</button>
                </div>
            `;
            attendanceList.appendChild(item);
        });
    };

    renderSection("Acólitos", acolitos);
    renderSection("Coroinhas", coroinhas);
}

function updateGeneralList() {
    if (!generalStatusList) return;
    generalStatusList.innerHTML = '';
    
    const monthMassIds = massSchedules.map(m => m.id);
    
    const grouped = {};
    attendanceData.forEach(entry => {
        if (!grouped[entry.server_id]) grouped[entry.server_id] = [];
        grouped[entry.server_id].push(entry);
    });

    const sortedServers = [...servers].sort((a,b) => a.nome.localeCompare(b.nome));
    
    sortedServers.forEach(server => {
        const allEntries = grouped[server.id] || [];
        const serverEntries = allEntries.filter(e => monthMassIds.includes(e.mass_id) || e.mass_id.startsWith('special-'));
        
        let statusText = 'Inativo';
        let statusClass = 'role-inativo';
        let daysText = 'Não se inscreveu';

        if (serverEntries.length > 0) {
            daysText = serverEntries.map(e => {
                if (e.mass_id.startsWith('special-')) {
                    const id = e.mass_id.replace('special-', '');
                    const m = specialMasses.find(sm => sm.id == id);
                    if (!m) return '';
                    const [y, mon, d] = m.mass_date.split('-');
                    return `🌟 ${m.description} (${d}/${mon})`;
                } else {
                    const m = massSchedules.find(ms => ms.id === e.mass_id);
                    if (m) {
                        return `${m.dia.substring(0,3)} ${m.data} (${m.hora})`;
                    } else {
                        const parts = e.mass_id.split('-');
                        if (parts.length >= 5) {
                            const diaSemana = parts[0] === 'sab' ? 'Sáb' : 'Dom';
                            const dataFormatada = `${parts[4]}/${parts[3]}`;
                            return `${diaSemana} ${dataFormatada}`;
                        }
                        return e.mass_id;
                    }
                }
            }).filter(d => d !== '').join(', ');

            const hasConfirmed = serverEntries.some(e => e.status === 'present');
            const hasAbsent = serverEntries.some(e => e.status === 'absent');
            const hasPending = serverEntries.some(e => e.status === 'pretended' || e.status === 'pending');

            if (hasConfirmed) {
                statusText = 'Confirmado';
                statusClass = 'role-presente';
            } else if (hasAbsent) {
                statusText = 'Ausente';
                statusClass = 'role-ausente';
            } else if (hasPending) {
                statusText = 'Aguardando';
                statusClass = 'role-aguardando';
            }
        }

        const item = document.createElement('div');
        item.className = 'attendance-item';
        const roleClass = server.cargo === 'Acólito' ? 'role-acolito' : 'role-coroinha';

        item.innerHTML = `
            <div class="person-info">
                <div class="person-name-row" style="display: flex; align-items: center; gap: 8px;">
                    <h4>${server.nome}</h4>
                    <span class="badge ${roleClass}">${server.cargo}</span>
                    <span class="badge-total-ticks ${serverEntries.length > 0 ? 'has-ticks' : ''}">${serverEntries.length} missa${serverEntries.length !== 1 ? 's' : ''} em ${MONTH_NAMES[selectedMonth]}</span>
                </div>
                <p style="margin-top: 5px; font-weight: 600;">Escalado em: ${daysText}</p>
            </div>
            <span class="badge ${statusClass}">${statusText}</span>
        `;
        generalStatusList.appendChild(item);
    });
}

window.setStatus = async function(serverId, massId, status) {
    const entry = attendanceData.find(a => a.server_id === serverId && a.mass_id === massId);
    if (entry) {
        const isConfirmed = (status === 'present');
        try {
            const { error } = await supabaseClient
                .from('attendance')
                .update({ status: status, confirmed: isConfirmed })
                .eq('id', entry.id);

            if (error) throw error;

            entry.status = status;
            entry.confirmed = isConfirmed;
            updateAttendanceList();
            updateGeneralList();
            updateChart();
            renderPublicScale();
        } catch (e) {
            console.error("Erro ao atualizar status", e);
            showToast("Erro ao atualizar.");
        }
    }
};

function setupSpecialMassForm() {
    formSpecialMass.addEventListener('submit', async (e) => {
        e.preventDefault();
        const desc = document.getElementById('special-desc').value;
        const date = document.getElementById('special-date').value;
        const time = document.getElementById('special-time').value;

        const btn = formSpecialMass.querySelector('button');
        btn.disabled = true;
        btn.textContent = "Criando...";

        try {
            const { data, error } = await supabaseClient
                .from('special_masses')
                .insert([{ description: desc, mass_date: date, mass_time: time }])
                .select();

            if (error) throw error;
            
            showToast("Missa especial criada com sucesso! 🌟");
            formSpecialMass.reset();
            await fetchData();
            renderSpecialMassListAdmin();
        } catch (err) {
            console.error(err);
            const errorMsg = err.message || "Erro desconhecido";
            showToast(`Erro: ${errorMsg}`);
            
            if (errorMsg.includes("404") || errorMsg.includes("not found")) {
                showToast("Erro: A tabela 'special_masses' não foi encontrada no banco.");
            }
        } finally {
            btn.disabled = false;
            btn.textContent = "Criar Missa Especial";
        }
    });
}

function renderSpecialMassListAdmin() {
    if (!specialMassList) return;
    specialMassList.innerHTML = '';
    if (specialMasses.length === 0) {
        specialMassList.innerHTML = '<p style="text-align:center; padding:20px;">Nenhuma missa especial cadastrada.</p>';
        return;
    }

    specialMasses.forEach(m => {
        const item = document.createElement('div');
        item.className = 'attendance-item';
        const [y, mon, d] = m.mass_date.split('-');
        item.innerHTML = `
            <div class="person-info">
                <h4>${m.description}</h4>
                <p>${d}/${mon}/${y} às ${m.mass_time.substring(0,5)}</p>
            </div>
            <button class="status-btn absent" onclick="deleteSpecialMass(${m.id})">Excluir</button>
        `;
        specialMassList.appendChild(item);
    });
}

window.deleteSpecialMass = async function(id) {
    if (!confirm("Tem certeza que deseja excluir esta missa especial e todas as suas presenças?")) return;
    
    try {
        const mId = `special-${id}`;
        await supabaseClient.from('attendance').delete().eq('mass_id', mId);
        const { error } = await supabaseClient.from('special_masses').delete().eq('id', id);
        if (error) throw error;
        
        showToast("Missa excluída!");
        await fetchData();
        renderSpecialMassListAdmin();
    } catch (err) {
        console.error(err);
        showToast("Erro ao excluir.");
    }
};

function initChart() {
    const canvas = document.getElementById('attendanceChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    attendanceChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Confirmados', 'Aguardando/Ausente', 'Não Inscritos'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: ['#27ae60', '#f1c40f', '#95a5a6'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

function updateChart() {
    if (!attendanceChart) return;
    
    const monthMassIds = massSchedules.map(m => m.id);
    const grouped = {};
    attendanceData.forEach(entry => {
        if (!grouped[entry.server_id]) grouped[entry.server_id] = [];
        grouped[entry.server_id].push(entry);
    });

    let confirmedCount = 0;
    let pendingCount = 0;
    let inactiveCount = 0;

    servers.forEach(server => {
        const allEntries = grouped[server.id] || [];
        const entries = allEntries.filter(e => monthMassIds.includes(e.mass_id) || e.mass_id.startsWith('special-'));
        
        if (entries.length === 0) {
            inactiveCount++;
        } else if (entries.some(e => e.status === 'present')) {
            confirmedCount++;
        } else {
            pendingCount++;
        }
    });

    attendanceChart.data.datasets[0].data = [confirmedCount, pendingCount, inactiveCount];
    attendanceChart.update();
}

function exportToPDF() {
    const element = document.getElementById('view-luiggi');
    const monthName = MONTH_NAMES[selectedMonth];
    const opt = {
        margin: 10,
        filename: `Escala_Perpetuo_de_Socorro_${monthName}_${selectedYear}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
}

function exportToExcel() {
    try {
        const sortedServers = [...servers].sort((a, b) => a.nome.localeCompare(b.nome));
        const monthMassIds = massSchedules.map(m => m.id);
        const monthText = `${MONTH_NAMES[selectedMonth]}_${selectedYear}`;
        
        const data = sortedServers.map(server => {
            const allEntries = attendanceData.filter(a => a.server_id === server.id);
            const serverEntries = allEntries.filter(e => monthMassIds.includes(e.mass_id) || e.mass_id.startsWith('special-'));
            
            let daysText = 'Não se inscreveu';
            if (serverEntries.length > 0) {
                daysText = serverEntries.map(e => {
                    if (e.mass_id.startsWith('special-')) {
                        const id = e.mass_id.replace('special-', '');
                        const m = specialMasses.find(sm => sm.id == id);
                        if (!m) return '';
                        const [y, mon, d] = m.mass_date.split('-');
                        return `Missa Especial: ${m.description} (${d}/${mon})`;
                    } else {
                        const m = massSchedules.find(ms => ms.id === e.mass_id);
                        if (m) {
                            return `${m.dia} ${m.data} às ${m.hora}`;
                        } else {
                            return e.mass_id;
                        }
                    }
                }).filter(d => d !== '').join('; ');
            }

            return {
                'Nome': server.nome,
                'Cargo': server.cargo,
                'Total Missas no Mês': serverEntries.length,
                'Datas/Horários': daysText,
                'Status Geral': serverEntries.some(e => e.status === 'present') ? 'Confirmado' : 
                                serverEntries.some(e => e.status === 'absent') ? 'Ausente' : 
                                serverEntries.length > 0 ? 'Aguardando' : 'Inativo'
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, `Escala_${MONTH_NAMES[selectedMonth]}`);

        const wscols = [
            {wch: 25}, // Nome
            {wch: 15}, // Cargo
            {wch: 20}, // Total Missas
            {wch: 60}, // Datas/Horários
            {wch: 15}  // Status
        ];
        worksheet['!cols'] = wscols;

        XLSX.writeFile(workbook, `Escala_Perpetuo_de_Socorro_${monthText}.xlsx`);
        showToast("Excel mensal gerado com sucesso! 📊");
    } catch (error) {
        console.error("Erro ao exportar Excel:", error);
        showToast("Erro ao gerar Excel.");
    }
}

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
}

// Inicializa a aplicação
init();
