Module.register("MMM-DeLijn",{
	// Default module config.
	defaults: {
		text: "Loading...",
		label: "B",            // first cell, like "Train" in MMM-NMBS-Connection
		title: "",             // shown in the line-number box, e.g. "Brussels WTC"
		entity: 3,             // entiteitnummer: 1 Antwerpen, 2 Oost-Vlaanderen, 3 Vlaams-Brabant, 4 Limburg, 5 West-Vlaanderen
		busStop: "",           // haltenummer, e.g. "300881"
		apiKey: "",            // Ocp-Apim-Subscription-Key from data.delijn.be
		updateInterval: 30000, // ms
		results: 3,            // number of buses to show
		destination: "",       // only show buses whose destination contains this text (case-insensitive), e.g. "Brussel Noord"
		direction: "",         // only show buses in this direction: "HEEN" or "TERUG"
		destinationStop: "",   // optional haltenummer where you get off; used to show the travel time
		destinationEntity: ""  // entiteitnummer of destinationStop, defaults to entity
	},

	start: function(){
		var self = this;
		this.val = undefined;
		this.lineNames = {}; // "<entity>_<lijnnummer>" -> lijnnummerPubliek, e.g. "3_250" -> "R50"
		this.lineColors = {}; // "<entity>_<lijnnummer>" -> {voorgrond, achtergrond, achtergrondRand} colour codes
		this.colors = {}; // colour code -> hex, e.g. "LB" -> "AACCEE"
		this.loadColors();
		this.getInfo();
		setInterval(function() {
			self.getInfo();
		}, this.config.updateInterval);
	},

	fetchJson: function(path) {
		return fetch("https://api.delijn.be/DLKernOpenData/api/v1/" + path, {headers: {"Ocp-Apim-Subscription-Key": this.config.apiKey}})
			.then(function(response) {
				if (!response.ok) {
					return response.text().then(function(text) {
						throw new Error("status " + response.status + ": " + text);
					});
				}
				return response.json();
			});
	},

	fetchStop: function(entity, stop) {
		return this.fetchJson("haltes/" + entity + "/" + stop + "/real-time")
			.then(function(json) {
				return json.halteDoorkomsten.length ? json.halteDoorkomsten[0].doorkomsten : [];
			});
	},

	getInfo: function() {
		var self = this;
		var requests = [this.fetchStop(this.config.entity, this.config.busStop)];
		if (this.config.destinationStop) {
			requests.push(this.fetchStop(this.config.destinationEntity || this.config.entity, this.config.destinationStop)
				.catch(function(error) {
					Log.error("MMM-DeLijn: destination stop request failed with " + error.message);
					return [];
				}));
		}
		Promise.all(requests)
			.then(function(results) {
				var doorkomsten = self.filter(results[0]);
				self.val = self.combine(doorkomsten, results[1] || []);
				self.updateDom();
				self.loadLineNames(doorkomsten);
			})
			.catch(function(error) {
				Log.error("MMM-DeLijn: request failed with " + error.message);
			});
	},

	loadColors: function() {
		var self = this;
		this.fetchJson("kleuren")
			.then(function(json) {
				json.kleuren.forEach(function(kleur) {
					self.colors[kleur.code] = kleur.hex;
				});
				self.updateDom();
			})
			.catch(function(error) {
				Log.error("MMM-DeLijn: colour list request failed with " + error.message);
			});
	},

	// Look up the public line name (e.g. "R50" for internal line 250) once per line.
	loadLineNames: function(doorkomsten) {
		var self = this;
		doorkomsten.forEach(function(d) {
			var key = d.entiteitnummer + "_" + d.lijnnummer;
			if (key in self.lineNames) {
				return;
			}
			self.lineNames[key] = undefined; // mark as requested; a failed lookup keeps showing the internal number
			self.fetchJson("lijnen/" + d.entiteitnummer + "/" + d.lijnnummer)
				.then(function(json) {
					if (json.lijnnummerPubliek) {
						self.lineNames[key] = json.lijnnummerPubliek;
						self.updateDom();
					}
				})
				.catch(function(error) {
					Log.error("MMM-DeLijn: line " + key + " lookup failed with " + error.message);
				});
			self.fetchJson("lijnen/" + d.entiteitnummer + "/" + d.lijnnummer + "/lijnkleuren")
				.then(function(json) {
					self.lineColors[key] = {
						voorgrond: json.voorgrond && json.voorgrond.code,
						achtergrond: json.achtergrond && json.achtergrond.code,
						achtergrondRand: json.achtergrondRand && json.achtergrondRand.code
					};
					self.updateDom();
				})
				.catch(function(error) {
					Log.error("MMM-DeLijn: line " + key + " colour lookup failed with " + error.message);
				});
		});
	},

	filter: function(doorkomsten) {
		var destination = this.config.destination.toLowerCase();
		var direction = this.config.direction.toUpperCase();
		return doorkomsten.filter(function(d) {
			// cancelled trips are still listed, with status GESCHRAPT
			if ((d.predictionStatussen || []).indexOf("GESCHRAPT") != -1) {
				return false;
			}
			if (direction && d.richting != direction) {
				return false;
			}
			if (destination) {
				var names = [d.bestemming, d.bestemmingKort, d.plaatsBestemming].join("|").toLowerCase();
				if (names.indexOf(destination) == -1) {
					return false;
				}
			}
			return true;
		});
	},

	// real-timeTijdstip is missing when there is no live prediction; fall back to the schedule
	time: function(d) {
		return new Date(d['real-timeTijdstip'] || d.dienstregelingTijdstip);
	},

	// doorkomstId is "<date>_<entity><line>_<ritnummer>_<sequence>_<stop>"; the first three parts identify the trip
	tripId: function(d) {
		return d.doorkomstId.split("_").slice(0, 3).join("_");
	},

	// Pair each bus with its arrival at destinationStop (same trip) to get the travel time.
	combine: function(doorkomsten, destinationDoorkomsten) {
		var self = this;
		var arrivals = {};
		destinationDoorkomsten.forEach(function(d) {
			arrivals[self.tripId(d)] = self.time(d);
		});
		// Keep every bus (sorted by predicted time) so getDom can drop the ones that have passed and still show `results` buses
		return doorkomsten.map(function(d) {
			var departure = self.time(d);
			var arrival = arrivals[self.tripId(d)];
			return {
				line: Number(d.lijnnummer),
				lineKey: d.entiteitnummer + "_" + d.lijnnummer,
				departure: departure,
				travelMinutes: arrival ? Math.round((arrival.getTime() - departure.getTime())/(1000*60)) : undefined
			};
		}).sort(function(a, b) {
			return a.departure.getTime() - b.departure.getTime();
		});
	},

	// Override dom generator.
	getDom: function() {
		var val = this.val;
		let wrapper = document.createElement('div');
		if(val == undefined){
			wrapper.className = "MMM-DeLijn dimmed light small";
			wrapper.innerHTML = this.config.text;
			return wrapper;
		}
		let now = new Date();
		val = val.filter(function(bus) {
			return bus.departure.getTime() > now.getTime();
		}).slice(0, this.config.results);

		// Same grid layout and class names as MMM-NMBS-Connection: label, line-number box, route name, then one cell per bus
		wrapper.className = "stib-table small MMM-DeLijn";
		wrapper.style.gridTemplateColumns = "auto auto 1fr repeat(" + val.length + ", auto)";

		let label = document.createElement('span');
		label.className = "stib-stopname dimmed";
		label.innerHTML = this.config.label;
		wrapper.appendChild(label);

		let lineContainer = document.createElement('div');
		lineContainer.className = "stib-linenumber-container";
		let lineNumber = document.createElement('span');
		lineNumber.className = "stib-linenumber";
		lineNumber.innerHTML = this.config.title;
		lineContainer.appendChild(lineNumber);
		let lineIcon = document.createElement('span');
		lineIcon.className = "stib-linenumber-icon";
		lineContainer.appendChild(lineIcon);
		wrapper.appendChild(lineContainer);

		let routeName = document.createElement('span');
		routeName.className = "stib-routename";
		wrapper.appendChild(routeName);

		for(let i = 0; i < val.length; i++){
			let minutes = Math.round((val[i].departure.getTime() - now.getTime())/(1000*60));
			let bus = document.createElement('div');
			bus.className = "stib-times" + (i > 0 ? " dimmed" : "");
			let busText = document.createElement('span');
			busText.appendChild(document.createTextNode(minutes + 'm '));
			busText.appendChild(this.lineBadge(val[i]));
			if(val[i].travelMinutes != undefined){
				busText.appendChild(document.createTextNode(' ' + val[i].travelMinutes + '⏱️'));
			}
			bus.appendChild(busText);
			wrapper.appendChild(bus);
		}
		return wrapper;
	},

	// Line name in the official De Lijn colours, once both the colour list and the line's colour codes have loaded
	lineBadge: function(bus) {
		let badge = document.createElement('span');
		badge.className = "delijn-line";
		badge.innerHTML = this.lineNames[bus.lineKey] || bus.line;
		let codes = this.lineColors[bus.lineKey];
		let colors = this.colors;
		if(codes && colors[codes.achtergrond]){
			badge.style.backgroundColor = "#" + colors[codes.achtergrond];
			badge.style.color = "#" + (colors[codes.voorgrond] || "FFFFFF");
			badge.style.borderColor = "#" + (colors[codes.achtergrondRand] || colors[codes.achtergrond]);
		}
		return badge;
	},

	getStyles: function() {
		return ["MMM-DeLijn.css"];
	}

});
