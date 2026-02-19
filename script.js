'use strict';

const APP_PASS = '*Slog1987'; 

const Auth = {
    check() {
        const input = document.getElementById('login-pass');
        const error = document.getElementById('login-error');
        
        if (input.value.trim() === APP_PASS) {
            this.unlock();
        } else {
            error.classList.remove('hidden');
            input.classList.add('border-red-500', 'bg-red-50');
            setTimeout(() => {
                input.classList.remove('border-red-500', 'bg-red-50');
            }, 1000);
        }
    },
    
    unlock() {
        const screen = document.getElementById('login-screen');
        const app = document.getElementById('app-wrapper');
        
        screen.classList.add('opacity-0', 'pointer-events-none');
        app.classList.remove('blur-sm');
        
        setTimeout(() => screen.style.display = 'none', 500);
    },
    
    init() {
        setTimeout(() => {
            const el = document.getElementById('login-pass');
            if(el) el.focus();
        }, 500);
    },

    logout() {
        location.reload();
    }
};

const CONFIG = {
    geoBase: { lat: -8.1586327, lon: -34.9840637, text: "Base Operacional - Recife/PE" },
    storageKey: 'sgc_enterprise_v6_db',
    apiGeo: 'https://nominatim.openstreetmap.org',
    apiRoute: 'https://router.project-osrm.org/route/v1/driving',
    
    drivers: {
        day: ["MARIO", "CLEITON", "MESSIAS", "MARCELO A.", "JAMERSON", "MANSUETO", "JOAO VICTOR", "LUIZ R.", "JONES", "EMERSON", "JOZY A.", "JACKSON", "ROBERTO C.", "ERIC", "RODRIGO", "CLOVIS", "JOELITON"],
        night: ["ELCIDES", "MARCONI", "ELMAR", "ROBSON", "LUIZ", "RODRIGO", "MAYKEL", "MATHEUS", "PLATINIS", "BRUNO"]
    },
    
    colors: ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#db2777', '#dc2626', '#0891b2', '#ea580c']
};

const State = {
    data: { fleet: {}, addressBook: [], disposalPoints: [] }, 
    session: { currentDriver: null, shift: 'day', type: 'troca' },
    tempQueue: [],

    init() {
        const stored = localStorage.getItem(CONFIG.storageKey);
        if (stored) {
            this.data = JSON.parse(stored);
            if(!this.data.addressBook) this.data.addressBook = [];
            if(!this.data.disposalPoints) this.data.disposalPoints = [];
        } else {
            this.resetFleet();
        }
        this.integrityCheck();
    },

    integrityCheck() {
        const all = [...CONFIG.drivers.day, ...CONFIG.drivers.night];
        all.forEach((name, i) => {
            if (!this.data.fleet[name]) {
                this.data.fleet[name] = { 
                    trips: [], 
                    plate: '', 
                    color: CONFIG.colors[i % CONFIG.colors.length],
                    initialBoxes: 0 // Campo para estoque inicial
                };
            }
            // Garante que o campo exista para motoristas antigos
            if (this.data.fleet[name].initialBoxes === undefined) {
                this.data.fleet[name].initialBoxes = 0;
            }
        });
        this.save();
    },

    save() {
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(this.data));
    },

    resetFleet() {
        const book = this.data.addressBook || [];
        const disposal = this.data.disposalPoints || [];
        this.data.fleet = {};
        this.data.addressBook = book;
        this.data.disposalPoints = disposal;
        this.integrityCheck();
    },

    getDriver(name) { return this.data.fleet[name]; },
    
    getDriversByShift() {
        return this.session.shift === 'day' ? CONFIG.drivers.day : CONFIG.drivers.night;
    },

    updateInitialBoxes(name, qty) {
        if (this.data.fleet[name]) {
            this.data.fleet[name].initialBoxes = parseInt(qty) || 0;
            this.save();
        }
    },

    addTrip(driverName, tripData) {
        const driver = this.data.fleet[driverName];
        if (!driver) return;
        
        let dist = 0;
        if (tripData.from && tripData.from.lat && tripData.to && tripData.to.lat) {
            dist = GeoService.getDistance(tripData.from.lat, tripData.from.lon, tripData.to.lat, tripData.to.lon);
        }
        tripData.distance = dist.toFixed(1);
        tripData.id = Date.now() + Math.random();

        driver.trips.push(tripData);
        this.save();
    },

    removeTrip(driverName, index) {
        this.data.fleet[driverName].trips.splice(index, 1);
        this.save();
    },
    
    updateTripText(driverName, index, company, obra, obs) {
        if(this.data.fleet[driverName] && this.data.fleet[driverName].trips[index]) {
            this.data.fleet[driverName].trips[index].empresa = company;
            this.data.fleet[driverName].trips[index].obra = obra;
            if (obs !== undefined) this.data.fleet[driverName].trips[index].obs = obs;
            this.save();
        }
    },

    toggleTripStatus(driverName, index) {
        const trip = this.data.fleet[driverName].trips[index];
        trip.completed = !trip.completed;
        this.save();
    },
    
    updateTripType(driverName, index, newType) {
        if(this.data.fleet[driverName] && this.data.fleet[driverName].trips[index]) {
            this.data.fleet[driverName].trips[index].type = newType;
            this.save();
        }
    },

    updateTripQty(driverName, index, newQty) {
        if(this.data.fleet[driverName] && this.data.fleet[driverName].trips[index]) {
            const qty = parseInt(newQty);
            if(qty > 0) {
                this.data.fleet[driverName].trips[index].qty = qty;
                this.save();
            }
        }
    },

    addDisposalPoint(name, address, coords) {
        this.data.disposalPoints.push({ id: Date.now(), name, address, coords });
        this.save();
    },
    
    removeDisposalPoint(id) {
        this.data.disposalPoints = this.data.disposalPoints.filter(d => d.id !== id);
        this.save();
    },

    updateDescarte(driverName, index, location, disposalObj = null) {
        const trip = this.data.fleet[driverName].trips[index];
        if (trip) {
            trip.descarteLocal = location;
            if(disposalObj) {
                trip.disposalCoords = disposalObj.coords;
            } else {
                trip.disposalCoords = null; 
            }
            this.save();
        }
    },

    updatePlate(driverName, plate) {
        this.data.fleet[driverName].plate = plate.toUpperCase();
        this.save();
    },

    addToAddressBook(company, name, address) {
        const safeName = (name || "Sem Nome").trim();
        const safeCompany = (company || "").trim();
        
        const exists = this.data.addressBook.find(i => 
            i.name.toLowerCase() === safeName.toLowerCase() && 
            i.company.toLowerCase() === safeCompany.toLowerCase()
        );

        if (!exists) {
            this.data.addressBook.push({ 
                id: Date.now(), 
                company: safeCompany, 
                name: safeName, 
                address: address 
            });
            this.save();
            return true; 
        }
        return false; 
    },
    
    removeFromAddressBook(id) {
        this.data.addressBook = this.data.addressBook.filter(item => item.id !== id);
        this.save();
    },

    searchAddressBook(query) {
        if (!query) return [];
        const q = query.toLowerCase();
        return this.data.addressBook.filter(item => 
            (item.name && item.name.toLowerCase().includes(q)) || 
            (item.company && item.company.toLowerCase().includes(q))
        ).slice(0, 5);
    }
};

