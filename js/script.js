class Converter {
    constructor() {
        this.origin = { code: 'BRL', flagClass: 'fi-br' };
        this.destination = { code: 'USD', flagClass: 'fi-us' };
        this.currencies = [];
        this.validPairCodes = new Set();
        this.ratesCache = new Map();
        this.availablePairsCache = null;
        this.graphicCache = new Map();
    }

    async getRate(origin, destination) {
        if (origin === destination) return 1;

        const cacheKey = `${origin}-${destination}`;

        if (this.ratesCache.has(cacheKey)) return this.ratesCache.get(cacheKey)

        try {
            const res = await fetch(`https://economia.awesomeapi.com.br/json/last/${origin}-${destination}`);

            if (!res.ok) {
                console.error(`Error na API: Erro HTTP ${res.status}`);
                return null;
            }

            /** @type {{ [key: string]: { bid?: string } }} */
            const data = await res.json();
            const pairKey = `${origin}${destination}`;

            const fetchedRate = parseFloat(data?.[pairKey]?.bid);

            if (fetchedRate) {
                this.ratesCache.set(cacheKey, fetchedRate);
                return fetchedRate;
            }
        } catch (err) {
            console.error('Falha ao buscar taxa:', err);
            return null;
        }
    }

    async getGraphic(origin, destination, day = 7) {
        if (origin === destination) return [];

        const cacheKey = `${origin}-${destination}-${day}`;

        if (this.graphicCache.has(cacheKey)) {
            return this.graphicCache.get(cacheKey);
        }

        try {
            const res = await fetch(`https://economia.awesomeapi.com.br/json/daily/${origin}-${destination}/${day}`);

            if (!res.ok) {
                console.error(`Erro na API: Erro HTTP ${res.status}`);
                return [];
            }

            const data = await res.json();

            if (Array.isArray(data) && data.length > 0) {
                const formattedData = data.reverse().map(item => {
                    const date = new Date(parseInt(item.timestamp) * 1000);

                    const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''); // "seg"
                    const dayMonth = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); // "08/09"

                    return {
                        label: `${weekday}, ${dayMonth}`,
                        value: parseFloat(item.bid || item.ask),
                    };
                });

                this.graphicCache.set(cacheKey, formattedData);
                return formattedData;
            }

            return [];

        } catch (err) {
            console.error('Falha ao buscar gráfico:', err);
            return [];
        }
    }

    async loadCurrencies() {
        try {
            const res = await fetch('https://economia.awesomeapi.com.br/json/available/uniq');
            if (!res.ok) {
                console.error(`Falha ao carregar lista de moedas: Erro HTTP ${res.status}`);
                return [];
            }

            const data = await res.json();

            this.currencies = Object.entries(data)
                .filter(([code]) => (code.length <= 3))
                .map(([code, fullName]) => ({
                    code,
                    name: fullName,
                    flagClass: `fi-${code.substring(0, 2).toLowerCase()}`
                }))
                .sort((a, b) => a.code.localeCompare(b.code));

            return this.currencies;
        } catch (err) {
            console.error('Falha ao carregar lista de moedas:', err);
            return [];
        }
    }

    async fetchValidPairsFor(oppositeCode, targetType) {
        try {
            if (!this.availablePairsCache) {
                const res = await fetch('https://economia.awesomeapi.com.br/json/available');
                if (!res.ok) return this.validPairCodes;
                this.availablePairsCache = await res.json();
            }

            this.validPairCodes.clear();

            Object.keys(this.availablePairsCache).forEach(pair => {
                const [origin, destination] = pair.split('-');

                if (targetType === 'destination' && origin === oppositeCode) {
                    this.validPairCodes.add(destination);
                } else if (targetType === 'origin' && destination === oppositeCode) {
                    this.validPairCodes.add(origin);
                }
            });

            return this.validPairCodes;
        } catch (err) {
            console.error('Falha ao buscar pares disponíveis:', err);
            return this.validPairCodes;
        }
    }

    trade() {
        [this.origin, this.destination] = [this.destination, this.origin];
    }

    get codes() {
        return [this.origin.code, this.destination.code];
    }

    get coins() {
        return [this.origin, this.destination];
    }

    setCurrency(type, currencyObj) {
        if (type === 'origin') {
            this.origin = currencyObj;
        } else if (type === 'destination') {
            this.destination = currencyObj;
        }
    }
}

