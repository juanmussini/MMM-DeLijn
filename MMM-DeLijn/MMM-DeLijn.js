Module.register("MMM-DeLijn",{
	// Default module config.
	defaults: {
		text: "Loading...",
		entity: 3,             // entiteitnummer: 1 Antwerpen, 2 Oost-Vlaanderen, 3 Vlaams-Brabant, 4 Limburg, 5 West-Vlaanderen
		busStop: "",           // haltenummer, e.g. "300881"
		apiKey: "",            // Ocp-Apim-Subscription-Key from data.delijn.be
		updateInterval: 30000, // ms
		destination: "",       // only show buses whose destination contains this text (case-insensitive), e.g. "Brussel Noord"
		direction: ""          // only show buses in this direction: "HEEN" or "TERUG"
	},

	start: function(){
		var self = this;
		this.val = undefined;
		this.getInfo();
		setInterval(function() {
			self.getInfo();
		}, this.config.updateInterval);
	},

	getInfo: function() {
		var self = this;
		var url = "https://api.delijn.be/DLKernOpenData/api/v1/haltes/" + this.config.entity + "/" + this.config.busStop + "/real-time";
		var xmlhttp = new XMLHttpRequest();
		xmlhttp.onreadystatechange = function() {
			if (this.readyState == 4) {
				if (this.status == 200) {
					var myArr = JSON.parse(this.responseText);
					self.val = self.filter(myArr.halteDoorkomsten[0].doorkomsten);
					self.updateDom();
				} else {
					Log.error("MMM-DeLijn: request failed with status " + this.status + ": " + this.responseText);
				}
			}
		};
		xmlhttp.open("GET", url, true);
		xmlhttp.setRequestHeader("Ocp-Apim-Subscription-Key", this.config.apiKey);
		xmlhttp.send();
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

	// Override dom generator.
	getDom: function() {
		var val = this.val;
		let table = document.createElement('table');
		table.className = "table table-bordered table-dark";
		if(val == undefined){
			table.innerHTML = this.config.text;
			return table;
		}
		for(let i = 0; i < val.length; i++){
			let row = document.createElement('tr');
			let lijnnr = document.createElement('td');
			lijnnr.innerHTML = Number(val[i].lijnnummer);
			row.appendChild(lijnnr);
			// real-timeTijdstip is missing when there is no live prediction; fall back to the schedule
			let date = new Date(val[i]['real-timeTijdstip'] || val[i].dienstregelingTijdstip);
			let now = new Date();
			let tijd = document.createElement('td');
			tijd.innerHTML = '' + date.getHours() + ':' + ("0" + date.getMinutes()).slice(-2);
			row.appendChild(tijd);
			let diff = document.createElement('td');
			diff.innerHTML = Math.round((date.getTime() - now.getTime())/(1000*60));
			row.appendChild(diff);

			table.appendChild(row);
		}
		return table;
	},

	getStyles: function() {
		return ["MMM-DeLijn.css"];
	}

});
