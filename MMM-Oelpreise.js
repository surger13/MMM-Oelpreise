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
    currentPrice: null, // Variable für den aktuellen Preis
    previousPrice: null, // Variable für den Preis des Vortages
    priceLastMonth: null, // Preis vom gleichen Tag des Vormonats
    priceLastYear: null, // Preis vom gleichen Tag des Vorjahres
    apiUrl: '',

    defaults: {
        amount: '3000',  // amount in liter
        updateInterval: 86400000, // 1 day in milliseconds
        width: 1200,   // width in pixel
        height: 800,    // height in pixel
        showOverlay: true, // Zeigt das Overlay an, wenn true
		overlayBlink: false, // Standardwert für das Blinken auf false setzen
        overlayUnvisibleDuration: 3000, // Dauer, für die das Overlay ausgeblendet wird (in ms)
        overlayInterval: 15000, // Dauer wie lang das Overlay angezeigt wird (in ms)
        fadeDuration: 500, // Dauer des Fade-In/Out-Effekts (in ms)
		
		showPreviousDay: true,  // Anzeige des Preises vom Vortag
		showLastMonth: true,     // Anzeige des Preises vom Vormonat
		showLastYear: true,      // Anzeige des Preises vom Vorjahr
		showMaxMin: true         // Anzeige der Max- und Minpreise
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

    // Request node_helper to get json from url
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
        for (let i = this.jsonData.length - 1; i >= 0; i--) {
            let dataDate = new Date(this.jsonData[i].DateTime);
            if (dataDate.getFullYear() === date.getFullYear() && dataDate.getMonth() === date.getMonth() && dataDate.getDate() === date.getDate()) {
                return this.jsonData[i].Price;
            }
        }
        return null;
    },
	
	getMaxMinForLastYear: function() {
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

        // Create wrapper element
        const wrapperEl = document.createElement("div");
        wrapperEl.setAttribute("style", "position: relative; display: inline-block; color: white;");

        // Create overlay element for the information only if showOverlay is true
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

            // Current Price
			const currentPriceEl = document.createElement("div");

			// Formatierung des Preises mit unterschiedlichen Farben und Schriftgrößen
			currentPriceEl.innerHTML = `
				<span style="color: grey; font-size: 20px;">Heute:</span> 
				<span style="color: white; font-size: 24px;">
					${this.currentPrice !== null ? this.currentPrice.toFixed(2) : 'Warte auf Daten...'}
				</span>
				<span style="color: grey; font-size: 20px;"> €</span>
			`;
			currentPriceEl.setAttribute("style", "margin-bottom: 0px");
			overlayEl.appendChild(currentPriceEl);



			// Funktion zum Einfügen des Pfeils basierend auf der Änderung
			function getArrow(previousPrice, currentPrice) {
				return previousPrice < currentPrice ? '↓' : '↑'; // Pfeil nach unten wenn der vorherige Preis niedriger war als der Aktuelle
			}

            // "Änderung"-Textzeile
            const changeLabelEl = document.createElement("div");
            changeLabelEl.innerHTML = "Änderung zum";
            changeLabelEl.setAttribute("style", "font-size: 16px; margin-top: 0px; color: grey;");
            overlayEl.appendChild(changeLabelEl);

            // Änderung zum Vortag
			if (this.config.showPreviousDay) {
				const dayChangeEl = document.createElement("div");
				if (this.previousPrice !== null) {  
					let percentageChangeDay = ((this.currentPrice - this.previousPrice) / this.previousPrice) * 100;
					let arrowDay = getArrow(percentageChangeDay);  // Pfeil basierend auf der Änderung
					dayChangeEl.innerHTML = `Vortag: ${percentageChangeDay.toFixed(1)}% (${this.previousPrice.toFixed(2)} €) ` + arrowDay;
					dayChangeEl.setAttribute("style", "font-size: 16px; margin-bottom: 0px; color: " + (percentageChangeDay > 0 ? "red" : "green") + ";");
				} else {
					dayChangeEl.innerHTML = 'Warte auf Daten...';
					dayChangeEl.setAttribute("style", "font-size: 16px; margin-bottom: 0px;");
				}
				overlayEl.appendChild(dayChangeEl);
			}

			// Änderung zum Vormonat
			if (this.config.showLastMonth) {
				const changeLastMonthEl = document.createElement("div");
				if (this.priceLastMonth !== null) {
					let percentageChangeLastMonth = ((this.currentPrice - this.priceLastMonth) / this.priceLastMonth) * 100;
					let arrowMonth = getArrow(this.priceLastMonth, this.currentPrice);
					changeLastMonthEl.innerHTML = "Vormonat: " + percentageChangeLastMonth.toFixed(1) + '% (' + this.priceLastMonth.toFixed(2) + ' €) ' + arrowMonth;
					changeLastMonthEl.setAttribute("style", "font-size: 16px; margin-bottom: 0px; color: " + (percentageChangeLastMonth > 0 ? "red" : "green") + ";");
				} else {
					changeLastMonthEl.innerHTML = 'Warte auf Daten...';
					changeLastMonthEl.setAttribute("style", "font-size: 16px; margin-bottom: 0px;");
				}
				overlayEl.appendChild(changeLastMonthEl);
			}

			// Änderung zum Vorjahr
			if (this.config.showLastYear) {
				const changeLastYearEl = document.createElement("div");
				if (this.priceLastYear !== null) {
					let percentageChangeLastYear = ((this.currentPrice - this.priceLastYear) / this.priceLastYear) * 100;
					let arrowYear = getArrow(this.priceLastYear, this.currentPrice);
					changeLastYearEl.innerHTML = "Vorjahr: " + percentageChangeLastYear.toFixed(1) + '% (' + this.priceLastYear.toFixed(2) + ' €) ' + arrowYear;
					changeLastYearEl.setAttribute("style", "font-size: 16px; margin-bottom: 0px; color: " + (percentageChangeLastYear > 0 ? "red" : "green") + ";");
				} else {
					changeLastYearEl.innerHTML = 'Warte auf Daten...';
					changeLastYearEl.setAttribute("style", "font-size: 16px; margin-bottom: 0px;");
				}
				overlayEl.appendChild(changeLastYearEl);
			}

		// Maxima und Minima des letzten Jahres abrufen
		if (this.config.showMaxMin) {
			let maxMin = this.getMaxMinForLastYear(); // Aufruf der Funktion zur Berechnung von Maxima und Minima

			// Änderung zu Maximalpreis des letzten Jahres
			const maxPriceEl = document.createElement("div");
			if (maxMin.max !== null) {
				let percentageChangeMax = ((this.currentPrice - maxMin.max) / maxMin.max) * 100;
				let arrowMax = getArrow(maxMin.max, this.currentPrice);
				maxPriceEl.innerHTML = "Max. (letztes Jahr): " + percentageChangeMax.toFixed(1) + '% (' + maxMin.max.toFixed(2) + ' €) ' + arrowMax;
				maxPriceEl.setAttribute("style", "font-size: 16px; margin-bottom: 0px; color: " + (percentageChangeMax > 0 ? "red" : "green") + ";");
			} else {
				maxPriceEl.innerHTML = 'Warte auf Daten...';
				maxPriceEl.setAttribute("style", "font-size: 16px; margin-bottom: 0px;");
			}
			overlayEl.appendChild(maxPriceEl);

			// Änderung zu Minimalpreis des letzten Jahres
			const minPriceEl = document.createElement("div");
			if (maxMin.min !== null) {
				let percentageChangeMin = ((this.currentPrice - maxMin.min) / maxMin.min) * 100;
				let arrowMin = getArrow(maxMin.min, this.currentPrice);
				minPriceEl.innerHTML = "Min. (letztes Jahr): " + percentageChangeMin.toFixed(1) + '% (' + maxMin.min.toFixed(2) + ' €) ' + arrowMin;
				minPriceEl.setAttribute("style", "font-size: 16px; margin-bottom: 0px; color: " + (percentageChangeMin > 0 ? "red" : "green") + ";");
			} else {
				minPriceEl.innerHTML = 'Warte auf Daten...';
				minPriceEl.setAttribute("style", "font-size: 16px; margin-bottom: 0px;");
			}
			overlayEl.appendChild(minPriceEl);
			}
        }

        // Append overlay to wrapper only if showOverlay is true
        if (this.config.showOverlay) {
            wrapperEl.appendChild(overlayEl);
        }

        // Chart Data
        self.euros = [];
        self.days = [];

        var allData = this.jsonData;

        // Sortiere die Daten nach Datum (aufsteigend)
        allData.sort(function(a, b) {
            return new Date(a['DateTime']) - new Date(b['DateTime']);
        });

        // Befülle die Arrays mit den Daten
        for (var i = 0; i < allData.length; i++) {
            var obj = allData[i];
            var date = new Date(obj['DateTime']);

            var month = date.getMonth() + 1;
            var day = date.getDate();

            month = (month < 10 ? "0" : "") + month;
            day = (day < 10 ? "0" : "") + day;

            self.days.push(day + "." + month);
            self.euros.push(obj['Price']);
        }

        // Chart-Konfiguration
        var chartConfig = {
            type: 'line',
            data: {
                labels: self.days,
                datasets: [{
                    label: 'Euro / 100l',
                    data: self.euros,
                    fill: true,
                    backgroundColor: 'rgb(255, 255, 255, .3)',
                    borderColor: 'rgb(255, 255, 255)',
                    borderWidth: 3, // Setze die Linienbreite Chart
                    pointRadius: 0 // Punkte ausblenden
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false,
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: "white"
                        },
						grid: {
							display: false // Gitterlinien für die x-Achse ausblenden
						}
                    },
                    y: {
                        ticks: {
                            color: "white",
                            callback: function(value, index, ticks) {
                                return value + '€';
                            }
                        },
						grid: {
							display: false // Gitterlinien für die y-Achse ausblenden
						}
                    }
                }
            }
        };

        // Create chart canvas
        const chartEl = document.createElement("canvas");        
        var myChart = new Chart(chartEl.getContext("2d"), chartConfig);
        chartEl.width = this.config.width;
        chartEl.height = this.config.height;
        chartEl.setAttribute("style", "display: block;");

        // Append chart
        wrapperEl.appendChild(chartEl);

		// Timer für das Overlay-Element
		var overlayVisible = false; // Startwert auf false setzen
		var overlayTimer; // Variable für den Overlay-Timer

		// Überprüfen, ob das Blinken aktiviert ist
		if (this.config.overlayBlink) {
			// Mache das Overlay sichtbar
			overlayEl.style.opacity = '1'; 
			overlayVisible = true;

			// Timer für die Sichtbarkeit
			overlayTimer = setInterval(function() {
				if (overlayVisible) {
					overlayEl.style.opacity = '0'; // Mache das Overlay unsichtbar
					overlayVisible = false; // Setze den Status auf unsichtbar
					// Timer für die nächste Sichtbarkeit
					setTimeout(function() {
						overlayEl.style.opacity = '1'; // Mache das Overlay sichtbar
						overlayVisible = true; // Setze den Status auf sichtbar
					}, self.config.overlayUnvisibleDuration); // Warte die Dauer, bevor es wieder sichtbar wird
				}
			}, self.config.overlayUnvisibleDuration + self.config.overlayInterval); // Gesamtzeit für einen Blinkzyklus
		} else {
			// Wenn das Blinken nicht aktiviert ist, stelle sicher, dass das Overlay dauerhaft angezeigt wird
			overlayEl.style.opacity = '1'; // Immer sichtbar
		}

        return wrapperEl;
    }
});