class ConverterApp {
    constructor(converter) {
        this.converter = converter;
        this.animation = false;
        this.inputOrigem = document.querySelector('#inputOrigem');
        this.inputDestino = document.querySelector('#inputDestino');
        this.btnTrade = document.querySelector('#btn-trade');

        this.btnSelectOrigem = document.querySelector('#selectOrigem');
        this.btnSelectDestino = document.querySelector('#selectDestino');

        this.flagOrigin = document.querySelector('.flag-origem');
        this.flagDestination = document.querySelector('.flag-destino');
        this.coinOrigin = document.querySelector('#moeda-origem');
        this.coinDestination = document.querySelector('#moeda-destino');

        this.notificationActive = false;
        this.notification = document.querySelector('.notification');
        this.message = document.querySelector('.message');


        this.modal = new CurrencyModal(
            'modal-moedas',
            (target, selectedCoin) => this.handleCurrencyChange(target, selectedCoin),
            (msg) => this.notif(msg)
        );
    }

    async init() {
        const list = await this.converter.loadCurrencies();
        this.modal.setCurrencies(list);

        this.inputOrigem.addEventListener('input', () => this.changeInput());
        this.btnTrade.addEventListener('click', () => this.trade());

        this.btnSelectOrigem.addEventListener('click', async () => {
            const validPairs = await this.converter.fetchValidPairsFor(
                this.converter.destination.code,
                'origin'
            );
            await this.modal.open(
                'origin',
                this.btnSelectOrigem,
                this.converter.origin.code,
                this.converter.destination.code,
                validPairs
            );
        });

        this.btnSelectDestino.addEventListener('click', async () => {
            const validPairs = await this.converter.fetchValidPairsFor(
                this.converter.origin.code,
                'destination'
            );
            await this.modal.open(
                'destination',
                this.btnSelectDestino,
                this.converter.destination.code,
                this.converter.origin.code,
                validPairs
            );
        });

        void this.changeInput();
    }

    handleCurrencyChange(targetType, newCoin) {
        this.converter.setCurrency(targetType, newCoin);

        if (targetType === 'origin') {
            this.flagOrigin.className = `fi ${newCoin.flagClass} flag-origem`;
            this.coinOrigin.textContent = newCoin.code;
        } else {
            this.flagDestination.className = `fi ${newCoin.flagClass} flag-destino`;
            this.coinDestination.textContent = newCoin.code;
        }

        void this.changeInput();
    }

    animationTrade() {
        this.animation = true;
        this.btnTrade.classList.add('trade-animation');

        setTimeout(() => {
            this.animation = false;
            this.btnTrade.classList.remove('trade-animation');
        }, 1000);
    }

    async trade() {
        if (this.animation) return;

        const [origCode, destCode] = this.converter.codes;

        const validInvertedPairs = await this.converter.fetchValidPairsFor(destCode, 'destination');

        if (!validInvertedPairs.has(origCode)) {
            this.notif(`Inversão indisponível: sem cotação de ${destCode} para ${origCode}`);
            return;
        }

        this.animationTrade();
        this.converter.trade();

        const [orig, dest] = this.converter.coins;
        this.flagOrigin.className = `fi ${orig.flagClass} flag-origem`;
        this.flagDestination.className = `fi ${dest.flagClass} flag-destino`;
        this.coinOrigin.textContent = orig.code;
        this.coinDestination.textContent = dest.code;

        void this.changeInput();
    }

    async changeInput() {
        try {
            const originValue = parseFloat(this.inputOrigem.value);

            if (isNaN(originValue) || originValue <= 0) {
                this.inputDestino.value = '';
                return;
            }

            const [orig, dest] = this.converter.codes;
            const rate = await this.converter.getRate(orig, dest);

            if (rate) {
                this.inputDestino.value = (originValue * rate).toFixed(2);
            } else {
                this.inputDestino.value = 'N/A';
            }

            void await this.renderGraphic();
        } catch (error) {
            console.error(error);
        }
    }

    async renderGraphic() {
        const [orig, dest] = this.converter.codes;
        const historyData = await this.converter.getGraphic(orig, dest, 7);

        if (historyData.length === 0) return;

        const labels = historyData.map(d => d.label);
        const values = historyData.map(d => d.value);

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        const ctx = document.getElementById('chart-cambio').getContext('2d');
        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Cotação ${orig}/${dest}`,
                    data: values,
                    borderColor: '#8B4BFFFF',
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const valor = context.parsed.y;
                                return `Valor: ${valor.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(3);
                            }
                        }
                    }
                }
            }
        });
    }

    notif(message) {
        if (this.notificationActive) return;

        this.notificationActive = true;
        this.notification.classList.add('notif');
        this.message.textContent = message;

        setTimeout(() => {
            this.notification.classList.remove('notif');
            this.notificationActive = false;
        }, 3000);
    }
}