const GeoService = {
    delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); },

    async searchAddress(query) {
        let cleanQuery = query.replace(/[^\w\s,áéíóúãõâêîôûàèìòùçñÁÉÍÓÚÃÕÂÊÎÔÛÀÈÌÒÙÇÑ\-0-9]/g, " ").trim();
        if (!cleanQuery.toLowerCase().includes('pernambuco') && !cleanQuery.toLowerCase().includes('recife')) {
            cleanQuery += " Pernambuco";
        }

        try {
            const url = `${CONFIG.apiGeo}/search?format=json&q=${encodeURIComponent(cleanQuery)}&limit=1&countrycodes=br&viewbox=-36.5,-7.0,-34.5,-9.5&bounded=0`;
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.length > 0) {
                return {
                    lat: parseFloat(data[0].lat),
                    lon: parseFloat(data[0].lon),
                    text: data[0].display_name
                };
            }
        } catch (error) { console.error("Erro Geo:", error); }
        return null;
    },

    extractFromInput(input) {
        const patterns = [
            /@(-?\d+\.\d+),(-?\d+\.\d+)/, 
            /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
            /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
            /(-?\d+\.\d+),\s*(-?\d+\.\d+)/
        ];
        
        for (let p of patterns) {
            const m = input.match(p);
            if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]), text: "Localização GPS", isLink: true };
        }
        
        if (input.includes('maps.app.goo.gl') || input.includes('goo.gl')) {
            return { lat: null, lon: null, text: input, isLink: true };
        }
        return null;
    },

    async resolveLocation(input) {
        const extracted = this.extractFromInput(input);
        if (extracted) {
            if (extracted.lat) {
                const reverse = await this.reverseGeocode(extracted.lat, extracted.lon);
                return { ...extracted, text: reverse };
            }
            return { ...extracted, text: input };
        }
        
        const loc = await this.searchAddress(input);
        if(loc) {
            loc.text = input; 
        }
        return loc;
    },

    async reverseGeocode(lat, lon) {
        try {
            const res = await fetch(`${CONFIG.apiGeo}/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
            const data = await res.json();
            if (data.address) {
                const a = data.address;
                const street = a.road || a.pedestrian || "";
                const num = a.house_number || "";
                const district = a.suburb || a.neighbourhood || "";
                const city = a.city || a.town || a.village || "";
                return [street, num, district, city].filter(Boolean).join(', ') || data.display_name;
            }
        } catch(e) {}
        return `GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    },

    async getRoutePolyline(start, end) {
        if (!start.lat || !end.lat) return null;
        try {
            const url = `${CONFIG.apiRoute}/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&geometries=geojson`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.code === 'Ok') {
                return {
                    geometry: data.routes[0].geometry,
                    duration: data.routes[0].duration
                };
            }
        } catch(e) {}
        return null;
    },

    getDistance(lat1, lon1, lat2, lon2) {
        if(!lat1 || !lon1 || !lat2 || !lon2) return 99999;
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; 
    }
};

const RouteOptimizer = {
    async optimizeFrom(driverName, startIndex, startCoords) {
        const driver = State.getDriver(driverName);
        if (!driver) return; 

        let fixedTrips = driver.trips.slice(0, startIndex + 1);
        let pool = driver.trips.slice(startIndex + 1);
        let currentPos = startCoords;
        let sorted = [];

        // LÓGICA DE INVENTÁRIO DURANTE A OTIMIZAÇÃO
        // Calculamos o saldo atual de caixas antes de começar a otimizar o restante
        let runningInventory = driver.initialBoxes || 0;
        fixedTrips.forEach(t => {
            const q = parseInt(t.qty) || 0;
            if (t.type === 'colocacao') runningInventory -= q;
            else if (t.type === 'retirada') runningInventory += q;
            // Troca e encher mantêm saldo líquido igual
        });

        while(pool.length > 0) {
            let closestIndex = -1;
            let minDist = Infinity;

            // Determinar quais são os candidatos viáveis com base no estoque
            let candidates = pool;
            
            // Se o motorista está sem caixas (ou saldo insuficiente), 
            // priorizamos a RETIRADA mais próxima para "ter caixas" e poder continuar.
            if (runningInventory <= 0) {
                const availableRetiradas = pool.filter(p => p.type === 'retirada');
                if (availableRetiradas.length > 0) {
                    candidates = availableRetiradas;
                }
            }

            // Busca pelo serviço mais próximo dentro dos candidatos permitidos
            for(let i=0; i < pool.length; i++) {
                const p = pool[i];
                if (!candidates.includes(p)) continue; // Ignora se não for uma retirada necessária

                const d = GeoService.getDistance(currentPos.lat, currentPos.lon, p.to.lat, p.to.lon);
                if(d < minDist) {
                    minDist = d;
                    closestIndex = i;
                }
            }

            // Se por algum motivo (ex: só tem colocação e não tem retirada no pool) não achou candidato,
            // pega o mais próximo geral para não travar o algoritmo, mas a UI mostrará o erro.
            if (closestIndex === -1 && pool.length > 0) {
                for(let i=0; i < pool.length; i++) {
                    const p = pool[i];
                    const d = GeoService.getDistance(currentPos.lat, currentPos.lon, p.to.lat, p.to.lon);
                    if(d < minDist) {
                        minDist = d;
                        closestIndex = i;
                    }
                }
            }

            if(closestIndex !== -1) {
                const nextTrip = pool[closestIndex];
                nextTrip.from = currentPos;
                
                // Atualiza o inventário simulado para a escolha da PRÓXIMA parada
                const q = parseInt(nextTrip.qty) || 0;
                if (nextTrip.type === 'colocacao') runningInventory -= q;
                else if (nextTrip.type === 'retirada') runningInventory += q;

                await GeoService.delay(100); 
                const routeObj = await GeoService.getRoutePolyline(currentPos, nextTrip.to);
                
                if(routeObj) {
                    nextTrip.geometry = routeObj.geometry;
                    nextTrip.duration = routeObj.duration;
                }
                nextTrip.distance = minDist.toFixed(1);

                sorted.push(nextTrip);
                
                if (nextTrip.disposalCoords && nextTrip.disposalCoords.lat) {
                    currentPos = nextTrip.disposalCoords;
                } else {
                    currentPos = nextTrip.to;
                }
                
                pool.splice(closestIndex, 1);
            } else {
                sorted.push(pool.shift());
            }
        }

        driver.trips = [...fixedTrips, ...sorted];
        State.save();
    }
};

