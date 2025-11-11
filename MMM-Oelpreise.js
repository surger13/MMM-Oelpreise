/* global Module */

/* MagicMirror²
 * Module: MMM-Oelpreise
 *
 * By Markus Eckert https://github.com/eckonator/
 * MIT Licensed.
 */

Module.register("MMM-Oelpreise", {
    jsonData: [],
    days: [],
    euros: [],
    currentPrice: null,
    previousPrice: null,
    priceLastMonth: null,
    priceLastYear: null,
    apiUrl: '',

    defaults: {
        amount: '3000',  
        updateInterval: 86400000, 
        width: 1200,   
        height: 800,    
        showOverlay: true,
        overlayBlink: false,
        overlayUnvisibleDuration: 3000,
        overlayInterval: 15000,
        fadeDuration: 500,
        showPreviousDay: true,
        showLastMonth: true,
        showLastYear: true,
        showMaxMin: true
    },

    getScripts: function() {
        return ["modules/" + this.name + "/node_modules/chart.js/dist/chart.min.js"];
    },

    start: function() {
        this.getJson();
        this.scheduleUpdate();
        this.config = Object.assign({}, this.defaults, this.config);
        Log.info("Starting module: " + this.name);
    },

    scheduleUpdate: function () {
        var self = this;
        setInterval(function () {
            self.getJson();
        }, this.config.updateInterval);
    },

    getJson: function () {
        this.apiUrl = 'https://www.heizoel24.de/api/site/1/prices/history?amount=' + this.config.amount + '&productId=1&rangeType=6';
        this.sendSocketNotification("MMM-Oelpreise_GET_JSON", this.apiUrl);
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === "MMM-Oelpreise_JSON_RESULT") {
            this.jsonData = payload.data;

            if (this.jsonData.length > 0) {
                this.currentPrice = this.jsonData[this.jsonData.length - 1].Price;

                if (this.jsonData.length > 1) {
                    this.previousPrice = this.jsonData[this.jsonData.length - 2].Price;
                }

                let today = new Date(this.jsonData[this.jsonData.length - 1].DateTime);
                let lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
                let lastYearDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

                this.priceLastMonth = this.getPriceForDate(lastMonthDate);
                this.priceLastYear = this.getPriceForDate(lastYearDate);
            }

            this.updateDom();
        }
    },

    getPriceForDate: function(date) {
        if (!this.jsonData || this.jsonData.length === 0) return null;

        for (let i = this.jsonData.length - 1; i >= 0; i--) {
            let dataDate = new Date(this.jsonData[i].DateTime);
            if (dataDate.getFullYear() === date.getFullYear() && dataDate.getMonth() === date.getMonth() && dataDate.getDate() === date.getDate()) {
                return this.jsonData[i].Price;
            }
        }
        return null;
    },

    getMaxMinForLastYear: function() {
        if (!this.jsonData || this.jsonData.length === 0) return { max: null, min: null };

        let today = new Date(this.jsonData[this.jsonData.length - 1].DateTime);
        let lastYearDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

        let filteredData = this.jsonData.filter((data) => {
            let dataDate = new Date(data.DateTime);
            return dataDate >= lastYearDate && dataDate <= today;
        });

        if (filteredData.length > 0) {
            let prices = filteredData.map(data => data.Price);
            let maxPrice = Math.max(...prices);
            let minPrice = Math.min(...prices);
            return { max: maxPrice, min: minPrice };
        }

        return { max: null, min: null };
    },

    getDom: function() {
        var self = this;

        const wrapperEl = document.createElement("div");
        wrapperEl.setAttribute("style", "position: relative; display: inline-block; color: white;");

        const overlayEl = document.createElement("div");
        if (this.config.showOverlay) {
            overlayEl.setAttribute("style", `
                position: absolute;
                top: 0px;
                right: 0px;
                color: white;
                background: rgba(0, 0, 0, 0.0);
                padding: 2px;
                margin: 0;
                border-radius: 5px;
                opacity: 0;
                transition: opacity ${this.config.fadeDuration}ms ease-in-out;
            `);

            // Aktueller Preis
            const currentPriceEl = document.createElement("div");
            currentPriceEl.innerHTML = `
                <span style="color: grey; font-size: 20px;">Heute:</span> 
                <span style="color: white; font-size: 24px;">
                    ${this.currentPrice !== null ? this.currentPrice.toFixed(2) : 'Warte auf Daten...'}
                </span>
                <span style="color: grey; font-size: 20px;"> €</span>
            `;
            currentPriceEl.setAttribute("style", "margin-bottom: 0px");
            overlayEl.appendChild(currentPriceEl);

            function getArrow(previousPrice, currentPrice) {
                return previousPrice < currentPrice ? '↓' : '↑';
            }

            // Änderungen: Vortag, Vormonat, Vorjahr
            const changes = [
                { key: 'previousPrice', label: 'Vortag', show: this.config.showPreviousDay },
                { key: 'priceLastMonth', label: 'Vormonat', show: this.config.showLastMonth },
                { key: 'priceLastYear', label: 'Vorjahr', show: this.config.showLastYear }
            ];

            changes.forEach(item => {
                if (item.show) {
                    const el = document.createElement("div");
                    const priceValue = this[item.key];
                    if (priceValue !== null && this.currentPrice !== null) {
                        let percentageChange = ((this.currentPrice - priceValue) / priceValue) * 100;
                        let arrow = getArrow(priceValue, this.currentPrice);
                        el.innerHTML = `${item.label}: ${percentageChange.toFixed(1)}% (${priceValue.toFixed(2)} €) ${arrow}`;
                        el.setAttribute("style", "font-size: 16px; margin-bottom: 0px; color: " + (percentageChange > 0 ? "red" : "green") + ";");
                    } else {
                        el.innerHTML = 'Warte auf Daten...';
                        el.setAttribute("style", "font-size: 16px; margin-bottom: 0px;");
                    }
                    overlayEl.appendChild(el);
                }
            });

            // Max/Min des letzten Jahres
            if (this.config.showMaxMin) {
                let maxMin = this.getMaxMinForLastYear();

                const maxEl = document.createElement("div");
                if (maxMin.max !== null && this.currentPrice !== null) {
                    let perc = ((this.currentPrice - maxMin.max) / maxMin.max) * 100;
                    let arrow = getArrow(maxMin.max, this.currentPrice);
                    maxEl.innerHTML = `Max. (letztes Jahr): ${perc.toFixed(1)}% (${maxMin.max.toFixed(2)} €) ${arrow}`;
                    maxEl.setAttribute("style", "font-size: 16px; margin-bottom: 0px; color: " + (perc > 0 ? "red" : "green") + ";");
                } else {
                    maxEl.innerHTML = 'Warte auf Daten...';
                    maxEl.setAttribute("style", "font-size: 16px; margin-bottom: 0px;");
                }
                overlayEl.appendChild(maxEl);

                const minEl = document.createElement("div");
                if (maxMin.min !== null && this.currentPrice !== null) {
                    let perc = ((this.currentPrice - maxMin.min) / maxMin.min) * 100;
                    let arrow = getArrow(maxMin.min, this.currentPrice);
                    minEl.innerHTML = `Min. (letztes Jahr): ${perc.toFixed(1)}% (${maxMin.min.toFixed(2)} €) ${arrow}`;
                    minEl.setAttribute("style", "font-size: 16px; margin-bottom: 0px; color: " + (perc > 0 ? "red" : "green") + ";");
                } else {
                    minEl.innerHTML = 'Warte auf Daten...';
                    minEl.setAttribute("style", "font-size: 16px; margin-bottom: 0px;");
                }
                overlayEl.appendChild(minEl);
            }
        }

        if (this.config.showOverlay) wrapperEl.appendChild(overlayEl);

        // Chart-Daten
        self.euros = [];
        self.days = [];
        if (this.jsonData && this.jsonData.length > 0) {
            const allData = this.jsonData.slice().sort((a, b) => new Date(a.DateTime) - new Date(b.DateTime));
            allData.forEach(obj => {
                const date = new Date(obj.DateTime);
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const day = date.getDate().toString().padStart(2, '0');
                self.days.push(`${day}.${month}`);
                self.euros.push(obj.Price);
            });
        }

        const chartConfig = {
            type: 'line',
            data: {
                labels: self.days,
                datasets: [{
                    label: 'Euro / 100l',
                    data: self.euros,
                    fill: true,
                    backgroundColor: 'rgb(255, 255, 255, .3)',
                    borderColor: 'rgb(255, 255, 255)',
                    borderWidth: 3,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: "white" }, grid: { display: false } },
                    y: { ticks: { color: "white", callback: v => v + '€' }, grid: { display: false } }
                }
            }
        };

        const chartEl = document.createElement("canvas");        
        new Chart(chartEl.getContext("2d"), chartConfig);
        chartEl.width = this.config.width;
        chartEl.height = this.config.height;
        chartEl.setAttribute("style", "display: block;");
        wrapperEl.appendChild(chartEl);

        // Overlay Blink
        let overlayVisible = false;
        if (this.config.overlayBlink && this.config.showOverlay) {
            overlayEl.style.opacity = '1';
            overlayVisible = true;
            setInterval(() => {
                if (overlayVisible) {
                    overlayEl.style.opacity = '0';
                    overlayVisible = false;
                    setTimeout(() => {
                        overlayEl.style.opacity = '1';
                        overlayVisible = true;
                    }, self.config.overlayUnvisibleDuration);
                }
            }, self.config.overlayUnvisibleDuration + self.config.overlayInterval);
        } else if (this.config.showOverlay) {
            overlayEl.style.opacity = '1';
        }

        return wrapperEl;
    }
});