class CurrencyModal {
    constructor(modalId, onSelectCallback, notifyCallback) {
        this.modal = document.querySelector(`#${modalId}`);
        this.searchInput = this.modal.querySelector('#busca');
        this.contentContainer = this.modal.querySelector('.modal-content');
        this.onSelect = onSelectCallback;
        this.notify = notifyCallback;

        this.currencies = [];
        this.validPairCodes = new Set();
        this.activeTarget = null;
        this.currentTriggerBtn = null;
        this.currentSelectedCode = null;
        this.oppositeCode = null;

        this.initEvents();
    }

    initEvents() {
        this.searchInput.addEventListener('input', (e) => this.filter(e.target.value));

        this.handleOutsideClick = (e) => {
            const isClickInsideModal = this.modal.contains(e.target);
            const isClickOnTrigger = this.currentTriggerBtn && this.currentTriggerBtn.contains(e.target);

            if (!isClickInsideModal && !isClickOnTrigger) {
                this.close();
            }
        };
    }

    setCurrencies(list) {
        this.currencies = list;
    }

    async open(targetType, triggerElement, currentSelectedCode, oppositeCode, validPairCodes) {
        this.activeTarget = targetType;
        this.currentTriggerBtn = triggerElement;
        this.currentSelectedCode = currentSelectedCode;
        this.oppositeCode = oppositeCode;
        this.validPairCodes = validPairCodes;
        this.searchInput.value = '';

        this.positionModal(triggerElement);
        this.render(this.currencies, currentSelectedCode);
        this.modal.classList.add('active');

        setTimeout(() => {
            document.addEventListener('click', this.handleOutsideClick);
        }, 0);
    }

    positionModal(triggerElement) {
        const rect = triggerElement.getBoundingClientRect();
        const modalRect = this.modal.getBoundingClientRect();
        const modalWidth = Math.round(modalRect.width) || 290;
        const modalHeight = Math.round(modalRect.height) || 337;

        const gap = 8;
        const padding = 26;

        // CÁLCULO HORIZONTAL (LEFT):
        let leftPosition = rect.left + window.scrollX;
        const maxLeft = window.innerWidth - modalWidth - padding;
        leftPosition = Math.min(leftPosition, maxLeft);
        leftPosition = Math.max(padding, leftPosition);

        // CÁLCULO VERTICAL (TOP):
        let topPosition = rect.bottom + window.scrollY + gap;

        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < modalHeight + gap) {
            topPosition = rect.top + window.scrollY - modalHeight - gap;
        }

        this.modal.style.top = `${Math.max(padding, topPosition)}px`;
        this.modal.style.left = `${leftPosition}px`;
    }

    close() {
        this.modal.classList.remove('active');
        this.activeTarget = null;
        this.currentTriggerBtn = null;

        document.removeEventListener('click', this.handleOutsideClick);
    }

    render(list, selectedCode) {
        this.contentContainer.innerHTML = '';

        list.forEach(coin => {
            const isSelected = coin.code === selectedCode;
            const hasDirectConversion = this.validPairCodes.has(coin.code);

            const item = document.createElement('div');
            item.className = `moeda-item ${isSelected ? 'block' : ''}`;
            item.dataset.currency = coin.code;

            item.innerHTML = `
                <div class="moeda-info">
                    <span class="fi ${coin.flagClass}"></span>
                    <p>${coin.code}</p>
                </div>
                <i class="ph ph-check check-icon" style="display: ${isSelected ? 'block' : 'none'}"></i>
            `;

            item.addEventListener('click', () => {
                if (!hasDirectConversion) {
                    if (this.activeTarget === 'origin') {
                        this.notify(`A moeda ${coin.code} não tem uma conversão direta para ${this.oppositeCode}`);
                    } else {
                        this.notify(`A moeda ${this.oppositeCode} não tem uma conversão direta para ${coin.code}`);
                    }
                    return;
                }

                this.onSelect(this.activeTarget, coin);
                this.close();
            });

            this.contentContainer.appendChild(item);
        });
    }

    filter(searchTerm) {
        const term = searchTerm.toLowerCase();
        const filtered = this.currencies.filter(c =>
            c.code.toLowerCase().includes(term) || c.name.toLowerCase().includes(term)
        );
        this.render(filtered, this.currentSelectedCode);
    }
}

const converter = new Converter();
const converterApp = new ConverterApp(converter);
void converterApp.init();