const WhatsappService = {
    generateShiftIcon(shift) { return shift === 'day' ? 'DIA' : 'NOITE'; },
    
    getPluralLabel(type, qty) {
        const q = parseInt(qty);
        const t = type.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        let label = type.toUpperCase();
        if (t.includes('troca')) label = q > 1 ? 'TROCAS' : 'TROCA';
        if (t.includes('coloca')) label = q > 1 ? 'COLOCAÇÕES' : 'COLOCAÇÃO';
        if (t.includes('retira')) label = q > 1 ? 'RETIRADAS' : 'RETIRADA';
        if (t.includes('encher')) label = 'ENCHER';
        
        return label;
    },

    formatAddress(text) {
        if (!text) return "Localização no Mapa";
        const matchParens = text.match(/\(([^)]+)\)$/);
        if (matchParens) {
            return matchParens[1];
        }
        return text.replace(/, Brasil$/i, ''); 
    },

    formatDuration(duration, distance) {
        let minutes = 0;
        if (duration) {
            minutes = Math.round(duration / 60);
        } else if (distance) {
            minutes = Math.round(parseFloat(distance) * 2.2) + 2;
        }
        if (minutes > 0) return ` [~${minutes} min]`;
        return '';
    },

    buildMessage(driverName, trips, shift, plate) {
        const date = new Date().toLocaleDateString('pt-BR');
        const shiftTxt = this.generateShiftIcon(shift);
        const plateTxt = plate ? `*[${plate}]*` : '';
        
        let msg = `ROTA ${date} (${shiftTxt})\n`;
        msg += `MOTORISTA: *${driverName}* ${plateTxt}\n`;
        msg += `--------------------------------\n\n`;

        for (let i = 0; i < trips.length; i++) {
            const t = trips[i];
            
            if (t.obs) {
                msg += `*\`OBS: ${t.obs.toUpperCase()}\`*\n`;
            }

            if (t.empresa) {
                msg += `${t.empresa.toUpperCase()}\n`;
            }

            let typeHeader = "";
            if (t.type === 'encher') {
                const q = t.qty;
                const l1 = q > 1 ? 'COLOCAÇÕES' : 'COLOCAÇÃO';
                const l2 = q > 1 ? 'RETIRADAS' : 'RETIRADA';
                typeHeader = `${q} ${l1} + ${q} ${l2}`;
            } else {
                typeHeader = `${t.qty} ${this.getPluralLabel(t.type, t.qty)}`;
            }
            msg += `*${typeHeader}*\n`;

            if (t.obra) {
                msg += `OBRA: ${t.obra.toUpperCase()}\n`;
            }

            const displayEnd = this.formatAddress(t.to.text).toUpperCase();
            msg += `END: ${displayEnd}\n`;

            if (t.descarteLocal) {
                msg += `*DESCARTE: ${t.descarteLocal.toUpperCase()}*\n`;
            }

            msg += `\n`; 
        }

        return msg;
    },

    shareGeneralSummary() {
        const shift = State.session.shift;
        const date = new Date().toLocaleDateString('pt-BR');
        const shiftTxt = shift === 'day' ? 'DIA' : 'NOITE';
        let msg = `ROTA ${date} (${shiftTxt})\n`;
        msg += `========================\n\n`;
        
        let hasContent = false;
        const drivers = State.getDriversByShift();

        drivers.forEach(name => {
            const driver = State.getDriver(name);
            const activeTrips = driver.trips.filter(t => !t.completed);
            
            if (activeTrips.length > 0) {
                hasContent = true;
                const plate = driver.plate ? `*[${driver.plate}]*` : '';
                msg += `>> *${name}* ${plate}\n`;
                
                let step = 1;
                for (let i = 0; i < activeTrips.length; i++) {
                    const t = activeTrips[i];
                    
                    if(t.obs) msg += `*\`OBS: ${t.obs.toUpperCase()}\`*\n`;
                    if (t.empresa) msg += `${t.empresa.toUpperCase()}\n`;

                    let header = "";
                    if (t.type === 'encher') {
                        const q = t.qty;
                        const l1 = q > 1 ? 'COLOCAÇÕES' : 'COLOCAÇÃO';
                        const l2 = q > 1 ? 'RETIRADAS' : 'RETIRADA';
                        header = `*${q} ${l1} + ${q} ${l2}*`;
                    } else {
                        header = `*${t.qty} ${this.getPluralLabel(t.type, t.qty)}*`;
                    }
                    msg += `${header}\n`;

                    if (t.obra) msg += `OBRA: ${t.obra.toUpperCase()}\n`;
                    const displayEnd = this.formatAddress(t.to.text).toUpperCase();
                    msg += `END: ${displayEnd}\n`;
                    if(t.descarteLocal) msg += `*DESCARTE: ${t.descarteLocal.toUpperCase()}*\n`;

                    msg += `\n`;
                    step++;
                }
                msg += `------------------------\n`;
            }
        });

        if (hasContent) {
            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
        } else {
            UI.toast("Nenhuma rota para enviar.", "info");
        }
    }
};

