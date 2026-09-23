Module.register("MMM-DeLijn",{
	// Default module config.
	defaults: {
		text: "Loading...",
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
		this.getInfo();
		setInterval(function() {
			self.getInfo();
		}, this.config.updateInterval);
	},

	fetchStop: function(entity, stop) {
		var url = "https://api.delijn.be/DLKernOpenData/api/v1/haltes/" + entity + "/" + stop + "/real-time";
		return fetch(url, {headers: {"Ocp-Apim-Subscription-Key": this.config.apiKey}})
			.then(function(response) {
				if (!response.ok) {
					return response.text().then(function(text) {
						throw new Error("status " + response.status + ": " + text);
					});
				}
				return response.json();
			})
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
				self.val = self.combine(self.filter(results[0]), results[1] || []);
				self.updateDom();
			})
			.catch(function(error) {
				Log.error("MMM-DeLijn: request failed with " + error.message);
			});
	},

	filter: function(doorkomsten) {
		var destination = this.config.destination.toLowerCase();
		var direction = this.config.direction.toUpperCase();
		return doorkomsten.filter(function(d) {
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
		wrapper.className = "MMM-DeLijn small";
		if(val == undefined){
			wrapper.innerHTML = this.config.text;
			return wrapper;
		}
		let now = new Date();
		val = val.filter(function(bus) {
			return bus.departure.getTime() > now.getTime();
		}).slice(0, this.config.results);
		for(let i = 0; i < val.length; i++){
			let minutes = Math.round((val[i].departure.getTime() - now.getTime())/(1000*60));
			let text = minutes + 'm ' + val[i].line;
			if(val[i].travelMinutes != undefined){
				text += ' ' + val[i].travelMinutes + '⏱️';
			}
			let bus = document.createElement('span');
			bus.className = "delijn-bus" + (i > 0 ? " dimmed" : "");
			bus.innerHTML = text;
			wrapper.appendChild(bus);
		}
		return wrapper;
	},

	getStyles: function() {
		return ["MMM-DeLijn.css"];
	}

});