const DataService = {
    export() {
        const blob = new Blob([JSON.stringify(State.data)], {type: 'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `SGC_Backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    },
    import(input) {
        const r = new FileReader();
        r.onload = e => { 
            try { 
                State.data = JSON.parse(e.target.result); 
                State.save(); 
                location.reload(); 
            } catch { UI.toast("Arquivo inválido", "error"); }
        };
        if(input.files[0]) r.readAsText(input.files[0]);
    },
    reset() {
        if(confirm("Deseja iniciar um novo dia?\n\nIsso apagará todas as rotas atuais, mas manterá seus endereços salvos.")) {
            State.resetFleet();
            State.save();
            location.reload();
        }
    }
};

const UI = {
    map: null, layerGroup: null, tempTripIndex: null,

    init() {
        Auth.init(); 
        State.init();
        this.initMap();
        this.toggleSection('planning');
        App.renderGrid();
        App.renderList();
        App.initDBForm();
    },

    initMap() {
        const mapEl = document.getElementById('map');
        if(!mapEl) return;
        
        this.map = L.map('map', { zoomControl: false, attributionControl: false }).setView([CONFIG.geoBase.lat, CONFIG.geoBase.lon], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(this.map);
        this.layerGroup = L.layerGroup().addTo(this.map);
        
        const icon = L.divIcon({ className: 'custom-div-icon', html: `<div class="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-white shadow-xl text-lg border-2 border-white"><i class="fas fa-warehouse"></i></div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
        L.marker([CONFIG.geoBase.lat, CONFIG.geoBase.lon], { icon }).addTo(this.map);
    },

    toggleSidebar() {
        const sb = document.getElementById('sidebar');
        const bd = document.getElementById('sidebar-backdrop');
        if(!sb) return;
        
        const isOpen = !sb.classList.contains('-translate-x-full');
        if (isOpen) {
            sb.classList.add('-translate-x-full');
            if(bd) { bd.classList.add('hidden'); setTimeout(() => bd.classList.add('opacity-0'), 50); }
        } else {
            sb.classList.remove('-translate-x-full');
            if(bd) { bd.classList.remove('hidden'); setTimeout(() => bd.classList.remove('opacity-0'), 10); }
        }
        setTimeout(() => this.map.invalidateSize(), 300);
    },

    toggleSidebarExpand() {
        const sb = document.getElementById('sidebar');
        const icon = document.getElementById('btn-expand-icon');
        sb.classList.toggle('sidebar-expanded');
        if(sb.classList.contains('sidebar-expanded')) {
            icon.classList.replace('fa-expand', 'fa-compress');
        } else {
            icon.classList.replace('fa-compress', 'fa-expand');
        }
    },

    toggleSection(id) {
        ['planning', 'list', 'db'].forEach(s => {
            const el = document.getElementById(`section-${s}`);
            const arrow = document.getElementById(`arrow-${s}`);
            if (s === id) {
                if (el.classList.contains('hidden')) {
                    el.classList.remove('hidden');
                    if(arrow) arrow.style.transform = 'rotate(180deg)';
                } else {
                    el.classList.add('hidden');
                    if(arrow) arrow.style.transform = 'rotate(0deg)';
                }
            } else {
                el.classList.add('hidden');
                if(arrow) arrow.style.transform = 'rotate(0deg)';
            }
        });
        
        const fab = document.getElementById('fab-summary');
        if (id === 'list') {
            App.renderList();
            if(fab) fab.classList.remove('hidden');
        } else {
            if(fab) fab.classList.add('hidden');
        }
        
        if(id === 'planning') App.renderGrid();
        if(id === 'db') App.renderAddressBook();
    },

    toggleModal(id) { 
        const el = document.getElementById(id);
        if(el) el.classList.toggle('hidden'); 
    },
    
    loading(show) { document.getElementById('loading-overlay').classList.toggle('hidden', !show); },

    toast(msg, type = 'success') {
        const c = document.getElementById('toast-container');
        const el = document.createElement('div');
        const cls = type === 'success' ? 'bg-emerald-600' : (type === 'error' ? 'bg-red-500' : 'bg-blue-600');
        el.className = `${cls} text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 text-xs font-bold animate-fade-in border border-white/20`;
        el.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
        c.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    },

    openEditor(name) {
        const d = State.getDriver(name);
        State.session.currentDriver = name;
        State.tempQueue = []; 
        App.renderQueue(); 
        
        document.getElementById('editor-panel').classList.remove('hidden');
        document.getElementById('editor-driver-name').innerText = name;
        document.getElementById('input-plate').value = d.plate || '';
        document.getElementById('input-empresa').value = '';
        document.getElementById('input-obra').value = '';
        document.getElementById('input-dest').value = '';
        document.getElementById('input-obs').value = ''; 
        document.getElementById('input-qty').value = '1';
        
        const last = d.trips.length ? d.trips[d.trips.length-1].to : CONFIG.geoBase;
        document.getElementById('editor-origin').innerText = last.customName || last.text;

        document.getElementById('form-single').classList.remove('hidden');

        this.selectType('troca');
        App.visualizeDriverOnMap(name);
        App.renderMiniHistory(name);
        
        setTimeout(() => document.getElementById('input-empresa').focus(), 100);
    },

    closeEditor() {
        State.session.currentDriver = null;
        document.getElementById('editor-panel').classList.add('hidden');
        document.getElementById('suggestions-box').classList.add('hidden');
        this.layerGroup.clearLayers();
        L.marker([CONFIG.geoBase.lat, CONFIG.geoBase.lon], { icon: L.divIcon({className:'custom-div-icon', html:`<div class="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-white border-2 border-white"><i class="fas fa-warehouse"></i></div>`}) }).addTo(this.map);
        this.map.setView([CONFIG.geoBase.lat, CONFIG.geoBase.lon], 13);
        App.renderGrid();
    },

    selectType(t) {
        State.session.type = t;
        const types = ['troca', 'colocacao', 'retirada', 'encher'];
        types.forEach(type => {
            const btn = document.getElementById(`btn-type-${type}`);
            btn.className = 'type-sel transition-all duration-200 font-bold text-lg border text-slate-500 border-slate-200 hover:bg-slate-50';
            if (t === type) {
                if(type === 'troca') btn.className = 'type-sel active bg-blue-600 text-white border-blue-600 shadow-md scale-105';
                if(type === 'colocacao') btn.className = 'type-sel active bg-red-600 text-white border-red-600 shadow-md scale-105';
                if(type === 'retirada') btn.className = 'type-sel active bg-purple-600 text-white border-purple-600 shadow-md scale-105';
                if(type === 'encher') btn.className = 'type-sel active bg-amber-500 text-white border-amber-500 shadow-md scale-105';
            }
        });
    }
};

const App = {
    dragSource: null,

    initDBForm() {
        const dbSection = document.getElementById('section-db');
        if (!dbSection) return;
        const container = dbSection.querySelector('.space-y-2');
        if (container && !document.getElementById('db-company')) {
            const input = document.createElement('input');
            input.id = 'db-company';
            input.type = 'text';
            input.className = 'input-modern mb-2';
            input.placeholder = 'Empresa (Ex: Construtora X)';
            container.insertBefore(input, document.getElementById('db-name'));
        }
        this.renderDisposalList();
    },

    async processSmartPaste() {
        const text = document.getElementById('paste-area').value;
        if (!text.trim()) return UI.toast("Cole o texto primeiro", "error");
        
        const driverName = State.session.currentDriver;
        if (!driverName) return UI.toast("Selecione um motorista", "error");

        UI.loading(true);

        const lines = text.split('\n');
        let buffer = { empresa: '', obra: '', end: '' };
        let count = 0;

        for (let line of lines) {
            line = line.trim();
            if(!line) continue;

            const matchEmpresa = line.match(/(?:EMPRESA|CLIENTE):\s*(.+)/i);
            if(matchEmpresa) buffer.empresa = matchEmpresa[1].trim();

            const matchObra = line.match(/(?:OBRA|LOCAL):\s*(.+)/i);
            if(matchObra) buffer.obra = matchObra[1].trim();

            const matchEnd = line.match(/(?:END|ENDEREÇO):\s*(.+)/i);
            if(matchEnd) {
                buffer.end = matchEnd[1].trim();
                await this.createRouteFromBuffer(driverName, buffer);
                buffer = { empresa: '', obra: '', end: '' };
                count++;
            }
        }

        UI.loading(false);
        UI.toggleModal('paste-modal');
        document.getElementById('paste-area').value = '';
        UI.openEditor(driverName);
        UI.toast(`${count} rotas importadas!`);
    },

    async createRouteFromBuffer(driverName, data) {
        if(!data.end) return;
        
        await GeoService.delay(1000);

        const loc = await GeoService.resolveLocation(data.end);
        if(loc && loc.lat) {
            if(data.empresa || data.obra) {
                State.addToAddressBook(data.empresa, data.obra, data.end);
            }

            const driver = State.getDriver(driverName);
            const lastTrip = driver.trips.length > 0 ? driver.trips[driver.trips.length-1].to : CONFIG.geoBase;

            const inputs = {
                empresa: data.empresa,
                obra: data.obra,
                qty: 1,
                type: 'troca',
                obs: "",
                to: loc,
                from: lastTrip,
                descarteLocal: null,
                completed: false
            };

            const routeObj = await GeoService.getRoutePolyline(inputs.from, inputs.to);
            if(routeObj) {
                inputs.geometry = routeObj.geometry;
                inputs.duration = routeObj.duration;
            }

            State.addTrip(driverName, inputs);
        }
    },

    openDisposalModal(tripIndex) {
        const list = document.getElementById('select-disposal-list');
        list.innerHTML = '';
        
        State.data.disposalPoints.forEach(dp => {
            const btn = document.createElement('button');
            btn.className = "w-full text-left p-3 hover:bg-green-50 rounded border-b border-slate-50 text-xs font-bold text-slate-700 flex items-center";
            btn.innerHTML = `<i class="fas fa-map-marker-alt text-green-500 mr-2"></i>${dp.name}`;
            btn.onclick = () => App.confirmDisposalSelection(tripIndex, dp);
            list.appendChild(btn);
        });
        
        if(State.data.disposalPoints.length === 0) {
            list.innerHTML = '<div class="text-center text-xs text-gray-400 p-4">Nenhum aterro cadastrado.<br>Vá em Configurações > Gerenciar Aterros.</div>';
        }

        UI.tempTripIndex = tripIndex;
        UI.toggleModal('select-disposal-modal');
    },

    async confirmDisposalSelection(tripIndex, disposal) {
        const name = State.session.currentDriver;
        UI.toggleModal('select-disposal-modal');
        UI.loading(true);

        try {
            State.updateDescarte(name, tripIndex, disposal.name, disposal);
            this.renderList(); // ATUALIZA A UI IMEDIATAMENTE (Feedback Instantâneo)
            
            await RouteOptimizer.optimizeFrom(name, tripIndex, disposal.coords);
            UI.toast(`Recalculado a partir de ${disposal.name}`);
        } catch (e) {
            console.error(e);
            UI.toast("Erro ao calcular rota do aterro", "error");
        } finally {
            UI.loading(false);
            UI.openEditor(name); 
            this.renderList(); // Atualiza de novo caso tenha mudado algo na rota
        }
    },

    async recalculateFrom(name, index) {
        const driver = State.getDriver(name);
        const trip = driver.trips[index];
        let startPoint = trip.to; 
        let confirmMsg = `Recalcular ordem das próximas viagens a partir de: ${trip.to.text}?`;
        
        if(trip.descarteLocal) {
             if(trip.disposalCoords && trip.disposalCoords.lat) {
                 startPoint = trip.disposalCoords;
                 confirmMsg = `Recalcular ordem a partir do Aterro: ${trip.descarteLocal}?`;
             } else {
                 UI.loading(true);
                 const loc = await GeoService.resolveLocation(trip.descarteLocal);
                 UI.loading(false);
                 if(loc && loc.lat) {
                    startPoint = { lat: loc.lat, lon: loc.lon };
                    State.updateDescarte(name, index, trip.descarteLocal, { coords: startPoint });
                    confirmMsg = `Recalcular ordem a partir do Aterro: ${trip.descarteLocal}?`;
                 }
             }
        }
        
        if(confirm(confirmMsg)) {
            UI.loading(true);
            try {
                await RouteOptimizer.optimizeFrom(name, index, startPoint);
                UI.toast("Rota reorganizada!");
            } catch (e) {
                console.error(e);
                UI.toast("Erro na otimização", "error");
            } finally {
                UI.loading(false);
                this.renderList(); 
            }
        }
    },

    clearTripDisposal() {
        const name = State.session.currentDriver;
        State.updateDescarte(name, UI.tempTripIndex, null, null);
        UI.toggleModal('select-disposal-modal');
        this.renderList();
    },

    async addDisposalPoint() {
        const name = document.getElementById('new-aterro-name').value;
        const addr = document.getElementById('new-aterro-addr').value;
        if(!name || !addr) return UI.toast("Preencha todos os campos", "error");

        UI.loading(true);
        const loc = await GeoService.resolveLocation(addr);
        UI.loading(false);

        if(loc && loc.lat) {
            State.addDisposalPoint(name, addr, { lat: loc.lat, lon: loc.lon });
            this.renderDisposalList();
            document.getElementById('new-aterro-name').value = '';
            document.getElementById('new-aterro-addr').value = '';
            UI.toast("Aterro salvo com sucesso!");
        } else {
            UI.toast("Endereço não encontrado", "error");
        }
    },

    renderDisposalList() {
        const el = document.getElementById('disposal-list');
        if(!el) return;
        el.innerHTML = '';
        State.data.disposalPoints.forEach(dp => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-slate-50 p-2 rounded border border-slate-100";
            div.innerHTML = `<span class="text-xs font-bold text-slate-700">${dp.name}</span><button onclick="State.removeDisposalPoint(${dp.id}); App.renderDisposalList()" class="text-red-400 hover:text-red-600"><i class="fas fa-trash"></i></button>`;
            el.appendChild(div);
        });
    },

    setShift(shift) {
        State.session.shift = shift;
        document.getElementById('shift-day').className = `shift-btn ${shift==='day'?'active':''}`;
        document.getElementById('shift-night').className = `shift-btn ${shift==='night'?'active':''}`;
        
        const logo = document.getElementById('app-logo');
        if (shift === 'night') {
            document.body.classList.add('night-mode');
            if(logo) logo.src = 'images.png';
        } else {
            document.body.classList.remove('night-mode');
            if(logo) logo.src = 'images.png';
        }

        UI.closeEditor();
        this.renderGrid();
        if(!document.getElementById('section-list').classList.contains('hidden')) this.renderList();
    },

    updatePlate() {
        const name = State.session.currentDriver;
        if(name) State.updatePlate(name, document.getElementById('input-plate').value);
    },

    handleAutocomplete(input, type) {
        const val = input.value.toLowerCase();
        const box = document.getElementById('suggestions-box');
        
        if (val.length < 2) {
            box.classList.add('hidden');
            return;
        }

        const matches = State.searchAddressBook(val);
        
        if (matches.length > 0) {
            box.innerHTML = matches.map(item => `
                <div class="suggestion-item" onclick="App.selectSuggestion('${item.company || ''}', '${item.name}', '${item.address}')">
                    <div class="flex justify-between items-center">
                        <strong>${item.name}</strong>
                        <span class="text-[9px] bg-slate-100 px-1 rounded text-slate-500 uppercase">${item.company || 'Geral'}</span>
                    </div>
                    <div class="text-xs text-slate-400 truncate">${item.address}</div>
                </div>
            `).join('');
            box.classList.remove('hidden');
        } else {
            box.classList.add('hidden');
        }
    },

    selectSuggestion(company, name, address) {
        document.getElementById('input-empresa').value = company;
        document.getElementById('input-obra').value = name;
        document.getElementById('input-dest').value = address;
        
        document.getElementById('input-dest').classList.add('bg-blue-50', 'border-blue-200');
        setTimeout(() => document.getElementById('input-dest').classList.remove('bg-blue-50', 'border-blue-200'), 1000);

        document.getElementById('suggestions-box').classList.add('hidden');
    },

    async addRoute() {
        const name = State.session.currentDriver;
        if (!name) return;
        const raw = document.getElementById('input-dest').value;
        if (!raw) return UI.toast("Digite um endereço", "error");

        UI.loading(true);
        
        try {
            const extraInfoMatch = raw.match(/\((.*?)\)/);
            const extraInfo = extraInfoMatch ? extraInfoMatch[1] : null;
            const cleanRaw = raw.replace(/\(.*?\)/g, '').trim();

            const location = await GeoService.resolveLocation(cleanRaw || raw);
            
            if (location) {
                if (extraInfo) location.text += ` (${extraInfo})`;

                const driver = State.getDriver(name);
                let fromLocation = CONFIG.geoBase;
                if(driver.trips.length > 0) {
                    const lastTrip = driver.trips[driver.trips.length - 1];
                    if(lastTrip.disposalCoords) {
                        fromLocation = lastTrip.disposalCoords;
                    } else {
                        fromLocation = lastTrip.to;
                    }
                }

                const inputs = {
                    empresa: document.getElementById('input-empresa').value,
                    obra: document.getElementById('input-obra').value,
                    qty: document.getElementById('input-qty').value,
                    type: State.session.type,
                    obs: document.getElementById('input-obs').value,
                    to: location,
                    from: fromLocation,
                    descarteLocal: null,
                    disposalCoords: null, 
                    completed: false
                };

                const routeObj = await GeoService.getRoutePolyline(inputs.from, inputs.to);
                if (routeObj) {
                    inputs.geometry = routeObj.geometry;
                    inputs.duration = routeObj.duration;
                }

                State.addTrip(name, inputs);
                
                if (inputs.obra || inputs.empresa) {
                    const addressToSave = (location.isLink) ? raw : location.text;
                    State.addToAddressBook(inputs.empresa, inputs.obra, addressToSave);
                }
                
                document.getElementById('input-dest').value = '';
                document.getElementById('input-obs').value = '';
                
                UI.openEditor(name);
                App.renderList();   
                App.renderGrid();   
                App.renderAddressBook(); 
                UI.toast("Adicionado!");
            } else {
                UI.toast("Endereço não encontrado em PE", "error");
            }
        } catch (error) {
            console.error(error);
            UI.toast("Erro ao processar rota", "error");
        } finally {
            UI.loading(false);
        }
    },

    addToQueue() {
        const empresa = document.getElementById('input-empresa').value;
        const obra = document.getElementById('input-obra').value;
        const dest = document.getElementById('input-dest').value;
        
        if (!dest) return UI.toast("Preencha o endereço", "error");

        const item = {
            empresa,
            obra,
            dest,
            qty: document.getElementById('input-qty').value,
            type: State.session.type,
            obs: document.getElementById('input-obs').value
        };

        State.tempQueue.push(item);
        
        document.getElementById('input-dest').value = '';
        document.getElementById('input-obs').value = '';
        document.getElementById('input-empresa').focus(); 
        
        this.renderQueue();
        UI.toast("Adicionado à fila!");
    },

    renderQueue() {
        const container = document.getElementById('queue-container');
        const list = document.getElementById('queue-list');
        const count = document.getElementById('queue-count');
        
        list.innerHTML = '';
        count.innerText = State.tempQueue.length;

        if (State.tempQueue.length > 0) {
            container.classList.remove('hidden');
            State.tempQueue.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = "flex justify-between items-center text-[10px] bg-white p-1 rounded border border-blue-100";
                div.innerHTML = `<span class="truncate font-bold text-blue-800">${index+1}. ${item.empresa || 'Empresa'} - ${item.dest}</span>`;
                list.appendChild(div);
            });
        } else {
            container.classList.add('hidden');
        }
    },

    async processQueue() {
        const name = State.session.currentDriver;
        if (!name || State.tempQueue.length === 0) return;

        UI.loading(true);
        
        for (const item of State.tempQueue) {
            try {
                await this.addRouteFromData(name, item);
            } catch (e) {
                console.error(e);
            }
        }

        State.tempQueue = [];
        this.renderQueue();
        UI.loading(false);
        UI.toast("Fila processada com sucesso!");
    },

    async addRouteFromData(name, data) {
        const raw = data.dest;
        const extraInfoMatch = raw.match(/\((.*?)\)/);
        const extraInfo = extraInfoMatch ? extraInfoMatch[1] : null;
        const cleanRaw = raw.replace(/\(.*?\)/g, '').trim();

        const location = await GeoService.resolveLocation(cleanRaw || raw);
        
        if (location) {
            if (extraInfo) location.text += ` (${extraInfo})`;

            const driver = State.getDriver(name);
            let fromLocation = CONFIG.geoBase;
            if(driver.trips.length > 0) {
                const lastTrip = driver.trips[driver.trips.length - 1];
                if(lastTrip.disposalCoords) {
                    fromLocation = lastTrip.disposalCoords;
                } else {
                    fromLocation = lastTrip.to;
                }
            }

            const inputs = {
                empresa: data.empresa,
                obra: data.obra,
                qty: data.qty,
                type: data.type,
                obs: data.obs,
                to: location,
                from: fromLocation,
                descarteLocal: null,
                disposalCoords: null, 
                completed: false
            };

            const routeObj = await GeoService.getRoutePolyline(inputs.from, inputs.to);
            if (routeObj) {
                inputs.geometry = routeObj.geometry;
                inputs.duration = routeObj.duration;
            }

            State.addTrip(name, inputs);
            
            if (inputs.obra || inputs.empresa) {
                const addressToSave = (location.isLink) ? raw : location.text;
                State.addToAddressBook(inputs.empresa, inputs.obra, addressToSave);
            }
            
            App.renderList();   
            App.renderGrid();   
            App.renderAddressBook();
        }
    },

    addToAddressBook(company, name, address) {
        let c = company, n = name, a = address;
        let isManual = false;
        
        if (arguments.length === 0) {
            isManual = true;
            c = document.getElementById('db-company').value;
            n = document.getElementById('db-name').value;
            a = document.getElementById('db-addr').value;
        }

        const saved = State.addToAddressBook(c, n, a);
        
        if (saved) {
            this.renderAddressBook();
            if(isManual) {
                document.getElementById('db-company').value = '';
                document.getElementById('db-name').value = '';
                document.getElementById('db-addr').value = '';
                UI.toast("Salvo com sucesso!");
            }
            return true;
        } else {
            if(isManual) UI.toast("Já existe no banco", "info");
            return false;
        }
    },
    
    removeFromAddressBook(id) {
        this.data.addressBook = this.data.addressBook.filter(item => item.id !== id);
        this.save();
    },

    searchAddressBook(query) {
        if (!query) return [];
        const q = query.toLowerCase();
        return this.data.addressBook.filter(item => 
            (item.name && item.name.toLowerCase().includes(q)) || 
            (item.company && item.company.toLowerCase().includes(q))
        ).slice(0, 5);
    },

    deleteFromAddressBook(id) {
        if(confirm("Remover este endereço?")) {
            State.removeFromAddressBook(id);
            this.renderAddressBook();
        }
    },

    renderAddressBook() {
        const el = document.getElementById('db-list');
        el.innerHTML = '';
        if(State.data.addressBook.length === 0) {
            el.innerHTML = '<div class="text-center text-xs text-slate-400 py-4">Nenhum endereço salvo</div>';
            return;
        }
        State.data.addressBook.slice().reverse().forEach(item => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-white p-2 rounded border border-slate-100 shadow-sm";
            div.innerHTML = `
                <div class="flex-1 min-w-0 pr-2">
                    <div class="flex items-center gap-2">
                        <div class="font-bold text-xs text-slate-700 truncate">${item.name}</div>
                        ${item.company ? `<span class="text-[8px] bg-blue-50 text-blue-500 px-1 rounded uppercase">${item.company}</span>` : ''}
                    </div>
                    <div class="text-[9px] text-slate-400 truncate">${item.address}</div>
                </div>
                <button onclick="App.deleteFromAddressBook(${item.id})" class="text-slate-300 hover:text-red-500"><i class="fas fa-trash-alt"></i></button>
            `;
            el.appendChild(div);
        });
    },

    renderGrid() {
        const el = document.getElementById('drivers-grid');
        el.innerHTML = '';
        State.getDriversByShift().forEach(name => {
            const d = State.getDriver(name);
            const pending = d.trips.filter(t => !t.completed).length;
            const card = document.createElement('div');
            card.className = `driver-card ${State.session.currentDriver===name ? 'selected' : ''}`;
            card.onclick = () => UI.openEditor(name);
            
            const plateHtml = d.plate ? `<div class="text-[8px] font-mono bg-slate-100 text-slate-500 rounded px-1 w-fit mt-1 border border-slate-200">${d.plate}</div>` : '';
            
            card.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm transition-transform hover:scale-110" style="background:${d.color}">${name.substring(0,2)}</div>
                    <div class="flex-1 min-w-0">
                        <div class="font-bold text-xs text-slate-700 truncate">${name}</div>
                        ${plateHtml}
                        <div class="text-[9px] ${pending?'text-blue-600 font-bold':'text-slate-400'} mt-0.5">${pending} pendentes</div>
                    </div>
                </div>`;
            el.appendChild(card);
        });
    },

    renderMiniHistory(name) {
        const el = document.getElementById('mini-history');
        el.innerHTML = '';
        const trips = State.getDriver(name).trips;
        if(trips.length === 0) { el.innerHTML = '<div class="text-[9px] text-slate-300 text-center py-2">Sem viagens hoje</div>'; return; }
        
        trips.slice().reverse().forEach((t, revIndex) => {
            const realIndex = trips.length - 1 - revIndex;
            const row = document.createElement('div');
            row.className = "flex justify-between items-center bg-slate-50 p-2 rounded border border-slate-100 mb-1 animate-fade-in";
            const obsText = t.obs ? `<span class="text-[8px] text-amber-600 block italic">Obs: ${t.obs}</span>` : '';
            const companyTag = t.empresa ? `<span class="text-[7px] bg-slate-200 px-1 rounded mr-1">${t.empresa}</span>` : '';
            
            let displayType = t.type.toUpperCase();
            if(t.type === 'encher') displayType = 'ENCHER'; 

            row.innerHTML = `
                <div class="truncate pr-2">
                    <div class="flex gap-1">
                        <button onclick="App.changeQty('${name}',${realIndex})" class="text-[9px] font-bold text-slate-700 hover:text-blue-600 border-b border-dotted border-slate-300 w-4 text-center" title="Mudar Qtd">${t.qty}</button>
                        <button onclick="App.cycleType('${name}',${realIndex})" class="text-[9px] font-bold text-slate-700 hover:text-blue-600 border-b border-dotted border-slate-300" title="Mudar Tipo">${displayType}</button>
                    </div>
                    <div class="text-[8px] text-slate-400 truncate">${companyTag}${t.obra || 'Sem nome'}</div>
                    ${obsText}
                </div>
                <button onclick="App.quickDelete('${name}', ${realIndex})" class="w-5 h-5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 flex items-center justify-center"><i class="fas fa-times text-xs"></i></button>
            `;
            el.appendChild(row);
        });
    },

    handleDragStart(e, driverName, index) {
        this.dragSource = { driver: driverName, index: index };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify(this.dragSource));
        setTimeout(() => e.target.classList.add('opacity-50', 'bg-blue-50'), 0);
    },

    handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault(); 
        }
        e.dataTransfer.dropEffect = 'move';
        return false;
    },

    async handleDrop(e, targetDriverName, targetIndex) {
        e.stopPropagation();
        
        document.querySelectorAll('.timeline-item').forEach(el => {
            el.classList.remove('opacity-50', 'bg-blue-50');
        });

        const source = this.dragSource;
        if (!source || source.driver !== targetDriverName) {
            UI.toast("Mova apenas dentro do mesmo motorista", "error");
            return false;
        }

        if (source.index === targetIndex) return false;

        const driver = State.getDriver(source.driver);
        const movedItem = driver.trips.splice(source.index, 1)[0];
        driver.trips.splice(targetIndex, 0, movedItem);
        
        State.save();
        this.renderList();
        
        return false;
    },

    renderList() {
        const container = document.getElementById('monitoring-list');
        container.innerHTML = '';
        const drivers = State.getDriversByShift();
        
        drivers.forEach(name => {
            const d = State.getDriver(name);
            if(!d.trips.length) return;
            
            // LOGICA DE INVENTARIO PARA O MONITORAMENTO
            let currentBalance = d.initialBoxes || 0;
            const balanceSteps = [];

            const card = document.createElement('div');
            card.className = "bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm";
            
            let html = `
                <div class="p-3 bg-slate-50/50 flex justify-between items-center border-b border-slate-100">
                    <div class="flex items-center gap-3" onclick="this.parentElement.nextElementSibling.classList.toggle('hidden')">
                        <div class="w-8 h-8 rounded-lg text-white text-xs flex items-center justify-center font-bold shadow-sm" style="background:${d.color}">${name.substring(0,2)}</div>
                        <div>
                            <span class="font-bold text-xs text-slate-700 block">${name}</span>
                            ${d.plate ? '<span class="text-[9px] text-slate-400 font-mono tracking-tight">'+d.plate+'</span>' : ''}
                        </div>
                    </div>
                    <div class="flex flex-col items-end gap-1">
                        <div class="flex items-center gap-2">
                            <span class="text-[10px] font-bold text-slate-400 uppercase">Estoque Inicial:</span>
                            <input type="number" class="input-inventory" value="${d.initialBoxes}" onchange="State.updateInitialBoxes('${name}', this.value); App.renderList()">
                        </div>
                    </div>
                </div>
                <div class="p-3 space-y-3">
            `;

            d.trips.forEach((t, i) => {
                const qty = parseInt(t.qty) || 0;
                let hasError = false;

                // Lógica solicitada
                if (t.type === 'colocacao') {
                    if (currentBalance < qty) hasError = true;
                    currentBalance -= qty;
                } else if (t.type === 'retirada') {
                    currentBalance += qty;
                } else if (t.type === 'troca') {
                    // Para trocar precisa ter uma vazia disponível
                    if (currentBalance < qty) hasError = true;
                    // Saldo não muda no final (tira uma vazia, põe uma cheia no caminhão)
                }

                const errorMsg = hasError ? `<div class="inventory-badge inventory-error mt-1"><i class="fas fa-exclamation-triangle"></i> SEM CAIXA! PRECISA RETIRAR</div>` : '';
                const balanceDisplay = `<span class="text-[9px] font-bold ${currentBalance < 0 ? 'text-red-500' : 'text-slate-400'} uppercase ml-auto">Saldo: ${currentBalance}</span>`;

                const descarteClass = t.descarteLocal ? 'active bg-red-50 border-red-200 text-red-500' : 'text-slate-300 hover:text-slate-500 border-transparent';
                const recalcBtn = (i < d.trips.length - 1) ? `<button onclick="App.recalculateFrom('${name}', ${i})" class="ml-2 text-[9px] bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded font-bold hover:bg-blue-100 transition flex items-center gap-1"><i class="fas fa-route"></i> Recalcular Próximas</button>` : '';
                const descarteDisplay = t.descarteLocal ? `<div class="mt-1.5 flex flex-wrap items-center gap-1"><div class="text-[9px] font-bold text-red-500 flex items-center gap-1.5 p-1 bg-red-50 rounded border border-red-100 w-fit"><i class="fas fa-trash-arrow-up"></i> DESCARTAR EM: ${t.descarteLocal}</div></div>` : '';
                const obsDisplay = t.obs ? `<div class="mt-1 text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 w-fit"><i class="fas fa-comment-dots text-[8px] mr-1"></i>${t.obs}</div>` : '';
                const companyDisplay = t.empresa ? `<span class="text-[8px] font-bold text-blue-600 bg-blue-50 px-1 rounded mr-1">${t.empresa}</span>` : '';
                const distDisplay = t.distance ? `<span class="text-[9px] text-slate-400 font-bold text-blue-600">(${t.distance} km)</span>` : '';
                const timeStr = WhatsappService.formatDuration(t.duration, t.distance);
                const timeDisplay = timeStr ? `<span class="text-[9px] text-slate-400 font-bold text-green-600 ml-1"><i class="far fa-clock"></i>${timeStr.replace(' [~', ' ').replace(']', '')}</span>` : '';
                
                let displayType = t.type.toUpperCase();
                if(t.type === 'encher') displayType = 'ENCHER NA HORA';

                html += `
                <div class="timeline-item ${t.completed ? 'opacity-50 grayscale' : ''}"
                     draggable="true"
                     ondragstart="App.handleDragStart(event, '${name}', ${i})"
                     ondragover="App.handleDragOver(event)"
                     ondrop="App.handleDrop(event, '${name}', ${i})"
                     style="cursor: grab;"
                >
                    <div onclick="App.toggleStatus('${name}',${i})" class="timeline-dot ${t.completed?'completed':''}">${t.completed?'<i class="fas fa-check text-[8px]"></i>':''}</div>
                    <div class="flex justify-between items-start pl-2">
                        <div class="flex-1 min-w-0 pr-2">
                            <div class="flex flex-wrap gap-1 mb-0.5 items-center">
                                <div class="mr-1.5 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing"><i class="fas fa-grip-vertical text-[10px]"></i></div>
                                <div class="flex items-center gap-1 mr-1">
                                     <button onclick="App.changeQty('${name}',${i})" class="text-[10px] font-black text-slate-800 hover:text-blue-600 border-b border-dotted border-slate-300 min-w-[1.2rem]">${t.qty}</button>
                                     <button onclick="App.cycleType('${name}',${i})" class="text-[10px] font-black text-slate-800 hover:text-blue-600 border-b border-dotted border-slate-300">${displayType}</button>
                                </div>
                                <span class="text-[10px] text-slate-500 truncate">- ${companyDisplay}${t.obra || ''}</span>
                            </div>
                            <div class="text-[10px] text-slate-400 truncate">${WhatsappService.formatAddress(t.to.text)} ${distDisplay}${timeDisplay}</div>
                            ${obsDisplay}
                            ${descarteDisplay}
                            ${errorMsg}
                            <div class="mt-1 flex items-center">${recalcBtn} ${balanceDisplay}</div>
                        </div>
                        <div class="flex gap-1 shrink-0">
                            <button onclick="App.editObs('${name}',${i})" class="btn-descarte w-7 h-7 border rounded flex items-center justify-center text-blue-400 hover:bg-blue-50 border-blue-100" title="Observação"><i class="fas fa-cloud text-xs"></i></button>
                            <button onclick="App.openDisposalModal(${i})" class="btn-descarte w-7 h-7 border rounded flex items-center justify-center ${descarteClass}" title="Descarte"><i class="fas fa-recycle text-xs"></i></button>
                            <button onclick="App.deleteTrip('${name}',${i})" class="w-7 h-7 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition"><i class="fas fa-times text-xs"></i></button>
                        </div>
                    </div>
                </div>`;
            });

            html += `
                <div class="mt-3 pt-3 border-t border-slate-100">
                    <button onclick="App.shareDriverRoute('${name}')" class="w-full py-2 bg-slate-800 hover:bg-black text-white text-xs font-bold rounded-lg transition flex items-center justify-center gap-2">
                        <i class="fab fa-whatsapp"></i> Enviar Rota Individual
                    </button>
                </div>
                </div>`;
            
            card.innerHTML = html;
            container.appendChild(card);
        });
    },

    visualizeDriverOnMap(name) {
        UI.layerGroup.clearLayers();
        const d = State.getDriver(name);
        const points = [];
        
        d.trips.forEach((t, i) => {
            if(t.geometry) {
                const latlngs = t.geometry.coordinates.map(c => [c[1], c[0]]);
                points.push(...latlngs);
                L.polyline(latlngs, { color: t.completed ? '#cbd5e1' : d.color, weight: 4, opacity: 0.8 }).addTo(UI.map);
            }
            
            const html = `<div class="w-6 h-6 ${t.completed?'bg-slate-300':'bg-white'} border-2 border-slate-700 rounded text-slate-800 flex items-center justify-center text-[10px] font-bold shadow-md">${i+1}</div>`;
            if(t.to.lat) L.marker([t.to.lat, t.to.lon], { icon: L.divIcon({className:'custom-div-icon', html, iconSize:[24,24]}) }).addTo(UI.layerGroup);

            if (t.disposalCoords && t.disposalCoords.lat) {
                 const disposalIcon = L.divIcon({
                     className: 'custom-div-icon', 
                     html: `<div class="w-8 h-8 bg-green-500 rounded-full border-2 border-white shadow-md flex items-center justify-center text-white"><i class="fas fa-recycle text-sm"></i></div>`,
                     iconSize: [32, 32],
                     iconAnchor: [16, 16]
                 });
                 L.marker([t.disposalCoords.lat, t.disposalCoords.lon], { icon: disposalIcon }).addTo(UI.layerGroup);
                 L.polyline([[t.to.lat, t.to.lon], [t.disposalCoords.lat, t.disposalCoords.lon]], { color: '#22c55e', dashArray: '5, 10', weight: 2, opacity: 0.7 }).addTo(UI.map);
            }
        });

        const last = d.trips.length ? d.trips[d.trips.length-1].to : CONFIG.geoBase;
        if(last.lat) {
            const html = `<div style="background:${d.color}" class="w-10 h-10 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-white"><i class="fas fa-truck"></i></div>`;
            L.marker([last.lat, last.lon], { icon: L.divIcon({className:'custom-div-icon', html, iconSize:[40,40], iconAnchor:[20,20]}), zIndexOffset:1000 }).addTo(UI.layerGroup);
        }

        if(points.length) UI.map.fitBounds(points, { padding: [50, 50] });
        else UI.map.setView([CONFIG.geoBase.lat, CONFIG.geoBase.lon], 13);
    },

    quickDelete(name, index) {
        if(confirm("Excluir viagem rápida?")) {
            State.removeTrip(name, index);
            UI.openEditor(name);
        }
    },
    deleteTrip(name, index) {
        if(confirm("Apagar esta entrega?")) {
            State.removeTrip(name, index);
            this.renderList();
        }
    },
    toggleStatus(n, i) { State.toggleTripStatus(n, i); this.renderList(); },
    
    cycleType(name, index) {
        const d = State.getDriver(name);
        if(!d || !d.trips[index]) return;
        const types = ['troca', 'colocacao', 'retirada', 'encher'];
        const current = d.trips[index].type;
        let nextIndex = types.indexOf(current) + 1;
        if (nextIndex >= types.length || nextIndex === -1) nextIndex = 0;
        State.updateTripType(name, index, types[nextIndex]);
        this.renderList();
        this.renderMiniHistory(name);
    },
    
    editTripText(name, index) {
        const d = State.getDriver(name);
        if(!d || !d.trips[index]) return;
        const currentCompany = d.trips[index].empresa || '';
        const currentObra = d.trips[index].obra || '';
        const currentObs = d.trips[index].obs || ''; 
        const newCompany = prompt("Editar Empresa:", currentCompany);
        if(newCompany === null) return; 
        const newObra = prompt("Editar Obra:", currentObra);
        if(newObra === null) return; 
        const newObs = prompt("Editar Observação:", currentObs);
        if (newObs === null) return;
        State.updateTripText(name, index, newCompany, newObra, newObs);
        this.renderList();
    },

    editObs(name, index) {
        const d = State.getDriver(name);
        const currentObs = d.trips[index].obs || '';
        const newObs = prompt("Adicionar/Editar Observação:", currentObs);
        if (newObs !== null) {
            d.trips[index].obs = newObs;
            State.save();
            this.renderList();
        }
    },

    changeQty(name, index) {
        const d = State.getDriver(name);
        if(!d || !d.trips[index]) return;
        const current = d.trips[index].qty;
        const newQty = prompt("Nova quantidade:", current);
        if(newQty !== null) {
            State.updateTripQty(name, index, newQty);
            this.renderList();
            this.renderMiniHistory(name);
        }
    },

    setDescarte(n, i) {
       this.openDisposalModal(i);
    },

    shareDriverRoute(name) {
        const d = State.getDriver(name);
        const active = d.trips.filter(t => !t.completed);
        if (!active.length) return UI.toast("Sem rotas pendentes", "info");
        let msg = WhatsappService.buildMessage(name, active, State.session.shift, d.plate);
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }
};

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW registrado!', reg))
            .catch(err => console.log('SW falhou', err));
    });
}

window.onload = () => UI.init();
